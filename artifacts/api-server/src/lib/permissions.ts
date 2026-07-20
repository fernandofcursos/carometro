import { Request, Response, NextFunction } from "express";
import {
  db, usuariosRolesTable, rolesPermissoesTable, permissoesTable,
  eq,
} from "@workspace/db";

export function requirePermissao(permissao: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.usuarioId) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }

    try {
      const [recurso, acao] = permissao.split(":");

      const perms = await db
        .select({ recurso: permissoesTable.recurso, acao: permissoesTable.acao })
        .from(usuariosRolesTable)
        .innerJoin(rolesPermissoesTable, eq(rolesPermissoesTable.roleId, usuariosRolesTable.roleId))
        .innerJoin(permissoesTable, eq(permissoesTable.id, rolesPermissoesTable.permissaoId))
        .where(eq(usuariosRolesTable.usuarioId, req.usuarioId));

      const hasPermission = perms.some((p) => p.recurso === recurso && p.acao === acao);

      if (!hasPermission) {
        res.status(403).json({ error: "Permissão negada" });
        return;
      }

      next();
    } catch {
      res.status(500).json({ error: "Erro ao verificar permissões" });
    }
  };
}
