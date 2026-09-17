# Spec: Monitoramento — Prometheus + Grafana + n8n

**Status:** Implementado ✅  
**ISO 27001:** A.8.15 (logs), A.8.18 (mínimo privilégio), A.8.20 (segmentação de rede), A.8.24 (TLS), A.9.4 (controle de acesso)  
**LGPD:** Métricas sem PII; retenção limitada a 15 dias; telemetria externa desabilitada.

---

## Arquitetura

```
Internet
    │ HTTPS 443
    ▼
[nginx — frontend container]
    ├── /api/*         → api-server:8080      (app_net)
    ├── /grafana/      → grafana:3000         (monitoring_net)  auth: Grafana nativa
    ├── /prometheus/   → prometheus:9090      (monitoring_net)  auth: HTTP Basic Auth
    ├── /n8n/          → n8n:5678             (app_net)         auth: n8n nativa
    └── /*             → static (Vite build)
    
[monitoring_net — internal: true — sem acesso à Internet]
    prometheus ←── scrape ──→ api-server:8080/api/metrics
    prometheus ←── scrape ──→ postgres-exporter:9187
    grafana    ←── datasource ──→ prometheus:9090
    postgres-exporter ──→ db:5432 (usuário seshat_monitor)
```

### Redes Docker

| Rede | Driver | `internal` | Serviços |
|---|---|---|---|
| `app_net` | bridge | `false` | db, api-server, frontend, n8n |
| `monitoring_net` | bridge | `true` | prometheus, grafana, postgres-exporter, api-server, n8n |

`internal: true` → nenhum container do `monitoring_net` acessa a Internet. Prometheus e Grafana nunca fazem chamadas externas.

---

## Prometheus

### Configuração (`monitoring/prometheus/prometheus.yml`)

| Parâmetro | Valor | Motivo |
|---|---|---|
| `scrape_interval` | 15s | Granularidade suficiente sem sobrecarga |
| `evaluation_interval` | 15s | Alerta reativo |
| `storage.tsdb.retention.time` | 15d (prod) / 7d (dev) | Mínimo necessário — LGPD |
| `web.external-url` | `/prometheus/` | Subpath nginx |
| `web.listen-address` | `0.0.0.0:9090` | Interno apenas |

### Jobs de scrape

| Job | Target | Path |
|---|---|---|
| `seshat_api` | `api-server:8080` | `/api/metrics` |
| `prometheus` | `localhost:9090` | `/metrics` (auto) |
| `postgres` | `postgres-exporter:9187` | `/metrics` (padrão) |

### Acesso

- **Produção:** `https://SEU_DOMINIO/prometheus/` — exige HTTP Basic Auth (`nginx/monitoring.htpasswd`)
- **Dev:** `http://localhost:9090` — acesso direto (sem auth em dev)

Gerar htpasswd:
```bash
htpasswd -c nginx/monitoring.htpasswd admin_monitoramento
# ou via script:
bash scripts/setup-monitoring.sh
```

### Proteção dupla de `/api/metrics`

1. **nginx:** `location = /api/metrics { return 403; }` — bloqueia acesso externo
2. **api-server:** allowlist de IP — só aceita requisições de `172.x`, `10.x`, `::1`, `127.x` (redes internas Docker)

```typescript
// artifacts/api-server/src/index.ts
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

## Métricas da Aplicação (`artifacts/api-server/src/lib/metrics.ts`)

### Instrumentos exportados

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `http_requests_total` | Counter | method, route, status_code | Total de requisições recebidas |
| `http_request_duration_seconds` | Histogram | method, route, status_code | Duração em segundos (buckets: 5ms…5s) |
| `http_requests_in_flight` | Gauge | — | Requisições em processamento agora |
| `process_*`, `nodejs_*` | (prom-client padrão) | — | Heap, GC, event loop lag, handles |

### `normalizeRoute(path: string): string`

Evita cardinalidade explosiva e vazamento de PII nos labels:

```typescript
// /api/usuarios/abc-123          → /api/usuarios/:id
// /api/avisos?q=João&mes=2026-09 → /api/avisos
// /api/healthz                   → /api/healthz
```

**Regras:**
1. Remove tudo após `?` (query string)
2. Substitui UUIDs por `/:id`
3. Substitui segmentos numéricos por `/:id`
4. Trunca em 120 caracteres

### Middleware de instrumentação

```typescript
app.use((req, res, next) => {
  if (req.path === "/api/metrics") return next(); // não instrumenta o próprio endpoint
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
```

---

## Grafana

### Configuração

| Variável | Valor (prod) | Motivo |
|---|---|---|
| `GF_SECURITY_ADMIN_USER` | `${GRAFANA_ADMIN_USER:-admin}` | Credencial via .env |
| `GF_SECURITY_ADMIN_PASSWORD` | `${GRAFANA_ADMIN_PASSWORD}` | OBRIGATÓRIO no .env |
| `GF_SERVER_ROOT_URL` | `https://%(domain)s/grafana/` | Subpath nginx |
| `GF_SERVER_SERVE_FROM_SUB_PATH` | `true` | Habilita subpath |
| `GF_ANALYTICS_REPORTING_ENABLED` | `false` | Sem telemetria (LGPD) |
| `GF_ANALYTICS_CHECK_FOR_UPDATES` | `false` | Sem chamadas externas |
| `GF_NEWS_NEWS_FEED_ENABLED` | `false` | Sem chamadas externas |
| `GF_USERS_ALLOW_SIGN_UP` | `false` | Somente admin cria usuários |
| `GF_AUTH_ANONYMOUS_ENABLED` | `false` | Sem acesso anônimo |
| `GF_SESSION_COOKIE_SECURE` | `true` | Apenas HTTPS |
| `GF_SESSION_COOKIE_SAMESITE` | `lax` | CSRF |

### Provisioning automático

`monitoring/grafana/provisioning/datasources/prometheus.yml` — datasource Prometheus pré-configurado (`editable: false`)  
`monitoring/grafana/provisioning/dashboards/dashboard.yml` — provider aponta para `/var/lib/grafana/dashboards`

### Dashboard `seshat-overview.json`

10 painéis provisionados automaticamente:

| Painel | Tipo | Métrica |
|---|---|---|
| Requisições/s | Stat | `rate(http_requests_total[5m])` |
| Erros 5xx | Stat | `rate(http_requests_total{status_code=~"5.."}[5m])` |
| Latência p95 | Gauge | `histogram_quantile(0.95, ...)` |
| Req em andamento | Stat | `http_requests_in_flight` |
| Req por rota | Timeseries | `topk(10, ...)` |
| Latência por rota | Timeseries | `histogram_quantile(0.95, ...)` |
| Node.js Heap | Timeseries | `nodejs_heap_used_bytes` |
| Conexões PG | Timeseries | `pg_stat_activity_count` |
| Status HTTP (pizza) | PieChart | por faixa 2xx/3xx/4xx/5xx |
| Tamanho do banco | Stat | `pg_database_size_bytes` |

### Acesso

- **Produção:** `https://SEU_DOMINIO/grafana/` (login com GRAFANA_ADMIN_PASSWORD)
- **Dev:** `http://localhost:3001` (usuário: `admin`, senha: `seshat-dev`)

---

## postgres-exporter

Imagem: `prometheuscommunity/postgres-exporter:v0.15.0`  
Usuário PostgreSQL: `seshat_monitor` — criado por `scripts/init-monitoring-user.sql`

```sql
-- Apenas pg_monitor (role nativa PG 10+) — sem acesso às tabelas da aplicação
GRANT pg_monitor TO seshat_monitor;
```

`DATA_SOURCE_NAME`: `postgresql://seshat_monitor:${PG_EXPORTER_PASSWORD}@db:5432/seshat?sslmode=disable`

---

## n8n

### O que é

Plataforma de automação de fluxos (workflow automation) auto-hospedada. Conecta o Seshat a serviços externos — Slack, e-mail, Google Sheets, webhooks, APIs REST — sem código adicional no backend.

### Configuração Docker

| Variável | Valor | Motivo |
|---|---|---|
| `DB_TYPE` | `postgresdb` | Banco relacional em produção |
| `DB_POSTGRESDB_DATABASE` | `seshat_n8n` | Banco isolado — workflows separados do seshat |
| `N8N_ENCRYPTION_KEY` | `${N8N_ENCRYPTION_KEY}` | Criptografia AES-256 das credenciais salvas |
| `N8N_PATH` | `/n8n/` | Subpath nginx |
| `N8N_EDITOR_BASE_URL` | `${FRONTEND_URL}/n8n/` | URL pública do editor |
| `WEBHOOK_URL` | `${FRONTEND_URL}/n8n/` | URL base de webhooks expostos |
| `N8N_DIAGNOSTICS_ENABLED` | `false` | Sem telemetria (LGPD) |
| `N8N_VERSION_NOTIFICATIONS_ENABLED` | `false` | Sem chamadas externas |
| `GENERIC_TIMEZONE` | `America/Sao_Paulo` | Agendamentos no fuso correto |

### Banco de dados

`scripts/init-n8n-db.sql` cria `seshat_n8n` idempotentemente na inicialização do PostgreSQL.  
n8n gerencia suas próprias migrations (Drizzle interno).

### Acesso

- **Produção:** `https://SEU_DOMINIO/n8n/` (login n8n — criar na primeira inicialização)
- **Dev:** `http://localhost:5678` (`docker compose --profile tools up`)

### Integração Slack

Slack é SaaS — não containerizável. Integração via n8n:

**Opção A — Incoming Webhook (simples):**
1. Acesse `api.slack.com/apps` → Create New App → From scratch
2. Ative **Incoming Webhooks** → Add New Webhook to Workspace
3. Copie a URL → defina em `.env` como `SLACK_WEBHOOK_URL`
4. No n8n: node **HTTP Request** com método POST para `{{ $env.SLACK_WEBHOOK_URL }}`

**Opção B — Bot Token (completo):**
1. Crie Slack App com Bot Token Scopes: `chat:write`, `channels:read`
2. Copie o Bot Token → configure credencial **Slack** no n8n
3. Use o node **Slack** para enviar mensagens, DMs e interações

### Exemplos de workflows Seshat + Slack

| Gatilho | Ação | Descrição |
|---|---|---|
| Webhook `POST /api/ocorrencias` | Slack `#ocorrencias` | Notifica coordenação a cada nova ocorrência |
| Cron diário 07:00 | Slack `#gestao` | Resumo do dia: cardápio, avisos publicados |
| Webhook `POST /api/avisos` (urgente) | Slack + E-mail | Alerta imediato para toda equipe |
| Cron semanal | Google Sheets | Exporta métricas Grafana para planilha de gestão |

---

## Variáveis de Ambiente (`.env`)

```bash
# Grafana
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=SENHA_FORTE_AQUI    # mínimo 12 chars, alfanumérico + especial

# postgres-exporter
PG_EXPORTER_USER=seshat_monitor
PG_EXPORTER_PASSWORD=SENHA_FORTE_AQUI

# n8n
N8N_ENCRYPTION_KEY=<32 bytes hex>          # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Slack (usado nos workflows n8n)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

---

## Execução em Desenvolvimento

```bash
# Subir Prometheus + Grafana
docker compose --profile monitoring up -d
# Grafana:    http://localhost:3001  (admin / seshat-dev)
# Prometheus: http://localhost:9090  (sem auth em dev)

# Subir n8n
docker compose --profile tools up -d
# n8n:        http://localhost:5678  (criar usuário na primeira abertura)

# Subir tudo junto
docker compose --profile monitoring --profile tools up -d
```

---

## Deploy em Produção

```bash
# 1. Preparar .env
cp .env.example .env
# Preencher: GRAFANA_ADMIN_PASSWORD, PG_EXPORTER_PASSWORD, N8N_ENCRYPTION_KEY

# 2. Gerar htpasswd para Prometheus
bash scripts/setup-monitoring.sh

# 3. Subir stack completa
docker compose -f docker-compose.prod.yml up -d --build

# Verificar saúde
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs prometheus --tail=20
docker compose -f docker-compose.prod.yml logs grafana --tail=20
docker compose -f docker-compose.prod.yml logs n8n --tail=20
```

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `artifacts/api-server/src/lib/metrics.ts` | Instrumentação prom-client |
| `artifacts/api-server/src/index.ts` | Middleware + endpoint `/api/metrics` |
| `monitoring/prometheus/prometheus.yml` | Jobs de scrape |
| `monitoring/grafana/provisioning/` | Datasource + dashboard provider |
| `monitoring/grafana/dashboards/seshat-overview.json` | Dashboard 10 painéis |
| `docker-compose.prod.yml` | Stack de produção completa |
| `docker-compose.yml` | Perfis `monitoring` e `tools` (dev) |
| `nginx/nginx.conf` | Proxy `/grafana/`, `/prometheus/`, `/n8n/` |
| `scripts/init-monitoring-user.sql` | Cria `seshat_monitor` (pg_monitor) |
| `scripts/init-n8n-db.sql` | Cria banco `seshat_n8n` |
| `scripts/setup-monitoring.sh` | Cria `nginx/monitoring.htpasswd` |
| `.env.example` | Template com todas as variáveis |
