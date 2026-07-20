import { Router, Request, Response } from "express";
import { db, usuariosTable, rolesTable, usuariosRolesTable, permissoesTable, rolesPermissoesTable, eq, isNull, and } from "@workspace/db";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

function encryptEmail(email: string, secret: string): string {
  const { createCipheriv } = require("crypto");
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(email, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decryptEmail(encrypted: string, secret: string): string {
  try {
    const { createDecipheriv } = require("crypto");
    const key = createHash("sha256").update(secret).digest();
    const [ivHex, encHex] = encrypted.split(":");
    if (!ivHex || !encHex) return "";
    const decipher = createDecipheriv("aes-256-cbc", key, Buffer.from(ivHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

const createUsuarioSchema = z.object({
  email: z.string().email(),
  nome: z.string().min(2).optional(),
  roleId: z.string().uuid().optional(),
});

// GET /api/usuarios — listar usuários ativos com seus roles
router.get("/", requirePermissao("usuarios:manage"), async (req: Request, res: Response) => {
  try {
    const secret = process.env["SESSION_SECRET"] ?? "default-dev-secret-change-in-production";
    const usuarios = await db
      .select()
      .from(usuariosTable)
      .where(isNull(usuariosTable.deletadoEm))
      .orderBy(usuariosTable.criadoEm);

    const usuariosComRoles = await Promise.all(
      usuarios.map(async (u) => {
        const roles = await db
          .select({ id: rolesTable.id, nome: rolesTable.nome })
          .from(usuariosRolesTable)
          .innerJoin(rolesTable, eq(usuariosRolesTable.roleId, rolesTable.id))
          .where(eq(usuariosRolesTable.usuarioId, u.id));

        return {
          id:            u.id,
          nome:          u.nome,
          email:         decryptEmail(u.emailEncrypted, secret),
          codigoAcesso:  u.codigoAcesso,
          primeiroAcesso: u.primeiroAcesso,
          bloqueadoAte:  u.bloqueadoAte,
          ultimoLoginEm: u.ultimoLoginEm,
          criadoEm:      u.criadoEm,
          roles,
        };
      })
    );

    res.json(usuariosComRoles);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar usuários" });
  }
});

// GET /api/usuarios/:id
router.get("/:id", requirePermissao("usuarios:manage"), async (req: Request, res: Response) => {
  try {
    const secret = process.env["SESSION_SECRET"] ?? "default-dev-secret-change-in-production";
    const [u] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, req.params.id));
    if (!u || u.deletadoEm) return res.status(404).json({ error: "Usuário não encontrado" });

    const roles = await db
      .select({ id: rolesTable.id, nome: rolesTable.nome })
      .from(usuariosRolesTable)
      .innerJoin(rolesTable, eq(usuariosRolesTable.roleId, rolesTable.id))
      .where(eq(usuariosRolesTable.usuarioId, u.id));

    const permissoes = await db
      .select({ recurso: permissoesTable.recurso, acao: permissoesTable.acao })
      .from(usuariosRolesTable)
      .innerJoin(rolesPermissoesTable, eq(usuariosRolesTable.roleId, rolesPermissoesTable.roleId))
      .innerJoin(permissoesTable, eq(rolesPermissoesTable.permissaoId, permissoesTable.id))
      .where(eq(usuariosRolesTable.usuarioId, u.id));

    res.json({
      id: u.id, nome: u.nome,
      email: decryptEmail(u.emailEncrypted, secret),
      codigoAcesso: u.codigoAcesso, primeiroAcesso: u.primeiroAcesso,
      bloqueadoAte: u.bloqueadoAte, ultimoLoginEm: u.ultimoLoginEm, criadoEm: u.criadoEm,
      roles,
      permissions: permissoes.map((p) => `${p.recurso}:${p.acao}`),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar usuário" });
  }
});

// POST /api/usuarios — criar usuário com senha temporária
router.post("/", requirePermissao("usuarios:manage"), async (req: Request, res: Response) => {
  try {
    const { email, nome, roleId } = createUsuarioSchema.parse(req.body);
    const secret = process.env["SESSION_SECRET"] ?? "default-dev-secret-change-in-production";

    // Gerar credenciais temporárias
    const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const codigoAcesso = Array.from({ length: 8 }, () => charset[Math.floor(Math.random() * charset.length)]).join("");
    const senhaTemp = randomBytes(8).toString("base64url").slice(0, 10);
    const senhaHash = await bcrypt.hash(senhaTemp, 12);

    const [u] = await db.insert(usuariosTable).values({
      nome,
      emailEncrypted: encryptEmail(email, secret),
      emailHash: createHash("sha256").update(email.toLowerCase()).digest("hex"),
      codigoAcesso,
      senhaHash,
      primeiroAcesso: true,
    }).returning();

    // Vincular ao role se informado
    if (roleId) {
      await db.insert(usuariosRolesTable).values({ usuarioId: u.id, roleId, concedidoPor: req.usuarioId });
    }

    await registrarAuditoria({
      tabela: "usuarios", operacao: "INSERT", registroId: u.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/usuarios", metodoHttp: "POST", statusHttp: 201,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.status(201).json({
      id: u.id, email, codigoAcesso,
      senhaTemporaria: senhaTemp,
      primeiroAcesso: true,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// PUT /api/usuarios/:id — atualizar dados do usuário (nome)
router.put("/:id", requirePermissao("usuarios:manage"), async (req: Request, res: Response) => {
  try {
    const { nome } = z.object({ nome: z.string().min(2) }).parse(req.body);
    const [u] = await db
      .update(usuariosTable)
      .set({ nome, atualizadoEm: new Date() })
      .where(eq(usuariosTable.id, req.params.id))
      .returning();
    if (!u) return res.status(404).json({ error: "Usuário não encontrado" });
    await registrarAuditoria({
      tabela: "usuarios", operacao: "UPDATE", registroId: u.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/usuarios/:id", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json({ id: u.id, nome: u.nome });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// PUT /api/usuarios/:id/roles — substituir roles do usuário
router.put("/:id/roles", requirePermissao("usuarios:manage"), async (req: Request, res: Response) => {
  try {
    const { roleIds } = z.object({ roleIds: z.array(z.string().uuid()) }).parse(req.body);

    await db.delete(usuariosRolesTable).where(eq(usuariosRolesTable.usuarioId, req.params.id));
    if (roleIds.length > 0) {
      await db.insert(usuariosRolesTable).values(
        roleIds.map((roleId) => ({ usuarioId: req.params.id, roleId, concedidoPor: req.usuarioId }))
      );
    }

    await registrarAuditoria({
      tabela: "usuarios_roles", operacao: "UPDATE", registroId: req.params.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/usuarios/:id/roles", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.json({ ok: true, total: roleIds.length });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// DELETE /api/usuarios/:id — soft delete
router.delete("/:id", requirePermissao("usuarios:manage"), async (req: Request, res: Response) => {
  try {
    // Não permitir auto-exclusão
    if (req.params.id === req.usuarioId) {
      return res.status(400).json({ error: "Não é possível excluir o próprio usuário" });
    }
    const [u] = await db
      .update(usuariosTable)
      .set({ deletadoEm: new Date() })
      .where(eq(usuariosTable.id, req.params.id))
      .returning();
    if (!u) return res.status(404).json({ error: "Usuário não encontrado" });
    await registrarAuditoria({
      tabela: "usuarios", operacao: "DELETE", registroId: u.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "DELETE /api/usuarios/:id", metodoHttp: "DELETE", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao excluir usuário" });
  }
});

export default router;
