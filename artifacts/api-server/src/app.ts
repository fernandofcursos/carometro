import express, { Express } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";

// Factory da aplicação Express com middlewares de segurança
export function createApp(): Express {
  // Instanciar aplicação Express
  const app = express();

  // ISO 27001 — A.8.26: segurança em aplicações (headers de segurança)
  // Helmet adiciona headers HTTP importantes para mitigação de ataques comuns
  app.use(helmet({
    // Content Security Policy — bloqueia inline scripts e recursos não permitidos
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],      // Padrão: apenas recursos do próprio domínio
        scriptSrc: ["'self'"],        // Scripts bloqueados exceto locais
        styleSrc: ["'self'", "'unsafe-inline'"],  // CSS inline necessário para algumas libs
        imgSrc: ["'self'", "data:"],  // Imagens locais e data URLs
      },
    },
    // HSTS — obriga HTTPS por 1 ano (31536000 segundos)
    hsts: { maxAge: 31536000, includeSubDomains: true },
  }));

  // CORS — permitir requisições apenas do frontend autorizado
  // LGPD + ISO 27001: credentials=true necessário para cookies httpOnly funcionarem
  app.use(cors({
    // URL do frontend — substitui localhost em produção
    origin: process.env.FRONTEND_URL ?? "http://localhost:5000",
    // Permitir cookies nas requisições cross-origin
    credentials: true,
  }));

  // Parser de cookies — usado para JWT em cookie
  app.use(cookieParser());

  // Parser JSON com limite aumentado (fotos em base64 podem ser grandes)
  // 10MB é suficiente para fotos JPEG comprimidas (~150KB cada)
  app.use(express.json({ limit: "10mb" }));

  // Logging estruturado — ISO 27001 A.8.15 (logging de eventos de segurança)
  // Pino registra automaticamente todas as requisições/respostas
  app.use(pinoHttp({ level: process.env.LOG_LEVEL ?? "info" }));

  // Retornar aplicação configurada (middlewares prontos)
  return app;
}
