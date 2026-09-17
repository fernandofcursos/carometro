# AEE — Sala de Recursos: Design Spec

**Goal:** Módulo completo de gestão da Sala de Recursos Generalista do AEE, integrado ao Seshat, com encaminhamento inter-módulo para SOE e AEE.

**Referência física:** Flyer institucional "AEE – Atendimento Educacional Especializado – Sala de Recursos Generalista" (CIE/Santa Maria–DF).

---

## Contexto e Escopo

A Sala de Recursos Generalista atende ENEEs — Estudantes com Necessidades Educacionais Especiais com laudo: DI, DF, DOWN, TEA, AH/SD. Suas atribuições são:

1. Atendimento individualizado aos estudantes com laudo
2. Auxílio aos professores no desenvolvimento dos ENEEs
3. Adequação Curricular junto aos professores
4. Acompanhamento e orientação do ESV (Educador Social Voluntário)
5. Auxílio às famílias dos ENEEs
6. Realização de Estudo de Caso

**O que não é:** reforço escolar. **Sucesso:** inclusão.

Este módulo é **independente** do módulo AEE já implementado (que será revisado posteriormente) e do SOE. O encaminhamento entre os três módulos se dá por uma tabela de eventos compartilhada (`encaminhamentos_eventos`).

---

## Arquitetura

Segue o padrão estabelecido pelo SOE:
- Schema Drizzle: `lib/db/src/schema/sala-recursos.ts`
- Migração SQL: `scripts/migrate-sala-recursos.sql`
- Rotas Express: `artifacts/api-server/src/routes/sala-recursos.ts`
- Registro no servidor: `artifacts/api-server/src/index.ts`
- Páginas React: `artifacts/seshat/src/pages/sala-recursos/`
- Skill de contexto: `.claude/skills/seshat-sala-recursos/SKILL.md`
- Spec: `.specs/features/sala-recursos.md`

---

## Schema de Banco de Dados

### `sr_estudantes_enee`
Registro do ENEE vinculado a um usuário existente.

```sql
id              uuid PK
escola_id       uuid FK → escolas
usuario_id      uuid FK → usuarios (restrict)
laudo           varchar(20) NOT NULL  -- 'DI'|'DF'|'DOWN'|'TEA'|'AH_SD'
data_laudo      date
instituicao_laudo varchar(200)
observacoes     text
ativo           boolean DEFAULT true
criado_em       timestamptz
atualizado_em   timestamptz
UNIQUE (escola_id, usuario_id) WHERE deletado_em IS NULL
```

### `sr_atendimentos`
Sessões realizadas na sala de recursos.

```sql
id              uuid PK
escola_id       uuid FK → escolas
estudante_id    uuid FK → sr_estudantes_enee (restrict)
data_atendimento date NOT NULL
duracao_min     smallint  -- minutos
tipo            varchar(30) NOT NULL
                -- 'individual'|'orientacao_professor'|'orientacao_familia'|'esv'|'estudo_caso'
narrativa       text  -- registro livre da sessão
registrado_por  uuid FK → usuarios
criado_em       timestamptz
atualizado_em   timestamptz
```

### `sr_planos_aee`
Plano de AEE estruturado + narrativa complementar.

```sql
id              uuid PK
escola_id       uuid FK → escolas
estudante_id    uuid FK → sr_estudantes_enee (restrict)
objetivos       text NOT NULL
estrategias     text NOT NULL
avaliacao       text NOT NULL
prazo           date NOT NULL
observacoes     text  -- narrativa livre complementar
status          varchar(20) DEFAULT 'rascunho'
                -- 'rascunho'|'ativo'|'encerrado'
elaborado_por   uuid FK → usuarios
ano             integer NOT NULL
semestre        smallint NOT NULL CHECK (semestre IN (1,2))
criado_em       timestamptz
atualizado_em   timestamptz
```

### `sr_esv`
Educador Social Voluntário vinculado ao ENEE.

```sql
id              uuid PK
escola_id       uuid FK → escolas
estudante_id    uuid FK → sr_estudantes_enee (restrict)
nome            varchar(200) NOT NULL
contato         varchar(200)
periodo_inicio  date NOT NULL
periodo_fim     date
observacoes     text
ativo           boolean DEFAULT true
criado_em       timestamptz
atualizado_em   timestamptz
```

### `sr_estudos_caso`
Estudo de caso multidisciplinar.

```sql
id              uuid PK
escola_id       uuid FK → escolas
estudante_id    uuid FK → sr_estudantes_enee (restrict)
data_realizacao date NOT NULL
participantes   text  -- lista livre de participantes
sintese         text NOT NULL
encaminhamentos_resultantes text
status          varchar(20) DEFAULT 'aberto' -- 'aberto'|'encerrado'
criado_em       timestamptz
atualizado_em   timestamptz
```

### `sr_encaminhamentos`
Encaminhamentos internos da Sala de Recursos.

```sql
id              uuid PK
escola_id       uuid FK → escolas
estudante_id    uuid FK → sr_estudantes_enee (restrict)
descricao       text NOT NULL
destinatario_id uuid FK → usuarios
status          varchar(20) DEFAULT 'pendente' -- 'pendente'|'em_andamento'|'concluido'
prazo           date
resposta        text
criado_por      uuid FK → usuarios
criado_em       timestamptz
atualizado_em   timestamptz
```

### `encaminhamentos_eventos` (tabela compartilhada — nova)
Roteamento inter-módulo entre SOE, AEE e Sala de Recursos.

```sql
id              uuid PK
escola_id       uuid FK → escolas
origem_modulo   varchar(30) NOT NULL  -- 'soe'|'aee'|'sala_recursos'
destino_modulo  varchar(30) NOT NULL  -- 'soe'|'aee'|'sala_recursos'
estudante_id    uuid FK → usuarios
referencia_id   uuid  -- ID do registro de origem (atendimento, encaminhamento etc.)
referencia_tipo varchar(50)  -- tipo do registro de origem
mensagem        text
status          varchar(20) DEFAULT 'pendente' -- 'pendente'|'recebido'|'encerrado'
criado_por      uuid FK → usuarios
recebido_por    uuid FK → usuarios
criado_em       timestamptz
atualizado_em   timestamptz
```

---

## Permissões (RBAC)

| Permissão | Descrição | Quem recebe |
|---|---|---|
| `sala_recursos:manage` | CRUD completo — atendimentos, planos, ESV, estudos de caso, encaminhamentos | Professor da Sala de Recursos |
| `sala_recursos:view` | Leitura total + relatórios | Coordenação / Gestão |
| `sala_recursos:professor` | Leitura das adequações curriculares do Plano de AEE dos seus ENEEs | Professor regente |
| `sala_recursos:self` | Plano de AEE ativo do filho no portal do responsável | Família (pai/responsável) |

Guard: `srGuard(nivel)` análogo ao `soeGuard` — usa `buscarRoles` com cache de 60s.

Seeds em migração SQL:
```sql
INSERT INTO permissoes (recurso, acao) VALUES
  ('sala_recursos', 'manage'),
  ('sala_recursos', 'view'),
  ('sala_recursos', 'professor'),
  ('sala_recursos', 'self')
ON CONFLICT (recurso, acao) DO NOTHING;
```

---

## API Endpoints

Prefixo `/api/sala-recursos`. Todos requerem `requireAuth` + `requireTenant`.

| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/estudantes-enee` | `view` | Lista ENEEs da escola |
| POST | `/estudantes-enee` | `manage` | Registra ENEE |
| PUT | `/estudantes-enee/:id` | `manage` | Atualiza laudo/dados |
| GET | `/atendimentos` | `view` | Lista atendimentos (filtros: estudanteId, tipo, ano, semestre) |
| POST | `/atendimentos` | `manage` | Registra sessão |
| PUT | `/atendimentos/:id` | `manage` | Edita sessão |
| DELETE | `/atendimentos/:id` | `manage` | Remove sessão |
| GET | `/planos-aee` | `view` | Lista planos |
| GET | `/planos-aee/:id` | `view` \| `professor` | Detalhe do plano |
| POST | `/planos-aee` | `manage` | Cria plano |
| PUT | `/planos-aee/:id` | `manage` | Atualiza plano |
| GET | `/esv` | `view` | Lista ESVs vinculados (filtro: estudanteId) |
| POST | `/esv` | `manage` | Vincula ESV a ENEE |
| PUT | `/esv/:id` | `manage` | Atualiza ESV |
| GET | `/estudos-caso` | `view` | Lista estudos de caso |
| POST | `/estudos-caso` | `manage` | Cria estudo de caso |
| PUT | `/estudos-caso/:id` | `manage` | Atualiza estudo de caso |
| GET | `/encaminhamentos` | `view` | Lista encaminhamentos internos |
| POST | `/encaminhamentos` | `manage` | Cria encaminhamento interno |
| PUT | `/encaminhamentos/:id` | `manage` | Atualiza status/resposta |
| POST | `/encaminhamentos/inter-modulo` | `manage` | Dispara evento inter-módulo |
| GET | `/portal/plano` | `self` | Plano ativo do filho (família) |
| GET | `/portal/professor/adequacoes` | `professor` | Adequações dos ENEEs das turmas do professor |

---

## UI — Páginas

### `/sala-recursos/gestao` (manage + view)
Página principal, espelho do `/soe/gestao`.

- **Topbar:** título "AEE — Sala de Recursos", botão "Novo Atendimento"
- **KPI row (4 cards):** ENEEs Ativos · Atendimentos no Mês · Planos AEE Ativos · Estudos de Caso Abertos
- **Layout split:**
  - Coluna esquerda (~240px): busca + lista de ENEEs com badge de laudo e status do plano
  - Coluna direita: painel de detalhes com tabs:
    - **Atendimentos** — cards com data, tipo, duração, narrativa
    - **Plano de AEE** — campos estruturados (objetivos/estratégias/avaliação/prazo) + observações narrativas; botão editar; histórico de versões (planos anteriores do mesmo estudante)
    - **ESV** — card do ESV vinculado com período, contato, observações
    - **Estudo de Caso** — lista de estudos com data, participantes, síntese
    - **Encaminhamentos** — internos + inter-módulo recebidos/enviados

### `/sala-recursos/professores` (professor)
Visão do professor regente — read-only.

- Lista ENEEs das turmas do professor
- Para cada ENEE: nome, laudo, adequações curriculares extraídas do Plano de AEE ativo
- Sem acesso a: narrativas de atendimento, dados clínicos, ESV, estudo de caso

### `/sala-recursos/analise` (view)
Relatórios e visão gerencial.

- KPIs agregados por período
- Filtros: laudo, turma, professor, status do plano
- Tabela: ENEE, laudo, último atendimento, status do plano, ESV vinculado
- Encaminhamentos inter-módulo pendentes/recebidos

### Portal do Responsável — nova aba "Plano de AEE" em `/portal`
Exibe (se existir plano ativo):
- Objetivos, estratégias, avaliação, prazo
- ESV vinculado (nome e período)
- **Não exibe:** narrativas de atendimento, estudos de caso, dados clínicos

---

## Menu (Seshat layout.tsx)

```
Grupo: "AEE — Sala de Recursos"
  Ícone: GraduationCap (lucide-react)
  Visível para: sala_recursos:manage | sala_recursos:view

  "Gestão"        → /sala-recursos/gestao    (manage | view)
  "Professores"   → /sala-recursos/professores  (professor — menu separado no grupo deles)
  "Análise"       → /sala-recursos/analise   (view)
```

O link "Professores" aparece no grupo "Docência" para quem tem `sala_recursos:professor`, não no grupo da Sala de Recursos.

---

## Encaminhamento Inter-Módulo

Quando o Professor da SR precisa encaminhar para o SOE ou AEE:

1. UI: botão "Encaminhar para..." no painel de detalhes do ENEE
2. Modal: seleciona destino (SOE / AEE), escreve mensagem, referencia o atendimento ou plano
3. API: `POST /api/sala-recursos/encaminhamentos/inter-modulo`
4. Persiste em `encaminhamentos_eventos` com `status = 'pendente'`
5. Módulo destino (SOE/AEE): ao ser revisado, passa a consultar `encaminhamentos_eventos WHERE destino_modulo = 'soe' AND status = 'pendente'` para exibir notificações

A tabela `encaminhamentos_eventos` é criada neste módulo (Sala de Recursos) e não é consumida ainda pelo SOE/AEE — fica dormindo até a revisão desses módulos. Nenhum acoplamento de código é criado agora.

---

## Testes

Arquivo: `artifacts/api-server/src/tests/sala-recursos.test.ts`

Cobertura mínima:
- Guard `srGuard`: acesso negado sem permissão; hierarquia correta
- CRUD de `sr_estudantes_enee`: criação, listagem, atualização
- `sr_planos_aee`: campos obrigatórios; professor regente não acessa plano de ENEE que não é seu
- `sr_esv`: vinculação e listagem
- Portal família: retorna só campos permitidos (sem narrativa)
- `encaminhamentos_eventos`: INSERT correto; status atualizado

---

## Migração SQL

`scripts/migrate-sala-recursos.sql` — idempotente com `CREATE TABLE IF NOT EXISTS`.

Ordem de criação:
1. `sr_estudantes_enee`
2. `sr_atendimentos`
3. `sr_planos_aee`
4. `sr_esv`
5. `sr_estudos_caso`
6. `sr_encaminhamentos`
7. `encaminhamentos_eventos` (criada só se não existir — futuros módulos reutilizam)
8. Seeds de permissões

---

## Restrições e Decisões

- **Multi-tenant:** todas as queries usam `withTenant(escolaId, async (tx) => await tx...)` — padrão obrigatório do projeto
- **`buscarRoles`:** roles não estão no JWT; sempre usar `buscarRoles(req.usuarioId)` com cache de 60s
- **Sem criptografia neste módulo:** diferente do SOE, os registros da Sala de Recursos não contêm dados clínicos sigilosos no nível do SOE — narrativas são texto simples. Se no futuro houver necessidade, o padrão `cifrarRegistro`/`decifrarRegistro` do SOE pode ser aplicado
- **`encaminhamentos_eventos` não tem RLS** neste primeiro momento — acesso controlado pela camada de aplicação
- **Planos versionados implicitamente:** múltiplos planos por estudante/ano/semestre são permitidos; o "ativo" é o de `status = 'ativo'` mais recente. Não há coluna `versao` — o histórico emerge da lista de planos
