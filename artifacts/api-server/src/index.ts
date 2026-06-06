import { createApp } from "./app.js";
import { Request, Response, NextFunction } from "express";
import authRouter from "./routes/auth.js";
// Fase 3: Importar rotas de LGPD e auditoria
import lgpdRouter from "./routes/lgpd.js";
import auditoriaRouter from "./routes/auditoria.js";

// Criar aplicação com middlewares configurados
const app = createApp();

// Rota de health check — verificar se servidor está rodando
// Usado por docker compose healthcheck e load balancers
app.get("/api/healthz", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Registrar rota de autenticação — DEVE vir antes de qualquer router com requireAuth
app.use("/api/auth", authRouter);

// Fase 3: Registrar rotas de LGPD (consentimentos e solicitações de direitos)
// Path específico /api/lgpd evita que requireAuth intercepte /api/auth/*
app.use("/api/lgpd", lgpdRouter);

// Fase 3: Registrar rotas de auditoria (logs de operações)
app.use("/api/auditoria", auditoriaRouter);
// app.use("/api/turnos", turnosRouter);
// app.use("/api/cursos", cursosRouter);
// app.use("/api/turmas", turmasRouter);
// app.use("/api/estudantes", estudantesRouter);
// app.use("/api/carometro", carometroRouter);
// app.use("/api/import", importRouter);
// app.use("/api/ocorrencias", ocorrenciasRouter);
// app.use("/api/roles", rolesRouter);
// app.use("/api/usuarios", usuariosRouter);
// app.use("/api/disciplinas", disciplinasRouter);

// Handler de erro global — nunca vazar stack trace em produção
// ISO 27001 A.8.3 — proteção contra erros que revelam detalhes internos
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Log estruturado do erro
  req.log?.error(err);

  // Em produção, não retornar detalhes da exceção (pode revelar vulnerabilidades)
  const isProd = process.env.NODE_ENV === "production";
  res.status(500).json({
    error: isProd ? "Erro interno" : err.message,
  });
});

// Inicializar servidor Express na porta configurada
const PORT = Number(process.env.PORT ?? 8080);
app.listen(PORT, () => {
  console.log(`✅ API rodando na porta ${PORT}`);
});
