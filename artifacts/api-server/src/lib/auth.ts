import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Estender tipo Request para incluir usuarioId adicionado pelo middleware
declare global {
  namespace Express {
    interface Request {
      usuarioId?: string;
      log?: any;
      startTime?: number;
      ip?: string;
    }
  }
}

// Middleware obrigatório — verifica JWT antes de acessar qualquer rota autenticada
// Cookie httpOnly é mais seguro que localStorage (protegido contra XSS)
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Extrair JWT do cookie
  const token = req.cookies?.token;
  if (!token) {
    // Não autenticado — retornar 401
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  try {
    // Verificar assinatura do JWT e prazo de expiração
    // issuer valida que o token foi gerado por esta aplicação
    const payload = jwt.verify(token, process.env.SESSION_SECRET!, {
      issuer: "carometro",
    }) as { sub: string };

    // Salvar usuarioId no request para uso nas rotas
    req.usuarioId = payload.sub;
    // Chamar próximo middleware/rota
    next();
  } catch (err) {
    // Token expirado ou inválido — limpar cookie e retornar 401
    res.clearCookie("token");
    res.status(401).json({ error: "Sessão expirada" });
  }
}

// Assinar novo JWT após login bem-sucedido
// Payload contém sub (user ID) e roles para autorização baseada em roles
export function signToken(userId: string, roles: string[]): string {
  // JWT com 8 horas de validade — bastante para uma sessão de trabalho
  const token = jwt.sign(
    // Payload
    { sub: userId, roles },
    // Secret key — DEVE ser aleatório em produção (mínimo 64 chars)
    process.env.SESSION_SECRET!,
    // Opções de assinatura
    { expiresIn: "8h", issuer: "carometro" }
  );
  return token;
}

// Configurar cookie httpOnly com token JWT
// httpOnly protege contra XSS — JavaScript não consegue acessar
export function setAuthCookie(res: Response, token: string): void {
  res.cookie("token", token, {
    // httpOnly = JavaScript não consegue acessar (protege contra XSS)
    httpOnly: true,
    // Secure = apenas HTTPS em produção (HTTP em dev para localhost)
    secure: process.env.NODE_ENV === "production",
    // SameSite = apenas requisições do mesmo site (protege contra CSRF)
    sameSite: "lax",
    // 8 horas = mesma validade do JWT
    maxAge: 8 * 60 * 60 * 1000,
    // Path = disponível em todas as rotas
    path: "/",
  });
}

// Limpar cookie de autenticação (logout)
export function clearAuthCookie(res: Response): void {
  res.clearCookie("token", { path: "/" });
}
