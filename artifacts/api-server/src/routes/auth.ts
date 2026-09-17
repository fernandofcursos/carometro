import { Router, Request, Response } from "express";
import { z } from "zod";
import { createHash, randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import {
  db, usuariosTable, rolesTable, usuariosRolesTable,
  rolesPermissoesTable, permissoesTable, matriculasTable, escolasTable,
  eq, and, isNull,
} from "@workspace/db";
import jwt from "jsonwebtoken";
import { signToken, signTempToken, setAuthCookie, setTempCookie, clearAuthCookie, requireAuth } from "../lib/auth.js";
import { descriptografarEmail } from "../lib/crypto.js";
import { enviarEmailRecuperacao } from "../lib/mailer.js";
import { invalidarCachePermissoes } from "../lib/permissions.js";

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

// Helper: buscar roles + permissões de um usuário
// Retorna shape completo esperado pelo AuthContext do frontend
async function buscarRolesEPermissoes(usuarioId: string) {
  // Roles com id e nome (para allRoles + activeRoleId)
  const rolesRows = await db
    .select({ id: rolesTable.id, nome: rolesTable.nome })
    .from(usuariosRolesTable)
    .innerJoin(rolesTable, eq(usuariosRolesTable.roleId, rolesTable.id))
    .where(eq(usuariosRolesTable.usuarioId, usuarioId));

  // Permissões de todas as roles do usuário (join roles_permissoes → permissoes)
  const permsRows = rolesRows.length > 0
    ? await db
        .select({ recurso: permissoesTable.recurso, acao: permissoesTable.acao })
        .from(usuariosRolesTable)
        .innerJoin(rolesPermissoesTable, eq(rolesPermissoesTable.roleId, usuariosRolesTable.roleId))
        .innerJoin(permissoesTable, eq(permissoesTable.id, rolesPermissoesTable.permissaoId))
        .where(eq(usuariosRolesTable.usuarioId, usuarioId))
    : [];

  // Deduplicar permissões (usuário pode ter mesma permissão via múltiplas roles)
  const permissionsSet = new Set(permsRows.map((p) => `${p.recurso}:${p.acao}`));

  return {
    roles:        rolesRows.map((r) => r.nome),           // string[] para JWT e hasRole()
    allRoles:     rolesRows,                               // Role[] para switcher de perfil
    activeRoleId: rolesRows[0]?.id ?? null,               // primeira role como ativa (default)
    permissions:  Array.from(permissionsSet),              // "recurso:acao"[] para hasPermission()
  };
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

    // Login bem-sucedido — detectar escolas do usuário via matrículas ativas
    const escolasDoUsuario = await db
      .selectDistinct({ id: escolasTable.id, nome: escolasTable.nome, sigla: escolasTable.sigla })
      .from(matriculasTable)
      .innerJoin(escolasTable, eq(matriculasTable.escolaId, escolasTable.id))
      .where(and(
        eq(matriculasTable.usuarioId, usuario.id),
        eq(matriculasTable.ativo, true),
        isNull(matriculasTable.deletadoEm),
      ));

    // Resetar tentativas e registrar último login
    await db
      .update(usuariosTable)
      .set({ tentativasLoginFalhas: 0, bloqueadoAte: null, ultimoLoginEm: new Date() })
      .where(eq(usuariosTable.id, usuario.id));

    // Se múltiplas escolas → retornar lista para seleção (sem emitir token completo)
    if (escolasDoUsuario.length > 1) {
      const tempToken = signTempToken(usuario.id);
      setTempCookie(res, tempToken);
      return res.status(200).json({
        requiresEscolaSelection: true,
        escolasDisponiveis: escolasDoUsuario,
      });
    }

    // Se usuário não tem matrículas (staff: secretaria, coordenação, etc.)
    // usa escola_id direto do usuário (setado no cadastro)
    let escolaFinal: string | undefined;
    if (escolasDoUsuario.length === 0) {
      // Buscar escola do próprio usuário (staff sem matrícula)
      const [usuarioComEscola] = await db
        .select({ escolaId: usuariosTable.escolaId })
        .from(usuariosTable)
        .where(eq(usuariosTable.id, usuario.id));
      escolaFinal = usuarioComEscola?.escolaId ?? undefined;
    } else if (escolasDoUsuario.length === 1) {
      escolaFinal = escolasDoUsuario[0].id;
    }
    // else: multiple schools → selection flow (handled below)
    const escolaId = escolaFinal;

    // Buscar roles + permissões
    const { roles, allRoles, activeRoleId, permissions } = await buscarRolesEPermissoes(usuario.id);

    // Gerar JWT (com escolaId se houver) e definir cookie
    const token = signToken(usuario.id, roles, escolaId);
    setAuthCookie(res, token);

    // Descriptografar e-mail para retornar na resposta (dados pessoais — LGPD)
    let email = "";
    try { email = descriptografarEmail(usuario.emailEncrypted); } catch { /* mantém vazio */ }

    return res.json({
      id:            usuario.id,
      nome:          usuario.nome,
      email,                                               // adicionado: frontend usa para exibir no sidebar
      codigoAcesso:  usuario.codigoAcesso,                 // adicionado: AuthUser shape
      roles,
      allRoles,                                            // adicionado: Role[] para switcher de perfil
      activeRoleId,                                        // adicionado: perfil ativo default
      permissions,                                         // adicionado: permissões para guards de menu
      primeiroAcesso: usuario.primeiroAcesso,
      disciplinas:   [],                                   // adicionado: placeholder (implementar na Fase 1e)
      escolaId: escolaId ?? null,                          // escola selecionada automaticamente (ou null)
    });
  } catch (err) {
    console.error("[login] erro interno:", err);
    res.status(500).json({ error: "Erro ao fazer login" });
  }
});

// POST /api/auth/logout
router.post("/logout", (req: Request, res: Response) => {
  if (req.usuarioId) invalidarCachePermissoes(req.usuarioId);
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

// GET /api/auth/me — dados completos do usuário autenticado
// Retorna shape AuthUser completo (roles, allRoles, activeRoleId, permissions, email, disciplinas)
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const [usuario] = await db
      .select({
        id:             usuariosTable.id,
        nome:           usuariosTable.nome,
        emailEncrypted: usuariosTable.emailEncrypted, // necessário para descriptografar
        codigoAcesso:   usuariosTable.codigoAcesso,
        primeiroAcesso: usuariosTable.primeiroAcesso,
      })
      .from(usuariosTable)
      .where(and(eq(usuariosTable.id, req.usuarioId!), isNull(usuariosTable.deletadoEm)));

    if (!usuario) {
      return res.status(401).json({ error: "Usuário não encontrado" });
    }

    const { roles, allRoles, activeRoleId, permissions } = await buscarRolesEPermissoes(usuario.id);

    // Descriptografar e-mail (LGPD: dado pessoal armazenado criptografado)
    let email = "";
    try { email = descriptografarEmail(usuario.emailEncrypted); } catch { /* mantém vazio */ }

    return res.json({
      id:            usuario.id,
      nome:          usuario.nome,
      email,
      codigoAcesso:  usuario.codigoAcesso,
      roles,
      allRoles,
      activeRoleId,
      permissions,
      primeiroAcesso: usuario.primeiroAcesso,
      disciplinas:   [],
    });
  } catch {
    res.status(500).json({ error: "Erro ao buscar usuário" });
  }
});

// POST /api/auth/switch-role — trocar perfil ativo (multi-role)
router.post("/switch-role", requireAuth, async (req: Request, res: Response) => {
  try {
    const { roleId } = req.body as { roleId?: string };
    if (!roleId) return res.status(400).json({ error: "roleId obrigatório" });

    // Verificar que o usuário realmente possui a role solicitada
    const [vinculo] = await db
      .select({ roleId: usuariosRolesTable.roleId })
      .from(usuariosRolesTable)
      .where(and(
        eq(usuariosRolesTable.usuarioId, req.usuarioId!),
        eq(usuariosRolesTable.roleId, roleId),
      ));

    if (!vinculo) return res.status(403).json({ error: "Perfil não autorizado para este usuário" });

    // Invalidar cache de permissões — novo role pode ter permissões diferentes
    invalidarCachePermissoes(req.usuarioId!);

    // Retornar dados atualizados com nova role ativa
    const [usuario] = await db
      .select({ id: usuariosTable.id, nome: usuariosTable.nome, emailEncrypted: usuariosTable.emailEncrypted, codigoAcesso: usuariosTable.codigoAcesso, primeiroAcesso: usuariosTable.primeiroAcesso })
      .from(usuariosTable)
      .where(eq(usuariosTable.id, req.usuarioId!));

    const { roles, allRoles, permissions } = await buscarRolesEPermissoes(usuario.id);

    let email = "";
    try { email = descriptografarEmail(usuario.emailEncrypted); } catch { /* */ }

    return res.json({
      id: usuario.id, nome: usuario.nome, email,
      codigoAcesso: usuario.codigoAcesso,
      roles, allRoles,
      activeRoleId: roleId,       // role explicitamente trocada
      permissions, primeiroAcesso: usuario.primeiroAcesso, disciplinas: [],
    });
  } catch {
    res.status(500).json({ error: "Erro ao trocar perfil" });
  }
});

// POST /api/auth/selecionar-escola — confirmar escola após fluxo multi-escola
// Requer temp_token emitido no login quando há múltiplas escolas
router.post("/selecionar-escola", async (req: Request, res: Response) => {
  try {
    const schema = z.object({ escolaId: z.string().uuid("escolaId inválido") });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    // Verificar token temporário (cookie ou header Authorization Bearer)
    const tempToken = req.cookies?.temp_token
      ?? (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined);

    if (!tempToken) {
      return res.status(401).json({ error: "Token temporário ausente" });
    }

    let payload: { sub: string; pendingEscolaSelection?: boolean };
    try {
      payload = jwt.verify(tempToken, process.env.SESSION_SECRET!, { issuer: "seshat" }) as any;
    } catch {
      return res.status(401).json({ error: "Token temporário inválido ou expirado" });
    }

    if (!payload.pendingEscolaSelection) {
      return res.status(401).json({ error: "Token não é de seleção de escola" });
    }

    const usuarioId = payload.sub;
    const { escolaId } = parsed.data;

    // Validar que o usuário realmente tem matrícula ativa nesta escola
    const [matricula] = await db
      .select({ id: matriculasTable.id })
      .from(matriculasTable)
      .innerJoin(escolasTable, eq(matriculasTable.escolaId, escolasTable.id))
      .where(and(
        eq(matriculasTable.usuarioId, usuarioId),
        eq(matriculasTable.escolaId, escolaId),
        eq(matriculasTable.ativo, true),
        isNull(matriculasTable.deletadoEm),
      ))
      .limit(1);

    if (!matricula) {
      return res.status(403).json({ error: "Escola não autorizada para este usuário" });
    }

    // Buscar dados completos do usuário
    const [usuario] = await db
      .select({
        id: usuariosTable.id,
        nome: usuariosTable.nome,
        emailEncrypted: usuariosTable.emailEncrypted,
        codigoAcesso: usuariosTable.codigoAcesso,
        primeiroAcesso: usuariosTable.primeiroAcesso,
      })
      .from(usuariosTable)
      .where(and(eq(usuariosTable.id, usuarioId), isNull(usuariosTable.deletadoEm)));

    if (!usuario) {
      return res.status(401).json({ error: "Usuário não encontrado" });
    }

    const { roles, allRoles, activeRoleId, permissions } = await buscarRolesEPermissoes(usuarioId);

    // Emitir JWT completo com escolaId
    const token = signToken(usuarioId, roles, escolaId);
    setAuthCookie(res, token);
    // Limpar cookie temporário
    res.clearCookie("temp_token", { path: "/" });

    let email = "";
    try { email = descriptografarEmail(usuario.emailEncrypted); } catch { /* mantém vazio */ }

    return res.json({
      id:            usuario.id,
      nome:          usuario.nome,
      email,
      codigoAcesso:  usuario.codigoAcesso,
      roles,
      allRoles,
      activeRoleId,
      permissions,
      primeiroAcesso: usuario.primeiroAcesso,
      disciplinas:   [],
      escolaId,
    });
  } catch (err) {
    console.error("[selecionar-escola] erro interno:", err);
    res.status(500).json({ error: "Erro ao selecionar escola" });
  }
});

// POST /api/auth/solicitar-recuperacao — solicitar redefinição de senha
// Resposta sempre 200 para não revelar se o e-mail existe (LGPD + user enumeration)
router.post("/solicitar-recuperacao", async (req: Request, res: Response) => {
  try {
    const schema = z.object({ email: z.string().email("E-mail inválido") });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const { email } = parsed.data;

    const [usuario] = await db
      .select({ id: usuariosTable.id, nome: usuariosTable.nome, emailEncrypted: usuariosTable.emailEncrypted, codigoAcesso: usuariosTable.codigoAcesso })
      .from(usuariosTable)
      .where(and(eq(usuariosTable.emailHash, emailHash(email)), isNull(usuariosTable.deletadoEm)));

    if (usuario) {
      const token = randomUUID();
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

      await db
        .update(usuariosTable)
        .set({ recuperacaoTokenHash: tokenHash, recuperacaoExpiresAt: expiresAt, atualizadoEm: new Date() })
        .where(eq(usuariosTable.id, usuario.id));

      const emailDestino = descriptografarEmail(usuario.emailEncrypted);
      try {
        await enviarEmailRecuperacao(emailDestino, token, expiresAt, usuario.nome, usuario.codigoAcesso);
      } catch (err) {
        // Falha no envio não deve revelar informação — registrar e continuar
        console.error("[recuperacao] falha ao enviar e-mail:", err);
      }
    }

    return res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao processar solicitação" });
  }
});

// POST /api/auth/redefinir-senha — redefinir senha com token recebido
router.post("/redefinir-senha", async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      token: z.string().min(1, "Token obrigatório"),
      novaSenha: z.string().min(8, "Nova senha deve ter mínimo 8 caracteres"),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const { token, novaSenha } = parsed.data;
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const [usuario] = await db
      .select({ id: usuariosTable.id, recuperacaoTokenHash: usuariosTable.recuperacaoTokenHash, recuperacaoExpiresAt: usuariosTable.recuperacaoExpiresAt })
      .from(usuariosTable)
      .where(and(eq(usuariosTable.recuperacaoTokenHash, tokenHash), isNull(usuariosTable.deletadoEm)));

    if (!usuario || !usuario.recuperacaoExpiresAt) {
      return res.status(400).json({ error: "Token inválido ou já utilizado" });
    }

    if (new Date() > new Date(usuario.recuperacaoExpiresAt)) {
      return res.status(400).json({ error: "Token expirado" });
    }

    const novaSenhaHash = await bcrypt.hash(novaSenha, 12);

    await db
      .update(usuariosTable)
      .set({
        senhaHash: novaSenhaHash,
        primeiroAcesso: false,
        recuperacaoTokenHash: null,
        recuperacaoExpiresAt: null,
        atualizadoEm: new Date(),
      })
      .where(eq(usuariosTable.id, usuario.id));

    return res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao redefinir senha" });
  }
});

export default router;
