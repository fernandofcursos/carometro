# EEAA e Workflow de Encaminhamentos — Design Spec

**Data:** 2026-09-17  
**Módulos afetados:** EEAA (ex-AEE), SOE, Sala de Recursos

---

## Objetivo

1. **Rename AEE → EEAA** em todos os artefatos (banco, código, UI, docs, skill) para refletir o nome correto do serviço: *Equipe Especializada de Apoio à Aprendizagem*.
2. **Implementar workflow tridimensional de encaminhamentos** entre SOE ↔ EEAA ↔ SR em qualquer direção, com ciclo de vida completo (pendente → aceito → em andamento → resolvido | devolvido | re-encaminhado).

---

## Parte 1 — Rename AEE → EEAA

### 1.1 Tabelas SQL (ALTER TABLE RENAME)

| Antes | Depois |
|---|---|
| `aee_estudantes` | `eeaa_estudantes` |
| `aee_planos` | `eeaa_planos` |
| `aee_plano_assinaturas` | `eeaa_plano_assinaturas` |
| `aee_plano_adaptacoes` | `eeaa_plano_adaptacoes` |
| `aee_metas` | `eeaa_metas` |
| `aee_evolucoes` | `eeaa_evolucoes` |
| `aee_sessoes` | `eeaa_sessoes` |
| `aee_laudos` | `eeaa_laudos` |
| `aee_liberacoes` | `eeaa_liberacoes` |
| `aee_auditoria` | `eeaa_auditoria` |

Indexes renomeados: `idx_aee_*` → `idx_eeaa_*`, `uq_aee_*` → `uq_eeaa_*`.

FKs referenciam nomes novos após o RENAME (PostgreSQL atualiza automaticamente).

### 1.2 Permissões

```sql
INSERT INTO permissoes (recurso, acao) VALUES
  ('eeaa', 'manage'), ('eeaa', 'view')
ON CONFLICT (recurso, acao) DO NOTHING;
-- manter aee:manage e aee:view na tabela por compatibilidade retroativa
-- (podem ser removidas em release futura após confirmação de zero uso)
```

### 1.3 Arquivos a renomear / atualizar

| Arquivo antigo | Arquivo novo |
|---|---|
| `lib/db/src/schema/aee.ts` | `lib/db/src/schema/eeaa.ts` |
| `artifacts/api-server/src/routes/aee.ts` | `artifacts/api-server/src/routes/eeaa.ts` |
| `artifacts/api-server/src/lib/aee-crypto.ts` | `artifacts/api-server/src/lib/eeaa-crypto.ts` |
| `artifacts/api-server/src/lib/aee-audit.ts` | `artifacts/api-server/src/lib/eeaa-audit.ts` |
| `artifacts/api-server/src/tests/aee.test.ts` | `artifacts/api-server/src/tests/eeaa.test.ts` |
| `artifacts/seshat/src/pages/aee/gestao.tsx` | `artifacts/seshat/src/pages/eeaa/gestao.tsx` |
| `artifacts/seshat/src/pages/aee/analise.tsx` | `artifacts/seshat/src/pages/eeaa/analise.tsx` |
| `.specs/features/portal-aee.md` | `.specs/features/portal-eeaa.md` |
| `.claude/skills/seshat-aee/` | `.claude/skills/seshat-eeaa/` |

### 1.4 Substituições em código

**Exports Drizzle** (`eeaa.ts`): todas as exportações `aeeXxxTable` → `eeaaXxxTable`.

**`lib/db/src/schema/index.ts`**: `export * from "./aee"` → `export * from "./eeaa"`.

**`artifacts/api-server/src/index.ts`**:
```typescript
// antes:
import aeeRouter from "./routes/aee.js";
app.use("/api/aee", aeeRouter);
// depois:
import eeaaRouter from "./routes/eeaa.js";
app.use("/api/eeaa", eeaaRouter);
```

**`artifacts/seshat/src/App.tsx`**:
```typescript
// antes:
import AeeGestaoPage  from "./pages/aee/gestao";
import AeeAnalisePage from "./pages/aee/analise";
<Route path="/aee/gestao"  component={AeeGestaoPage} />
<Route path="/aee/analise" component={AeeAnalisePage} />
// depois:
import EeaaGestaoPage  from "./pages/eeaa/gestao";
import EeaaAnalisePage from "./pages/eeaa/analise";
<Route path="/eeaa/gestao"  component={EeaaGestaoPage} />
<Route path="/eeaa/analise" component={EeaaAnalisePage} />
```

**`artifacts/seshat/src/components/layout.tsx`**:
- Permissões: `hasAny("aee:manage")` → `hasAny("eeaa:manage")`, idem para `aee:view`
- Labels: `"AEE"` → `"EEAA"`, `"Atendimento Educacional Especializado"` → `"Equipe Especializada de Apoio à Aprendizagem"`
- Grupo SR: `"AEE — Sala de Recursos"` → `"Sala de Recursos"` (o módulo SR é independente da EEAA)
- Label do item professor SR: `"Adequações AEE"` → `"Adequações SR"`
- URLs: `/aee/gestao` → `/eeaa/gestao`, `/aee/analise` → `/eeaa/analise`

**Dentro de `eeaa.ts` (schema) e `eeaa.ts` (routes)**: todas as referências a tabelas, imports e strings "aee" → "eeaa".

**Imports nas rotas** que importam `aee-crypto` e `aee-audit` devem apontar para `eeaa-crypto` e `eeaa-audit`.

### 1.5 Textos de UI

| Antes | Depois |
|---|---|
| "AEE" | "EEAA" |
| "Atendimento Educacional Especializado" | "Equipe Especializada de Apoio à Aprendizagem" |
| Subtítulos com "AEE" | Subtítulos com "EEAA" |

---

## Parte 2 — Workflow Tridimensional de Encaminhamentos

### 2.1 Modelo de dados

#### Extensão da tabela `encaminhamentos_eventos` (já existe)

Adicionar colunas via `ALTER TABLE`:

```sql
ALTER TABLE encaminhamentos_eventos
  ADD COLUMN IF NOT EXISTS tipo_demanda varchar(100),
  ADD COLUMN IF NOT EXISTS cids         text[],
  ADD COLUMN IF NOT EXISTS resolucao    text,
  ADD COLUMN IF NOT EXISTS pai_id       uuid REFERENCES encaminhamentos_eventos(id) ON DELETE SET NULL;

-- Ampliar o CHECK de status para suportar o ciclo de vida completo:
ALTER TABLE encaminhamentos_eventos DROP CONSTRAINT IF EXISTS encaminhamentos_eventos_status_check;
ALTER TABLE encaminhamentos_eventos
  ADD CONSTRAINT encaminhamentos_eventos_status_check
  CHECK (status IN ('pendente','aceito','em_andamento','devolvido','resolvido','arquivado'));

CREATE INDEX IF NOT EXISTS idx_enc_eventos_pai ON encaminhamentos_eventos(pai_id);
```

#### Schema Drizzle (`encaminhamentosEventosTable` em `sala-recursos.ts`)

Adicionar os novos campos ao tipo:
```typescript
tipoDemanda: varchar("tipo_demanda", { length: 100 }),
cids:        text("cids").array(),
resolucao:   text("resolucao"),
paiId:       uuid("pai_id").references((): AnyPgColumn => encaminhamentosEventosTable.id, { onDelete: "set null" }),
```

> **Nota:** `(): AnyPgColumn =>` é necessário para self-reference em Drizzle.

#### Ciclo de vida (status transitions)

```
[pendente] → aceitar → [aceito]
[aceito]   → iniciar → [em_andamento]
[em_andamento | aceito] → resolver  → [resolvido]
[em_andamento | aceito] → devolver  → [devolvido]   (cria novo registro com pai_id)
[pendente | aceito | em_andamento]  → re-encaminhar → cria filho com novos origem/destino
```

Ao **devolver**: status do registro atual → `devolvido`; a mensagem de devolução fica em `resolucao`.  
Ao **re-encaminhar**: status do registro atual → `em_andamento`; novo registro filho com `pai_id` apontando para o atual, `origemModulo` = módulo atual, `destinoModulo` = escolhido.

### 2.2 API — Router compartilhado `/api/encaminhamentos`

Arquivo: `artifacts/api-server/src/routes/encaminhamentos.ts`

#### Guard de acesso

```typescript
const MODULO_PERMS: Record<string, string[]> = {
  sr:   ["sala_recursos:manage"],
  eeaa: ["eeaa:manage"],
  soe:  ["soe:manage"],
};

async function encGuard(req, res, next) {
  const roles = await buscarRoles(req.usuarioId);
  const temAlgum = Object.values(MODULO_PERMS).flat().some(p => roles.includes(p));
  if (!temAlgum) return res.status(403).json({ error: "Sem permissão." });
  next();
}
```

#### Endpoints

| Método | Rota | Guard | Descrição |
|---|---|---|---|
| GET | `/api/encaminhamentos?caixa=recebidos&modulo=sr` | encGuard | Caixa de entrada do módulo (`destinoModulo = modulo`) |
| GET | `/api/encaminhamentos?caixa=enviados&modulo=sr` | encGuard | Caixa de saída (`origemModulo = modulo`) |
| POST | `/api/encaminhamentos` | encGuard | Criar encaminhamento (body: ver abaixo) |
| PUT | `/api/encaminhamentos/:id/aceitar` | encGuard | Aceitar (status → aceito) |
| PUT | `/api/encaminhamentos/:id/resolver` | encGuard | Resolver (status → resolvido, body: `{resolucao}`) |
| PUT | `/api/encaminhamentos/:id/devolver` | encGuard | Devolver ao módulo de origem (status → devolvido, body: `{resolucao}`) |
| PUT | `/api/encaminhamentos/:id/reencaminhar` | encGuard | Re-encaminhar para terceiro módulo (body: `{destinoModulo, mensagem}`) |

**POST body:**
```typescript
{
  escolaId:     string,    // uuid
  estudanteId:  string,    // uuid
  origemModulo: "sr" | "eeaa" | "soe",
  destinoModulo: "sr" | "eeaa" | "soe",
  mensagem:     string,    // obrigatório (= motivo)
  tipoDemanda?: string,    // opcional
  cids?:        string[],  // opcional, ex: ["F90.0"]
}
```

**Validação:** `origemModulo !== destinoModulo`. Usuário deve ter permissão `manage` no módulo de origem.

**Registro em `artifacts/api-server/src/index.ts`:**
```typescript
import encaminhamentosRouter from "./routes/encaminhamentos.js";
app.use("/api/encaminhamentos", encaminhamentosRouter);
```

### 2.3 UI — Aba "Encaminhamentos" nas páginas de gestão

Adicionar tab "Encaminhamentos" em três páginas existentes:
- `artifacts/seshat/src/pages/sala-recursos/gestao.tsx`
- `artifacts/seshat/src/pages/eeaa/gestao.tsx` (após rename)
- `artifacts/seshat/src/pages/soe/gestao.tsx`

#### Estrutura da aba (componente `EncaminhamentosTab`)

```
┌─────────────────────────────────────────────────────────┐
│ [Recebidos (N)] [Enviados (M)]                           │
├─────────────────────────────────────────────────────────┤
│ Estudante   │ De/Para │ Tipo     │ CIDs  │ Status │ Ações│
│ João Silva  │ SR→EEAA │ TDAH     │ F90.0 │ 🟡 Pend│ [V] │
│ Maria Luiza │ SOE→SR  │ —        │ —     │ 🟢 Acei│ [V] │
└─────────────────────────────────────────────────────────┘
```

**Ações disponíveis (ícone "Ver" abre modal):**

*Modal de detalhe com ações contextuais por status:*
- `pendente` → botões: **Aceitar** | **Devolver**
- `aceito` → botões: **Resolver** | **Devolver** | **Re-encaminhar**
- `em_andamento` → botões: **Resolver** | **Devolver** | **Re-encaminhar**
- `resolvido` / `devolvido` → somente leitura

**Modal "Novo Encaminhamento"** (botão "+ Encaminhar" no topo da aba):
```
Estudante:       [select com busca]
Destino:         [SR | EEAA | SOE]
Motivo:          [textarea]
Tipo de demanda: [input texto, opcional]
CIDs:            [tags input — ex: F90.0, F81.0] (opcional)
```

**Modal "Re-encaminhar":**
```
Destino:   [SR | EEAA | SOE] (exclui módulo atual e origem)
Mensagem:  [textarea]
```

**Componente compartilhado:** `artifacts/seshat/src/components/encaminhamentos-tab.tsx`  
Recebe props: `modulo: "sr" | "eeaa" | "soe"` e renderiza a aba completa.

#### Queries React Query

```typescript
// Recebidos
useQuery({
  queryKey: ["enc-recebidos", modulo],
  queryFn: () => apiFetch(`/api/encaminhamentos?caixa=recebidos&modulo=${modulo}`),
  refetchInterval: 60_000,  // 1 min
});

// Enviados
useQuery({
  queryKey: ["enc-enviados", modulo],
  queryFn: () => apiFetch(`/api/encaminhamentos?caixa=enviados&modulo=${modulo}`),
});
```

### 2.4 Badges de status

```typescript
const STATUS_BADGE = {
  pendente:     { label: "Pendente",     variant: "warning" },
  aceito:       { label: "Aceito",       variant: "default" },
  em_andamento: { label: "Em andamento", variant: "secondary" },
  devolvido:    { label: "Devolvido",    variant: "outline" },
  resolvido:    { label: "Resolvido",    variant: "success" },
  arquivado:    { label: "Arquivado",    variant: "ghost" },
};
```

---

## Parte 3 — Permissões e Menu

**Nenhuma nova permissão** além das já existentes para os 3 módulos. O acesso ao workflow de encaminhamentos exige `manage` em qualquer um dos três.

**Layout — sem mudanças de menu** além das já descritas no rename. A aba "Encaminhamentos" é interna às páginas de gestão existentes.

---

## Migração

Dois arquivos de migração:

### `scripts/migrate-eeaa-rename.sql`
```sql
BEGIN;
ALTER TABLE aee_estudantes         RENAME TO eeaa_estudantes;
ALTER TABLE aee_planos             RENAME TO eeaa_planos;
ALTER TABLE aee_plano_assinaturas  RENAME TO eeaa_plano_assinaturas;
ALTER TABLE aee_plano_adaptacoes   RENAME TO eeaa_plano_adaptacoes;
ALTER TABLE aee_metas              RENAME TO eeaa_metas;
ALTER TABLE aee_evolucoes          RENAME TO eeaa_evolucoes;
ALTER TABLE aee_sessoes            RENAME TO eeaa_sessoes;
ALTER TABLE aee_laudos             RENAME TO eeaa_laudos;
ALTER TABLE aee_liberacoes         RENAME TO eeaa_liberacoes;
ALTER TABLE aee_auditoria          RENAME TO eeaa_auditoria;

-- Índices
ALTER INDEX idx_aee_estudantes_escola  RENAME TO idx_eeaa_estudantes_escola;
ALTER INDEX idx_aee_estudantes_usuario RENAME TO idx_eeaa_estudantes_usuario;
ALTER INDEX idx_aee_planos_estudante   RENAME TO idx_eeaa_planos_estudante;
ALTER INDEX idx_aee_laudos_estudante   RENAME TO idx_eeaa_laudos_estudante;
ALTER INDEX idx_aee_sessoes_estudante  RENAME TO idx_eeaa_sessoes_estudante;
ALTER INDEX idx_aee_liberacoes_estudante RENAME TO idx_eeaa_liberacoes_estudante;
ALTER INDEX idx_aee_liberacoes_professor RENAME TO idx_eeaa_liberacoes_professor;
ALTER INDEX idx_aee_auditoria_usuario  RENAME TO idx_eeaa_auditoria_usuario;
ALTER INDEX idx_aee_auditoria_estudante RENAME TO idx_eeaa_auditoria_estudante;
ALTER INDEX idx_aee_auditoria_criado   RENAME TO idx_eeaa_auditoria_criado;
ALTER INDEX uq_aee_assinatura          RENAME TO uq_eeaa_assinatura;

-- Novas permissões EEAA
INSERT INTO permissoes (recurso, acao) VALUES
  ('eeaa', 'manage'), ('eeaa', 'view')
ON CONFLICT (recurso, acao) DO NOTHING;
COMMIT;
```

### `scripts/migrate-encaminhamentos-workflow.sql`
```sql
BEGIN;
ALTER TABLE encaminhamentos_eventos
  ADD COLUMN IF NOT EXISTS tipo_demanda varchar(100),
  ADD COLUMN IF NOT EXISTS cids         text[],
  ADD COLUMN IF NOT EXISTS resolucao    text,
  ADD COLUMN IF NOT EXISTS pai_id       uuid REFERENCES encaminhamentos_eventos(id) ON DELETE SET NULL;

ALTER TABLE encaminhamentos_eventos DROP CONSTRAINT IF EXISTS encaminhamentos_eventos_status_check;
ALTER TABLE encaminhamentos_eventos
  ADD CONSTRAINT encaminhamentos_eventos_status_check
  CHECK (status IN ('pendente','aceito','em_andamento','devolvido','resolvido','arquivado'));

CREATE INDEX IF NOT EXISTS idx_enc_eventos_pai ON encaminhamentos_eventos(pai_id);
COMMIT;
```

---

## Arquivos-chave (ao final da implementação)

| Arquivo | Responsabilidade |
|---|---|
| `scripts/migrate-eeaa-rename.sql` | Rename das 10 tabelas + permissões EEAA |
| `scripts/migrate-encaminhamentos-workflow.sql` | Extensão de `encaminhamentos_eventos` |
| `lib/db/src/schema/eeaa.ts` | Schema Drizzle renomeado |
| `lib/db/src/schema/sala-recursos.ts` | `encaminhamentosEventosTable` com novos campos |
| `artifacts/api-server/src/routes/eeaa.ts` | Router EEAA renomeado |
| `artifacts/api-server/src/routes/encaminhamentos.ts` | Router compartilhado de workflow |
| `artifacts/seshat/src/components/encaminhamentos-tab.tsx` | Componente de aba compartilhado |
| `artifacts/seshat/src/pages/eeaa/gestao.tsx` | Página EEAA + aba encaminhamentos |
| `artifacts/seshat/src/pages/soe/gestao.tsx` | + aba encaminhamentos |
| `artifacts/seshat/src/pages/sala-recursos/gestao.tsx` | + aba encaminhamentos |
| `artifacts/seshat/src/App.tsx` | Rotas atualizadas |
| `artifacts/seshat/src/components/layout.tsx` | Menu atualizado |
| `.claude/skills/seshat-eeaa/SKILL.md` | Skill atualizada |

---

## Global Constraints

- **Multi-tenant**: `withTenant(escolaId, async (tx) => await tx.select()...)` — `async` e `await` obrigatórios
- **Roles não estão no JWT**: usar `buscarRoles(req.usuarioId)` de `../lib/permissions.js`
- **Drizzle `sql`**: importar de `drizzle-orm`, não de `drizzle-orm/pg-core`
- **Vitest mocks**: `vi.hoisted()` antes de `vi.mock()` factories
- **App.tsx routing**: padrão Wouter `component={...}`, não `element={<.../>}`
- **Migrações idempotentes**: `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`
- **Self-reference Drizzle**: `(): AnyPgColumn =>` para FK auto-referencial
