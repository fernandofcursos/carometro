import { Router, Request, Response } from "express";
import { z } from "zod";

// Criar router para rota /api/auth
const router = Router();

// Schema de validação para login (usando Zod)
// Garante que os campos obrigatórios estão presentes e têm tipos corretos
const loginSchema = z.object({
  // Código de acesso do usuário (CPF ou matrícula)
  codigoAcesso: z.string().min(1, "Código de acesso obrigatório"),
  // Senha do usuário
  senha: z.string().min(1, "Senha obrigatória"),
});

// POST /api/auth/login — autenticar usuário
// Retorna JWT em cookie httpOnly
router.post("/login", async (req: Request, res: Response) => {
  try {
    // Validar payload com Zod
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      // Dados inválidos — retornar 400 com detalhes do erro
      return res.status(400).json({
        error: "Dados inválidos",
        issues: parsed.error.issues,
      });
    }

    const { codigoAcesso, senha } = parsed.data;

    // TODO: Implementar lógica de login
    // 1. Buscar usuário no banco por codigoAcesso
    // 2. Verificar bloqueio por tentativas falhas (ISO 27001 A.8.5)
    // 3. Comparar senha com bcrypt
    // 4. Gerar JWT
    // 5. Registrar auditoria

    // Resposta de exemplo (será implementado na Fase 1.4)
    res.status(200).json({
      error: "Login ainda não implementado",
    });
  } catch (err) {
    res.status(500).json({ error: "Erro ao fazer login" });
  }
});

// POST /api/auth/logout — fazer logout
// Limpar cookie de autenticação
router.post("/logout", (req: Request, res: Response) => {
  // Limpar cookie JWT
  res.clearCookie("token", { path: "/" });
  // Retornar sucesso
  res.json({ message: "Logout realizado" });
});

// GET /api/auth/me — obter dados do usuário autenticado
// Requer middleware requireAuth
router.get("/me", (req: Request, res: Response) => {
  // TODO: Implementar quando rotas de autenticação forem conclusas
  res.status(401).json({ error: "Não autenticado" });
});

// Exportar router para ser registrado em index.ts
export default router;
