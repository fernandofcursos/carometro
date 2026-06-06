import { Router, Request, Response } from "express";
import { z } from "zod";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { db, usuariosTable, rolesTable, usuariosRolesTable, eq, and, isNull } from "@workspace/db";
import { signToken, setAuthCookie, clearAuthCookie, requireAuth } from "../lib/auth.js";

const router = Router();

// Aceita e-mail ou código de acesso como identificador
const loginSchema = z.object({
  identificador: z.string().min(1, "Identificador obrigatório"),
  senha: z.string().min(1, "Senha obrigatória"),
});

// Máximo de tentativas antes de bloquear a conta (ISO 27001 A.8.5)
const MAX_TENTATIVAS = 5;
// Duração do bloqueio em minutos
const BLOQUEIO_MINUTOS = 15;

function emailHash(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex");
}

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", issues: parsed.error.issues });
    }

    const { identificador, senha } = parsed.data;
    const isEmail = identificador.includes("@");

    // Buscar usuário por e-mail (hash) ou código de acesso
    const [usuario] = isEmail
      ? await db
          .select()
          .from(usuariosTable)
          .where(and(eq(usuariosTable.emailHash, emailHash(identificador)), isNull(usuariosTable.deletadoEm)))
      : await db
          .select()
          .from(usuariosTable)
          .where(and(eq(usuariosTable.codigoAcesso, identificador.toUpperCase()), isNull(usuariosTable.deletadoEm)));

    if (!usuario) {
      // Não revelar se o usuário existe ou não (enumeração de usuários)
      return res.status(401).json({ error: "Identificador ou senha inválidos" });
    }

    // Verificar bloqueio por tentativas excessivas
    if (usuario.bloqueadoAte && new Date() < new Date(usuario.bloqueadoAte)) {
      return res.status(429).json({ error: "Conta temporariamente bloqueada. Tente novamente em alguns minutos." });
    }

    // Verificar senha com bcrypt
    const senhaCorreta = await bcrypt.compare(senha, usuario.senhaHash);

    if (!senhaCorreta) {
      const novasTentativas = (usuario.tentativasLoginFalhas ?? 0) + 1;
      const bloquear = novasTentativas >= MAX_TENTATIVAS;
      const bloqueadoAte = bloquear ? new Date(Date.now() + BLOQUEIO_MINUTOS * 60 * 1000) : null;

      await db
        .update(usuariosTable)
        .set({
          tentativasLoginFalhas: novasTentativas,
          ...(bloquear ? { bloqueadoAte } : {}),
        })
        .where(eq(usuariosTable.id, usuario.id));

      return res.status(401).json({ error: "Identificador ou senha inválidos" });
    }

    // Login bem-sucedido — buscar roles do usuário
    const rolesRows = await db
      .select({ nome: rolesTable.nome })
      .from(usuariosRolesTable)
      .innerJoin(rolesTable, eq(usuariosRolesTable.roleId, rolesTable.id))
      .where(eq(usuariosRolesTable.usuarioId, usuario.id));

    const roles = rolesRows.map((r) => r.nome);

    // Resetar tentativas e registrar último login
    await db
      .update(usuariosTable)
      .set({
        tentativasLoginFalhas: 0,
        bloqueadoAte: null,
        ultimoLoginEm: new Date(),
      })
      .where(eq(usuariosTable.id, usuario.id));

    // Gerar JWT e definir cookie
    const token = signToken(usuario.id, roles);
    setAuthCookie(res, token);

    return res.json({
      id: usuario.id,
      nome: usuario.nome,
      roles,
      primeiroAcesso: usuario.primeiroAcesso,
    });
  } catch (err) {
    res.status(500).json({ error: "Erro ao fazer login" });
  }
});

// POST /api/auth/logout
router.post("/logout", (_req: Request, res: Response) => {
  clearAuthCookie(res);
  res.json({ message: "Logout realizado" });
});

// POST /api/auth/change-password — alterar senha (obrigatório no primeiro acesso)
router.post("/change-password", requireAuth, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      senhaAtual: z.string().min(1, "Senha atual obrigatória"),
      senhaNova: z.string().min(6, "Nova senha deve ter mínimo 6 caracteres"),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const { senhaAtual, senhaNova } = parsed.data;

    const [usuario] = await db
      .select({ id: usuariosTable.id, senhaHash: usuariosTable.senhaHash })
      .from(usuariosTable)
      .where(and(eq(usuariosTable.id, req.usuarioId!), isNull(usuariosTable.deletadoEm)));

    if (!usuario) {
      return res.status(401).json({ error: "Usuário não encontrado" });
    }

    const senhaCorreta = await bcrypt.compare(senhaAtual, usuario.senhaHash);
    if (!senhaCorreta) {
      return res.status(400).json({ error: "Senha atual incorreta" });
    }

    const novaSenhaHash = await bcrypt.hash(senhaNova, 12);

    await db
      .update(usuariosTable)
      .set({ senhaHash: novaSenhaHash, primeiroAcesso: false, atualizadoEm: new Date() })
      .where(eq(usuariosTable.id, usuario.id));

    return res.status(204).send();
  } catch {
    res.status(500).json({ error: "Erro ao alterar senha" });
  }
});

// GET /api/auth/me — dados do usuário autenticado
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const [usuario] = await db
      .select({ id: usuariosTable.id, nome: usuariosTable.nome, primeiroAcesso: usuariosTable.primeiroAcesso })
      .from(usuariosTable)
      .where(and(eq(usuariosTable.id, req.usuarioId!), isNull(usuariosTable.deletadoEm)));

    if (!usuario) {
      return res.status(401).json({ error: "Usuário não encontrado" });
    }

    const rolesRows = await db
      .select({ nome: rolesTable.nome })
      .from(usuariosRolesTable)
      .innerJoin(rolesTable, eq(usuariosRolesTable.roleId, rolesTable.id))
      .where(eq(usuariosRolesTable.usuarioId, usuario.id));

    return res.json({ ...usuario, roles: rolesRows.map((r) => r.nome) });
  } catch {
    res.status(500).json({ error: "Erro ao buscar usuário" });
  }
});

export default router;
