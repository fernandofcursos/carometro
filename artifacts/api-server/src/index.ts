import fs from "node:fs";
const UPLOADS_DIR = new URL("../uploads/avisos/", import.meta.url).pathname;
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

import { createApp } from "./app.js";
import { Request, Response, NextFunction } from "express";
import {
  registry, httpRequestsTotal, httpRequestDuration, httpRequestsInFlight, normalizeRoute
} from "./lib/metrics.js";
import authRouter from "./routes/auth.js";
// Fase 3: Importar rotas de LGPD e auditoria
import lgpdRouter from "./routes/lgpd.js";
import auditoriaRouter from "./routes/auditoria.js";
// SDD Dia 1: rotas de entidades de suporte
import turnosRouter from "./routes/turnos.js";
import cursosRouter from "./routes/cursos.js";
import disciplinasRouter from "./routes/disciplinas.js";
import turmasRouter from "./routes/turmas.js";
// SDD Dia 2: ocorrências, roles e usuários
import tiposOcorrenciasRouter from "./routes/tipos-ocorrencias.js";
import textosPadraoRouter from "./routes/textos-padrao.js";
import mailerTestRouter from "./routes/mailer-test.js";
import ocorrenciasRouter from "./routes/ocorrencias.js";
import rolesRouter from "./routes/roles.js";
import usuariosRouter from "./routes/usuarios.js";
// SDD Dia 3: estudantes, carômetro e import
import estudantesRouter from "./routes/estudantes.js";
import matriculasRouter from "./routes/matriculas.js";
import usuarioDisciplinasRouter from "./routes/usuario-disciplinas.js";
import seshatRouter from "./routes/seshat.js";
import importRouter from "./routes/import.js";
import statsRouter from "./routes/stats.js";
import fotosRouter from "./routes/fotos.js";
import biometriaRouter from "./routes/biometria.js";
import portalEstudanteRouter from "./routes/portal-estudante.js";
import carteirasRouter, { criarRotaVerificacaoCarteira } from "./routes/carteiras.js";
import portalResponsavelRouter from "./routes/portal-responsavel.js";
import gestaoResponsaveisRouter from "./routes/gestao-responsaveis.js";
import calendarioRouter from "./routes/calendario.js";
import horariosRouter from "./routes/horarios.js";
import portalProfessorRouter from "./routes/portal-professor.js";
import portalGestoraRouter from "./routes/portal-gestora.js";
import portalCoordenadorRouter from "./routes/portal-coordenador.js";
// Módulo Avisos e Informes
import avisosInformesRouter from "./routes/avisos-informes.js";
import requerimentosRouter from "./routes/requerimentos.js";

// Criar aplicação com middlewares configurados
const app = createApp();

// ── Métricas Prometheus ───────────────────────────────────────────────────────
// Middleware de instrumentação HTTP — deve vir antes de qualquer rota.
// LGPD: labels não contêm dados pessoais (ver normalizeRoute).
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/api/metrics") return next(); // evita auto-instrumentar /metrics
  const start = process.hrtime.bigint();
  httpRequestsInFlight.inc();
  res.on("finish", () => {
    httpRequestsInFlight.dec();
    const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
    const route = normalizeRoute(req.path);
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, durationSec);
  });
  next();
});

// Endpoint /api/metrics — acessível SOMENTE a partir da rede interna Docker.
// ISO 27001 A.8.20: porta não exposta externamente; nginx bloqueia /api/metrics.
// LGPD: métricas agregadas sem PII.
const ALLOWED_METRICS_NETS = ["172.", "10.", "::1", "127."];
app.get("/api/metrics", async (req: Request, res: Response) => {
  const ip = req.ip ?? "";
  const allowed = ALLOWED_METRICS_NETS.some((prefix) => ip.startsWith(prefix));
  if (!allowed) return res.status(403).json({ error: "Forbidden" });
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

// Rota de health check — verificar se servidor está rodando
// Usado por docker compose healthcheck e load balancers
app.get("/api/healthz", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Data do servidor — usada por dashboards para exibir o mês correto
app.get("/api/hoje", (_req: Request, res: Response) => {
  res.json({ hoje: new Date().toISOString().slice(0, 10) });
});

// Registrar rota de autenticação — DEVE vir antes de qualquer router com requireAuth
app.use("/api/auth", authRouter);

// Fase 3: Registrar rotas de LGPD (consentimentos e solicitações de direitos)
// Path específico /api/lgpd evita que requireAuth intercepte /api/auth/*
app.use("/api/lgpd", lgpdRouter);

// Fase 3: Registrar rotas de auditoria (logs de operações)
app.use("/api/auditoria", auditoriaRouter);
// SDD Dia 1: rotas implementadas
app.use("/api/turnos", turnosRouter);
app.use("/api/cursos", cursosRouter);
app.use("/api/disciplinas", disciplinasRouter);
app.use("/api/turmas", turmasRouter);
// SDD Dia 2: rotas implementadas
app.use("/api/tipos-ocorrencias", tiposOcorrenciasRouter);
app.use("/api/mailer", mailerTestRouter);
app.use("/api/textos-padrao", textosPadraoRouter);
app.use("/api/ocorrencias", ocorrenciasRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/usuarios", usuariosRouter);
// SDD Dia 3: rotas implementadas
app.use("/api/estudantes", estudantesRouter);
app.use("/api/matriculas", matriculasRouter);
app.use("/api/usuario-disciplinas", usuarioDisciplinasRouter);
app.use("/api/carometro", seshatRouter);
app.use("/api/import", importRouter);
app.use("/api/stats", statsRouter);
app.use("/api/fotos", fotosRouter);
// Biometria facial e digital (WebAuthn FIDO2)
app.use("/api/auth/biometria", biometriaRouter);
// Portal do estudante (autoatendimento)
app.use("/api/portal", portalEstudanteRouter);
// Gestão de carteiras e cartões (coordenadores / equipe gestora)
app.use("/api/carteiras", carteirasRouter);
// Verificação pública de QR Code (sem auth) — verifica status real no banco
app.use("/api/verificar", criarRotaVerificacaoCarteira());
// Portal do responsável (pais/responsáveis)
app.use("/api/portal-responsavel", portalResponsavelRouter);
// Gestão de vínculos responsável↔estudante, cartões de saída e atestados (coordenadores)
// Rotas disponíveis em /api/gestao-responsaveis/{vinculos, cartoes-saida, atestados-medicos}
app.use("/api/gestao-responsaveis", gestaoResponsaveisRouter);
app.use("/api/calendario", calendarioRouter);
app.use("/api/horarios", horariosRouter);
// Portal do professor (autoatendimento do docente)
app.use("/api/portal-professor", portalProfessorRouter);
// Portal da equipe gestora
app.use("/api/portal-gestora", portalGestoraRouter);
// Portal do coordenador (autoatendimento do coordenador de curso)
app.use("/api/portal-coordenador", portalCoordenadorRouter);
// Módulo Avisos e Informes
app.use("/api/avisos-informes", avisosInformesRouter);
app.use("/api/requerimentos", requerimentosRouter);

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
