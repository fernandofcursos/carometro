/**
 * Instrumentação Prometheus (prom-client).
 *
 * LGPD / ISO 27001:
 *   - Labels NUNCA contêm dados pessoais (user_id, email, CPF, nome).
 *   - Query strings são removidas da rota antes de virar label
 *     (ex: /api/usuarios?q=João → /api/usuarios).
 *   - O endpoint /api/metrics é protegido por allowlist de IP interno
 *     (ver middleware metricsAuth em index.ts).
 */
import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from "prom-client";

export const registry = new Registry();

registry.setDefaultLabels({ app: "seshat" });

// Coleta métricas padrão do Node.js (heap, GC, event loop lag, handles)
collectDefaultMetrics({ register: registry });

// ── Contadores e histogramas HTTP ─────────────────────────────────────────────

export const httpRequestsTotal = new Counter({
  name:    "http_requests_total",
  help:    "Total de requisições HTTP recebidas",
  labelNames: ["method", "route", "status_code"],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name:    "http_request_duration_seconds",
  help:    "Duração das requisições HTTP em segundos",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const httpRequestsInFlight = new Gauge({
  name:    "http_requests_in_flight",
  help:    "Requisições HTTP em processamento no momento",
  registers: [registry],
});

// ── Utilitário: normaliza rota para label segura ──────────────────────────────

/**
 * Remove query strings e parâmetros dinâmicos para evitar cardinalidade
 * explosiva e vazamento acidental de dados pessoais em query params.
 *
 * Ex:
 *   /api/usuarios/abc-123     → /api/usuarios/:id
 *   /api/avisos?mes=2026-09   → /api/avisos
 *   /api/healthz              → /api/healthz
 */
export function normalizeRoute(path: string): string {
  // Remove query string
  const clean = path.split("?")[0];
  // Substitui UUIDs e IDs numéricos por :id
  return clean
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+/g, "/:id")
    // Trunca rotas muito longas (segurança: evita label injection)
    .slice(0, 120);
}
