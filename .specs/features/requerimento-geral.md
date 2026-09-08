# Spec: Requerimento Geral

**Status:** Implementado ✅  
**Modelo físico:** Formulário Geral institucional (Santa Maria – DF)

---

## Visão Geral

Módulo que permite ao estudante maior de 18 anos ou ao Pai/Responsável solicitar serviços da Secretaria Escolar por meio de um formulário eletrônico com assinatura digital, fiel ao modelo físico institucional.

A análise (deferimento/indeferimento) é feita exclusivamente por **Supervisor Pedagógico** (`supervisao_pedagogica`) ou **Chefe de Secretaria** (`secretaria`). Ambos devem assinar digitalmente após a decisão.

---

## Regras de Negócio

### Acesso ao formulário

| Perfil | Acesso | Condição |
|---|---|---|
| `estudante` | ✅ | **Obrigatório:** maior de 18 anos (`estudantes.dataNascimento`) |
| `pai_responsavel` | ✅ | Sem restrição de idade — seleciona qual filho vinculado |
| `estudante` menor | ❌ | Bloqueado — formulário indisponível |
| Outros perfis | ❌ | Sem acesso |

> **Implementação:** roles são verificadas via banco com cache de 60s (`buscarRoles` exportada de `lib/permissions.ts`). `req.user?.roles` **não existe** — o JWT só carrega `sub` (userId).

- Pai/Responsável deve selecionar qual estudante vinculado (`responsaveis_estudantes`) antes de preencher
- Cada requerimento é individual por estudante
- Não há limite de requerimentos por estudante
- O modal exibe **um card por estudante** com os turnos reais das matrículas ativas (ex: "Técnico em Redes · Matutino / Noturno") — sem duplicatas por turno

### Assuntos disponíveis (seed — modelo físico)

| Ordem | Assunto | Slug | Requer Motivos | Requer Data/Hora | Efeito ao Deferir |
|---|---|---|---|---|---|
| 1 | Cancelamento de Matrícula | — | Não | Não | — |
| 2 | Trancamento de Curso | — | Não | Não | — |
| 3 | Troca de Curso | — | Sim | Não | — |
| 4 | Aproveitamento de Estudos | — | Sim | Não | — |
| 5 | Pedido de Saída Antecipada (Semestral) | `saida-semestral` | Sim | Não | Gera Cartão de Saída Semestral |
| 6 | Pedido de Saída Antecipada (Eventual) | `saida-eventual` | Sim | **Sim** | Gera Cartão de Saída Diário (±5 min) |
| 7 | Outros | — | Sim | Não | — |

### Exposição de Motivos

- Campo texto livre, exibido quando `requer_motivos = true` ou sempre opcional
- Limite: **1000 palavras** (validado na API e UI com contador em tempo real)
- Quando o assunto `requer_motivos = true`: campo obrigatório

### Data e Hora da Solicitação

- `requerimento_assuntos.requer_data_hora` — sinaliza assuntos que exigem data/hora
- `requerimentos.data_solicitacao` (date) — obrigatório quando `requer_data_hora = true`
- `requerimentos.hora_solicitacao` (time) — obrigatório quando `data_solicitacao` preenchida
- A UI exibe campos de data/hora realçados em âmbar com preview da validade do cartão

### Efeitos automáticos do Deferimento

| Assunto | Efeito |
|---|---|
| Pedido de Saída Antecipada (Semestral) | INSERT em `carteiras` (tipo=`cartao-semestral`) para o período da matrícula ativa |
| Pedido de Saída Antecipada (Eventual)  | INSERT em `cartoes_saida` (status=`aprovado`) com `data_saida` e `horario_saida` do requerimento |

- Geração é **idempotente** e **tolerante a falhas** (try/catch — não falha a análise)
- Cancelamento automático do Eventual: detectado pelo frontend (refetchInterval: 30s, janela ±5 min)

### Status do requerimento

```
pendente → em_analise → deferido
                      → indeferido (requer parecer)
```

### Análise

- Somente `secretaria` e `supervisao_pedagogica` podem analisar
- **Deferido**: sem obrigação de parecer
- **Indeferido**: parecer obrigatório (máx 1000 palavras)
- Prazo: 05 dias úteis (exibido no formulário — informativo)

### Numeração

Formato: `REQ-AAAA-NNNN` (ex: `REQ-2026-0001`).  
Gerada na aplicação com base em `COUNT(*)` do ano corrente.

---

## Assinatura Digital

### Papéis e momento

| Papel | Quem | Quando |
|---|---|---|
| `requerente` | Estudante adulto ou Pai/Responsável | Após criar o requerimento |
| `analisador` | Secretaria ou Supervisor | Após deferir ou indeferir |

### Métodos implementados

| Método | Status | Implementação |
|---|---|---|
| `senha` | ✅ Ativo | `bcrypt.compare` → SHA-256 do `requerimento_id + usuario_id + timestamp + senha` |
| `gov_br` | 🔜 Planejado | Placeholder — requer integração com Portal Gov.br (OAuth2) |
| `certificado_digital` | 🔜 Planejado | Placeholder — requer ICP-Brasil integration |

### Token de assinatura

```typescript
SHA256(`${requerimentoId}:${usuarioId}:${Date.now()}:${senha}`)
```

Armazenado em `requerimento_assinaturas.token_hash`. Não reversível. Serve como prova de assinatura eletrônica.

### Constraint

`UNIQUE (requerimento_id, usuario_id, papel)` — cada usuário só pode assinar uma vez por papel.

---

## Banco de Dados

### `requerimento_tipos`

```sql
id, nome varchar(100), ordem smallint, ativo boolean
```

### `requerimento_assuntos`

```sql
id, tipo_id FK→requerimento_tipos, nome varchar(200), descricao text,
slug varchar(50),          -- 'saida-semestral' | 'saida-eventual' | NULL
requer_motivos boolean, requer_data_hora boolean,
ordem smallint, ativo boolean
```

### `requerimentos`

```sql
id uuid PK
numero varchar(20) UNIQUE NOT NULL          -- REQ-AAAA-NNNN
estudante_id FK→estudantes (RESTRICT)       -- o aluno alvo
requerente_id FK→usuarios (RESTRICT)        -- quem submete
tipo_requerente varchar(20)                 -- 'estudante' | 'pai_responsavel'
assunto_id FK→requerimento_assuntos (RESTRICT)
exposicao_motivos text                      -- max 1000 palavras
data_solicitacao date                       -- obrigatório se assunto.requer_data_hora
hora_solicitacao time                       -- obrigatório se data_solicitacao preenchida
status varchar(20) DEFAULT 'pendente'       -- pendente|em_analise|deferido|indeferido
parecer text                                -- motivo do indeferimento
analisado_por_id FK→usuarios (SET NULL)
analisado_em timestamptz
criado_em, atualizado_em timestamptz
```

### `requerimento_assinaturas`

```sql
id uuid PK
requerimento_id FK→requerimentos (CASCADE)
usuario_id FK→usuarios (RESTRICT)
papel varchar(20)                           -- 'requerente' | 'analisador'
metodo varchar(30)                          -- 'senha' | 'gov_br' | 'certificado_digital'
token_hash varchar(64) NOT NULL             -- SHA-256
assinado_em timestamptz
ip_origem varchar(45)
UNIQUE (requerimento_id, usuario_id, papel)
```

**3NF garantida:** assinaturas em tabela separada (múltiplos assinantes por requerimento, sem repetição de grupos). Assuntos em tabela separada do tipo (sem dependência transitiva).

---

## API

| Método | Endpoint | Verificação | Descrição |
|---|---|---|---|
| GET | `/api/requerimentos/tipos` | autenticado | Tipos + assuntos ativos |
| GET | `/api/requerimentos/elegibilidade` | autenticado + `buscarRoles` | Verifica acesso + lista estudantes |
| GET | `/api/requerimentos` | autenticado + `buscarRoles` | Lista (filtrado por perfil) |
| POST | `/api/requerimentos` | autenticado + `buscarRoles` | Cria requerimento |
| GET | `/api/requerimentos/:id` | autenticado + `buscarRoles` | Detalhe completo |
| POST | `/api/requerimentos/:id/assinar` | autenticado + `buscarRoles` | Assina como requerente |
| PUT | `/api/requerimentos/:id/analisar` | autenticado + `buscarRoles` (`secretaria`\|`supervisao_pedagogica`) | Atualiza status + parecer |
| POST | `/api/requerimentos/:id/assinar-analise` | autenticado + `buscarRoles` (`secretaria`\|`supervisao_pedagogica`) | Assina como analisador |

> **Implementação:** nenhum endpoint usa `requirePermissao` — todos usam `requireAuth` + `buscarRoles` (cache 60s, consulta `usuarios_roles JOIN roles`). Independente do estado do seed de permissões.

### Filtro de acesso em `GET /api/requerimentos`

- **Secretaria/Supervisor:** vê todos (suporta `?status=pendente`)
- **Estudante/Responsável:** vê apenas os próprios (por `requerente_id` OU vínculos de `responsaveis_estudantes`)

---

## Permissões

| Verificação | Roles permitidas |
|---|---|
| Criar requerimento | `estudante` (≥18 anos), `pai_responsavel` |
| Visualizar requerimentos | `estudante`, `pai_responsavel`, `secretaria`, `supervisao_pedagogica` |
| Analisar / Assinar análise | `secretaria`, `supervisao_pedagogica` |

> Controle feito via `buscarRoles` (não via tabela `permissoes`). Seed de `roles_permissoes` é opcional — o módulo funciona sem ele.

---

## UI

### `/requerimentos` — Requerente (estudante adulto + responsável)

- Verifica elegibilidade ao carregar (GET `/elegibilidade`)
- Se inelegível: exibe card de bloqueio com o motivo
- Lista de requerimentos com número, status colorido, assunto, estudante, data
- Badge "Aguardando assinatura" quando pendente e sem assinatura do requerente
- **Fluxo de criação (3 steps):**
  1. Selecionar estudante (responsável com múltiplos filhos: radio list)
  2. Selecionar assunto (radio list com descrição)
  3. Preencher exposição de motivos (contador de palavras em tempo real)
- **Detalhe do requerimento:** visualização fiel ao formulário físico com dados do aluno, assunto, motivos, aviso legal, local/data, campos de assinatura, resultado da análise
- **Assinatura:** modal com opções (senha ativa, gov.br e certificado como placeholders)

### `/requerimentos/analise` — Secretaria + Supervisor Pedagógico

- KPIs: Pendentes / Deferidos / Indeferidos / Total
- Busca por número, estudante ou assunto
- Tabs: Pendentes | Deferidos | Indeferidos | Todos
- Card de requerimento: número, status colorido, assinatura do requerente, dados do aluno
- **Modal de análise:**
  - Visualização completa do requerimento (dados do aluno, curso, turno, assunto, motivos)
  - Seleção de decisão: Em Análise | Deferido | Indeferido (botões visuais)
  - Textarea de parecer (obrigatório se Indeferido, com contador de palavras)
  - Layout fiel ao formulário: campos de assinatura lado a lado (Supervisor / Secretaria)
  - Após salvar decisão final (deferido/indeferido): abre automaticamente modal de assinatura

---

## Menu

| Perfil | Localização | Link |
|---|---|---|
| `estudante` adulto | "Meu Portal" | `/requerimentos` |
| `pai_responsavel` | "Portal do Responsável" | `/requerimentos` |
| `secretaria` / `supervisao_pedagogica` | Grupo "Requerimentos" | `/requerimentos/analise` |

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/requerimentos.ts` | Schema Drizzle + Zod |
| `scripts/migrate-requerimentos.sql` | DDL + seed de assuntos |
| `artifacts/api-server/src/routes/requerimentos.ts` | 7 endpoints + lógica de negócio |
| `artifacts/api-server/src/index.ts` | Registra `/api/requerimentos` |
| `artifacts/api-server/src/scripts/seed-admin.ts` | 3 novas permissões + roles |
| `artifacts/seshat/src/pages/requerimentos/index.tsx` | UI do requerente |
| `artifacts/seshat/src/pages/requerimentos/analise.tsx` | UI da análise |
| `artifacts/seshat/src/App.tsx` | Rotas `/requerimentos` e `/requerimentos/analise` |
| `artifacts/seshat/src/components/layout.tsx` | Menu por perfil |
