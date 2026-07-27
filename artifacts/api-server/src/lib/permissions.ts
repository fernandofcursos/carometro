import { Request, Response, NextFunction } from "express";
import {
  db, usuariosRolesTable, rolesPermissoesTable, permissoesTable,
  eq,
} from "@workspace/db";

type CacheEntry = { permissoes: string[]; expiraEm: number };

// Cache em memória por usuarioId — evita 3 JOINs por request
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000; // 60 segundos

async function buscarPermissoes(usuarioId: string): Promise<string[]> {
  const cached = cache.get(usuarioId);
  if (cached && Date.now() < cached.expiraEm) return cached.permissoes;

  const rows = await db
    .select({ recurso: permissoesTable.recurso, acao: permissoesTable.acao })
    .from(usuariosRolesTable)
    .innerJoin(rolesPermissoesTable, eq(rolesPermissoesTable.roleId, usuariosRolesTable.roleId))
    .innerJoin(permissoesTable, eq(permissoesTable.id, rolesPermissoesTable.permissaoId))
    .where(eq(usuariosRolesTable.usuarioId, usuarioId));

  const permissoes = rows.map(r => `${r.recurso}:${r.acao}`);
  cache.set(usuarioId, { permissoes, expiraEm: Date.now() + TTL_MS });
  return permissoes;
}

// Invalidar cache ao fazer logout, troca de role ou alteração de permissões
export function invalidarCachePermissoes(usuarioId: string): void {
  cache.delete(usuarioId);
}

// Limpar todo o cache — usado em testes para isolamento entre casos
export function limparCachePermissoes(): void {
  cache.clear();
}

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
