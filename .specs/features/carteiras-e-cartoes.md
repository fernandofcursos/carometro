# Spec: Gestão de Carteiras e Cartões

**Status:** Implementado ✅

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
> O Cartão de Liberação **nunca é emitido automaticamente** — exige pedido formal via Requerimento:
> - **Semestral**: requerimento "Pedido de Saída Antecipada (Semestral)" → deferido → `processarDeferimento()` insere carteira (`tipo='cartao-semestral'`) OU coordenador emite manualmente via `POST /api/carteiras/emitir-liberacao/:usuarioId`.
> - **Diário (menor de idade)**: pai/responsável preenche requerimento "Pedido de Saída Antecipada (Eventual)" em `/requerimentos` → deferido → `processarDeferimento()` insere `cartoes_saida (status='aprovado')`.
> - **Diário (maior de idade)**: estudante preenche requerimento próprio → mesmo fluxo de deferimento.

> **REGRA:** O Portal do Responsável **não tem formulário de "Nova Solicitação"** para cartão diário. O requerimento (em `/requerimentos`) é o único canal de solicitação.

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
horario_saida   time         — horário diário de saída autorizado (cartao-semestral); null para tipo='carteira'
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

---

## Visualização no Portal do Estudante

### Aba "Carteira" — Carteira de Estudante

Layout horizontal CIE 2026 (560×320px):
- Fundo lavanda `#eaecf8`, faixa azul `#1a2f7a`, curvas decorativas roxas
- Logo GDF/SEEDF (esq.) + Logo CEP ETSM (dir.) embutidas em base64 — **nunca URL externa**
- Foto do estudante via `me.usuario.fotoUrl` (Portal Estudante) ou `est.fotoUrl` (Portal Responsável)
- QR Code: `{origin}/verificar/{token}` — COD CIE: últimos 12 chars do token
- Botão "Imprimir carteira" exibido apenas quando `status === 'ativa'`

**Portal do Responsável:** componente `CarteiraEstudanteCIE({ est, carteira })` — mesmo layout, adaptado para `EstudanteInfo`. Exibido na aba "Dados" de "Meus Filhos".

### Aba "Cartão de Liberação" — sub-abas Semestral / Diário

Mesmo layout CIE 560×320px; paleta de cor diferente por tipo/dia. **Ambos os portais (estudante e responsável)** exibem LOGO_GDF (esquerda) + LOGO_CEP (direita) no cabeçalho — constantes base64 no topo de cada arquivo de página. Nunca usar URL externa.

| Sub-tipo | Condição de exibição | Fundo | Faixa |
|---|---|---|---|
| **Semestral** | `cartao-semestral` status `ativa` | `#dcfce7` | `#166534` |
| **Diário — Segunda** (Lua) | janela ±5 min + data=hoje | `#dbeafe` | `#1d4ed8` |
| **Diário — Terça** (Marte) | janela ±5 min + data=hoje | `#fee2e2` | `#991b1b` |
| **Diário — Quarta** (Mercúrio) | janela ±5 min + data=hoje | `#fefce8` | `#a16207` |
| **Diário — Quinta** (Júpiter) | janela ±5 min + data=hoje | `#ede9fe` | `#3730a3` |
| **Diário — Sexta** (Vênus) | janela ±5 min + data=hoje | `#fdf2f8` | `#9d174d` |

**Janela de validade (diário):** cartão exibido somente entre `horario_saida − 5min` e `horario_saida + 5min`. Fora da janela, nova solicitação obrigatória.

**Revalidação automática:** `refetchInterval: 30_000` ms — sem reload manual.

**QR Code validado pelo app Seshat:** registra automaticamente ocorrência de saída antecipada.

#### Estados da aba Diário

| Estado | Condição | Exibição |
|---|---|---|
| **Ativo** | `dentroJanelaHorario` = true | CartaoLiberacaoCard + aviso verde "Cartão válido agora" |
| **Próximo aprovado** | cartão futuro (hoje ainda não chegou ou dia futuro) | aviso com data/hora + "disponível 5 min antes…" |
| **Expirado / sem cartão** | cartão de hoje já passou `horario + 5min` OU nenhum cartão aprovado | "Nenhum cartão de liberação diário aprovado" + instrução de requerimento |

> `horarioJaPassou(dataSaida, horarioSaida)`: retorna `true` quando `totalMin > alvoMin + 5`. Cartões expirados são excluídos de `cartoesFuturos` e não aparecem como "próximo aprovado".

---

## Endpoints do Portal do Estudante

### GET /api/portal/carteiras
Retorna todas as carteiras do estudante logado (inclui `cartao-semestral`).

### GET /api/portal/cartoes-saida
Retorna cartões de saída **aprovados** do estudante logado (via `estudantes.usuario_id`). O frontend filtra pelo horário para exibir apenas o válido agora.

---

## Fluxo Completo — Requerimentos

### Cartão de Liberação Semestral
```
Estudante adulto ou Pai/Responsável
  → Requerimento "Pedido de Saída Antecipada (Semestral)" em /requerimentos
  → Secretaria/Supervisão defere
  → processarDeferimento() → INSERT carteiras (tipo='cartao-semestral', status='aprovado')
     OU coordenador emite manualmente: POST /api/carteiras/emitir-liberacao/:usuarioId { ano, semestre }
  → token HMAC gerado → status 'ativa'
  → Visível na aba "Cartão de Liberação > Semestral" em ambos os portais
```

### Cartão de Saída Diário — Menor de Idade
```
Pai/Responsável
  → Requerimento "Pedido de Saída Antecipada (Eventual)" em /requerimentos
    (preenche data + horário da saída)
  → Secretaria/Supervisão defere
  → processarDeferimento() → INSERT cartoes_saida (status='aprovado', dataSaida, horarioSaida)
  → Exibido nos portais do Estudante e do Responsável na janela ±5 min do horário
```

### Cartão de Saída Diário — Maior de Idade
```
Estudante (≥18 anos)
  → Requerimento "Pedido de Saída Antecipada (Eventual)" em /requerimentos
    (preenche data + horário da saída)
  → Secretaria/Supervisão defere
  → processarDeferimento() → INSERT cartoes_saida (status='aprovado', dataSaida, horarioSaida)
  → Exibido no Portal do Estudante na janela ±5 min do horário
```

> **IMPORTANTE:** O endpoint `POST /api/portal-responsavel/cartao-saida` ainda existe para uso interno/legado, mas **não é exposto via UI**. O requerimento é o único canal de solicitação para o usuário final.

---

## Regra: Modelo CIE em todos os perfis

Tanto a **Carteira de Estudante** quanto o **Cartão de Liberação** usam o layout CIE 560×320px em ambos os portais. **Nunca usar cartão azul simples** (`bg-gradient-to-br from-blue-700`).

| Componente | Portal | Arquivo | Fonte de dados |
|---|---|---|---|
| `CarteiraEstudante` | Estudante | `portal/index.tsx` | `PortalMe` (me.usuario, me.matriculas[0]) |
| `CarteiraEstudanteCIE` | Responsável | `portal-responsavel/index.tsx` | `EstudanteInfo` (est.nome, est.registro, est.turmaSigla, est.cursoNome, est.turnos[0]) |
| `CartaoLiberacaoCard` | Estudante | `portal/index.tsx` | `PortalMe` + `CarteiraDB | CartaoSaidaDB` |
| `CartaoLiberacaoCard` | Responsável | `portal-responsavel/index.tsx` | `EstudanteInfo` + `CarteiraDB | CartaoSaidaDB` |

Todos os quatro componentes incluem **LOGO_GDF (esquerda) + LOGO_CEP (direita)** no cabeçalho — constantes base64 declaradas no topo de cada arquivo.

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/carteiras.ts` | Schema tabela carteiras |
| `lib/db/src/schema/cartoes-saida.ts` | Schema tabela cartoes_saida |
| `artifacts/api-server/src/routes/carteiras.ts` | CRUD carteiras + emitirCarteirasParaMatricula |
| `artifacts/api-server/src/routes/gestao-responsaveis.ts` | Gestão cartões de saída (aprovar/recusar) |
| `artifacts/api-server/src/routes/portal-responsavel.ts` | Endpoint legado cartão de saída avulso |
| `artifacts/api-server/src/routes/portal-estudante.ts` | GET /portal/carteiras + GET /portal/cartoes-saida |
| `artifacts/api-server/src/routes/requerimentos.ts` | processarDeferimento → gera carteiras e cartões ao deferir |
| `artifacts/seshat/src/pages/portal/index.tsx` | CarteiraEstudante + CartaoLiberacao + CartaoLiberacaoCard + horarioJaPassou |
| `artifacts/seshat/src/pages/portal-responsavel/index.tsx` | CarteiraEstudanteCIE + CartaoLiberacaoTab + CartaoLiberacaoCard + horarioJaPassou |
| `artifacts/seshat/src/pages/carteiras/index.tsx` | UI de gestão (coordenador) |
| `scripts/migrate-carteiras.sql` | DDL das tabelas |
