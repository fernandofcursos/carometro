import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Estender tipo Request para incluir usuarioId adicionado pelo middleware
declare global {
  namespace Express {
    interface Request {
      usuarioId?: string;
      escolaId?: string;
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
      issuer: "seshat",
    }) as { sub: string; roles?: string[]; escolaId?: string };

    // Salvar usuarioId e escolaId no request para uso nas rotas
    req.usuarioId = payload.sub;
    req.escolaId = payload.escolaId;
    // Chamar próximo middleware/rota
    next();
  } catch (err) {
    // Token expirado ou inválido — limpar cookie e retornar 401
    res.clearCookie("token");
    res.status(401).json({ error: "Sessão expirada" });
  }
}

// Assinar novo JWT após login bem-sucedido
// Payload contém sub (user ID), roles e escolaId opcional para multi-tenant
export function signToken(userId: string, roles: string[], escolaId?: string): string {
  const payload: Record<string, any> = { sub: userId, roles };
  if (escolaId) payload.escolaId = escolaId;
  // JWT com 8 horas de validade — bastante para uma sessão de trabalho
  const token = jwt.sign(
    payload,
    // Secret key — DEVE ser aleatório em produção (mínimo 64 chars)
    process.env.SESSION_SECRET!,
    // Opções de assinatura
    { expiresIn: "8h", issuer: "seshat" }
  );
  return token;
}

// Assinar token temporário para seleção de escola (multi-escola)
// Curta duração (5 min) — apenas para o fluxo de seleção de escola
export function signTempToken(userId: string): string {
  return jwt.sign(
    { sub: userId, pendingEscolaSelection: true },
    process.env.SESSION_SECRET!,
    { expiresIn: "5m", issuer: "seshat" }
  );
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

// Configurar cookie temporário para seleção de escola
export function setTempCookie(res: Response, token: string): void {
  res.cookie("temp_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 5 * 60 * 1000, // 5 minutos
    path: "/",
  });
}

// Limpar cookie de autenticação (logout)
export function clearAuthCookie(res: Response): void {
  res.clearCookie("token", { path: "/" });
}
