# Feature: Auditoria — Logs de Operações

> Athena aprovado | Status: implementado

## Objetivo

Registrar todas as operações de escrita no sistema para rastreabilidade, conformidade ISO 27001 (A.8.15) e LGPD (Art. 37). Permite investigação de incidentes e auditoria de acessos.

## Endpoints

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| `GET` | `/api/auditoria` | `auditoria:view` | Listar logs (últimos 50, máx 200) |
| `GET` | `/api/auditoria/:id` | `auditoria:view` | Detalhe de um log |

## Resposta GET /api/auditoria

```json
{
  "logs": [ /* AuditoriaLog[] */ ],
  "limite": 50,
  "total": 12
}
```

## Query Parameters

- `?limite=N` — quantos logs retornar (padrão 50, máximo 200)
- `?tabela=usuarios` — filtrar por tabela
- `?usuarioId=uuid` — filtrar por usuário

## Regras de Negócio

- Logs são **somente leitura** — nenhuma rota permite criação/edição via API.
- `registrarAuditoria()` é chamado em TODA operação de escrita (INSERT/UPDATE/DELETE) em qualquer rota.
- Falha no log **não** deve derrubar a requisição principal (try/catch silencioso).
- Campos obrigatórios: `tabela`, `operacao`, `usuarioId` (quando autenticado).
- `dadosAntes`/`dadosDepois` são opcionais mas recomendados para UPDATE/DELETE.
- Fotos de estudantes **não** são logadas em `dadosDepois` (dados sensíveis, LGPD).

## Modelo de Dados

```
auditoria_logs
  id          uuid PK
  tabela      text NOT NULL   (ex: "usuarios", "estudantes")
  operacao    enum            ("INSERT" | "UPDATE" | "DELETE" | "SELECT" | "SELECT_SENSITIVE")
  registroId  uuid nullable   (id do registro afetado)
  usuarioId   uuid nullable   (quem fez a operação)
  dadosAntes  jsonb nullable
  dadosDepois jsonb nullable
  ipOrigem    text nullable
  endpoint    text nullable
  metodoHttp  text nullable
  statusHttp  integer nullable
  duracaoMs   integer nullable
  criadoEm   timestamp
```

## Casos de Teste

- GET /api/auditoria sem auth → 401
- GET /api/auditoria sem permissão `auditoria:view` → 403
- GET /api/auditoria com permissão → `{ logs: AuditoriaLog[], limite: number, total: number }`
- Após POST /api/estudantes → um log INSERT na tabela "estudantes" deve existir
- GET /api/auditoria?tabela=usuarios → filtra por tabela
