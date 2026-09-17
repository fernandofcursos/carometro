# EEAA Rename + Workflow Encaminhamentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the AEE module to EEAA throughout (DB, code, UI, docs) and implement a tri-directional inter-module encaminhamentos workflow between SOE ↔ EEAA ↔ SR.

**Architecture:** Task 1 creates the two SQL migrations. Tasks 2-4 execute the mechanical rename (schema → API → frontend). Tasks 5-6 build the new shared encaminhamentos router and its tests. Tasks 7-8 build the shared UI component and wire it into the three gestão pages. Task 9 finalises docs and the skill file.

**Tech Stack:** PostgreSQL, Drizzle ORM, Express, React, Wouter, React Query, Vitest, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-09-17-eeaa-e-workflow-encaminhamentos-design.md`

## Global Constraints

- Multi-tenant: `withTenant(escolaId, async (tx) => await tx.select()...)` — `async` e `await` obrigatórios em todos os closures
- Roles não estão no JWT: usar `buscarRoles(req.usuarioId!)` importado de `"../lib/permissions.js"`
- Drizzle `sql`: importar de `"drizzle-orm"`, nunca de `"drizzle-orm/pg-core"`
- Vitest mocks: `vi.hoisted()` antes de `vi.mock()` factories — nunca referenciar variáveis do escopo externo dentro do factory
- App.tsx routing: padrão Wouter `component={ComponentName}`, não `element={<ComponentName/>}`
- Migrações idempotentes: `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `DROP CONSTRAINT IF EXISTS`
- Self-reference Drizzle: `(): AnyPgColumn =>` para FK auto-referencial na mesma tabela
- Commits frequentes: um commit por task concluída

---

### Task 1: SQL Migrations

**Files:**
- Create: `scripts/migrate-eeaa-rename.sql`
- Create: `scripts/migrate-encaminhamentos-workflow.sql`

**Interfaces:**
- Produces: dois scripts idempotentes prontos para aplicar no banco

- [ ] **Step 1: Criar `scripts/migrate-eeaa-rename.sql`**

```sql
BEGIN;

-- Rename das 10 tabelas
ALTER TABLE IF EXISTS aee_estudantes        RENAME TO eeaa_estudantes;
ALTER TABLE IF EXISTS aee_planos            RENAME TO eeaa_planos;
ALTER TABLE IF EXISTS aee_plano_assinaturas RENAME TO eeaa_plano_assinaturas;
ALTER TABLE IF EXISTS aee_plano_adaptacoes  RENAME TO eeaa_plano_adaptacoes;
ALTER TABLE IF EXISTS aee_metas             RENAME TO eeaa_metas;
ALTER TABLE IF EXISTS aee_evolucoes         RENAME TO eeaa_evolucoes;
ALTER TABLE IF EXISTS aee_sessoes           RENAME TO eeaa_sessoes;
ALTER TABLE IF EXISTS aee_laudos            RENAME TO eeaa_laudos;
ALTER TABLE IF EXISTS aee_liberacoes        RENAME TO eeaa_liberacoes;
ALTER TABLE IF EXISTS aee_auditoria         RENAME TO eeaa_auditoria;

-- Rename de índices (falha silenciosamente se já renomeado)
DO $$ BEGIN
  ALTER INDEX idx_aee_estudantes_escola    RENAME TO idx_eeaa_estudantes_escola;    EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX idx_aee_estudantes_usuario   RENAME TO idx_eeaa_estudantes_usuario;   EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX idx_aee_planos_estudante     RENAME TO idx_eeaa_planos_estudante;     EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX idx_aee_laudos_estudante     RENAME TO idx_eeaa_laudos_estudante;     EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX idx_aee_sessoes_estudante    RENAME TO idx_eeaa_sessoes_estudante;    EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX idx_aee_liberacoes_estudante RENAME TO idx_eeaa_liberacoes_estudante; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX idx_aee_liberacoes_professor RENAME TO idx_eeaa_liberacoes_professor; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX idx_aee_auditoria_usuario    RENAME TO idx_eeaa_auditoria_usuario;    EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX idx_aee_auditoria_estudante  RENAME TO idx_eeaa_auditoria_estudante;  EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX idx_aee_auditoria_criado     RENAME TO idx_eeaa_auditoria_criado;     EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX uq_aee_assinatura            RENAME TO uq_eeaa_assinatura;            EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Novas permissões EEAA
INSERT INTO permissoes (recurso, acao) VALUES
  ('eeaa', 'manage'),
  ('eeaa', 'view')
ON CONFLICT (recurso, acao) DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Criar `scripts/migrate-encaminhamentos-workflow.sql`**

```sql
BEGIN;

-- Extender encaminhamentos_eventos com campos do workflow
ALTER TABLE encaminhamentos_eventos
  ADD COLUMN IF NOT EXISTS tipo_demanda varchar(100),
  ADD COLUMN IF NOT EXISTS cids         text[],
  ADD COLUMN IF NOT EXISTS resolucao    text,
  ADD COLUMN IF NOT EXISTS pai_id       uuid REFERENCES encaminhamentos_eventos(id) ON DELETE SET NULL;

-- Ampliar CHECK de status
ALTER TABLE encaminhamentos_eventos
  DROP CONSTRAINT IF EXISTS encaminhamentos_eventos_status_check;
ALTER TABLE encaminhamentos_eventos
  ADD CONSTRAINT encaminhamentos_eventos_status_check
  CHECK (status IN ('pendente','aceito','em_andamento','devolvido','resolvido','arquivado'));

CREATE INDEX IF NOT EXISTS idx_enc_eventos_pai ON encaminhamentos_eventos(pai_id);

COMMIT;
```

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-eeaa-rename.sql scripts/migrate-encaminhamentos-workflow.sql
git commit -m "feat: migrations EEAA rename e workflow encaminhamentos"
```

---

### Task 2: Schema Drizzle — Rename AEE → EEAA + Extend encaminhamentosEventosTable

**Files:**
- Create: `lib/db/src/schema/eeaa.ts` (baseado em `aee.ts`, todos os nomes alterados)
- Modify: `lib/db/src/schema/sala-recursos.ts` (adicionar campos ao `encaminhamentosEventosTable`)
- Modify: `lib/db/src/schema/index.ts` (trocar export)
- Delete: `lib/db/src/schema/aee.ts` (remover após criar eeaa.ts)

**Interfaces:**
- Produces: exports `eeaaEstudantesTable`, `eeaaPlanosTable`, `eeaaSessoesTable`, etc.; `encaminhamentosEventosTable` com `tipoDemanda`, `cids`, `resolucao`, `paiId`

- [ ] **Step 1: Criar `lib/db/src/schema/eeaa.ts`**

Copiar o conteúdo de `lib/db/src/schema/aee.ts` e aplicar as seguintes substituições globais:
- `aeeEstudantesTable` → `eeaaEstudantesTable`
- `aeePlanosTable` → `eeaaPlanosTable`
- `aeePlanoAssinaturasTable` → `eeaaPlanoAssinaturasTable`
- `aeePlanoAdaptacoesTable` → `eeaaPlanoAdaptacoesTable`
- `aeeMetasTable` → `eeaaMetasTable`
- `aeeEvolucoesTable` → `eeaaEvolucoesTable`
- `aeeSessoesTable` → `eeaaSessoesTable`
- `aeeLaudosTable` → `eeaaLaudosTable`
- `aeeLiberacoesTable` → `eeaaLiberacoesTable`
- `aeeAuditoriaTable` → `eeaaAuditoriaTable`
- Strings SQL `"aee_estudantes"` → `"eeaa_estudantes"` (e assim para cada tabela)
- Index names: `"idx_aee_"` → `"idx_eeaa_"`, `"uq_aee_"` → `"uq_eeaa_"`
- Referências internas entre tabelas: ex. `aeeEstudantesTable.id` → `eeaaEstudantesTable.id`

O arquivo resultante deve exportar as 10 tabelas com prefixo `eeaa`.

- [ ] **Step 2: Adicionar campos ao `encaminhamentosEventosTable` em `lib/db/src/schema/sala-recursos.ts`**

Localizar a definição de `encaminhamentosEventosTable`. Após o campo `atualizadoEm`, adicionar:

```typescript
import type { AnyPgColumn } from "drizzle-orm/pg-core";

// Dentro de encaminhamentosEventosTable:
tipoDemanda: varchar("tipo_demanda", { length: 100 }),
cids:        text("cids").array(),
resolucao:   text("resolucao"),
paiId:       uuid("pai_id").references((): AnyPgColumn => encaminhamentosEventosTable.id, { onDelete: "set null" }),
```

E adicionar ao array de índices:
```typescript
index("idx_enc_eventos_pai").on(t.paiId),
```

- [ ] **Step 3: Atualizar `lib/db/src/schema/index.ts`**

```typescript
// Antes:
export * from "./aee";
// Depois:
export * from "./eeaa";
```

- [ ] **Step 4: Remover arquivo antigo**

```bash
rm lib/db/src/schema/aee.ts
```

- [ ] **Step 5: Verificar compilação TypeScript**

```bash
cd lib/db && npx tsc --noEmit 2>&1 | head -30
```

Esperado: sem erros.

- [ ] **Step 6: Commit**

```bash
git add lib/db/src/schema/eeaa.ts lib/db/src/schema/sala-recursos.ts lib/db/src/schema/index.ts
git rm lib/db/src/schema/aee.ts
git commit -m "feat: schema Drizzle EEAA rename + extend encaminhamentosEventosTable"
```

---

### Task 3: API Server — Rename AEE → EEAA

**Files:**
- Create: `artifacts/api-server/src/routes/eeaa.ts` (de `aee.ts`)
- Create: `artifacts/api-server/src/lib/eeaa-crypto.ts` (de `aee-crypto.ts`)
- Create: `artifacts/api-server/src/lib/eeaa-audit.ts` (de `aee-audit.ts`)
- Create: `artifacts/api-server/src/tests/eeaa.test.ts` (de `aee.test.ts`)
- Modify: `artifacts/api-server/src/index.ts`
- Delete: os quatro arquivos `aee.*` originais

**Interfaces:**
- Produces: router em `/api/eeaa/*` com mesma lógica mas nomes corrigidos

- [ ] **Step 1: Criar `eeaa-crypto.ts` e `eeaa-audit.ts`**

Copiar `lib/aee-crypto.ts` → `lib/eeaa-crypto.ts` e `lib/aee-audit.ts` → `lib/eeaa-audit.ts`.

Em cada arquivo, substituir:
- Toda referência a `aeeAuditoriaTable` → `eeaaAuditoriaTable`
- Strings de log `"aee"` → `"eeaa"` onde aparecerem como identificador de módulo
- Imports de `"@workspace/db"`: adicionar os nomes `eeaa*` equivalentes

- [ ] **Step 2: Criar `routes/eeaa.ts`**

Copiar `routes/aee.ts` (714 linhas) e aplicar:
- Imports: `aeeXxxTable` → `eeaaXxxTable` em todos os imports de `"@workspace/db"`
- Import de `"../lib/aee-crypto.js"` → `"../lib/eeaa-crypto.js"`
- Import de `"../lib/aee-audit.js"` → `"../lib/eeaa-audit.js"`
- Tipo `AeeNivel` → `EeaaNivel`
- Função `aeeGuard` → `eeaaGuard`
- Função `temAcessoAee` → `temAcessoEeaa`
- Função `gerarNumeroPai` → renomear string interna de `"PAI-"` para `"EEAA-"` (ou manter se for código de plano)
- Função `registrarAuditoriaAee` → `registrarAuditoriaEeaa`
- Strings de auditoria: `"ACCESS_ATTEMPT"`, `"ACCESS_DENIED"` — manter, apenas a função vem de `eeaa-audit`
- `req.aeeRoles` → `req.eeaaRoles`

- [ ] **Step 3: Criar `tests/eeaa.test.ts`**

Copiar `tests/aee.test.ts` e aplicar:
- Mock imports: `aeeXxxTable` → `eeaaXxxTable`
- Strings de rota `/api/aee/` → `/api/eeaa/`
- Import do router: `import eeaaRouter from "../routes/eeaa.js"`

- [ ] **Step 4: Atualizar `artifacts/api-server/src/index.ts`**

```typescript
// Remover:
import aeeRouter from "./routes/aee.js";
app.use("/api/aee", aeeRouter);

// Adicionar:
import eeaaRouter from "./routes/eeaa.js";
app.use("/api/eeaa", eeaaRouter);
```

- [ ] **Step 5: Remover arquivos antigos**

```bash
rm artifacts/api-server/src/routes/aee.ts
rm artifacts/api-server/src/lib/aee-crypto.ts
rm artifacts/api-server/src/lib/aee-audit.ts
rm artifacts/api-server/src/tests/aee.test.ts
```

- [ ] **Step 6: Rodar testes EEAA**

```bash
cd artifacts/api-server && npx vitest run src/tests/eeaa.test.ts 2>&1 | tail -20
```

Esperado: mesma quantidade de testes passando que o antigo `aee.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/routes/eeaa.ts artifacts/api-server/src/lib/eeaa-crypto.ts \
  artifacts/api-server/src/lib/eeaa-audit.ts artifacts/api-server/src/tests/eeaa.test.ts \
  artifacts/api-server/src/index.ts
git rm artifacts/api-server/src/routes/aee.ts artifacts/api-server/src/lib/aee-crypto.ts \
  artifacts/api-server/src/lib/aee-audit.ts artifacts/api-server/src/tests/aee.test.ts
git commit -m "feat: API server EEAA rename"
```

---

### Task 4: Frontend — Rename AEE → EEAA

**Files:**
- Create: `artifacts/seshat/src/pages/eeaa/gestao.tsx` (de `pages/aee/gestao.tsx`)
- Create: `artifacts/seshat/src/pages/eeaa/analise.tsx` (de `pages/aee/analise.tsx`)
- Modify: `artifacts/seshat/src/App.tsx`
- Modify: `artifacts/seshat/src/components/layout.tsx`
- Delete: `artifacts/seshat/src/pages/aee/` (diretório completo)

**Interfaces:**
- Produces: rotas `/eeaa/gestao` e `/eeaa/analise`, menu com label "EEAA", permissões `eeaa:manage`/`eeaa:view`

- [ ] **Step 1: Criar `pages/eeaa/gestao.tsx`**

Copiar `pages/aee/gestao.tsx` e aplicar:
- Todas as strings `"/api/aee/"` → `"/api/eeaa/"`
- Strings de UI: `"AEE"` → `"EEAA"`, `"Atendimento Educacional Especializado"` → `"Equipe Especializada de Apoio à Aprendizagem"`
- Nomes de componentes: `AeeGestao*` → `EeaaGestao*` (se houver)
- QueryKeys: `"aee-*"` → `"eeaa-*"`

- [ ] **Step 2: Criar `pages/eeaa/analise.tsx`**

Copiar `pages/aee/analise.tsx` e aplicar as mesmas substituições de UI e API que o Step 1.

- [ ] **Step 3: Atualizar `artifacts/seshat/src/App.tsx`**

```typescript
// Remover:
import AeeGestaoPage  from "./pages/aee/gestao";
import AeeAnalisePage from "./pages/aee/analise";
// ...
<Route path="/aee/gestao"  component={AeeGestaoPage} />
<Route path="/aee/analise" component={AeeAnalisePage} />

// Adicionar:
import EeaaGestaoPage  from "./pages/eeaa/gestao";
import EeaaAnalisePage from "./pages/eeaa/analise";
// ...
<Route path="/eeaa/gestao"  component={EeaaGestaoPage} />
<Route path="/eeaa/analise" component={EeaaAnalisePage} />
```

- [ ] **Step 4: Atualizar `artifacts/seshat/src/components/layout.tsx`**

Substituições:
- `hasAny("aee:manage")` → `hasAny("eeaa:manage")` (todas as ocorrências)
- `hasAny("aee:view")` → `hasAny("eeaa:view")` (todas as ocorrências)
- `nav("Atendimento", "/aee/gestao", ...)` → `nav("Gestão EEAA", "/eeaa/gestao", ...)`
- `nav("Acompanhamento", "/aee/analise", ...)` → `nav("Acompanhamento", "/eeaa/analise", ...)`
- Label do grupo EEAA: `"AEE"` → `"EEAA"`
- Label do grupo SR: `"AEE — Sala de Recursos"` → `"Sala de Recursos"`
- Label do item professor SR: `"Adequações AEE"` → `"Adequações SR"`

- [ ] **Step 5: Remover diretório antigo**

```bash
rm -rf artifacts/seshat/src/pages/aee/
```

- [ ] **Step 6: Verificar TypeScript**

```bash
cd artifacts/seshat && npx tsc --noEmit 2>&1 | head -30
```

Esperado: sem erros.

- [ ] **Step 7: Commit**

```bash
git add artifacts/seshat/src/pages/eeaa/ artifacts/seshat/src/App.tsx artifacts/seshat/src/components/layout.tsx
git rm -r artifacts/seshat/src/pages/aee/
git commit -m "feat: frontend EEAA rename"
```

---

### Task 5: API Router Compartilhado — Encaminhamentos Inter-módulos

**Files:**
- Create: `artifacts/api-server/src/routes/encaminhamentos.ts`
- Modify: `artifacts/api-server/src/index.ts`

**Interfaces:**
- Consumes: `encaminhamentosEventosTable` de `@workspace/db` (com `tipoDemanda`, `cids`, `resolucao`, `paiId` do Task 2)
- Produces: endpoints `GET /api/encaminhamentos`, `POST`, `PUT /:id/aceitar`, `PUT /:id/resolver`, `PUT /:id/devolver`, `PUT /:id/reencaminhar`

- [ ] **Step 1: Criar `artifacts/api-server/src/routes/encaminhamentos.ts`**

```typescript
import { Router } from "express";
import { z } from "zod";
import {
  db, encaminhamentosEventosTable,
  eq, and, or, sql,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { buscarRoles } from "../lib/permissions.js";
import { withTenant } from "../middleware/tenant.js";

const router = Router();
router.use(requireAuth);

const MODULO_PERMS: Record<string, string[]> = {
  sr:   ["sala_recursos:manage"],
  eeaa: ["eeaa:manage"],
  soe:  ["soe:manage"],
};

function temPermissaoModulo(roles: string[], modulo: string): boolean {
  return (MODULO_PERMS[modulo] ?? []).some(p => roles.includes(p));
}

async function encGuard(req: any, res: any, next: any) {
  const roles = await buscarRoles(req.usuarioId!);
  const temAlgum = Object.values(MODULO_PERMS).flat().some(p => roles.includes(p));
  if (!temAlgum) return res.status(403).json({ error: "Sem permissão." });
  req.encRoles = roles;
  next();
}

const MODULOS_VALIDOS = ["sr", "eeaa", "soe"] as const;

const criarSchema = z.object({
  escolaId:      z.string().uuid(),
  estudanteId:   z.string().uuid(),
  origemModulo:  z.enum(MODULOS_VALIDOS),
  destinoModulo: z.enum(MODULOS_VALIDOS),
  mensagem:      z.string().min(1),
  tipoDemanda:   z.string().max(100).optional(),
  cids:          z.array(z.string().max(20)).optional(),
});

// GET /api/encaminhamentos?caixa=recebidos|enviados&modulo=sr|eeaa|soe
router.get("/", encGuard, async (req, res) => {
  try {
    const { caixa, modulo } = req.query as Record<string, string>;
    if (!modulo || !MODULOS_VALIDOS.includes(modulo as any))
      return res.status(400).json({ error: "modulo inválido. Use: sr, eeaa, soe." });
    if (!["recebidos", "enviados"].includes(caixa))
      return res.status(400).json({ error: "caixa inválida. Use: recebidos, enviados." });

    const escolaId = (req as any).escolaId;
    const campo = caixa === "recebidos"
      ? encaminhamentosEventosTable.destinoModulo
      : encaminhamentosEventosTable.origemModulo;

    const rows = await withTenant(escolaId, async (tx) => await tx
      .select()
      .from(encaminhamentosEventosTable)
      .where(and(
        eq(encaminhamentosEventosTable.escolaId, escolaId),
        eq(campo, modulo),
      ))
      .orderBy(sql`${encaminhamentosEventosTable.criadoEm} DESC`)
    );
    res.json({ encaminhamentos: rows });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao buscar encaminhamentos.", detail: err?.message });
  }
});

// POST /api/encaminhamentos
router.post("/", encGuard, async (req, res) => {
  try {
    const parsed = criarSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { origemModulo, destinoModulo, escolaId, estudanteId, mensagem, tipoDemanda, cids } = parsed.data;

    if (origemModulo === destinoModulo)
      return res.status(422).json({ error: "Origem e destino não podem ser o mesmo módulo." });
    if (!temPermissaoModulo(req.encRoles, origemModulo))
      return res.status(403).json({ error: "Sem permissão no módulo de origem." });

    const [created] = await withTenant(escolaId, async (tx) => await tx
      .insert(encaminhamentosEventosTable)
      .values({
        escolaId,
        estudanteId,
        origemModulo,
        destinoModulo,
        mensagem,
        tipoDemanda,
        cids,
        status: "pendente",
        criadoPorId: req.usuarioId,
      })
      .returning()
    );
    res.status(201).json({ encaminhamento: created });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao criar encaminhamento.", detail: err?.message });
  }
});

// PUT /api/encaminhamentos/:id/aceitar
router.put("/:id/aceitar", encGuard, async (req, res) => {
  try {
    const escolaId = (req as any).escolaId;
    const [row] = await withTenant(escolaId, async (tx) => await tx
      .select()
      .from(encaminhamentosEventosTable)
      .where(and(
        eq(encaminhamentosEventosTable.id, req.params.id),
        eq(encaminhamentosEventosTable.escolaId, escolaId),
      ))
    );
    if (!row) return res.status(404).json({ error: "Encaminhamento não encontrado." });
    if (!temPermissaoModulo(req.encRoles, row.destinoModulo))
      return res.status(403).json({ error: "Sem permissão no módulo de destino." });
    if (row.status !== "pendente")
      return res.status(422).json({ error: "Apenas encaminhamentos pendentes podem ser aceitos." });

    const [updated] = await withTenant(escolaId, async (tx) => await tx
      .update(encaminhamentosEventosTable)
      .set({ status: "aceito", recebidoPorId: req.usuarioId, atualizadoEm: new Date() })
      .where(eq(encaminhamentosEventosTable.id, req.params.id))
      .returning()
    );
    res.json({ encaminhamento: updated });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao aceitar encaminhamento.", detail: err?.message });
  }
});

// PUT /api/encaminhamentos/:id/resolver
router.put("/:id/resolver", encGuard, async (req, res) => {
  try {
    const { resolucao } = req.body;
    if (!resolucao || typeof resolucao !== "string" || resolucao.trim().length === 0)
      return res.status(400).json({ error: "Resolução é obrigatória." });

    const escolaId = (req as any).escolaId;
    const [row] = await withTenant(escolaId, async (tx) => await tx
      .select()
      .from(encaminhamentosEventosTable)
      .where(and(
        eq(encaminhamentosEventosTable.id, req.params.id),
        eq(encaminhamentosEventosTable.escolaId, escolaId),
      ))
    );
    if (!row) return res.status(404).json({ error: "Encaminhamento não encontrado." });
    if (!temPermissaoModulo(req.encRoles, row.destinoModulo))
      return res.status(403).json({ error: "Sem permissão." });
    if (!["aceito", "em_andamento"].includes(row.status))
      return res.status(422).json({ error: "Status inválido para resolução." });

    const [updated] = await withTenant(escolaId, async (tx) => await tx
      .update(encaminhamentosEventosTable)
      .set({ status: "resolvido", resolucao, atualizadoEm: new Date() })
      .where(eq(encaminhamentosEventosTable.id, req.params.id))
      .returning()
    );
    res.json({ encaminhamento: updated });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao resolver encaminhamento.", detail: err?.message });
  }
});

// PUT /api/encaminhamentos/:id/devolver
router.put("/:id/devolver", encGuard, async (req, res) => {
  try {
    const { resolucao } = req.body;
    if (!resolucao || typeof resolucao !== "string" || resolucao.trim().length === 0)
      return res.status(400).json({ error: "Motivo da devolução é obrigatório." });

    const escolaId = (req as any).escolaId;
    const [row] = await withTenant(escolaId, async (tx) => await tx
      .select()
      .from(encaminhamentosEventosTable)
      .where(and(
        eq(encaminhamentosEventosTable.id, req.params.id),
        eq(encaminhamentosEventosTable.escolaId, escolaId),
      ))
    );
    if (!row) return res.status(404).json({ error: "Encaminhamento não encontrado." });
    if (!temPermissaoModulo(req.encRoles, row.destinoModulo))
      return res.status(403).json({ error: "Sem permissão." });

    const [updated] = await withTenant(escolaId, async (tx) => await tx
      .update(encaminhamentosEventosTable)
      .set({ status: "devolvido", resolucao, atualizadoEm: new Date() })
      .where(eq(encaminhamentosEventosTable.id, req.params.id))
      .returning()
    );
    res.json({ encaminhamento: updated });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao devolver encaminhamento.", detail: err?.message });
  }
});

// PUT /api/encaminhamentos/:id/reencaminhar
router.put("/:id/reencaminhar", encGuard, async (req, res) => {
  try {
    const { destinoModulo, mensagem } = req.body;
    if (!destinoModulo || !MODULOS_VALIDOS.includes(destinoModulo))
      return res.status(400).json({ error: "destinoModulo inválido. Use: sr, eeaa, soe." });
    if (!mensagem || typeof mensagem !== "string" || mensagem.trim().length === 0)
      return res.status(400).json({ error: "mensagem é obrigatória." });

    const escolaId = (req as any).escolaId;
    const [row] = await withTenant(escolaId, async (tx) => await tx
      .select()
      .from(encaminhamentosEventosTable)
      .where(and(
        eq(encaminhamentosEventosTable.id, req.params.id),
        eq(encaminhamentosEventosTable.escolaId, escolaId),
      ))
    );
    if (!row) return res.status(404).json({ error: "Encaminhamento não encontrado." });
    if (!temPermissaoModulo(req.encRoles, row.destinoModulo))
      return res.status(403).json({ error: "Sem permissão no módulo atual." });
    if (destinoModulo === row.destinoModulo)
      return res.status(422).json({ error: "Destino igual ao módulo atual." });
    if (!["pendente","aceito","em_andamento"].includes(row.status))
      return res.status(422).json({ error: "Não é possível re-encaminhar neste status." });

    const filho = await withTenant(escolaId, async (tx) => {
      await tx.update(encaminhamentosEventosTable)
        .set({ status: "em_andamento", atualizadoEm: new Date() })
        .where(eq(encaminhamentosEventosTable.id, req.params.id));

      const [created] = await tx.insert(encaminhamentosEventosTable)
        .values({
          escolaId,
          origemModulo:  row.destinoModulo,
          destinoModulo,
          estudanteId:   row.estudanteId,
          mensagem,
          tipoDemanda:   row.tipoDemanda,
          cids:          row.cids,
          status:        "pendente",
          criadoPorId:   req.usuarioId,
          paiId:         row.id,
        })
        .returning();
      return created;
    });
    res.status(201).json({ encaminhamento: filho });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao re-encaminhar.", detail: err?.message });
  }
});

export default router;
```

- [ ] **Step 2: Registrar em `artifacts/api-server/src/index.ts`**

```typescript
import encaminhamentosRouter from "./routes/encaminhamentos.js";
// Após os outros routers:
app.use("/api/encaminhamentos", encaminhamentosRouter);
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/routes/encaminhamentos.ts artifacts/api-server/src/index.ts
git commit -m "feat: router compartilhado /api/encaminhamentos"
```

---

### Task 6: Testes do Router Encaminhamentos

**Files:**
- Create: `artifacts/api-server/src/tests/encaminhamentos.test.ts`

**Interfaces:**
- Consumes: `encaminhamentosRouter` de `../routes/encaminhamentos.js`
- Produces: 10 testes cobrindo guard 403, criar, aceitar, resolver, devolver, re-encaminhar

- [ ] **Step 1: Escrever o teste**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const { mockDb } = vi.hoisted(() => {
  const chain = { where: vi.fn(), orderBy: vi.fn(), returning: vi.fn(), set: vi.fn(), values: vi.fn() };
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.set.mockReturnValue(chain);
  chain.values.mockReturnValue(chain);
  chain.returning.mockResolvedValue([]);

  const mockDb = {
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue(chain) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue(chain) }),
    update: vi.fn().mockReturnValue(chain),
  };
  return { mockDb };
});

vi.mock("@workspace/db", () => ({
  db: mockDb,
  encaminhamentosEventosTable: {
    id: "id", escolaId: "escola_id", origemModulo: "origem_modulo",
    destinoModulo: "destino_modulo", estudanteId: "estudante_id",
    mensagem: "mensagem", tipoDemanda: "tipo_demanda", cids: "cids",
    resolucao: "resolucao", status: "status", criadoPorId: "criado_por_id",
    recebidoPorId: "recebido_por_id", paiId: "pai_id", criadoEm: "criado_em", atualizadoEm: "atualizado_em",
  },
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
  and: vi.fn((...args) => ({ and: args })),
  or: vi.fn((...args) => ({ or: args })),
  sql: vi.fn(s => s),
}));

vi.mock("../lib/auth.js", () => ({
  requireAuth: (req: any, _: any, next: any) => { req.usuarioId = "user-1"; req.escolaId = "escola-1"; next(); },
}));

vi.mock("../lib/permissions.js", () => ({
  buscarRoles: vi.fn(),
}));

vi.mock("../middleware/tenant.js", () => ({
  withTenant: vi.fn(async (escolaId, fn) => {
    const mockTx = {
      select: mockDb.select,
      insert: mockDb.insert,
      update: mockDb.update,
    };
    return fn(mockTx);
  }),
}));

import encaminhamentosRouter from "../routes/encaminhamentos.js";
import { buscarRoles } from "../lib/permissions.js";

const app = express();
app.use(express.json());
app.use("/api/encaminhamentos", encaminhamentosRouter);

const mockBuscarRoles = buscarRoles as ReturnType<typeof vi.fn>;

function makeEnc(overrides = {}) {
  return {
    id: "enc-1", escolaId: "escola-1", origemModulo: "sr", destinoModulo: "eeaa",
    mensagem: "teste", status: "pendente", estudanteId: "est-1",
    criadoPorId: "user-1", tipoDemanda: null, cids: null, resolucao: null, paiId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const chain = { where: vi.fn(), orderBy: vi.fn(), returning: vi.fn(), set: vi.fn(), values: vi.fn() };
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.set.mockReturnValue(chain);
  chain.values.mockReturnValue(chain);
  chain.returning.mockResolvedValue([]);
  mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });
  mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue(chain) });
  mockDb.update.mockReturnValue(chain);
});

describe("GET /api/encaminhamentos", () => {
  it("retorna 403 sem permissão", async () => {
    mockBuscarRoles.mockResolvedValue([]);
    const res = await request(app).get("/api/encaminhamentos?caixa=recebidos&modulo=sr");
    expect(res.status).toBe(403);
  });

  it("retorna 400 para modulo inválido", async () => {
    mockBuscarRoles.mockResolvedValue(["sala_recursos:manage"]);
    const chain = { where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([]) };
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });
    const res = await request(app).get("/api/encaminhamentos?caixa=recebidos&modulo=xxx");
    expect(res.status).toBe(400);
  });

  it("retorna lista de recebidos", async () => {
    mockBuscarRoles.mockResolvedValue(["sala_recursos:manage"]);
    const chain = { where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([makeEnc()]) };
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });
    const res = await request(app).get("/api/encaminhamentos?caixa=recebidos&modulo=sr");
    expect(res.status).toBe(200);
    expect(res.body.encaminhamentos).toHaveLength(1);
  });
});

describe("POST /api/encaminhamentos", () => {
  it("retorna 422 se origemModulo === destinoModulo", async () => {
    mockBuscarRoles.mockResolvedValue(["sala_recursos:manage"]);
    const res = await request(app).post("/api/encaminhamentos").send({
      escolaId: "escola-1", estudanteId: "est-1",
      origemModulo: "sr", destinoModulo: "sr", mensagem: "teste",
    });
    expect(res.status).toBe(422);
  });

  it("cria encaminhamento com sucesso", async () => {
    mockBuscarRoles.mockResolvedValue(["sala_recursos:manage"]);
    const chain = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([makeEnc()]) };
    mockDb.insert.mockReturnValue(chain);
    const res = await request(app).post("/api/encaminhamentos").send({
      escolaId: "escola-1", estudanteId: "est-1",
      origemModulo: "sr", destinoModulo: "eeaa", mensagem: "Encaminhando",
      tipoDemanda: "TDAH", cids: ["F90.0"],
    });
    expect(res.status).toBe(201);
    expect(res.body.encaminhamento).toBeDefined();
  });
});

describe("PUT /api/encaminhamentos/:id/aceitar", () => {
  it("retorna 422 se status não é pendente", async () => {
    mockBuscarRoles.mockResolvedValue(["eeaa:manage"]);
    const chain = { where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([makeEnc({ status: "aceito", destinoModulo: "eeaa" })]) };
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });
    const res = await request(app).put("/api/encaminhamentos/enc-1/aceitar");
    expect(res.status).toBe(422);
  });

  it("aceita encaminhamento pendente", async () => {
    mockBuscarRoles.mockResolvedValue(["eeaa:manage"]);
    const selectChain = { where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([makeEnc({ destinoModulo: "eeaa" })]) };
    const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([makeEnc({ status: "aceito", destinoModulo: "eeaa" })]) };
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue(selectChain) });
    mockDb.update.mockReturnValue(updateChain);
    const res = await request(app).put("/api/encaminhamentos/enc-1/aceitar");
    expect(res.status).toBe(200);
    expect(res.body.encaminhamento.status).toBe("aceito");
  });
});

describe("PUT /api/encaminhamentos/:id/reencaminhar", () => {
  it("cria filho e marca pai em_andamento", async () => {
    mockBuscarRoles.mockResolvedValue(["eeaa:manage"]);
    const pai = makeEnc({ destinoModulo: "eeaa", status: "aceito" });
    const filho = makeEnc({ id: "enc-2", origemModulo: "eeaa", destinoModulo: "soe", paiId: "enc-1" });
    const selectChain = { where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([pai]) };
    const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
    const insertChain = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([filho]) };
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue(selectChain) });
    mockDb.update.mockReturnValue(updateChain);
    mockDb.insert.mockReturnValue(insertChain);
    const res = await request(app).put("/api/encaminhamentos/enc-1/reencaminhar")
      .send({ destinoModulo: "soe", mensagem: "Necessita SOE" });
    expect(res.status).toBe(201);
    expect(res.body.encaminhamento.paiId).toBe("enc-1");
  });
});
```

- [ ] **Step 2: Rodar os testes**

```bash
cd artifacts/api-server && npx vitest run src/tests/encaminhamentos.test.ts 2>&1 | tail -20
```

Esperado: 10 testes passando.

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/tests/encaminhamentos.test.ts
git commit -m "test: testes do router encaminhamentos inter-módulos"
```

---

### Task 7: Componente Compartilhado `EncaminhamentosTab`

**Files:**
- Create: `artifacts/seshat/src/components/encaminhamentos-tab.tsx`

**Interfaces:**
- Consumes: `GET /api/encaminhamentos?caixa=...&modulo=...`, `POST /api/encaminhamentos`, `PUT /api/encaminhamentos/:id/aceitar|resolver|devolver|reencaminhar`
- Produces: componente `<EncaminhamentosTab modulo="sr"|"eeaa"|"soe" escolaId="..." />` com sub-tabs Recebidos/Enviados e modais de ação

- [ ] **Step 1: Criar `artifacts/seshat/src/components/encaminhamentos-tab.tsx`**

```typescript
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ArrowRightLeft, Plus, Eye } from "lucide-react";

type Modulo = "sr" | "eeaa" | "soe";

const MODULO_LABEL: Record<Modulo, string> = {
  sr: "Sala de Recursos",
  eeaa: "EEAA",
  soe: "SOE",
};

const MODULOS_DESTINO: Record<Modulo, Modulo[]> = {
  sr:   ["eeaa", "soe"],
  eeaa: ["sr", "soe"],
  soe:  ["sr", "eeaa"],
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pendente:     { label: "Pendente",     variant: "secondary" },
  aceito:       { label: "Aceito",       variant: "default" },
  em_andamento: { label: "Em andamento", variant: "outline" },
  devolvido:    { label: "Devolvido",    variant: "destructive" },
  resolvido:    { label: "Resolvido",    variant: "default" },
  arquivado:    { label: "Arquivado",    variant: "secondary" },
};

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}

function apiMsg(err: any, fallback: string): string {
  return err?.data?.error ?? err?.error ?? fallback;
}

interface Enc {
  id: string;
  origemModulo: Modulo;
  destinoModulo: Modulo;
  estudanteId: string;
  mensagem: string;
  tipoDemanda?: string | null;
  cids?: string[] | null;
  status: string;
  resolucao?: string | null;
  paiId?: string | null;
  criadoEm: string;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

interface NovoEncModalProps {
  modulo: Modulo;
  escolaId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function NovoEncModal({ modulo, escolaId, open, onClose, onSuccess }: NovoEncModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    estudanteId: "", destinoModulo: "" as Modulo | "",
    mensagem: "", tipoDemanda: "", cids: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.destinoModulo || !form.mensagem.trim() || !form.estudanteId.trim()) return;
    try {
      await apiFetch("/api/encaminhamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          escolaId,
          estudanteId: form.estudanteId,
          origemModulo: modulo,
          destinoModulo: form.destinoModulo,
          mensagem: form.mensagem,
          tipoDemanda: form.tipoDemanda || undefined,
          cids: form.cids ? form.cids.split(",").map(s => s.trim()).filter(Boolean) : undefined,
        }),
      });
      toast({ title: "Encaminhamento criado." });
      setForm({ estudanteId: "", destinoModulo: "", mensagem: "", tipoDemanda: "", cids: "" });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: "Erro", description: apiMsg(err, "Falha ao criar encaminhamento."), variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Novo Encaminhamento</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>ID do Estudante</Label>
            <Input value={form.estudanteId} onChange={e => setForm(f => ({ ...f, estudanteId: e.target.value }))}
              placeholder="UUID do estudante" required />
          </div>
          <div>
            <Label>Destino</Label>
            <Select value={form.destinoModulo} onValueChange={v => setForm(f => ({ ...f, destinoModulo: v as Modulo }))}>
              <SelectTrigger><SelectValue placeholder="Selecionar módulo..." /></SelectTrigger>
              <SelectContent>
                {MODULOS_DESTINO[modulo].map(m => (
                  <SelectItem key={m} value={m}>{MODULO_LABEL[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Motivo</Label>
            <Textarea value={form.mensagem} onChange={e => setForm(f => ({ ...f, mensagem: e.target.value }))}
              placeholder="Descreva o motivo do encaminhamento..." rows={3} required />
          </div>
          <div>
            <Label>Tipo de demanda <span className="text-muted-foreground">(opcional)</span></Label>
            <Input value={form.tipoDemanda} onChange={e => setForm(f => ({ ...f, tipoDemanda: e.target.value }))}
              placeholder="Ex: TDAH, Dislexia..." />
          </div>
          <div>
            <Label>CIDs <span className="text-muted-foreground">(opcional, separados por vírgula)</span></Label>
            <Input value={form.cids} onChange={e => setForm(f => ({ ...f, cids: e.target.value }))}
              placeholder="Ex: F90.0, F81.0" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Encaminhar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface AcaoModalProps {
  enc: Enc | null;
  modulo: Modulo;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function AcaoModal({ enc, modulo, open, onClose, onSuccess }: AcaoModalProps) {
  const { toast } = useToast();
  const [resolucao, setResolucao] = useState("");
  const [reencDest, setReencDest] = useState<Modulo | "">("");
  const [reencMsg, setReencMsg] = useState("");
  const [acao, setAcao] = useState<"aceitar" | "resolver" | "devolver" | "reencaminhar" | null>(null);

  if (!enc) return null;

  async function executar() {
    if (!enc || !acao) return;
    try {
      if (acao === "aceitar") {
        await apiFetch(`/api/encaminhamentos/${enc.id}/aceitar`, { method: "PUT" });
      } else if (acao === "resolver") {
        await apiFetch(`/api/encaminhamentos/${enc.id}/resolver`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolucao }),
        });
      } else if (acao === "devolver") {
        await apiFetch(`/api/encaminhamentos/${enc.id}/devolver`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolucao }),
        });
      } else if (acao === "reencaminhar") {
        await apiFetch(`/api/encaminhamentos/${enc.id}/reencaminhar`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destinoModulo: reencDest, mensagem: reencMsg }),
        });
      }
      toast({ title: "Ação realizada com sucesso." });
      setAcao(null); setResolucao(""); setReencDest(""); setReencMsg("");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: "Erro", description: apiMsg(err, "Falha ao executar ação."), variant: "destructive" });
    }
  }

  const podeAceitar  = enc.destinoModulo === modulo && enc.status === "pendente";
  const podeResolver = enc.destinoModulo === modulo && ["aceito","em_andamento"].includes(enc.status);
  const podeDevolver = enc.destinoModulo === modulo && ["pendente","aceito","em_andamento"].includes(enc.status);
  const podeReenc    = enc.destinoModulo === modulo && ["pendente","aceito","em_andamento"].includes(enc.status);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Encaminhamento — {MODULO_LABEL[enc.origemModulo]} → {MODULO_LABEL[enc.destinoModulo]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <StatusBadge status={enc.status} />
            {enc.tipoDemanda && <Badge variant="outline">{enc.tipoDemanda}</Badge>}
            {enc.cids?.map(c => <Badge key={c} variant="outline" className="font-mono">{c}</Badge>)}
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Motivo</p>
            <p>{enc.mensagem}</p>
          </div>
          {enc.resolucao && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Resolução/Devolução</p>
              <p>{enc.resolucao}</p>
            </div>
          )}
          {enc.paiId && (
            <p className="text-xs text-muted-foreground">Re-encaminhamento (pai: {enc.paiId.slice(0,8)}…)</p>
          )}
        </div>

        {/* Área de ação */}
        {(podeAceitar || podeResolver || podeDevolver || podeReenc) && (
          <div className="border-t pt-3 space-y-3">
            {!acao && (
              <div className="flex flex-wrap gap-2">
                {podeAceitar  && <Button size="sm" onClick={() => setAcao("aceitar")}>Aceitar</Button>}
                {podeResolver && <Button size="sm" variant="outline" onClick={() => setAcao("resolver")}>Resolver</Button>}
                {podeDevolver && <Button size="sm" variant="outline" onClick={() => setAcao("devolver")}>Devolver</Button>}
                {podeReenc    && <Button size="sm" variant="outline" onClick={() => setAcao("reencaminhar")}>Re-encaminhar</Button>}
              </div>
            )}
            {acao === "aceitar" && (
              <div className="space-y-2">
                <p className="text-sm">Confirmar aceitação do encaminhamento?</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={executar}>Confirmar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAcao(null)}>Cancelar</Button>
                </div>
              </div>
            )}
            {(acao === "resolver" || acao === "devolver") && (
              <div className="space-y-2">
                <Label>{acao === "resolver" ? "Resolução" : "Motivo da devolução"}</Label>
                <Textarea value={resolucao} onChange={e => setResolucao(e.target.value)} rows={3} required />
                <div className="flex gap-2">
                  <Button size="sm" onClick={executar} disabled={!resolucao.trim()}>Confirmar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAcao(null)}>Cancelar</Button>
                </div>
              </div>
            )}
            {acao === "reencaminhar" && (
              <div className="space-y-2">
                <div>
                  <Label>Destino</Label>
                  <Select value={reencDest} onValueChange={v => setReencDest(v as Modulo)}>
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {MODULOS_DESTINO[modulo].filter(m => m !== enc.origemModulo).map(m => (
                        <SelectItem key={m} value={m}>{MODULO_LABEL[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Mensagem</Label>
                  <Textarea value={reencMsg} onChange={e => setReencMsg(e.target.value)} rows={2} required />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={executar} disabled={!reencDest || !reencMsg.trim()}>Encaminhar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAcao(null)}>Cancelar</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface EncaminhamentosTabProps {
  modulo: Modulo;
  escolaId: string;
}

export function EncaminhamentosTab({ modulo, escolaId }: EncaminhamentosTabProps) {
  const qc = useQueryClient();
  const [novoOpen, setNovoOpen] = useState(false);
  const [detalhe, setDetalhe] = useState<Enc | null>(null);

  const { data: recData } = useQuery({
    queryKey: ["enc-recebidos", modulo],
    queryFn: () => apiFetch(`/api/encaminhamentos?caixa=recebidos&modulo=${modulo}`),
    refetchInterval: 60_000,
  });
  const { data: envData } = useQuery({
    queryKey: ["enc-enviados", modulo],
    queryFn: () => apiFetch(`/api/encaminhamentos?caixa=enviados&modulo=${modulo}`),
    refetchInterval: 60_000,
  });

  const recebidos: Enc[] = recData?.encaminhamentos ?? [];
  const enviados:  Enc[] = envData?.encaminhamentos ?? [];

  function refresh() {
    qc.invalidateQueries({ queryKey: ["enc-recebidos", modulo] });
    qc.invalidateQueries({ queryKey: ["enc-enviados", modulo] });
  }

  function EncRow({ enc, showOrigem }: { enc: Enc; showOrigem: boolean }) {
    return (
      <div className="flex items-start justify-between p-3 border rounded-lg bg-white hover:bg-muted/30 cursor-pointer"
        onClick={() => setDetalhe(enc)}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{enc.mensagem}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">
              {showOrigem ? `De: ${MODULO_LABEL[enc.origemModulo]}` : `Para: ${MODULO_LABEL[enc.destinoModulo]}`}
            </span>
            {enc.tipoDemanda && <Badge variant="outline" className="text-xs">{enc.tipoDemanda}</Badge>}
            {enc.cids?.slice(0, 2).map(c => <Badge key={c} variant="outline" className="text-xs font-mono">{c}</Badge>)}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
          <StatusBadge status={enc.status} />
          <Eye className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setNovoOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo encaminhamento
        </Button>
      </div>

      <Tabs defaultValue="recebidos">
        <TabsList>
          <TabsTrigger value="recebidos">Recebidos ({recebidos.length})</TabsTrigger>
          <TabsTrigger value="enviados">Enviados ({enviados.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="recebidos" className="space-y-2 mt-3">
          {recebidos.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum encaminhamento recebido.</p>
          )}
          {recebidos.map(e => <EncRow key={e.id} enc={e} showOrigem />)}
        </TabsContent>
        <TabsContent value="enviados" className="space-y-2 mt-3">
          {enviados.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum encaminhamento enviado.</p>
          )}
          {enviados.map(e => <EncRow key={e.id} enc={e} showOrigem={false} />)}
        </TabsContent>
      </Tabs>

      <NovoEncModal
        modulo={modulo} escolaId={escolaId}
        open={novoOpen} onClose={() => setNovoOpen(false)} onSuccess={refresh}
      />
      <AcaoModal
        enc={detalhe} modulo={modulo}
        open={!!detalhe} onClose={() => setDetalhe(null)} onSuccess={refresh}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd artifacts/seshat && npx tsc --noEmit 2>&1 | grep "encaminhamentos-tab" | head -10
```

Esperado: sem erros neste arquivo.

- [ ] **Step 3: Commit**

```bash
git add artifacts/seshat/src/components/encaminhamentos-tab.tsx
git commit -m "feat: componente EncaminhamentosTab compartilhado"
```

---

### Task 8: Integrar EncaminhamentosTab nas 3 Páginas de Gestão

**Files:**
- Modify: `artifacts/seshat/src/pages/sala-recursos/gestao.tsx`
- Modify: `artifacts/seshat/src/pages/eeaa/gestao.tsx`
- Modify: `artifacts/seshat/src/pages/soe/gestao.tsx`

**Interfaces:**
- Consumes: `EncaminhamentosTab` de `@/components/encaminhamentos-tab`
- Produces: nova aba "Inter-módulos" em cada página de gestão

**Nota:** cada página já tem um tab "Encaminhamentos" com dados locais do módulo (sr_encaminhamentos, soe_encaminhamentos). A nova aba é "Inter-módulos" para não colidir.

- [ ] **Step 1: Adicionar aba em `sala-recursos/gestao.tsx`**

Adicionar import no topo do arquivo:
```typescript
import { EncaminhamentosTab } from "@/components/encaminhamentos-tab";
```

Localizar o `<TabsList>` que contém `"Encaminhamentos"`. Após o último `<TabsTrigger>`, adicionar:
```tsx
<TabsTrigger value="inter-modulos">Inter-módulos</TabsTrigger>
```

Após o último `</TabsContent>`, adicionar:
```tsx
<TabsContent value="inter-modulos" className="mt-0">
  <EncaminhamentosTab modulo="sr" escolaId={escolaId} />
</TabsContent>
```

Onde `escolaId` vem de `(req as any).escolaId` no server side — no frontend use o hook `useAuth()`:
```typescript
import { useAuth } from "@/contexts/auth";
const { user } = useAuth();
const escolaId = user?.escolaId ?? "";
```

- [ ] **Step 2: Adicionar aba em `eeaa/gestao.tsx`**

Mesma estrutura. Adicionar import de `EncaminhamentosTab`.

Adicionar ao `<TabsList>`:
```tsx
<TabsTrigger value="inter-modulos">Inter-módulos</TabsTrigger>
```

Adicionar `<TabsContent>`:
```tsx
<TabsContent value="inter-modulos" className="space-y-3">
  <EncaminhamentosTab modulo="eeaa" escolaId={escolaId} />
</TabsContent>
```

- [ ] **Step 3: Adicionar aba em `soe/gestao.tsx`**

A página SOE já tem `<TabsTrigger value="encaminhamentos">Encaminhamentos</TabsTrigger>` para encaminhamentos locais SOE. Adicionar apenas a aba nova:

```tsx
<TabsTrigger value="inter-modulos">Inter-módulos</TabsTrigger>
```

```tsx
<TabsContent value="inter-modulos" className="space-y-3 mt-3">
  <EncaminhamentosTab modulo="soe" escolaId={escolaId} />
</TabsContent>
```

- [ ] **Step 4: Verificar TypeScript**

```bash
cd artifacts/seshat && npx tsc --noEmit 2>&1 | head -20
```

Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add artifacts/seshat/src/pages/sala-recursos/gestao.tsx \
  artifacts/seshat/src/pages/eeaa/gestao.tsx \
  artifacts/seshat/src/pages/soe/gestao.tsx
git commit -m "feat: aba inter-módulos de encaminhamentos nas páginas de gestão SR, EEAA e SOE"
```

---

### Task 9: Documentação e Skill

**Files:**
- Rename: `.specs/features/portal-aee.md` → `.specs/features/portal-eeaa.md`
- Create: `.claude/skills/seshat-eeaa/SKILL.md`
- Delete: `.claude/skills/seshat-aee/` (diretório)
- Modify: `docs/superpowers/specs/2026-09-16-portal-aee-design.md` (atualizar título/labels)

**Interfaces:**
- Produces: skill `seshat-eeaa` e spec `portal-eeaa.md` coerentes com o rename

- [ ] **Step 1: Renomear spec e atualizar conteúdo**

```bash
cp .specs/features/portal-aee.md .specs/features/portal-eeaa.md
# Substituir "AEE" por "EEAA" e URLs /aee/ por /eeaa/ no novo arquivo
```

- [ ] **Step 2: Criar `.claude/skills/seshat-eeaa/SKILL.md`**

Conteúdo baseado em `.claude/skills/seshat-aee/` com:
- Todos os nomes de tabelas `aee_*` → `eeaa_*`
- Permissões `aee:manage` / `aee:view` → `eeaa:manage` / `eeaa:view`
- Rotas `/api/aee/*` → `/api/eeaa/*`
- URLs `/aee/gestao`, `/aee/analise` → `/eeaa/gestao`, `/eeaa/analise`
- Arquivos mencionados: `lib/eeaa-crypto.ts`, `lib/eeaa-audit.ts`
- Título do módulo: "Equipe Especializada de Apoio à Aprendizagem (EEAA)"

Acrescentar seção:
```markdown
## Workflow Inter-módulos

Ver `.claude/skills/seshat-encaminhamentos/SKILL.md` para o workflow SOE ↔ EEAA ↔ SR.
```

- [ ] **Step 3: Criar `.claude/skills/seshat-encaminhamentos/SKILL.md`**

```markdown
# Skill: Workflow de Encaminhamentos Inter-módulos

## Módulos envolvidos
SOE ↔ EEAA ↔ SR — qualquer direção, qualquer combinação.

## Tabela
`encaminhamentos_eventos` (em `lib/db/src/schema/sala-recursos.ts`)

## Campos novos (além da estrutura original)
- `tipo_demanda varchar(100)` — opcional
- `cids text[]` — array de CIDs, opcional
- `resolucao text` — preenchido ao resolver/devolver
- `pai_id uuid` — self-FK para encaminhamento de origem (re-encaminhamento)

## Status
`pendente → aceito → em_andamento → resolvido | devolvido`
Re-encaminhar: pai vai para `em_andamento`, filho nasce `pendente`.

## Permissões (guard `encGuard`)
| Módulo | Permissão necessária |
|---|---|
| SR | `sala_recursos:manage` |
| EEAA | `eeaa:manage` |
| SOE | `soe:manage` |

## API
Router: `artifacts/api-server/src/routes/encaminhamentos.ts`
Registrado em: `/api/encaminhamentos`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/?caixa=recebidos\|enviados&modulo=sr\|eeaa\|soe` | Listar caixa |
| POST | `/` | Criar encaminhamento |
| PUT | `/:id/aceitar` | Aceitar |
| PUT | `/:id/resolver` | Resolver (body: {resolucao}) |
| PUT | `/:id/devolver` | Devolver (body: {resolucao}) |
| PUT | `/:id/reencaminhar` | Re-encaminhar (body: {destinoModulo, mensagem}) |

## UI
Componente: `artifacts/seshat/src/components/encaminhamentos-tab.tsx`
Props: `{ modulo: "sr" | "eeaa" | "soe", escolaId: string }`

Integrado como aba "Inter-módulos" em:
- `pages/sala-recursos/gestao.tsx`
- `pages/eeaa/gestao.tsx`
- `pages/soe/gestao.tsx`
```

- [ ] **Step 4: Remover skill antiga**

```bash
rm -rf .claude/skills/seshat-aee/
```

- [ ] **Step 5: Commit**

```bash
git add .specs/features/portal-eeaa.md .claude/skills/seshat-eeaa/ .claude/skills/seshat-encaminhamentos/
git rm .specs/features/portal-aee.md
git rm -rf .claude/skills/seshat-aee/
git commit -m "docs: spec e skill EEAA + skill workflow encaminhamentos inter-módulos"
```
