import { Request, Response, NextFunction } from "express";
import {
  db, usuariosRolesTable, rolesPermissoesTable, permissoesTable, rolesTable,
  eq,
} from "@workspace/db";

const TTL_MS = 60_000; // 60 segundos

// ── Cache de permissões (recurso:acao) ────────────────────────────────────────
type PermEntry = { permissoes: string[]; expiraEm: number };
const permCache = new Map<string, PermEntry>();

async function buscarPermissoes(usuarioId: string): Promise<string[]> {
  const cached = permCache.get(usuarioId);
  if (cached && Date.now() < cached.expiraEm) return cached.permissoes;

  const rows = await db
    .select({ recurso: permissoesTable.recurso, acao: permissoesTable.acao })
    .from(usuariosRolesTable)
    .innerJoin(rolesPermissoesTable, eq(rolesPermissoesTable.roleId, usuariosRolesTable.roleId))
    .innerJoin(permissoesTable, eq(permissoesTable.id, rolesPermissoesTable.permissaoId))
    .where(eq(usuariosRolesTable.usuarioId, usuarioId));

  const permissoes = rows.map(r => `${r.recurso}:${r.acao}`);
  permCache.set(usuarioId, { permissoes, expiraEm: Date.now() + TTL_MS });
  return permissoes;
}

// ── Cache de roles (nomes) ────────────────────────────────────────────────────
type RoleEntry = { roles: string[]; expiraEm: number };
const roleCache = new Map<string, RoleEntry>();

export async function buscarRoles(usuarioId: string): Promise<string[]> {
  const cached = roleCache.get(usuarioId);
  if (cached && Date.now() < cached.expiraEm) return cached.roles;

  const rows = await db
    .select({ nome: rolesTable.nome })
    .from(usuariosRolesTable)
    .innerJoin(rolesTable, eq(rolesTable.id, usuariosRolesTable.roleId))
    .where(eq(usuariosRolesTable.usuarioId, usuarioId));

  const roles = rows.map(r => r.nome);
  roleCache.set(usuarioId, { roles, expiraEm: Date.now() + TTL_MS });
  return roles;
}

// ── Invalidação ───────────────────────────────────────────────────────────────

export function invalidarCachePermissoes(usuarioId: string): void {
  permCache.delete(usuarioId);
  roleCache.delete(usuarioId);
}

export function limparCachePermissoes(): void {
  permCache.clear();
  roleCache.clear();
}

// ── Middleware requirePermissao ───────────────────────────────────────────────

export function requirePermissao(permissao: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.usuarioId) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }

    try {
      const permissoes = await buscarPermissoes(req.usuarioId);
      if (!permissoes.includes(permissao)) {
        res.status(403).json({ error: "Permissão negada" });
        return;
      }
      next();
    } catch {
      res.status(500).json({ error: "Erro ao verificar permissões" });
    }
  };
}
