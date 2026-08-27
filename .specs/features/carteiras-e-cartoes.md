# Spec: Gestão de Carteiras e Cartões

**Status:** Implementado ✅ (regras de emissão corrigidas)

---

## Documentos Emitidos

O sistema gera dois tipos de documentos para estudantes, com fluxos de emissão distintos:

| Documento | Tipo | Emissão | Validade |
|---|---|---|---|
| **Carteira do Estudante** | `carteira` | Automática na enturmação | Semestral (ano/semestre da matrícula) |
| **Cartão de Liberação Semestral** | `cartao-semestral` | Manual — pedido formal → coordenador emite | Semestral |
| **Cartão de Saída Avulso** | `cartoes_saida` | Solicitação do responsável → aprovação do coordenador | Data única (diário) |

---

## Regra Central

> **A Carteira do Estudante é emitida automaticamente na enturmação.**
> O Cartão de Liberação **nunca é emitido automaticamente** — exige pedido formal:
> - **Permanente (Semestral)**: responsável faz pedido formal (presencial ou digital); coordenador emite manualmente no sistema.
> - **Avulso (Diário)**: responsável solicita pelo Portal do Responsável; coordenador aprova → token HMAC gerado.

---

## Tabela `carteiras`

Armazena Carteira do Estudante e Cartão de Liberação Semestral.

```
id              uuid PK
usuario_id      uuid FK → usuarios (cascade delete)
matricula_id    uuid FK → matriculas (set null)
tipo            varchar(20)  CHECK ('carteira', 'cartao-semestral')
ano             integer NOT NULL
semestre        smallint CHECK (1, 2)
status          varchar(20)  CHECK ('ativa', 'cancelada', 'revogada')
token           text NOT NULL  — HMAC-SHA256 assinado com SESSION_SECRET
cancelado_em    timestamptz
cancelado_por_id uuid FK → usuarios
criado_em       timestamptz
atualizado_em   timestamptz
```

## Tabela `cartoes_saida`

```
id                   uuid PK
estudante_id         uuid FK → estudantes
responsavel_id       uuid FK → usuarios
data_saida           date NOT NULL
horario_saida        time
motivo               varchar(300)
status               varchar(20) CHECK ('pendente','aprovado','recusado')
aprovado_por_id      uuid FK → usuarios
aprovado_em          timestamptz
observacao_aprovador varchar(300)
token                varchar(400)   — gerado ao aprovar
criado_em            timestamptz
atualizado_em        timestamptz
```

---

## Endpoints — Carteiras

### `emitirCarteirasParaMatricula(usuarioId, matriculaId, ano, semestre)`
Função interna chamada pelo POST /api/matriculas.
- Emite **apenas** `tipo = 'carteira'` (Carteira do Estudante).
- **Não emite** `cartao-semestral` — isso é feito manualmente após pedido formal.
- Idempotente: não duplica se já existe carteira ativa para o mesmo período.

### GET /api/carteiras
**Requer:** `estudantes:manage`
Lista carteiras. Query params: `usuarioId`, `ano`, `semestre`, `status`.

### GET /api/carteiras/:id
**Requer:** `estudantes:manage`

### POST /api/carteiras/emitir-liberacao/:usuarioId
**Requer:** `estudantes:manage`
Emite Cartão de Liberação Semestral (`cartao-semestral`) após pedido formal.
```typescript
{ ano: number; semestre: 1 | 2 }
```
- Idempotente: 409 se já existe ativo para o período.
- Associa à matrícula ativa do estudante (se houver).

### POST /api/carteiras/renovar/:usuarioId
**Requer:** `estudantes:manage`
Renova a **Carteira do Estudante** para novo semestre.
```typescript
{ ano: number; semestre: 1 | 2 }
```
Usa `emitirCarteirasParaMatricula` — emite somente `carteira`.

### POST /api/carteiras/:id/cancelar
**Requer:** `estudantes:manage`
Cancela carteira (extravio, mudança de turma). `{ motivo?: string }`

### POST /api/carteiras/:id/revogar
**Requer:** `estudantes:manage`
Revoga por fraude ou uso indevido. Status final irreversível.

### GET /api/verificar/:token  *(público, sem auth)*
Verifica autenticidade do token HMAC.
```typescript
// Resposta OK:
{ valido: true, status: 'ativa', tipo, validade, nome, fotoUrl, emitidoEm }
// Inválido/revogado:
{ valido: false, status?, erro? }
```

---

## Endpoints — Cartão de Saída Avulso

### POST /api/portal-responsavel/cartao-saida
Responsável solicita cartão para data específica.
```typescript
{ estudanteId: string; dataSaida: string; horarioSaida?: string; motivo?: string }
```
Status inicial: `pendente`.

### GET /api/portal-responsavel/cartao-saida?estudanteId=
Lista solicitações do responsável autenticado.

### GET /api/cartoes-saida  *(estudantes:manage)*
Coordenador lista todas as solicitações. Filtros: `estudanteId`, `status`.

### POST /api/cartoes-saida/:id/aprovar  *(estudantes:manage)*
Aprova e gera token HMAC-SHA256. `{ observacao?: string }`

### POST /api/cartoes-saida/:id/recusar  *(estudantes:manage)*
Recusa com observação. `{ observacao?: string }`

---

## Token HMAC — Estrutura

```typescript
// payload codificado em base64url
{ usuarioId, tipo, ano, semestre, ts: Date.now() }
// token = base64url(payload) + "." + HMAC-SHA256(base64url(payload), SESSION_SECRET)
```

A verificação pública (`/api/verificar/:token`) valida a assinatura E consulta o banco para confirmar que o status é `ativa` (revogação real em tempo real).

---

## Fluxo de Emissão — Resumo

```
Enturmação (POST /api/matriculas)
  └── emitirCarteirasParaMatricula()
        └── Emite: Carteira do Estudante [tipo=carteira]   ✅ automático
        └── NÃO emite: Cartão de Liberação Semestral       ❌ não automático

Pedido formal de liberação semestral (presencial/físico)
  └── Coordenador: POST /api/carteiras/emitir-liberacao/:usuarioId
        └── Emite: Cartão de Liberação Semestral [tipo=cartao-semestral]

Solicitação avulsa pelo responsável (Portal do Responsável)
  └── POST /api/portal-responsavel/cartao-saida  → status=pendente
  └── Coordenador: POST /api/cartoes-saida/:id/aprovar
        └── Gera token → Cartão de Saída Avulso disponível com QR Code
```

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/carteiras.ts` | Schema tabela carteiras |
| `lib/db/src/schema/cartoes-saida.ts` | Schema tabela cartoes_saida |
| `artifacts/api-server/src/routes/carteiras.ts` | CRUD carteiras + emitirCarteirasParaMatricula |
| `artifacts/api-server/src/routes/gestao-responsaveis.ts` | Gestão cartões de saída (aprovar/recusar) |
| `artifacts/api-server/src/routes/portal-responsavel.ts` | Solicitar cartão de saída avulso |
| `artifacts/seshat/src/pages/carteiras/index.tsx` | UI de gestão (coordenador) |
| `scripts/migrate-carteiras.sql` | DDL das tabelas |
