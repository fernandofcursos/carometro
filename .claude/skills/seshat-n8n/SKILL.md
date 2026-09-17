# Skill: n8n — Automação de Fluxos e Integração Slack

## Visão Geral

n8n é uma plataforma de automação de fluxos auto-hospedada.  
Conecta o Seshat a serviços externos (Slack, e-mail, planilhas, APIs) sem adicionar código ao backend.  
Acesso via nginx `/n8n/` sob TLS — porta `5678` nunca exposta em produção.

---

## Arquitetura

```
[app_net]
  nginx /n8n/ ──→ n8n:5678

[n8n pode chamar]
  api-server:8080   (webhooks internos do Seshat)
  db:5432           (banco seshat_n8n — exclusivo n8n)
  ↓ HTTPS para fora
  Slack API / api.slack.com
  Gmail / SMTP
  Google Sheets API
  Qualquer REST API
```

n8n está em `app_net` (não em `monitoring_net`) para poder fazer chamadas externas HTTPS — diferente do Prometheus/Grafana que são `internal: true`.

---

## Banco de Dados

n8n usa PostgreSQL dedicado para persistir workflows, credenciais e execuções:

| Parâmetro | Valor |
|---|---|
| Banco | `seshat_n8n` |
| Host | `db:5432` |
| Usuário | `${POSTGRES_USER}` (mesmo da aplicação) |
| Init script | `scripts/init-n8n-db.sql` (cria banco idempotentemente) |

O banco `seshat_n8n` é isolado do banco `seshat` da aplicação. Workflows e credenciais do n8n nunca tocam as tabelas do Seshat diretamente.

---

## Configuração por Ambiente

### Desenvolvimento

```bash
docker compose --profile tools up -d n8n
# http://localhost:5678
# Na primeira abertura: criar conta de owner
```

Não exige banco PostgreSQL (usa SQLite embutido por padrão em dev — sem `DB_TYPE`).

### Produção (`docker-compose.prod.yml`)

```yaml
environment:
  DB_TYPE:                 postgresdb
  DB_POSTGRESDB_HOST:      db
  DB_POSTGRESDB_PORT:      5432
  DB_POSTGRESDB_DATABASE:  seshat_n8n
  DB_POSTGRESDB_USER:      ${POSTGRES_USER}
  DB_POSTGRESDB_PASSWORD:  ${POSTGRES_PASSWORD}
  N8N_ENCRYPTION_KEY:      ${N8N_ENCRYPTION_KEY}   # AES-256 das credenciais
  N8N_PATH:                /n8n/
  N8N_EDITOR_BASE_URL:     ${FRONTEND_URL}/n8n/
  WEBHOOK_URL:             ${FRONTEND_URL}/n8n/
  N8N_DIAGNOSTICS_ENABLED: "false"                 # LGPD — sem telemetria
  GENERIC_TIMEZONE:        America/Sao_Paulo
```

**`N8N_ENCRYPTION_KEY`** — CRÍTICO: se perdido, todas as credenciais salvas ficam inacessíveis. Guardar em local seguro (vault, secrets manager).

Gerar chave:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Nginx — Proxy para n8n

```nginx
location /n8n/ {
  proxy_pass         http://n8n:5678/n8n/;
  proxy_http_version 1.1;
  proxy_set_header   Host              $host;
  proxy_set_header   X-Real-IP         $remote_addr;
  proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
  proxy_set_header   X-Forwarded-Proto $scheme;
  # WebSocket — necessário para execuções ao vivo no editor
  proxy_set_header   Upgrade           $http_upgrade;
  proxy_set_header   Connection        "upgrade";
  proxy_read_timeout 300s;
  proxy_send_timeout 300s;
  add_header Cache-Control "no-store, no-cache, must-revalidate";
}
```

`proxy_read_timeout 300s` — workflows longos podem demorar; 5 minutos evita 504.

---

## Integração Slack

Slack é SaaS. Duas formas de integrar:

### Opção A — Incoming Webhook (mais simples)

1. `api.slack.com/apps` → **Create New App → From scratch**
2. Ative **Incoming Webhooks** → **Add New Webhook to Workspace** → escolha canal
3. Copie a URL (ex: `https://hooks.slack.com/services/T.../B.../xxx`)
4. Defina no `.env`: `SLACK_WEBHOOK_URL=https://hooks.slack.com/...`
5. No n8n: node **HTTP Request**
   ```
   Method: POST
   URL: {{ $env.SLACK_WEBHOOK_URL }}
   Body: { "text": "{{ $json.mensagem }}" }
   ```

### Opção B — Slack App com Bot Token (completo)

1. `api.slack.com/apps` → Create App
2. **OAuth & Permissions** → Bot Token Scopes:
   - `chat:write` — enviar mensagens
   - `channels:read` — listar canais
   - `users:read` — (opcional) ler perfis
3. **Install to Workspace** → copie **Bot User OAuth Token** (`xoxb-...`)
4. No n8n: **Settings → Credentials → Add Credential → Slack**
   - Access Token: `xoxb-...`
5. Use o node **Slack** nos workflows

---

## Exemplos de Workflows

### 1. Notificação de Ocorrência no Slack

**Gatilho:** Webhook recebido do api-server após `POST /api/ocorrencias`  
**Nodes:** Webhook → Set (formata mensagem) → Slack (envia para `#ocorrencias`)

```
POST https://SEU_DOMINIO/n8n/webhook/ocorrencia-criada
Body: { "estudante": "...", "tipo": "...", "turma": "..." }
```

No api-server, após criar ocorrência:
```typescript
// Disparar webhook do n8n (fire-and-forget)
fetch(`${process.env.N8N_WEBHOOK_URL}/ocorrencia-criada`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ estudante: nome, tipo: tipoDescricao, turma: turmaSigla }),
}).catch(() => {}); // não bloquear fluxo principal
```

### 2. Resumo Diário para a Gestão

**Gatilho:** Cron `0 7 * * 1-5` (07h00, seg–sex, fuso America/Sao_Paulo)  
**Nodes:** Cron → HTTP Request (`GET /api/stats`) → Set (formata resumo) → Slack `#gestao`

### 3. Alerta de Aviso Urgente

**Gatilho:** Webhook após publicação de aviso com `urgente: true`  
**Nodes:** Webhook → IF (urgente?) → Slack (canal geral) + E-mail (SMTP)

### 4. Exportação Semanal para Google Sheets

**Gatilho:** Cron `0 18 * * 5` (sex 18h)  
**Nodes:** Cron → HTTP Request (Grafana API) → Google Sheets (append rows)

---

## Variáveis de Ambiente Relacionadas (`.env`)

```bash
# n8n — obrigatórias em produção
N8N_ENCRYPTION_KEY=<32 bytes hex>

# Slack — usadas nos workflows n8n
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx
# SLACK_BOT_TOKEN=xoxb-...

# URL do n8n para webhooks internos (api-server → n8n)
# Usar URL interna Docker em produção:
N8N_INTERNAL_URL=http://n8n:5678/n8n
```

---

## Segurança e LGPD

| Controle | Implementação |
|---|---|
| Credenciais criptografadas | `N8N_ENCRYPTION_KEY` (AES-256) |
| Sem telemetria | `N8N_DIAGNOSTICS_ENABLED=false` |
| Sem notificações externas | `N8N_VERSION_NOTIFICATIONS_ENABLED=false` |
| Banco isolado | `seshat_n8n` separado do banco da aplicação |
| Acesso sob TLS | Apenas via nginx HTTPS |
| Auth própria | n8n gerencia seus usuários (não usa RBAC do Seshat) |
| PII em workflows | **Não passar** userId, CPF, e-mail, nome em labels de métricas ou logs do n8n |

---

## Primeiro Deploy (Produção)

```bash
# 1. Garantir N8N_ENCRYPTION_KEY no .env
# 2. Subir
docker compose -f docker-compose.prod.yml up -d

# 3. Acessar https://SEU_DOMINIO/n8n/
# 4. Criar conta owner (primeira inicialização)
# 5. Configurar credenciais Slack
# 6. Importar/criar workflows
```

---

## Volumes

| Volume | Nome | Conteúdo |
|---|---|---|
| `n8n_data` (prod) | `seshat-prod-n8n` | Workflows, credenciais, execuções |
| `n8n_dev_data` (dev) | `seshat-n8n-dev` | Igual, separado do prod |

**IMPORTANTE:** Nunca usar `docker compose down -v` em produção — destrói o volume e perde todos os workflows.

---

## Troubleshooting

| Sintoma | Causa | Solução |
|---|---|---|
| Credenciais perdidas após restart | `N8N_ENCRYPTION_KEY` mudou | Restaurar a chave original |
| Webhooks não chegam | URL externa errada | Verificar `WEBHOOK_URL` no .env |
| 504 no editor | `proxy_read_timeout` baixo | Já configurado para 300s no nginx |
| n8n não conecta ao banco | `seshat_n8n` não criado | Verificar `init-n8n-db.sql` foi executado |
| Slack não recebe mensagem | Token expirado ou escopo insuficiente | Re-autorizar app no Slack e atualizar credencial |
| WebSocket falha | nginx sem suporte Upgrade | Verificar headers `Upgrade` e `Connection` no nginx |
