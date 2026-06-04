import { Request, Response, NextFunction } from "express";

// Middleware para verificar permissões específicas do usuário
// Usado em rotas que modificam dados (POST, PUT, DELETE)
export function requirePermissao(permissao: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Usuário deve estar autenticado (middleware requireAuth já rodou)
    if (!req.usuarioId) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }

    try {
      // TODO: Buscar permissões do usuário no banco de dados
      // Por enquanto, permitir tudo (será implementado na Fase 1)
      // const permissoes = await buscarPermissoesDoUsuario(req.usuarioId);
      // if (!permissoes.includes(permissao)) {
      //   res.status(403).json({ error: "Permissão negada" });
      //   return;
      // }

      // Permissão concedida — chamar próximo middleware/rota
      next();
    } catch (err) {
      // Erro ao verificar permissões — retornar 500
      res.status(500).json({ error: "Erro ao verificar permissões" });
    }
  };
}
