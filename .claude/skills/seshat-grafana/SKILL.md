# Skill: Grafana — Visualização de Métricas

## Visão Geral

Grafana é a interface de dashboards conectada ao Prometheus.  
Opera na rede `monitoring_net` (`internal: true`) — sem acesso externo direto.  
Acesso via nginx `/grafana/` sob TLS, com autenticação própria do Grafana.

---

## Provisioning Automático

Grafana inicia **totalmente provisionado** — sem configuração manual necessária.

### Datasource (`monitoring/grafana/provisioning/datasources/prometheus.yml`)

```yaml
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

`editable: false` → impede alteração acidental da URL pelo operador.

### Dashboard Provider (`monitoring/grafana/provisioning/dashboards/dashboard.yml`)

```yaml
providers:
  - name: seshat
    folder: Seshat
    type: file
    disableDeletion: true
    options:
      path: /var/lib/grafana/dashboards
```

`disableDeletion: true` → dashboards provisionados não podem ser deletados via UI.

---

## Dashboard `seshat-overview`

Arquivo: `monitoring/grafana/dashboards/seshat-overview.json`

10 painéis organizados em 2 linhas:

### Linha 1 — KPIs de saúde (stat/gauge)

| Painel | Métrica | Limiares |
|---|---|---|
| Requisições/s | `rate(http_requests_total[5m])` | Verde ≤ 100, Amarelo ≤ 500, Vermelho > 500 |
| Taxa de erros 5xx | `rate(http_requests_total{status_code=~"5.."}[5m])` | Verde = 0, Vermelho > 0 |
| Latência p95 | `histogram_quantile(0.95, ...)` | Verde ≤ 500ms, Amarelo ≤ 1s, Vermelho > 1s |
| Req em andamento | `http_requests_in_flight` | Informativo |

### Linha 2 — Séries temporais e detalhamento

| Painel | Tipo | Conteúdo |
|---|---|---|
| Req por rota (top 10) | Timeseries | `rate(http_requests_total[5m])` por `route` |
| Latência p95 por rota | Timeseries | `histogram_quantile(0.95, ...)` por `route` |
| Node.js Heap | Timeseries | `nodejs_heap_used_bytes` |
| Conexões PostgreSQL | Timeseries | `pg_stat_activity_count` |
| Status HTTP | PieChart | Distribuição 2xx / 3xx / 4xx / 5xx |
| Tamanho do banco | Stat | `pg_database_size_bytes{datname="seshat"}` |

---

## Configuração de Segurança (ISO 27001 / LGPD)

```yaml
# Produção — docker-compose.prod.yml
environment:
  GF_SECURITY_ADMIN_USER:          ${GRAFANA_ADMIN_USER:-admin}
  GF_SECURITY_ADMIN_PASSWORD:      ${GRAFANA_ADMIN_PASSWORD}       # obrigatório no .env
  GF_ANALYTICS_REPORTING_ENABLED:  "false"   # sem telemetria (LGPD)
  GF_ANALYTICS_CHECK_FOR_UPDATES:  "false"   # sem chamadas externas
  GF_NEWS_NEWS_FEED_ENABLED:       "false"   # sem chamadas externas
  GF_USERS_ALLOW_SIGN_UP:          "false"   # somente admin cria usuários
  GF_AUTH_ANONYMOUS_ENABLED:       "false"   # sem acesso anônimo
  GF_SESSION_COOKIE_SECURE:        "true"    # apenas HTTPS
  GF_SESSION_COOKIE_SAMESITE:      "lax"     # CSRF
  GF_SECURITY_COOKIE_SECURE:       "true"
  GF_SERVER_ROOT_URL:              https://%(domain)s/grafana/
  GF_SERVER_SERVE_FROM_SUB_PATH:   "true"
```

---

## Acesso por Ambiente

### Desenvolvimento

```bash
docker compose --profile monitoring up -d
# http://localhost:3001
# Usuário: admin   Senha: seshat-dev
```

Porta `3001` para não colidir com o Vite dev server (porta 3000).

### Produção

```bash
# .env deve ter GRAFANA_ADMIN_PASSWORD definido
docker compose -f docker-compose.prod.yml up -d
# https://SEU_DOMINIO/grafana/
# Usuário: admin (ou GRAFANA_ADMIN_USER)   Senha: GRAFANA_ADMIN_PASSWORD
```

---

## Nginx — Proxy para Grafana

```nginx
location /grafana/ {
  proxy_pass         http://grafana:3000/;
  proxy_http_version 1.1;
  proxy_set_header   Host              $host;
  proxy_set_header   X-Real-IP         $remote_addr;
  proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
  proxy_set_header   X-Forwarded-Proto $scheme;
  # WebSocket para live updates do Grafana
  proxy_set_header   Upgrade           $http_upgrade;
  proxy_set_header   Connection        "upgrade";
  proxy_read_timeout 120s;
}
```

WebSocket é necessário para o **Live Streaming** dos painéis (atualização em tempo real).

---

## Adicionar Novo Painel

1. Acessar Grafana em `/grafana/`
2. Abrir dashboard `Seshat Overview`
3. Adicionar painel via UI
4. Exportar como JSON: `Dashboard → Share → Export → Save to file`
5. Substituir `monitoring/grafana/dashboards/seshat-overview.json`
6. Commitar — próximo `up` provisiona automaticamente

**Não salvar dashboards pela UI em produção** — use o arquivo JSON versionado.

---

## Gestão de Usuários

Grafana tem seu próprio sistema de usuários (não usa o PostgreSQL do Seshat):

```
Admin (criado pelo .env) → cria outros usuários via UI
Roles: Admin | Editor | Viewer
```

Recomendação: criar usuário `Viewer` para equipe gestora (acesso somente leitura).

---

## Troubleshooting

| Sintoma | Causa | Solução |
|---|---|---|
| Grafana não conecta ao Prometheus | URL do datasource errada | Verificar `prometheus.yml` — URL deve ser `http://prometheus:9090` |
| Dashboards não aparecem | Provider mal configurado | Verificar path e permissões do volume |
| "Upstream connect error" no nginx | Grafana não inicializou | `docker compose logs grafana` — aguardar healthcheck |
| Login não funciona | `GRAFANA_ADMIN_PASSWORD` não definido | Verificar `.env` |
| Dados não atualizam | Prometheus não scrapeando | Verificar targets em `/prometheus/targets` |
