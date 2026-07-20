import { Router, Request, Response } from "express";
import { db, rolesTable, permissoesTable, rolesPermissoesTable, usuariosRolesTable, eq, and } from "@workspace/db";
import { z } from "zod/v4";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

const insertRoleSchema = z.object({
  nome: z.string().min(2).max(50),
  descricao: z.string().optional(),
  ativo: z.boolean().optional().default(true),
});

// GET /api/roles — listar roles com suas permissões
router.get("/", requirePermissao("roles:manage"), async (req: Request, res: Response) => {
  try {
    const roles = await db.select().from(rolesTable).orderBy(rolesTable.nome);

    // Para cada role, buscar permissões associadas
    const rolesComPermissoes = await Promise.all(
      roles.map(async (role) => {
        const permissoes = await db
          .select({
            id:       permissoesTable.id,
            recurso:  permissoesTable.recurso,
            acao:     permissoesTable.acao,
            descricao: permissoesTable.descricao,
          })
          .from(rolesPermissoesTable)
          .innerJoin(permissoesTable, eq(rolesPermissoesTable.permissaoId, permissoesTable.id))
          .where(eq(rolesPermissoesTable.roleId, role.id));
        return { ...role, permissoes };
      })
    );

    res.json({ roles: rolesComPermissoes });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar roles" });
  }
});

// GET /api/roles/:id
router.get("/:id", requirePermissao("roles:manage"), async (req: Request, res: Response) => {
  try {
    const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, req.params.id));
    if (!role) return res.status(404).json({ error: "Role não encontrado" });

    const permissoes = await db
      .select({ id: permissoesTable.id, recurso: permissoesTable.recurso, acao: permissoesTable.acao })
      .from(rolesPermissoesTable)
      .innerJoin(permissoesTable, eq(rolesPermissoesTable.permissaoId, permissoesTable.id))
      .where(eq(rolesPermissoesTable.roleId, role.id));

    res.json({ ...role, permissoes });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar role" });
  }
});

// POST /api/roles — criar role
router.post("/", requirePermissao("roles:manage"), async (req: Request, res: Response) => {
  try {
    const data = insertRoleSchema.parse(req.body);
    const [role] = await db.insert(rolesTable).values(data).returning();
    await registrarAuditoria({
      tabela: "roles", operacao: "INSERT", registroId: role.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/roles", metodoHttp: "POST", statusHttp: 201,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.status(201).json(role);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// PUT /api/roles/:id — atualizar role
router.put("/:id", requirePermissao("roles:manage"), async (req: Request, res: Response) => {
  try {
    const data = insertRoleSchema.parse(req.body);
    const [role] = await db
      .update(rolesTable)
      .set({ ...data, atualizadoEm: new Date() })
      .where(eq(rolesTable.id, req.params.id))
      .returning();
    if (!role) return res.status(404).json({ error: "Role não encontrado" });
    await registrarAuditoria({
      tabela: "roles", operacao: "UPDATE", registroId: role.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/roles/:id", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json(role);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// PUT /api/roles/:id/permissoes — substituir permissões do role
router.put("/:id/permissoes", requirePermissao("roles:manage"), async (req: Request, res: Response) => {
  try {
    const { permissaoIds } = z.object({ permissaoIds: z.array(z.string().uuid()) }).parse(req.body);

    // Remover todas as permissões atuais e reinserir
    await db.delete(rolesPermissoesTable).where(eq(rolesPermissoesTable.roleId, req.params.id));

    if (permissaoIds.length > 0) {
      await db.insert(rolesPermissoesTable).values(
        permissaoIds.map((permissaoId) => ({ roleId: req.params.id, permissaoId }))
      );
    }

    await registrarAuditoria({
      tabela: "roles_permissoes", operacao: "UPDATE", registroId: req.params.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/roles/:id/permissoes", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.json({ ok: true, total: permissaoIds.length });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// DELETE /api/roles/:id — excluir role (rejeita se tem usuários)
router.delete("/:id", requirePermissao("roles:manage"), async (req: Request, res: Response) => {
  try {
    const usuariosVinculados = await db
      .select({ id: usuariosRolesTable.usuarioId })
      .from(usuariosRolesTable)
      .where(eq(usuariosRolesTable.roleId, req.params.id))
      .limit(1);

    if (usuariosVinculados.length > 0) {
      return res.status(409).json({ error: "Não é possível excluir: role possui usuários vinculados" });
    }

    const [role] = await db.delete(rolesTable).where(eq(rolesTable.id, req.params.id)).returning();
    if (!role) return res.status(404).json({ error: "Role não encontrado" });

    await registrarAuditoria({
      tabela: "roles", operacao: "DELETE", registroId: role.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "DELETE /api/roles/:id", metodoHttp: "DELETE", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao excluir role" });
  }
});

// GET /api/roles/permissoes — listar todas as permissões disponíveis no sistema
router.get("/permissoes", requirePermissao("roles:manage"), async (req: Request, res: Response) => {
  try {
    const permissoes = await db.select().from(permissoesTable).orderBy(permissoesTable.recurso, permissoesTable.acao);
    res.json({ permissoes });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar permissões" });
  }
});

export default router;
