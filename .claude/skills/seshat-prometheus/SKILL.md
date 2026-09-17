# Skill: Prometheus — Coleta de Métricas

## Visão Geral

Prometheus coleta métricas da aplicação a cada **15 segundos** via scrape HTTP.  
Opera exclusivamente na rede Docker interna `monitoring_net` (`internal: true`).  
Nunca tem portas expostas ao host em produção — acesso via nginx `/prometheus/` com HTTP Basic Auth.

---

## Arquitetura de Scrape

```
[monitoring_net — sem Internet]
  prometheus:9090
    ├── scrape → api-server:8080/api/metrics    (job: seshat_api)
    ├── scrape → postgres-exporter:9187/metrics (job: postgres)
    └── scrape → localhost:9090/metrics         (job: prometheus — auto)
```

---

## Métricas Coletadas

### Da aplicação (`seshat_api`)

Definidas em `artifacts/api-server/src/lib/metrics.ts`:

| Métrica | Tipo | Labels |
|---|---|---|
| `http_requests_total` | Counter | `method`, `route`, `status_code` |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` |
| `http_requests_in_flight` | Gauge | — |
| `process_*`, `nodejs_*` | (prom-client default) | — |

**`normalizeRoute()`** — obrigatório para evitar cardinalidade explosiva e PII:
```typescript
// /api/usuarios/abc-123  →  /api/usuarios/:id
// /api/avisos?q=João     →  /api/avisos
```

### Do PostgreSQL (`postgres`)

Coletadas pelo `postgres-exporter` (usuário `seshat_monitor`, role `pg_monitor`):
- `pg_stat_activity_count` — conexões ativas
- `pg_database_size_bytes` — tamanho do banco
- `pg_stat_bgwriter_*` — I/O do background writer
- `pg_locks_count` — locks ativos

---

## Endpoint `/api/metrics`

Dupla proteção (ISO 27001 A.8.20):

1. **nginx:** `location = /api/metrics { return 403; }` — bloqueia qualquer request externo
2. **api-server:** allowlist de IP interno:

```typescript
const ALLOWED_METRICS_NETS = ["172.", "10.", "::1", "127."];
app.get("/api/metrics", async (req, res) => {
  const ip = req.ip ?? "";
  if (!ALLOWED_METRICS_NETS.some(p => ip.startsWith(p)))
    return res.status(403).json({ error: "Forbidden" });
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});
```

---

## Configuração (`monitoring/prometheus/prometheus.yml`)

```yaml
global:
  scrape_interval: 15s
  external_labels:
    environment: production
    app: seshat

scrape_configs:
  - job_name: seshat_api
    static_configs:
      - targets: ["api-server:8080"]
    metrics_path: /api/metrics

  - job_name: prometheus
    static_configs:
      - targets: ["localhost:9090"]

  - job_name: postgres
    static_configs:
      - targets: ["postgres-exporter:9187"]
```

---

## Retenção

| Ambiente | Retenção | Configuração |
|---|---|---|
| Produção | 15 dias | `--storage.tsdb.retention.time=15d` |
| Dev | 7 dias | `--storage.tsdb.retention.time=7d` |

15 dias é o máximo praticado — reduzir se necessário para conformidade LGPD.

---

## Acesso por Ambiente

### Desenvolvimento

```bash
docker compose --profile monitoring up -d
# http://localhost:9090  (sem autenticação)
```

### Produção

```bash
# 1. Gerar arquivo de senhas
bash scripts/setup-monitoring.sh
# Ou manualmente:
htpasswd -c nginx/monitoring.htpasswd admin_monitoramento

# 2. Subir
docker compose -f docker-compose.prod.yml up -d

# Acesso: https://SEU_DOMINIO/prometheus/
# (pede usuário/senha do htpasswd)
```

---

## PromQL — Queries Úteis

```promql
# Taxa de requisições por segundo (últimos 5 min)
rate(http_requests_total{app="seshat"}[5m])

# Taxa de erros 5xx
rate(http_requests_total{status_code=~"5.."}[5m])

# Latência p95 por rota
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route)
)

# Requisições em andamento
http_requests_in_flight

# Conexões PostgreSQL
pg_stat_activity_count

# Tamanho do banco (bytes)
pg_database_size_bytes{datname="seshat"}

# Heap Node.js
nodejs_heap_used_bytes
```

---

## Adicionar Nova Métrica

1. Abrir `artifacts/api-server/src/lib/metrics.ts`
2. Instanciar o instrumento no registry:
   ```typescript
   export const minhaMetrica = new Counter({
     name: "seshat_minha_metrica_total",
     help: "Descrição curta sem PII",
     labelNames: ["tipo"],
     registers: [registry],
   });
   ```
3. Incrementar/observar no local correto do código
4. Labels: **nunca** incluir `userId`, `email`, `cpf`, `nome`, `ip`

---

## Troubleshooting

| Sintoma | Causa | Solução |
|---|---|---|
| Target `seshat_api` DOWN | api-server não está rodando | `docker compose logs api-server` |
| 403 em `/api/metrics` | IP do Prometheus fora da allowlist | Verificar `monitoring_net` no compose |
| Target `postgres` DOWN | `seshat_monitor` não criado | Recriar container `db` (init script roda na primeira vez) |
| Prometheus não inicia | Erro no prometheus.yml | `docker compose logs prometheus` + validar YAML |
