# Produto: Seshat

## Visão

Sistema web para escolas gerenciarem o carômetro (grid de fotos) de estudantes, turmas, ocorrências e importação de dados, com controle de acesso por papel (RBAC) e conformidade com a LGPD.

## Personas

| Persona | Papel | Necessidade Principal |
|---------|-------|-----------------------|
| Administrador | `administrador` | Configurar o sistema, gerenciar usuários e papéis |
| Secretário(a) | `secretaria` | Cadastrar estudantes, turmas, cursos e importar XLSX |
| Professor(a) | `professor` | Registrar ocorrências, visualizar carômetro da própria turma |
| Coordenador(a) | `coordenacao` | Ver todos os carômetros, relatório de ocorrências |

## Entidades Principais

```
Curso ──< Turma >── Turno
              │
              └──< Estudante >── EstudanteEmail
                        │
                        └──< Ocorrencia >── TipoOcorrencia
                                    │
                                    └── Usuario (quem registrou)

Usuario ──< UsuarioRole >── Role ──< RolePermissao >── Permissao
```

## Fluxos Críticos

### Login
1. POST /api/auth/login (email + codigoAcesso + senha)
2. Backend: hash SHA-256 do email → busca na tabela → verifica bcrypt
3. Se `primeiroAcesso = true`: redirecionar para troca de senha
4. JWT gerado → httpOnly cookie `session`
5. Retorno: AuthUser (id, roles, permissions, email descriptografado)

### Cadastro de Estudante
1. POST /api/estudantes (multipart: dados + foto)
2. Backend: AES-256-CBC na foto → salvar em bytea
3. Auditoria: INSERT em auditoria_logs

### Carômetro
1. GET /api/carometro?turmaId=&cursoId=&busca=
2. Retorna: lista de estudantes com foto (base64) + dados de turma
3. Filtros: turma, curso, nome/registro

### Importação XLSX
1. POST /api/import (multipart: arquivo .xlsx)
2. Backend: lê planilha, valida colunas, upsert estudantes
3. Retorno: { inseridos, atualizados, erros[] }

## Requisitos Não-Funcionais

- Foto: máximo 5MB após compressão, formato JPEG/PNG/WEBP
- Sessão: JWT com expiração de 8h, renovação automática
- Auditoria: 100% das operações de escrita rastreadas
- LGPD: direito de exclusão implementado via soft delete

---

## Infraestrutura de Observabilidade e Automação

### Stack de Monitoramento (Prometheus + Grafana)

Implementado em `docker-compose.prod.yml` e `docker-compose.yml` (perfil `monitoring`).

| Serviço | Imagem | Porta (dev) | Acesso (prod) |
|---|---|---|---|
| Prometheus | `prom/prometheus:v2.53.4` | 9090 | `/prometheus/` + HTTP Basic Auth |
| Grafana | `grafana/grafana:11.4.0` | 3001 | `/grafana/` + auth Grafana |
| postgres-exporter | `prometheuscommunity/postgres-exporter:v0.15.0` | — | interno |

**Rede:** `monitoring_net` com `internal: true` — sem acesso à Internet.  
**Métricas coletadas:** HTTP requests/duração/in-flight (prom-client), Node.js heap, PostgreSQL stats.  
**Retenção:** 15 dias (produção) / 7 dias (desenvolvimento).  
**LGPD:** Labels sem PII; `normalizeRoute()` remove query strings e UUIDs.  
**ISO 27001:** Dupla proteção em `/api/metrics` (nginx 403 + IP allowlist interna).

Spec completa: `.specs/features/monitoramento.md`  
Skills: `seshat-prometheus`, `seshat-grafana`

### Hub de Automação e Integração (n8n)

Implementado em `docker-compose.prod.yml` e `docker-compose.yml` (perfil `tools`).

| Serviço | Imagem | Porta (dev) | Acesso (prod) |
|---|---|---|---|
| n8n | `n8nio/n8n:1.68.0` | 5678 | `/n8n/` + auth n8n |

**Banco:** `seshat_n8n` — PostgreSQL dedicado, isolado do banco da aplicação.  
**Credenciais:** Criptografadas com `N8N_ENCRYPTION_KEY` (AES-256).  
**Integrações disponíveis:** Slack, Gmail/SMTP, Google Sheets, webhooks, REST API.  
**LGPD:** `N8N_DIAGNOSTICS_ENABLED=false` — zero telemetria externa.

**Integração Slack:** Configurada no n8n via Incoming Webhook ou Bot Token.  
Exemplos: notificação de ocorrências, resumo diário, alertas de avisos urgentes.

Spec completa: `.specs/features/monitoramento.md`  
Skill: `seshat-n8n`

### Comandos de Desenvolvimento

```bash
# Monitoramento (Prometheus + Grafana)
docker compose --profile monitoring up -d
# Grafana: http://localhost:3001  (admin / seshat-dev)
# Prometheus: http://localhost:9090

# Automação (n8n + pgAdmin)
docker compose --profile tools up -d
# n8n: http://localhost:5678

# Tudo junto
docker compose --profile monitoring --profile tools up -d
```
