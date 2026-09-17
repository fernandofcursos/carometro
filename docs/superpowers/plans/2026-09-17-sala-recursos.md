# AEE — Sala de Recursos: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo completo de gestão da Sala de Recursos Generalista do AEE no Seshat — schema, API, testes, UI e encaminhamento inter-módulo.

**Architecture:** Segue o padrão do SOE: Drizzle ORM + Express + React + Vitest. Sete tabelas novas (prefixo `sr_*` + `encaminhamentos_eventos` compartilhada). Guard `srGuard` análogo ao `soeGuard`. Três páginas React + aba no portal do responsável.

**Tech Stack:** TypeScript, Drizzle ORM, Express, React, TanStack Query, shadcn/ui, Vitest, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-17-sala-recursos-design.md`

## Global Constraints

- Multi-tenant obrigatório: todas as queries usam `withTenant(escolaId, async (tx) => await tx.select()...)` — o `async` e o `await` na chain são obrigatórios para TypeScript inferir o tipo de retorno
- Roles não estão no JWT: usar sempre `buscarRoles(req.usuarioId)` de `../lib/permissions.js`
- Permissão guard: `srGuard(nivel)` com hierarquia `manage > view > professor > self`
- Imports de DB sempre de `@workspace/db`; imports do servidor com extensão `.js`
- Tabelas exportadas de `lib/db/src/schema/index.ts`
- SQL migration idempotente: `CREATE TABLE IF NOT EXISTS`
- Testes usam Vitest + Supertest; mocks via `vi.mock`; `withTenant` mockado como `vi.fn(async (_id, fn) => fn(mockDb))`
- Commits frequentes após cada passo verificável

---

### Task 1: Schema Drizzle + Migração SQL

**Files:**
- Create: `lib/db/src/schema/sala-recursos.ts`
- Modify: `lib/db/src/schema/index.ts`
- Create: `scripts/migrate-sala-recursos.sql`

**Interfaces:**
- Produz: `srEstudantesEneeTable`, `srAtendimentosTable`, `srPlanosAeeTable`, `srEsvTable`, `srEstudosCasoTable`, `srEncaminhamentosTable`, `encaminhamentosEventosTable` — todos exportados via `@workspace/db`

- [ ] **Step 1: Criar `lib/db/src/schema/sala-recursos.ts`**

```typescript
import {
  pgTable, uuid, varchar, text, timestamp,
  date, boolean, smallint, integer, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { escolasTable } from "./escolas";
import { usuariosTable } from "./usuarios";

export const srEstudantesEneeTable = pgTable("sr_estudantes_enee", {
  id:               uuid("id").primaryKey().defaultRandom(),
  escolaId:         uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  usuarioId:        uuid("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  laudo:            varchar("laudo", { length: 20 }).notNull(),
  dataLaudo:        date("data_laudo"),
  instituicaoLaudo: varchar("instituicao_laudo", { length: 200 }),
  observacoes:      text("observacoes"),
  ativo:            boolean("ativo").default(true).notNull(),
  criadoEm:         timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:     timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm:       timestamp("deletado_em",  { withTimezone: true }),
}, (t) => [
  index("idx_sr_enee_escola").on(t.escolaId),
  uniqueIndex("uq_sr_enee_usuario_escola").on(t.escolaId, t.usuarioId).where(sql`${t.deletadoEm} IS NULL`),
]);

export const srAtendimentosTable = pgTable("sr_atendimentos", {
  id:               uuid("id").primaryKey().defaultRandom(),
  escolaId:         uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteId:      uuid("estudante_id").notNull().references(() => srEstudantesEneeTable.id, { onDelete: "restrict" }),
  dataAtendimento:  date("data_atendimento").notNull(),
  duracaoMin:       smallint("duracao_min"),
  tipo:             varchar("tipo", { length: 30 }).notNull(),
  narrativa:        text("narrativa"),
  registradoPorId:  uuid("registrado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  criadoEm:         timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:     timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm:       timestamp("deletado_em",  { withTimezone: true }),
}, (t) => [
  index("idx_sr_atendimentos_escola").on(t.escolaId),
  index("idx_sr_atendimentos_estudante").on(t.estudanteId),
]);

export const srPlanosAeeTable = pgTable("sr_planos_aee", {
  id:            uuid("id").primaryKey().defaultRandom(),
  escolaId:      uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteId:   uuid("estudante_id").notNull().references(() => srEstudantesEneeTable.id, { onDelete: "restrict" }),
  objetivos:     text("objetivos").notNull(),
  estrategias:   text("estrategias").notNull(),
  avaliacao:     text("avaliacao").notNull(),
  prazo:         date("prazo").notNull(),
  observacoes:   text("observacoes"),
  status:        varchar("status", { length: 20 }).default("rascunho").notNull(),
  elaboradoPorId: uuid("elaborado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  ano:           integer("ano").notNull(),
  semestre:      smallint("semestre").notNull(),
  criadoEm:      timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:  timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_sr_planos_escola").on(t.escolaId),
  index("idx_sr_planos_estudante").on(t.estudanteId),
]);

export const srEsvTable = pgTable("sr_esv", {
  id:             uuid("id").primaryKey().defaultRandom(),
  escolaId:       uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteId:    uuid("estudante_id").notNull().references(() => srEstudantesEneeTable.id, { onDelete: "restrict" }),
  nome:           varchar("nome", { length: 200 }).notNull(),
  contato:        varchar("contato", { length: 200 }),
  periodoInicio:  date("periodo_inicio").notNull(),
  periodoFim:     date("periodo_fim"),
  observacoes:    text("observacoes"),
  ativo:          boolean("ativo").default(true).notNull(),
  criadoEm:       timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:   timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_sr_esv_escola").on(t.escolaId),
]);

export const srEstudosCasoTable = pgTable("sr_estudos_caso", {
  id:                         uuid("id").primaryKey().defaultRandom(),
  escolaId:                   uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteId:                uuid("estudante_id").notNull().references(() => srEstudantesEneeTable.id, { onDelete: "restrict" }),
  dataRealizacao:             date("data_realizacao").notNull(),
  participantes:              text("participantes"),
  sintese:                    text("sintese").notNull(),
  encaminhamentosResultantes: text("encaminhamentos_resultantes"),
  status:                     varchar("status", { length: 20 }).default("aberto").notNull(),
  criadoEm:                   timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:               timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_sr_estudos_caso_escola").on(t.escolaId),
]);

export const srEncaminhamentosTable = pgTable("sr_encaminhamentos", {
  id:              uuid("id").primaryKey().defaultRandom(),
  escolaId:        uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteId:     uuid("estudante_id").notNull().references(() => srEstudantesEneeTable.id, { onDelete: "restrict" }),
  descricao:       text("descricao").notNull(),
  destinatarioId:  uuid("destinatario_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  status:          varchar("status", { length: 20 }).default("pendente").notNull(),
  prazo:           date("prazo"),
  resposta:        text("resposta"),
  criadoPorId:     uuid("criado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  criadoEm:        timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:    timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_sr_encaminhamentos_escola").on(t.escolaId),
]);

export const encaminhamentosEventosTable = pgTable("encaminhamentos_eventos", {
  id:             uuid("id").primaryKey().defaultRandom(),
  escolaId:       uuid("escola_id").references(() => escolasTable.id, { onDelete: "set null" }),
  origemModulo:   varchar("origem_modulo", { length: 30 }).notNull(),
  destinoModulo:  varchar("destino_modulo", { length: 30 }).notNull(),
  estudanteId:    uuid("estudante_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  referenciaId:   uuid("referencia_id"),
  referenciaTipo: varchar("referencia_tipo", { length: 50 }),
  mensagem:       text("mensagem"),
  status:         varchar("status", { length: 20 }).default("pendente").notNull(),
  criadoPorId:    uuid("criado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  recebidoPorId:  uuid("recebido_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  criadoEm:       timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:   timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_enc_eventos_escola").on(t.escolaId),
  index("idx_enc_eventos_destino").on(t.destinoModulo, t.status),
]);
```

Nota: o `sql` para o uniqueIndex precisa ser importado:
```typescript
import { ..., sql } from "drizzle-orm/pg-core";
// ou importar sql de "drizzle-orm"
import { sql } from "drizzle-orm";
```

- [ ] **Step 2: Rodar TypeScript check para verificar o schema**

```bash
cd lib/db && npx tsc --noEmit 2>&1 | head -40
```

Esperado: sem erros.

- [ ] **Step 3: Adicionar export em `lib/db/src/schema/index.ts`**

Adicionar ao final do arquivo:
```typescript
export * from "./sala-recursos";
```

- [ ] **Step 4: Criar `scripts/migrate-sala-recursos.sql`**

```sql
-- AEE Sala de Recursos — migração idempotente
-- ATENÇÃO: executar após migrate-soe.sql

BEGIN;

CREATE TABLE IF NOT EXISTS sr_estudantes_enee (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id         uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  usuario_id        uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  laudo             varchar(20) NOT NULL CHECK (laudo IN ('DI','DF','DOWN','TEA','AH_SD')),
  data_laudo        date,
  instituicao_laudo varchar(200),
  observacoes       text,
  ativo             boolean     NOT NULL DEFAULT true,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  deletado_em       timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sr_enee_usuario_escola
  ON sr_estudantes_enee (escola_id, usuario_id)
  WHERE deletado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_sr_enee_escola ON sr_estudantes_enee (escola_id);

CREATE TABLE IF NOT EXISTS sr_atendimentos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id        uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_id     uuid        NOT NULL REFERENCES sr_estudantes_enee(id) ON DELETE RESTRICT,
  data_atendimento date        NOT NULL,
  duracao_min      smallint,
  tipo             varchar(30) NOT NULL CHECK (tipo IN ('individual','orientacao_professor','orientacao_familia','esv','estudo_caso')),
  narrativa        text,
  registrado_por_id uuid       REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  deletado_em      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sr_atendimentos_escola    ON sr_atendimentos (escola_id);
CREATE INDEX IF NOT EXISTS idx_sr_atendimentos_estudante ON sr_atendimentos (estudante_id);

CREATE TABLE IF NOT EXISTS sr_planos_aee (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id        uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_id     uuid        NOT NULL REFERENCES sr_estudantes_enee(id) ON DELETE RESTRICT,
  objetivos        text        NOT NULL,
  estrategias      text        NOT NULL,
  avaliacao        text        NOT NULL,
  prazo            date        NOT NULL,
  observacoes      text,
  status           varchar(20) NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','ativo','encerrado')),
  elaborado_por_id uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  ano              integer     NOT NULL,
  semestre         smallint    NOT NULL CHECK (semestre IN (1,2)),
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sr_planos_escola    ON sr_planos_aee (escola_id);
CREATE INDEX IF NOT EXISTS idx_sr_planos_estudante ON sr_planos_aee (estudante_id);

CREATE TABLE IF NOT EXISTS sr_esv (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id       uuid         NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_id    uuid         NOT NULL REFERENCES sr_estudantes_enee(id) ON DELETE RESTRICT,
  nome            varchar(200) NOT NULL,
  contato         varchar(200),
  periodo_inicio  date         NOT NULL,
  periodo_fim     date,
  observacoes     text,
  ativo           boolean      NOT NULL DEFAULT true,
  criado_em       timestamptz  NOT NULL DEFAULT now(),
  atualizado_em   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sr_esv_escola ON sr_esv (escola_id);

CREATE TABLE IF NOT EXISTS sr_estudos_caso (
  id                           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id                    uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_id                 uuid        NOT NULL REFERENCES sr_estudantes_enee(id) ON DELETE RESTRICT,
  data_realizacao              date        NOT NULL,
  participantes                text,
  sintese                      text        NOT NULL,
  encaminhamentos_resultantes  text,
  status                       varchar(20) NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','encerrado')),
  criado_em                    timestamptz NOT NULL DEFAULT now(),
  atualizado_em                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sr_estudos_caso_escola ON sr_estudos_caso (escola_id);

CREATE TABLE IF NOT EXISTS sr_encaminhamentos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id        uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_id     uuid        NOT NULL REFERENCES sr_estudantes_enee(id) ON DELETE RESTRICT,
  descricao        text        NOT NULL,
  destinatario_id  uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  status           varchar(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluido')),
  prazo            date,
  resposta         text,
  criado_por_id    uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sr_encaminhamentos_escola ON sr_encaminhamentos (escola_id);

-- Tabela compartilhada inter-módulo (idempotente — outros módulos também a criam se não existir)
CREATE TABLE IF NOT EXISTS encaminhamentos_eventos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id        uuid        REFERENCES escolas(id) ON DELETE SET NULL,
  origem_modulo    varchar(30) NOT NULL,
  destino_modulo   varchar(30) NOT NULL,
  estudante_id     uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  referencia_id    uuid,
  referencia_tipo  varchar(50),
  mensagem         text,
  status           varchar(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','recebido','encerrado')),
  criado_por_id    uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  recebido_por_id  uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enc_eventos_escola  ON encaminhamentos_eventos (escola_id);
CREATE INDEX IF NOT EXISTS idx_enc_eventos_destino ON encaminhamentos_eventos (destino_modulo, status);

-- Seeds de permissões
INSERT INTO permissoes (recurso, acao) VALUES
  ('sala_recursos', 'manage'),
  ('sala_recursos', 'view'),
  ('sala_recursos', 'professor'),
  ('sala_recursos', 'self')
ON CONFLICT (recurso, acao) DO NOTHING;

COMMIT;
```

- [ ] **Step 5: Commit**

```bash
git add lib/db/src/schema/sala-recursos.ts lib/db/src/schema/index.ts scripts/migrate-sala-recursos.sql
git commit -m "feat: schema Drizzle e migração SQL — AEE Sala de Recursos"
```

---

### Task 2: API Guard + Rotas + Registro no servidor

**Files:**
- Create: `artifacts/api-server/src/routes/sala-recursos.ts`
- Modify: `artifacts/api-server/src/index.ts`

**Interfaces:**
- Consome: `srEstudantesEneeTable`, `srAtendimentosTable`, `srPlanosAeeTable`, `srEsvTable`, `srEstudosCasoTable`, `srEncaminhamentosTable`, `encaminhamentosEventosTable` de `@workspace/db`
- Consome: `requireAuth` de `../lib/auth.js`, `buscarRoles` de `../lib/permissions.js`, `withTenant` de `../middleware/tenant.js`
- Produz: rotas montadas em `/api/sala-recursos`

- [ ] **Step 1: Escrever teste mínimo para o guard — verificar que falha sem permissão**

Criar `artifacts/api-server/src/tests/sala-recursos.test.ts` com apenas o teste do guard (o resto vem na Task 3):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { makeQuery } from "./helpers/db-mock.js";

const mockDb = {
  select: vi.fn(() => makeQuery()),
  insert: vi.fn(() => makeQuery()),
  update: vi.fn(() => makeQuery()),
  delete: vi.fn(() => makeQuery()),
};

vi.mock("@workspace/db", () => ({
  db: mockDb,
  srEstudantesEneeTable:    { id:"id", escolaId:"escolaId", usuarioId:"usuarioId", laudo:"laudo", dataLaudo:"dataLaudo", instituicaoLaudo:"instituicaoLaudo", observacoes:"observacoes", ativo:"ativo", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm", deletadoEm:"deletadoEm" },
  srAtendimentosTable:      { id:"id", escolaId:"escolaId", estudanteId:"estudanteId", dataAtendimento:"dataAtendimento", duracaoMin:"duracaoMin", tipo:"tipo", narrativa:"narrativa", registradoPorId:"registradoPorId", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm", deletadoEm:"deletadoEm" },
  srPlanosAeeTable:         { id:"id", escolaId:"escolaId", estudanteId:"estudanteId", objetivos:"objetivos", estrategias:"estrategias", avaliacao:"avaliacao", prazo:"prazo", observacoes:"observacoes", status:"status", elaboradoPorId:"elaboradoPorId", ano:"ano", semestre:"semestre", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  srEsvTable:               { id:"id", escolaId:"escolaId", estudanteId:"estudanteId", nome:"nome", contato:"contato", periodoInicio:"periodoInicio", periodoFim:"periodoFim", observacoes:"observacoes", ativo:"ativo", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  srEstudosCasoTable:       { id:"id", escolaId:"escolaId", estudanteId:"estudanteId", dataRealizacao:"dataRealizacao", participantes:"participantes", sintese:"sintese", encaminhamentosResultantes:"encaminhamentosResultantes", status:"status", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  srEncaminhamentosTable:   { id:"id", escolaId:"escolaId", estudanteId:"estudanteId", descricao:"descricao", destinatarioId:"destinatarioId", status:"status", prazo:"prazo", resposta:"resposta", criadoPorId:"criadoPorId", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  encaminhamentosEventosTable: { id:"id", escolaId:"escolaId", origemModulo:"origemModulo", destinoModulo:"destinoModulo", estudanteId:"estudanteId", referenciaId:"referenciaId", referenciaTipo:"referenciaTipo", mensagem:"mensagem", status:"status", criadoPorId:"criadoPorId", recebidoPorId:"recebidoPorId", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  eq:      vi.fn(() => "eq"),
  and:     vi.fn((..._a: any[]) => "and"),
  isNull:  vi.fn(() => "isNull"),
  desc:    vi.fn((c: any) => c),
  asc:     vi.fn((c: any) => c),
}));

vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../middleware/tenant.js", () => ({
  requireTenant: (_req: any, _res: any, next: () => void) => next(),
  withTenant: vi.fn(async (_id: string, fn: (tx: any) => Promise<any>) => fn(mockDb)),
}));

vi.mock("../lib/permissions.js", () => ({
  buscarRoles: vi.fn().mockResolvedValue(["sala_recursos:manage"]),
  requirePermissao: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  invalidarCachePermissoes: vi.fn(),
}));

vi.mock("../lib/auth.js", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => {
    (_req as any).usuarioId = "user-uuid-1";
    (_req as any).escolaId  = "escola-uuid-1";
    next();
  },
}));

import salaRecursosRouter from "../routes/sala-recursos.js";
import { buscarRoles } from "../lib/permissions.js";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/sala-recursos", salaRecursosRouter);
  return app;
}

describe("srGuard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna 403 quando sem permissão", async () => {
    vi.mocked(buscarRoles).mockResolvedValueOnce([]);
    const app = makeApp();
    const res = await request(app).get("/api/sala-recursos/estudantes-enee");
    expect(res.status).toBe(403);
  });

  it("permite acesso com sala_recursos:manage", async () => {
    vi.mocked(buscarRoles).mockResolvedValueOnce(["sala_recursos:manage"]);
    mockDb.select.mockReturnValueOnce(makeQuery({ estudantes: [] }));
    const app = makeApp();
    const res = await request(app).get("/api/sala-recursos/estudantes-enee");
    expect(res.status).toBe(200);
  });

  it("permite view acessar estudantes-enee", async () => {
    vi.mocked(buscarRoles).mockResolvedValueOnce(["sala_recursos:view"]);
    mockDb.select.mockReturnValueOnce(makeQuery({ estudantes: [] }));
    const app = makeApp();
    const res = await request(app).get("/api/sala-recursos/estudantes-enee");
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha (arquivo de rotas ainda não existe)**

```bash
cd artifacts/api-server && npx vitest run src/tests/sala-recursos.test.ts 2>&1 | tail -20
```

Esperado: erro de módulo não encontrado (`sala-recursos.js`).

- [ ] **Step 3: Criar `artifacts/api-server/src/routes/sala-recursos.ts`**

```typescript
import { Router } from "express";
import { z } from "zod";
import {
  db,
  srEstudantesEneeTable, srAtendimentosTable, srPlanosAeeTable,
  srEsvTable, srEstudosCasoTable, srEncaminhamentosTable,
  encaminhamentosEventosTable,
  eq, and, isNull, desc,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { buscarRoles } from "../lib/permissions.js";
import { withTenant } from "../middleware/tenant.js";

const router = Router();
router.use(requireAuth);

type SrNivel = "manage" | "view" | "professor" | "self";
function srGuard(nivel: SrNivel) {
  return async (req: any, res: any, next: any) => {
    const roles = await buscarRoles(req.usuarioId);
    const tem = (p: string) => roles.includes(p);
    const hierarquia: Record<SrNivel, string[]> = {
      manage:    ["sala_recursos:manage"],
      view:      ["sala_recursos:manage", "sala_recursos:view"],
      professor: ["sala_recursos:manage", "sala_recursos:view", "sala_recursos:professor"],
      self:      ["sala_recursos:manage", "sala_recursos:view", "sala_recursos:professor", "sala_recursos:self"],
    };
    if (hierarquia[nivel].some(tem)) return next();
    return res.status(403).json({ error: "Sem permissão para esta operação." });
  };
}

// ── ESTUDANTES ENEE ───────────────────────────────────────────────────────────

const eneeSchema = z.object({
  usuarioId:        z.string().uuid(),
  laudo:            z.enum(["DI", "DF", "DOWN", "TEA", "AH_SD"]),
  dataLaudo:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  instituicaoLaudo: z.string().max(200).optional(),
  observacoes:      z.string().optional(),
});

router.get("/estudantes-enee", srGuard("view"), async (req: any, res) => {
  try {
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select().from(srEstudantesEneeTable)
        .where(and(
          eq(srEstudantesEneeTable.escolaId, req.escolaId),
          isNull(srEstudantesEneeTable.deletadoEm),
        ))
        .orderBy(srEstudantesEneeTable.criadoEm)
    );
    res.json({ estudantes: rows });
  } catch {
    res.status(500).json({ error: "Erro ao listar ENEEs." });
  }
});

router.post("/estudantes-enee", srGuard("manage"), async (req: any, res) => {
  try {
    const body = eneeSchema.parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.insert(srEstudantesEneeTable).values({
        escolaId: req.escolaId,
        ...body,
      }).returning()
    );
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao registrar ENEE." });
  }
});

router.put("/estudantes-enee/:id", srGuard("manage"), async (req: any, res) => {
  try {
    const body = eneeSchema.partial().parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(srEstudantesEneeTable)
        .set({ ...body, atualizadoEm: new Date() })
        .where(and(
          eq(srEstudantesEneeTable.id, req.params.id),
          eq(srEstudantesEneeTable.escolaId, req.escolaId),
        ))
        .returning()
    );
    if (!row) return res.status(404).json({ error: "ENEE não encontrado." });
    res.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao atualizar ENEE." });
  }
});

// ── ATENDIMENTOS ──────────────────────────────────────────────────────────────

const atendimentoSchema = z.object({
  estudanteId:     z.string().uuid(),
  dataAtendimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duracaoMin:      z.number().int().positive().optional(),
  tipo:            z.enum(["individual", "orientacao_professor", "orientacao_familia", "esv", "estudo_caso"]),
  narrativa:       z.string().optional(),
});

router.get("/atendimentos", srGuard("view"), async (req: any, res) => {
  try {
    const { estudanteId, tipo } = req.query;
    const conditions: any[] = [
      eq(srAtendimentosTable.escolaId, req.escolaId),
      isNull(srAtendimentosTable.deletadoEm),
    ];
    if (estudanteId) conditions.push(eq(srAtendimentosTable.estudanteId, String(estudanteId)));
    if (tipo) conditions.push(eq(srAtendimentosTable.tipo, String(tipo)));
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select().from(srAtendimentosTable)
        .where(and(...conditions))
        .orderBy(desc(srAtendimentosTable.dataAtendimento))
    );
    res.json({ atendimentos: rows });
  } catch {
    res.status(500).json({ error: "Erro ao listar atendimentos." });
  }
});

router.post("/atendimentos", srGuard("manage"), async (req: any, res) => {
  try {
    const body = atendimentoSchema.parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.insert(srAtendimentosTable).values({
        escolaId: req.escolaId,
        registradoPorId: req.usuarioId,
        ...body,
      }).returning()
    );
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao registrar atendimento." });
  }
});

router.put("/atendimentos/:id", srGuard("manage"), async (req: any, res) => {
  try {
    const body = atendimentoSchema.partial().parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(srAtendimentosTable)
        .set({ ...body, atualizadoEm: new Date() })
        .where(and(
          eq(srAtendimentosTable.id, req.params.id),
          eq(srAtendimentosTable.escolaId, req.escolaId),
        ))
        .returning()
    );
    if (!row) return res.status(404).json({ error: "Atendimento não encontrado." });
    res.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao atualizar atendimento." });
  }
});

router.delete("/atendimentos/:id", srGuard("manage"), async (req: any, res) => {
  try {
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(srAtendimentosTable)
        .set({ deletadoEm: new Date() })
        .where(and(
          eq(srAtendimentosTable.id, req.params.id),
          eq(srAtendimentosTable.escolaId, req.escolaId),
        ))
        .returning()
    );
    if (!row) return res.status(404).json({ error: "Atendimento não encontrado." });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao remover atendimento." });
  }
});

// ── PLANOS AEE ────────────────────────────────────────────────────────────────

const planoSchema = z.object({
  estudanteId:  z.string().uuid(),
  objetivos:    z.string().min(1),
  estrategias:  z.string().min(1),
  avaliacao:    z.string().min(1),
  prazo:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observacoes:  z.string().optional(),
  status:       z.enum(["rascunho", "ativo", "encerrado"]).optional(),
  ano:          z.number().int(),
  semestre:     z.union([z.literal(1), z.literal(2)]),
});

router.get("/planos-aee", srGuard("view"), async (req: any, res) => {
  try {
    const { estudanteId } = req.query;
    const conditions: any[] = [eq(srPlanosAeeTable.escolaId, req.escolaId)];
    if (estudanteId) conditions.push(eq(srPlanosAeeTable.estudanteId, String(estudanteId)));
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select().from(srPlanosAeeTable)
        .where(and(...conditions))
        .orderBy(desc(srPlanosAeeTable.criadoEm))
    );
    res.json({ planos: rows });
  } catch {
    res.status(500).json({ error: "Erro ao listar planos." });
  }
});

router.get("/planos-aee/:id", srGuard("professor"), async (req: any, res) => {
  try {
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.select().from(srPlanosAeeTable)
        .where(and(
          eq(srPlanosAeeTable.id, req.params.id),
          eq(srPlanosAeeTable.escolaId, req.escolaId),
        ))
    );
    if (!row) return res.status(404).json({ error: "Plano não encontrado." });
    // professor: retorna só campos de adequação
    const roles = await buscarRoles(req.usuarioId);
    if (roles.includes("sala_recursos:professor") &&
        !roles.includes("sala_recursos:manage") &&
        !roles.includes("sala_recursos:view")) {
      const { objetivos, estrategias, avaliacao, prazo, status } = row;
      return res.json({ id: row.id, estudanteId: row.estudanteId, objetivos, estrategias, avaliacao, prazo, status });
    }
    res.json(row);
  } catch {
    res.status(500).json({ error: "Erro ao buscar plano." });
  }
});

router.post("/planos-aee", srGuard("manage"), async (req: any, res) => {
  try {
    const body = planoSchema.parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.insert(srPlanosAeeTable).values({
        escolaId: req.escolaId,
        elaboradoPorId: req.usuarioId,
        ...body,
      }).returning()
    );
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao criar plano." });
  }
});

router.put("/planos-aee/:id", srGuard("manage"), async (req: any, res) => {
  try {
    const body = planoSchema.partial().parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(srPlanosAeeTable)
        .set({ ...body, atualizadoEm: new Date() })
        .where(and(
          eq(srPlanosAeeTable.id, req.params.id),
          eq(srPlanosAeeTable.escolaId, req.escolaId),
        ))
        .returning()
    );
    if (!row) return res.status(404).json({ error: "Plano não encontrado." });
    res.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao atualizar plano." });
  }
});

// ── ESV ───────────────────────────────────────────────────────────────────────

const esvSchema = z.object({
  estudanteId:   z.string().uuid(),
  nome:          z.string().min(1).max(200),
  contato:       z.string().max(200).optional(),
  periodoInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodoFim:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  observacoes:   z.string().optional(),
  ativo:         z.boolean().optional(),
});

router.get("/esv", srGuard("view"), async (req: any, res) => {
  try {
    const { estudanteId } = req.query;
    const conditions: any[] = [eq(srEsvTable.escolaId, req.escolaId)];
    if (estudanteId) conditions.push(eq(srEsvTable.estudanteId, String(estudanteId)));
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select().from(srEsvTable).where(and(...conditions))
    );
    res.json({ esv: rows });
  } catch {
    res.status(500).json({ error: "Erro ao listar ESVs." });
  }
});

router.post("/esv", srGuard("manage"), async (req: any, res) => {
  try {
    const body = esvSchema.parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.insert(srEsvTable).values({ escolaId: req.escolaId, ...body }).returning()
    );
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao vincular ESV." });
  }
});

router.put("/esv/:id", srGuard("manage"), async (req: any, res) => {
  try {
    const body = esvSchema.partial().parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(srEsvTable)
        .set({ ...body, atualizadoEm: new Date() })
        .where(and(eq(srEsvTable.id, req.params.id), eq(srEsvTable.escolaId, req.escolaId)))
        .returning()
    );
    if (!row) return res.status(404).json({ error: "ESV não encontrado." });
    res.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao atualizar ESV." });
  }
});

// ── ESTUDOS DE CASO ───────────────────────────────────────────────────────────

const estudoCasoSchema = z.object({
  estudanteId:                z.string().uuid(),
  dataRealizacao:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  participantes:              z.string().optional(),
  sintese:                    z.string().min(1),
  encaminhamentosResultantes: z.string().optional(),
  status:                     z.enum(["aberto", "encerrado"]).optional(),
});

router.get("/estudos-caso", srGuard("view"), async (req: any, res) => {
  try {
    const { estudanteId } = req.query;
    const conditions: any[] = [eq(srEstudosCasoTable.escolaId, req.escolaId)];
    if (estudanteId) conditions.push(eq(srEstudosCasoTable.estudanteId, String(estudanteId)));
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select().from(srEstudosCasoTable)
        .where(and(...conditions))
        .orderBy(desc(srEstudosCasoTable.dataRealizacao))
    );
    res.json({ estudosCaso: rows });
  } catch {
    res.status(500).json({ error: "Erro ao listar estudos de caso." });
  }
});

router.post("/estudos-caso", srGuard("manage"), async (req: any, res) => {
  try {
    const body = estudoCasoSchema.parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.insert(srEstudosCasoTable).values({ escolaId: req.escolaId, ...body }).returning()
    );
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao criar estudo de caso." });
  }
});

router.put("/estudos-caso/:id", srGuard("manage"), async (req: any, res) => {
  try {
    const body = estudoCasoSchema.partial().parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(srEstudosCasoTable)
        .set({ ...body, atualizadoEm: new Date() })
        .where(and(eq(srEstudosCasoTable.id, req.params.id), eq(srEstudosCasoTable.escolaId, req.escolaId)))
        .returning()
    );
    if (!row) return res.status(404).json({ error: "Estudo de caso não encontrado." });
    res.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao atualizar estudo de caso." });
  }
});

// ── ENCAMINHAMENTOS INTERNOS ──────────────────────────────────────────────────

const encSchema = z.object({
  estudanteId:    z.string().uuid(),
  descricao:      z.string().min(1),
  destinatarioId: z.string().uuid().optional(),
  prazo:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status:         z.enum(["pendente", "em_andamento", "concluido"]).optional(),
  resposta:       z.string().optional(),
});

router.get("/encaminhamentos", srGuard("view"), async (req: any, res) => {
  try {
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select().from(srEncaminhamentosTable)
        .where(eq(srEncaminhamentosTable.escolaId, req.escolaId))
        .orderBy(desc(srEncaminhamentosTable.criadoEm))
    );
    res.json({ encaminhamentos: rows });
  } catch {
    res.status(500).json({ error: "Erro ao listar encaminhamentos." });
  }
});

router.post("/encaminhamentos", srGuard("manage"), async (req: any, res) => {
  try {
    const body = encSchema.parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.insert(srEncaminhamentosTable).values({
        escolaId: req.escolaId,
        criadoPorId: req.usuarioId,
        ...body,
      }).returning()
    );
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao criar encaminhamento." });
  }
});

router.put("/encaminhamentos/:id", srGuard("manage"), async (req: any, res) => {
  try {
    const body = encSchema.partial().parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(srEncaminhamentosTable)
        .set({ ...body, atualizadoEm: new Date() })
        .where(and(eq(srEncaminhamentosTable.id, req.params.id), eq(srEncaminhamentosTable.escolaId, req.escolaId)))
        .returning()
    );
    if (!row) return res.status(404).json({ error: "Encaminhamento não encontrado." });
    res.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao atualizar encaminhamento." });
  }
});

// ── ENCAMINHAMENTO INTER-MÓDULO ───────────────────────────────────────────────

const interModuloSchema = z.object({
  destinoModulo:  z.enum(["soe", "aee"]),
  estudanteId:    z.string().uuid(),
  referenciaId:   z.string().uuid().optional(),
  referenciaTipo: z.string().max(50).optional(),
  mensagem:       z.string().min(1),
});

router.post("/encaminhamentos/inter-modulo", srGuard("manage"), async (req: any, res) => {
  try {
    const body = interModuloSchema.parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.insert(encaminhamentosEventosTable).values({
        escolaId:      req.escolaId,
        origemModulo:  "sala_recursos",
        destinoModulo: body.destinoModulo,
        estudanteId:   body.estudanteId,
        referenciaId:  body.referenciaId,
        referenciaTipo: body.referenciaTipo,
        mensagem:      body.mensagem,
        criadoPorId:   req.usuarioId,
      }).returning()
    );
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao criar encaminhamento inter-módulo." });
  }
});

// ── PORTAL FAMÍLIA ────────────────────────────────────────────────────────────

router.get("/portal/plano", srGuard("self"), async (req: any, res) => {
  try {
    // Busca o ENEE pelo usuarioId do logado
    const [enee] = await withTenant(req.escolaId, async (tx) =>
      await tx.select({ id: srEstudantesEneeTable.id })
        .from(srEstudantesEneeTable)
        .where(and(
          eq(srEstudantesEneeTable.usuarioId, req.usuarioId),
          eq(srEstudantesEneeTable.escolaId, req.escolaId),
          isNull(srEstudantesEneeTable.deletadoEm),
        ))
    );
    if (!enee) return res.json({ plano: null });
    const [plano] = await withTenant(req.escolaId, async (tx) =>
      await tx.select({
        id:          srPlanosAeeTable.id,
        objetivos:   srPlanosAeeTable.objetivos,
        estrategias: srPlanosAeeTable.estrategias,
        avaliacao:   srPlanosAeeTable.avaliacao,
        prazo:       srPlanosAeeTable.prazo,
        status:      srPlanosAeeTable.status,
        ano:         srPlanosAeeTable.ano,
        semestre:    srPlanosAeeTable.semestre,
      })
      .from(srPlanosAeeTable)
      .where(and(
        eq(srPlanosAeeTable.estudanteId, enee.id),
        eq(srPlanosAeeTable.escolaId, req.escolaId),
        eq(srPlanosAeeTable.status, "ativo"),
      ))
      .orderBy(desc(srPlanosAeeTable.criadoEm))
    );
    res.json({ plano: plano ?? null });
  } catch {
    res.status(500).json({ error: "Erro ao buscar plano." });
  }
});

// ── PORTAL PROFESSOR ──────────────────────────────────────────────────────────

router.get("/portal/professor/adequacoes", srGuard("professor"), async (req: any, res) => {
  try {
    // Retorna planos ativos de todos os ENEEs — filtro por turma do professor é feito no front
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select({
        id:           srPlanosAeeTable.id,
        estudanteId:  srPlanosAeeTable.estudanteId,
        objetivos:    srPlanosAeeTable.objetivos,
        estrategias:  srPlanosAeeTable.estrategias,
        avaliacao:    srPlanosAeeTable.avaliacao,
        prazo:        srPlanosAeeTable.prazo,
        status:       srPlanosAeeTable.status,
      })
      .from(srPlanosAeeTable)
      .where(and(
        eq(srPlanosAeeTable.escolaId, req.escolaId),
        eq(srPlanosAeeTable.status, "ativo"),
      ))
    );
    res.json({ adequacoes: rows });
  } catch {
    res.status(500).json({ error: "Erro ao buscar adequações." });
  }
});

export default router;
```

- [ ] **Step 4: Registrar rota em `artifacts/api-server/src/index.ts`**

Adicionar após os imports existentes de rotas:
```typescript
import salaRecursosRouter from "./routes/sala-recursos.js";
```

Adicionar após o registro do router SOE:
```typescript
app.use("/api/sala-recursos", salaRecursosRouter);
```

- [ ] **Step 5: Rodar TypeScript check**

```bash
cd artifacts/api-server && npx tsc --noEmit 2>&1 | head -40
```

Esperado: sem erros.

- [ ] **Step 6: Rodar testes do guard para verificar que passam**

```bash
cd artifacts/api-server && npx vitest run src/tests/sala-recursos.test.ts 2>&1 | tail -20
```

Esperado: 3 testes passando.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/routes/sala-recursos.ts artifacts/api-server/src/index.ts artifacts/api-server/src/tests/sala-recursos.test.ts
git commit -m "feat: API routes sala de recursos + guard srGuard"
```

---

### Task 3: Testes completos da API

**Files:**
- Modify: `artifacts/api-server/src/tests/sala-recursos.test.ts`

**Interfaces:**
- Consome: rotas de `Task 2`
- Produz: cobertura de guard, CRUD ENEEs, planos AEE (restrição professor), ESV, portal família, encaminhamento inter-módulo

- [ ] **Step 1: Expandir o arquivo de testes com todos os casos**

Adicionar ao arquivo existente (após o `describe("srGuard", ...)`) os seguintes blocos:

```typescript
describe("GET /estudantes-enee", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna lista vazia", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([]));
    const res = await request(makeApp()).get("/api/sala-recursos/estudantes-enee");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("estudantes");
  });
});

describe("POST /estudantes-enee", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cria ENEE com campos válidos", async () => {
    const novo = { id: "uuid-enee-1", escolaId: "escola-uuid-1", usuarioId: "user-uuid-2", laudo: "TEA" };
    mockDb.insert.mockReturnValueOnce(makeQuery([novo]));
    const res = await request(makeApp())
      .post("/api/sala-recursos/estudantes-enee")
      .send({ usuarioId: "user-uuid-2", laudo: "TEA" });
    expect(res.status).toBe(201);
    expect(res.body.laudo).toBe("TEA");
  });

  it("rejeita laudo inválido com 400", async () => {
    const res = await request(makeApp())
      .post("/api/sala-recursos/estudantes-enee")
      .send({ usuarioId: "user-uuid-2", laudo: "INVALIDO" });
    expect(res.status).toBe(400);
  });
});

describe("POST /planos-aee", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cria plano com todos os campos obrigatórios", async () => {
    const plano = { id: "plano-1", status: "rascunho" };
    mockDb.insert.mockReturnValueOnce(makeQuery([plano]));
    const res = await request(makeApp())
      .post("/api/sala-recursos/planos-aee")
      .send({
        estudanteId: "uuid-enee-1",
        objetivos:   "Desenvolver autonomia",
        estrategias: "Recursos visuais e manipulativos",
        avaliacao:   "Observação contínua",
        prazo:       "2026-12-01",
        ano:         2026,
        semestre:    1,
      });
    expect(res.status).toBe(201);
  });

  it("rejeita campos faltando com 400", async () => {
    const res = await request(makeApp())
      .post("/api/sala-recursos/planos-aee")
      .send({ estudanteId: "uuid-enee-1" }); // faltam objetivos, estrategias, etc.
    expect(res.status).toBe(400);
  });
});

describe("GET /planos-aee/:id — restrição professor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("professor recebe só campos de adequação, sem observações", async () => {
    vi.mocked(buscarRoles).mockResolvedValueOnce(["sala_recursos:professor"]);
    const plano = {
      id: "plano-1", estudanteId: "enee-1",
      objetivos: "obj", estrategias: "est", avaliacao: "aval", prazo: "2026-12-01",
      status: "ativo", observacoes: "dado sigiloso",
    };
    mockDb.select.mockReturnValueOnce(makeQuery([plano]));
    // segunda chamada para buscarRoles (no handler após buscar plano)
    vi.mocked(buscarRoles).mockResolvedValueOnce(["sala_recursos:professor"]);
    const res = await request(makeApp()).get("/api/sala-recursos/planos-aee/plano-1");
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("observacoes");
    expect(res.body).toHaveProperty("objetivos");
  });

  it("manage recebe o plano completo", async () => {
    vi.mocked(buscarRoles).mockResolvedValue(["sala_recursos:manage"]);
    const plano = {
      id: "plano-1", estudanteId: "enee-1",
      objetivos: "obj", estrategias: "est", avaliacao: "aval", prazo: "2026-12-01",
      status: "ativo", observacoes: "dado sigiloso",
    };
    mockDb.select.mockReturnValueOnce(makeQuery([plano]));
    const res = await request(makeApp()).get("/api/sala-recursos/planos-aee/plano-1");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("observacoes");
  });
});

describe("POST /esv", () => {
  beforeEach(() => vi.clearAllMocks());

  it("vincula ESV com campos válidos", async () => {
    const esv = { id: "esv-1", nome: "João Voluntário" };
    mockDb.insert.mockReturnValueOnce(makeQuery([esv]));
    const res = await request(makeApp())
      .post("/api/sala-recursos/esv")
      .send({ estudanteId: "uuid-enee-1", nome: "João Voluntário", periodoInicio: "2026-03-01" });
    expect(res.status).toBe(201);
    expect(res.body.nome).toBe("João Voluntário");
  });
});

describe("GET /portal/plano — família", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna só campos permitidos (sem narrativa)", async () => {
    vi.mocked(buscarRoles).mockResolvedValueOnce(["sala_recursos:self"]);
    // 1ª select: busca ENEE pelo usuarioId
    mockDb.select.mockReturnValueOnce(makeQuery([{ id: "enee-1" }]));
    // 2ª select: busca plano ativo
    const plano = {
      id: "plano-1", objetivos: "obj", estrategias: "est",
      avaliacao: "aval", prazo: "2026-12-01", status: "ativo", ano: 2026, semestre: 1,
    };
    mockDb.select.mockReturnValueOnce(makeQuery([plano]));
    const res = await request(makeApp()).get("/api/sala-recursos/portal/plano");
    expect(res.status).toBe(200);
    expect(res.body.plano).toHaveProperty("objetivos");
    expect(res.body.plano).not.toHaveProperty("narrativa");
  });

  it("retorna plano null quando ENEE não encontrado", async () => {
    vi.mocked(buscarRoles).mockResolvedValueOnce(["sala_recursos:self"]);
    mockDb.select.mockReturnValueOnce(makeQuery([]));
    const res = await request(makeApp()).get("/api/sala-recursos/portal/plano");
    expect(res.status).toBe(200);
    expect(res.body.plano).toBeNull();
  });
});

describe("POST /encaminhamentos/inter-modulo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cria evento inter-módulo com destino SOE", async () => {
    const evento = { id: "evt-1", origemModulo: "sala_recursos", destinoModulo: "soe", status: "pendente" };
    mockDb.insert.mockReturnValueOnce(makeQuery([evento]));
    const res = await request(makeApp())
      .post("/api/sala-recursos/encaminhamentos/inter-modulo")
      .send({ destinoModulo: "soe", estudanteId: "user-uuid-2", mensagem: "Precisa de acompanhamento SOE" });
    expect(res.status).toBe(201);
    expect(res.body.origemModulo).toBe("sala_recursos");
    expect(res.body.destinoModulo).toBe("soe");
  });

  it("rejeita destino inválido com 400", async () => {
    const res = await request(makeApp())
      .post("/api/sala-recursos/encaminhamentos/inter-modulo")
      .send({ destinoModulo: "invalido", estudanteId: "user-uuid-2", mensagem: "msg" });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar todos os testes**

```bash
cd artifacts/api-server && npx vitest run src/tests/sala-recursos.test.ts 2>&1 | tail -30
```

Esperado: todos passando (mínimo 15 testes).

- [ ] **Step 3: Garantir que os outros testes continuam passando**

```bash
cd artifacts/api-server && npx vitest run 2>&1 | tail -10
```

Esperado: todos os testes do projeto passando.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/tests/sala-recursos.test.ts
git commit -m "test: testes completos API sala de recursos"
```

---

### Task 4: UI — Página de Gestão (`/sala-recursos/gestao`)

**Files:**
- Create: `artifacts/seshat/src/pages/sala-recursos/gestao.tsx`

**Interfaces:**
- Consome: `/api/sala-recursos/estudantes-enee`, `/api/sala-recursos/atendimentos`, `/api/sala-recursos/planos-aee`, `/api/sala-recursos/esv`, `/api/sala-recursos/estudos-caso`, `/api/sala-recursos/encaminhamentos`
- Produz: componente exportado `default` da página

- [ ] **Step 1: Criar `artifacts/seshat/src/pages/sala-recursos/gestao.tsx`**

```typescript
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, Users, BookOpen, Heart, ClipboardList, Plus, Send } from "lucide-react";

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}

const LAUDO_LABEL: Record<string, string> = {
  DI: "Deficiência Intelectual",
  DF: "Deficiência Física",
  DOWN: "Síndrome de Down",
  TEA: "TEA",
  AH_SD: "Altas Habilidades/SD",
};

const LAUDO_COLOR: Record<string, string> = {
  DI:    "bg-blue-100 text-blue-800",
  DF:    "bg-purple-100 text-purple-800",
  DOWN:  "bg-green-100 text-green-800",
  TEA:   "bg-amber-100 text-amber-800",
  AH_SD: "bg-rose-100 text-rose-800",
};

const TIPO_ATENDIMENTO: Record<string, string> = {
  individual:            "Individual",
  orientacao_professor:  "Orient. Professor",
  orientacao_familia:    "Orient. Família",
  esv:                   "ESV",
  estudo_caso:           "Estudo de Caso",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    rascunho:   "secondary",
    ativo:      "default",
    encerrado:  "outline",
    aberto:     "default",
    pendente:   "secondary",
    em_andamento: "outline",
    concluido:  "default",
  };
  return <Badge variant={(map[status] ?? "secondary") as any}>{status.replace(/_/g, " ")}</Badge>;
}

// Modal de novo atendimento
function NovoAtendimentoModal({ estudanteId, onClose, onSave }: {
  estudanteId: string; onClose: () => void; onSave: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    dataAtendimento: new Date().toISOString().substring(0, 10),
    tipo: "individual",
    duracaoMin: "",
    narrativa: "",
  });

  async function salvar() {
    try {
      await apiFetch("/api/sala-recursos/atendimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estudanteId,
          ...form,
          duracaoMin: form.duracaoMin ? Number(form.duracaoMin) : undefined,
        }),
      });
      toast({ title: "Atendimento registrado." });
      onSave();
      onClose();
    } catch {
      toast({ title: "Erro ao salvar atendimento.", variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Novo Atendimento</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data</Label>
              <Input type="date" value={form.dataAtendimento}
                onChange={e => setForm(f => ({ ...f, dataAtendimento: e.target.value }))} />
            </div>
            <div>
              <Label>Duração (min)</Label>
              <Input type="number" placeholder="50" value={form.duracaoMin}
                onChange={e => setForm(f => ({ ...f, duracaoMin: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIPO_ATENDIMENTO).map(([v, l]) =>
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Narrativa</Label>
            <Textarea rows={4} placeholder="Relato da sessão..."
              value={form.narrativa}
              onChange={e => setForm(f => ({ ...f, narrativa: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Modal de encaminhamento inter-módulo
function EncaminharModal({ estudanteId, onClose }: { estudanteId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [destino, setDestino] = useState("soe");
  const [mensagem, setMensagem] = useState("");

  async function enviar() {
    try {
      await apiFetch("/api/sala-recursos/encaminhamentos/inter-modulo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinoModulo: destino, estudanteId, mensagem }),
      });
      toast({ title: "Encaminhamento enviado." });
      onClose();
    } catch {
      toast({ title: "Erro ao encaminhar.", variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="h-4 w-4" /> Encaminhar para outro módulo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Destino</Label>
            <Select value={destino} onValueChange={setDestino}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="soe">SOE — Serviço de Orientação Educacional</SelectItem>
                <SelectItem value="aee">AEE — Coordenação de AEE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mensagem</Label>
            <Textarea rows={3} placeholder="Descreva o motivo do encaminhamento..."
              value={mensagem} onChange={e => setMensagem(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={enviar} disabled={!mensagem.trim()}>Encaminhar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SalaRecursosGestao() {
  const [busca, setBusca] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [novoAtendimento, setNovoAtendimento] = useState(false);
  const [encaminhar, setEncaminhar] = useState(false);
  const qc = useQueryClient();

  const { data: eneesData } = useQuery({
    queryKey: ["sr-enees"],
    queryFn: () => apiFetch("/api/sala-recursos/estudantes-enee"),
  });
  const enees: any[] = eneesData?.estudantes ?? [];
  const filtrados = enees.filter(e =>
    !busca || (e.nome ?? "").toLowerCase().includes(busca.toLowerCase()) || e.laudo?.includes(busca.toUpperCase())
  );
  const selected = enees.find(e => e.id === selectedId) ?? filtrados[0] ?? null;

  const { data: atData, refetch: refetchAt } = useQuery({
    queryKey: ["sr-atendimentos", selected?.id],
    queryFn: () => apiFetch(`/api/sala-recursos/atendimentos?estudanteId=${selected?.id}`),
    enabled: !!selected,
  });
  const { data: planosData } = useQuery({
    queryKey: ["sr-planos", selected?.id],
    queryFn: () => apiFetch(`/api/sala-recursos/planos-aee?estudanteId=${selected?.id}`),
    enabled: !!selected,
  });
  const { data: esvData } = useQuery({
    queryKey: ["sr-esv", selected?.id],
    queryFn: () => apiFetch(`/api/sala-recursos/esv?estudanteId=${selected?.id}`),
    enabled: !!selected,
  });
  const { data: ecData } = useQuery({
    queryKey: ["sr-estudos-caso", selected?.id],
    queryFn: () => apiFetch(`/api/sala-recursos/estudos-caso?estudanteId=${selected?.id}`),
    enabled: !!selected,
  });
  const { data: encData } = useQuery({
    queryKey: ["sr-encaminhamentos", selected?.id],
    queryFn: () => apiFetch(`/api/sala-recursos/encaminhamentos`),
    enabled: !!selected,
  });

  // KPIs
  const kpis = [
    { label: "ENEEs Ativos",       value: enees.filter(e => e.ativo).length,               icon: Users,         color: "text-blue-600" },
    { label: "Atendimentos no Mês", value: "—",                                              icon: BookOpen,       color: "text-green-600" },
    { label: "Planos AEE Ativos",  value: "—",                                              icon: ClipboardList, color: "text-amber-600" },
    { label: "Estudos de Caso",    value: "—",                                              icon: Heart,         color: "text-rose-600" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Topbar */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <GraduationCap className="h-5 w-5" /> AEE — Sala de Recursos
          </h1>
          <p className="text-sm text-muted-foreground">Gestão de ENEEs, planos de AEE e atendimentos</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 p-4 flex-shrink-0">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{k.label}</p>
                <k.icon className={`h-4 w-4 ${k.color}`} />
              </div>
              <p className="text-2xl font-bold mt-1">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Content split */}
      <div className="flex gap-4 px-4 pb-4 flex-1 min-h-0 overflow-hidden">

        {/* Lista ENEEs */}
        <div className="w-60 flex-shrink-0 flex flex-col gap-2">
          <Input placeholder="Buscar ENEE..." value={busca} onChange={e => setBusca(e.target.value)} />
          <div className="flex-1 overflow-y-auto space-y-2">
            {filtrados.map(e => (
              <div key={e.id}
                onClick={() => setSelectedId(e.id)}
                className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                  selected?.id === e.id ? "border-green-500 bg-green-50/50" : "border-border hover:border-primary"
                }`}
              >
                <p className="font-medium text-sm">{e.nome ?? e.usuarioId}</p>
                <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mt-1 ${LAUDO_COLOR[e.laudo] ?? "bg-gray-100 text-gray-800"}`}>
                  {LAUDO_LABEL[e.laudo] ?? e.laudo}
                </span>
              </div>
            ))}
            {filtrados.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhum ENEE encontrado.</p>}
          </div>
        </div>

        {/* Painel detalhe */}
        {selected ? (
          <div className="flex-1 min-w-0 border rounded-lg bg-white flex flex-col overflow-hidden">
            <div className="px-5 pt-4 pb-0 border-b flex-shrink-0">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="font-bold text-base">{selected.nome ?? selected.usuarioId}</h2>
                  <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${LAUDO_COLOR[selected.laudo] ?? ""}`}>
                    {LAUDO_LABEL[selected.laudo] ?? selected.laudo}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEncaminhar(true)}>
                    <Send className="h-3.5 w-3.5 mr-1" /> Encaminhar
                  </Button>
                  <Button size="sm" onClick={() => setNovoAtendimento(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Atendimento
                  </Button>
                </div>
              </div>
              <Tabs defaultValue="atendimentos">
                <TabsList className="mb-0">
                  <TabsTrigger value="atendimentos">Atendimentos</TabsTrigger>
                  <TabsTrigger value="plano">Plano de AEE</TabsTrigger>
                  <TabsTrigger value="esv">ESV</TabsTrigger>
                  <TabsTrigger value="estudo">Estudo de Caso</TabsTrigger>
                  <TabsTrigger value="encaminhamentos">Encaminhamentos</TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto p-5">
                  <TabsContent value="atendimentos" className="mt-0 space-y-3">
                    {(atData?.atendimentos ?? []).length === 0
                      ? <p className="text-sm text-muted-foreground">Nenhum atendimento registrado.</p>
                      : (atData?.atendimentos ?? []).map((a: any) => (
                        <div key={a.id} className="border rounded-lg p-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-xs font-semibold text-muted-foreground uppercase">
                                {TIPO_ATENDIMENTO[a.tipo] ?? a.tipo}
                              </span>
                              <p className="text-xs text-muted-foreground mt-0.5">{a.dataAtendimento}{a.duracaoMin ? ` · ${a.duracaoMin} min` : ""}</p>
                            </div>
                          </div>
                          {a.narrativa && <p className="text-sm mt-2">{a.narrativa}</p>}
                        </div>
                      ))
                    }
                  </TabsContent>

                  <TabsContent value="plano" className="mt-0 space-y-3">
                    {(planosData?.planos ?? []).length === 0
                      ? <p className="text-sm text-muted-foreground">Nenhum plano de AEE.</p>
                      : (planosData?.planos ?? []).map((p: any) => (
                        <div key={p.id} className="border rounded-lg p-4 space-y-3">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <StatusBadge status={p.status} />
                              <span className="text-xs text-muted-foreground">Prazo: {p.prazo}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{p.ano}/{p.semestre}º sem.</span>
                          </div>
                          <div className="grid gap-2 text-sm">
                            <div><p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Objetivos</p><p>{p.objetivos}</p></div>
                            <div><p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Estratégias</p><p>{p.estrategias}</p></div>
                            <div><p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Avaliação</p><p>{p.avaliacao}</p></div>
                            {p.observacoes && <div><p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Observações</p><p>{p.observacoes}</p></div>}
                          </div>
                        </div>
                      ))
                    }
                  </TabsContent>

                  <TabsContent value="esv" className="mt-0 space-y-3">
                    {(esvData?.esv ?? []).length === 0
                      ? <p className="text-sm text-muted-foreground">Nenhum ESV vinculado.</p>
                      : (esvData?.esv ?? []).map((e: any) => (
                        <div key={e.id} className="border rounded-lg p-3">
                          <p className="font-medium text-sm">{e.nome}</p>
                          {e.contato && <p className="text-xs text-muted-foreground mt-0.5">{e.contato}</p>}
                          <p className="text-xs text-muted-foreground mt-1">{e.periodoInicio}{e.periodoFim ? ` → ${e.periodoFim}` : " · em curso"}</p>
                          {e.observacoes && <p className="text-sm mt-2">{e.observacoes}</p>}
                        </div>
                      ))
                    }
                  </TabsContent>

                  <TabsContent value="estudo" className="mt-0 space-y-3">
                    {(ecData?.estudosCaso ?? []).length === 0
                      ? <p className="text-sm text-muted-foreground">Nenhum estudo de caso.</p>
                      : (ecData?.estudosCaso ?? []).map((ec: any) => (
                        <div key={ec.id} className="border rounded-lg p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-muted-foreground">{ec.dataRealizacao}</span>
                            <StatusBadge status={ec.status} />
                          </div>
                          {ec.participantes && <p className="text-xs text-muted-foreground mb-1">Participantes: {ec.participantes}</p>}
                          <p className="text-sm">{ec.sintese}</p>
                          {ec.encaminhamentosResultantes && (
                            <p className="text-xs text-muted-foreground mt-2 border-t pt-2">{ec.encaminhamentosResultantes}</p>
                          )}
                        </div>
                      ))
                    }
                  </TabsContent>

                  <TabsContent value="encaminhamentos" className="mt-0 space-y-3">
                    {(encData?.encaminhamentos ?? []).length === 0
                      ? <p className="text-sm text-muted-foreground">Nenhum encaminhamento.</p>
                      : (encData?.encaminhamentos ?? []).filter((enc: any) => enc.estudanteId === selected?.id).map((enc: any) => (
                        <div key={enc.id} className="border rounded-lg p-3">
                          <div className="flex justify-between items-center mb-1">
                            <StatusBadge status={enc.status} />
                            {enc.prazo && <span className="text-xs text-muted-foreground">Prazo: {enc.prazo}</span>}
                          </div>
                          <p className="text-sm">{enc.descricao}</p>
                          {enc.resposta && <p className="text-xs text-muted-foreground mt-2 border-t pt-2">Resposta: {enc.resposta}</p>}
                        </div>
                      ))
                    }
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Selecione um ENEE para ver os detalhes.
          </div>
        )}
      </div>

      {novoAtendimento && selected && (
        <NovoAtendimentoModal
          estudanteId={selected.id}
          onClose={() => setNovoAtendimento(false)}
          onSave={() => refetchAt()}
        />
      )}
      {encaminhar && selected && (
        <EncaminharModal estudanteId={selected.id} onClose={() => setEncaminhar(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd artifacts/seshat && npx tsc --noEmit 2>&1 | head -30
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add artifacts/seshat/src/pages/sala-recursos/gestao.tsx
git commit -m "feat: UI página /sala-recursos/gestao"
```

---

### Task 5: UI — Páginas de Professores e Análise

**Files:**
- Create: `artifacts/seshat/src/pages/sala-recursos/professores.tsx`
- Create: `artifacts/seshat/src/pages/sala-recursos/analise.tsx`

**Interfaces:**
- Consome: `/api/sala-recursos/portal/professor/adequacoes`, `/api/sala-recursos/estudantes-enee`, `/api/sala-recursos/planos-aee`
- Produz: dois componentes `default`

- [ ] **Step 1: Criar `artifacts/seshat/src/pages/sala-recursos/professores.tsx`**

```typescript
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";

async function apiFetch(url: string) {
  const r = await fetch(url, { credentials: "include" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}

const LAUDO_LABEL: Record<string, string> = {
  DI: "DI", DF: "DF", DOWN: "Down", TEA: "TEA", AH_SD: "AH/SD",
};

export default function SalaRecursosProfessores() {
  const [busca, setBusca] = useState("");

  const { data } = useQuery({
    queryKey: ["sr-adequacoes-professor"],
    queryFn: () => apiFetch("/api/sala-recursos/portal/professor/adequacoes"),
  });
  const { data: eneesData } = useQuery({
    queryKey: ["sr-enees-professor"],
    queryFn: () => apiFetch("/api/sala-recursos/estudantes-enee"),
  });

  const adequacoes: any[] = data?.adequacoes ?? [];
  const enees: any[] = eneesData?.estudantes ?? [];

  // Juntar adequações com dados do ENEE
  const itens = adequacoes
    .map(a => ({ ...a, enee: enees.find(e => e.id === a.estudanteId) }))
    .filter(a => !busca || (a.enee?.nome ?? "").toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b px-6 py-4 flex-shrink-0">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <BookOpen className="h-5 w-5" /> Adequações Curriculares — ENEEs
        </h1>
        <p className="text-sm text-muted-foreground">Visualização das adequações dos seus estudantes com necessidades especiais</p>
      </div>

      <div className="p-4 flex-shrink-0">
        <Input placeholder="Buscar por nome do estudante..." value={busca} onChange={e => setBusca(e.target.value)} className="max-w-sm" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {itens.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">Nenhum ENEE com plano ativo nas suas turmas.</p>
        )}
        {itens.map(item => (
          <div key={item.id} className="border rounded-lg bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{item.enee?.nome ?? item.estudanteId}</p>
                <Badge variant="outline" className="text-xs mt-1">{LAUDO_LABEL[item.enee?.laudo] ?? item.enee?.laudo}</Badge>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>Prazo: {item.prazo}</p>
                <p>{item.ano}/{item.semestre}º sem.</p>
              </div>
            </div>
            <div className="grid gap-2 text-sm border-t pt-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Objetivos</p>
                <p>{item.objetivos}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Estratégias</p>
                <p>{item.estrategias}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Avaliação</p>
                <p>{item.avaliacao}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground border-t pt-2">
              Dados compartilhados pela Sala de Recursos — somente leitura.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar `artifacts/seshat/src/pages/sala-recursos/analise.tsx`**

```typescript
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart2 } from "lucide-react";

async function apiFetch(url: string) {
  const r = await fetch(url, { credentials: "include" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}

const LAUDO_LABEL: Record<string, string> = {
  DI: "Deficiência Intelectual", DF: "Deficiência Física",
  DOWN: "Síndrome de Down", TEA: "TEA", AH_SD: "Altas Habilidades/SD",
};

export default function SalaRecursosAnalise() {
  const [filtroLaudo, setFiltroLaudo] = useState("todos");
  const [busca, setBusca] = useState("");

  const { data: eneesData } = useQuery({
    queryKey: ["sr-analise-enees"],
    queryFn: () => apiFetch("/api/sala-recursos/estudantes-enee"),
  });
  const { data: planosData } = useQuery({
    queryKey: ["sr-analise-planos"],
    queryFn: () => apiFetch("/api/sala-recursos/planos-aee"),
  });
  const { data: eventosData } = useQuery({
    queryKey: ["sr-analise-eventos"],
    queryFn: () => apiFetch("/api/sala-recursos/encaminhamentos"),
  });

  const enees: any[] = eneesData?.estudantes ?? [];
  const planos: any[] = planosData?.planos ?? [];

  const eneesAtivos = enees.filter(e => e.ativo);
  const planosPorLaudo = enees.reduce((acc: Record<string, number>, e) => {
    acc[e.laudo] = (acc[e.laudo] ?? 0) + 1;
    return acc;
  }, {});

  const kpis = [
    { label: "ENEEs Ativos",      value: eneesAtivos.length },
    { label: "Planos Ativos",     value: planos.filter(p => p.status === "ativo").length },
    { label: "Planos Rascunho",   value: planos.filter(p => p.status === "rascunho").length },
    { label: "Planos Encerrados", value: planos.filter(p => p.status === "encerrado").length },
  ];

  const filtrados = enees
    .filter(e => filtroLaudo === "todos" || e.laudo === filtroLaudo)
    .filter(e => !busca || (e.nome ?? "").toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b px-6 py-4 flex-shrink-0">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <BarChart2 className="h-5 w-5" /> Análise — Sala de Recursos
        </h1>
        <p className="text-sm text-muted-foreground">Visão gerencial de ENEEs, planos e encaminhamentos</p>
      </div>

      <div className="grid grid-cols-4 gap-4 p-4 flex-shrink-0">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{k.label}</p>
              <p className="text-2xl font-bold mt-1">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="px-4 pb-3 flex gap-3 flex-shrink-0">
        <Input placeholder="Buscar estudante..." value={busca} onChange={e => setBusca(e.target.value)} className="max-w-xs" />
        <Select value={filtroLaudo} onValueChange={setFiltroLaudo}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Filtrar por laudo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os laudos</SelectItem>
            {Object.entries(LAUDO_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="border rounded-lg bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="text-left px-4 py-3">Estudante</th>
                <th className="text-left px-4 py-3">Laudo</th>
                <th className="text-left px-4 py-3">Plano Ativo</th>
                <th className="text-left px-4 py-3">Prazo</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtrados.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum resultado.</td></tr>
              )}
              {filtrados.map(e => {
                const plano = planos.find(p => p.estudanteId === e.id && p.status === "ativo");
                return (
                  <tr key={e.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{e.nome ?? e.usuarioId}</td>
                    <td className="px-4 py-3"><Badge variant="outline">{e.laudo}</Badge></td>
                    <td className="px-4 py-3">{plano ? "Sim" : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3">{plano?.prazo ?? "—"}</td>
                    <td className="px-4 py-3">
                      {e.ativo ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd artifacts/seshat && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add artifacts/seshat/src/pages/sala-recursos/professores.tsx artifacts/seshat/src/pages/sala-recursos/analise.tsx
git commit -m "feat: UI páginas professores e análise — sala de recursos"
```

---

### Task 6: Wiring — App.tsx, layout.tsx, portal/index.tsx

**Files:**
- Modify: `artifacts/seshat/src/App.tsx`
- Modify: `artifacts/seshat/src/components/layout.tsx`
- Modify: `artifacts/seshat/src/pages/portal/index.tsx`

**Interfaces:**
- Consome: os três componentes das Tasks 4 e 5 + `/api/sala-recursos/portal/plano`
- Produz: rotas e menu funcionando

- [ ] **Step 1: Adicionar rotas em `App.tsx`**

Ler o arquivo para localizar onde estão as rotas do SOE (ex: `<Route path="/soe/gestao" ...>`), depois adicionar após elas:

```typescript
import SalaRecursosGestao from "./pages/sala-recursos/gestao";
import SalaRecursosProfessores from "./pages/sala-recursos/professores";
import SalaRecursosAnalise from "./pages/sala-recursos/analise";
```

E no bloco de rotas:
```tsx
<Route path="/sala-recursos/gestao" element={<SalaRecursosGestao />} />
<Route path="/sala-recursos/professores" element={<SalaRecursosProfessores />} />
<Route path="/sala-recursos/analise" element={<SalaRecursosAnalise />} />
```

- [ ] **Step 2: Adicionar menu em `layout.tsx`**

Ler o arquivo para localizar o grupo SOE. Após ele, adicionar o grupo Sala de Recursos:

Adicionar ao import de lucide-react: `GraduationCap`

```tsx
{(canManageSR || canViewSR) && (
  <SidebarGroup>
    <SidebarGroupLabel>AEE — Sala de Recursos</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        {(canManageSR || canViewSR) && (
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={location.pathname === "/sala-recursos/gestao"}>
              <Link to="/sala-recursos/gestao"><GraduationCap className="h-4 w-4" /><span>Gestão</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
        {canViewSR && (
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={location.pathname === "/sala-recursos/analise"}>
              <Link to="/sala-recursos/analise"><BarChart2 className="h-4 w-4" /><span>Análise</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
)}
{canProfessorSR && (
  /* Adicionar no grupo de Docência existente: */
  <SidebarMenuItem>
    <SidebarMenuButton asChild isActive={location.pathname === "/sala-recursos/professores"}>
      <Link to="/sala-recursos/professores"><BookOpen className="h-4 w-4" /><span>Adequações AEE</span></Link>
    </SidebarMenuButton>
  </SidebarMenuItem>
)}
```

As permissões derivadas no layout:
```typescript
const canManageSR  = hasAny("sala_recursos:manage");
const canViewSR    = hasAny("sala_recursos:manage", "sala_recursos:view");
const canProfessorSR = hasAny("sala_recursos:professor");
```

**ATENÇÃO:** Ler o arquivo `layout.tsx` para ver o padrão exato de `hasAny` e como as permissões são declaradas antes de editar. Seguir o padrão existente.

- [ ] **Step 3: Adicionar aba no portal do responsável (`portal/index.tsx`)**

Ler o arquivo para localizar onde estão as outras abas (ex: SOE). Adicionar:

Tipos customizados:
```typescript
type SrPlanoPortal = {
  id: string;
  objetivos: string;
  estrategias: string;
  avaliacao: string;
  prazo: string;
  status: string;
  ano: number;
  semestre: number;
};
```

Query:
```typescript
const { data: srPlanoData } = useQuery<{ plano: SrPlanoPortal | null }>({
  queryKey: ["sr-portal-plano"],
  queryFn: () => apiFetch("/api/sala-recursos/portal/plano"),
});
const srPlano = srPlanoData?.plano ?? null;
```

Nova aba:
```tsx
<TabsTrigger value="plano-aee">Plano de AEE</TabsTrigger>
```

Conteúdo da aba:
```tsx
<TabsContent value="plano-aee">
  {!srPlano ? (
    <div className="text-center py-12 text-muted-foreground text-sm">
      <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-40" />
      <p>Nenhum Plano de AEE ativo no momento.</p>
    </div>
  ) : (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        Plano elaborado pela Sala de Recursos Generalista · {srPlano.ano}/{srPlano.semestre}º semestre
      </div>
      <div className="grid gap-4">
        <div className="border rounded-lg p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Objetivos</p>
          <p className="text-sm">{srPlano.objetivos}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Estratégias</p>
          <p className="text-sm">{srPlano.estrategias}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Avaliação</p>
          <p className="text-sm">{srPlano.avaliacao}</p>
        </div>
        <div className="border rounded-lg p-3 bg-muted/40">
          <p className="text-xs text-muted-foreground">Prazo: {srPlano.prazo}</p>
        </div>
      </div>
    </div>
  )}
</TabsContent>
```

Adicionar `GraduationCap` ao import de lucide-react no arquivo.

- [ ] **Step 4: Verificar TypeScript**

```bash
cd artifacts/seshat && npx tsc --noEmit 2>&1 | head -30
```

Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add artifacts/seshat/src/App.tsx artifacts/seshat/src/components/layout.tsx artifacts/seshat/src/pages/portal/index.tsx
git commit -m "feat: rotas, menu e aba portal responsável — sala de recursos"
```

---

### Task 7: Documentação e Skill

**Files:**
- Create: `.specs/features/sala-recursos.md`
- Create: `.claude/skills/seshat-sala-recursos/SKILL.md`

**Interfaces:**
- Produz: referência técnica para sessões futuras

- [ ] **Step 1: Criar `.specs/features/sala-recursos.md`**

Copiar o conteúdo de `docs/superpowers/specs/2026-09-17-sala-recursos-design.md` verbatim para `.specs/features/sala-recursos.md`.

```bash
cp docs/superpowers/specs/2026-09-17-sala-recursos-design.md .specs/features/sala-recursos.md
```

- [ ] **Step 2: Criar `.claude/skills/seshat-sala-recursos/SKILL.md`**

Criar o arquivo com o conteúdo abaixo (skill de referência técnica para o módulo):

```markdown
# Skill: AEE — Sala de Recursos Generalista

## Visão Geral

Módulo de gestão da Sala de Recursos Generalista do AEE. Atende ENEEs (Estudantes com Necessidades Educacionais Especiais com laudo: DI, DF, DOWN, TEA, AH/SD).

**Independente** do módulo AEE já implementado e do SOE.

## Permissões (RBAC)

| Permissão | Quem | Acesso |
|---|---|---|
| `sala_recursos:manage` | Professor da Sala de Recursos | CRUD completo |
| `sala_recursos:view` | Coordenação/Gestão | Leitura total + relatórios |
| `sala_recursos:professor` | Professor regente | Só adequações curriculares do seu ENEE |
| `sala_recursos:self` | Família | Plano de AEE ativo do filho |

Guard: `srGuard(nivel)` — hierarquia `manage > view > professor > self`. Usa `buscarRoles(req.usuarioId)` (nunca JWT).

## Schema (tabelas)

| Tabela | Propósito |
|---|---|
| `sr_estudantes_enee` | Registro de ENEEs vinculados a usuarios |
| `sr_atendimentos` | Sessões na sala (individual, orientação, ESV, estudo de caso) |
| `sr_planos_aee` | Plano estruturado (objetivos, estratégias, avaliação, prazo) + narrativa |
| `sr_esv` | Educador Social Voluntário vinculado ao ENEE |
| `sr_estudos_caso` | Estudo de caso multidisciplinar |
| `sr_encaminhamentos` | Encaminhamentos internos da Sala de Recursos |
| `encaminhamentos_eventos` | **Compartilhada** — roteamento inter-módulo (SOE/AEE/SR) |

## API Endpoints

Prefixo `/api/sala-recursos`. Ver spec completa em `.specs/features/sala-recursos.md`.

Destaques:
- `GET /estudantes-enee` — lista ENEEs (view)
- `POST /atendimentos` — registra sessão (manage)
- `GET /planos-aee/:id` — professor recebe só campos de adequação (sem observações)
- `POST /encaminhamentos/inter-modulo` — cria evento em `encaminhamentos_eventos`
- `GET /portal/plano` — família: plano ativo do filho (self)
- `GET /portal/professor/adequacoes` — adequações para professor regente (professor)

## Encaminhamento Inter-Módulo

Tabela `encaminhamentos_eventos` criada neste módulo. SOE e AEE a consumirão na revisão futura.

```typescript
// Para encaminhar de SR para SOE:
POST /api/sala-recursos/encaminhamentos/inter-modulo
{ destinoModulo: "soe", estudanteId, referenciaId?, referenciaTipo?, mensagem }
// Insere em encaminhamentos_eventos com origemModulo: "sala_recursos", status: "pendente"
```

## Padrões obrigatórios

- Multi-tenant: `withTenant(escolaId, async (tx) => await tx.select()...)`
- O `async` e `await` na chain são obrigatórios (TypeScript inference)
- `buscarRoles(req.usuarioId)` de `../lib/permissions.js` — nunca JWT
- Sem criptografia neste módulo (diferente do SOE)

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/sala-recursos.ts` | Schema Drizzle (7 tabelas) |
| `scripts/migrate-sala-recursos.sql` | DDL + seeds de permissões |
| `artifacts/api-server/src/routes/sala-recursos.ts` | Rotas + srGuard |
| `artifacts/api-server/src/tests/sala-recursos.test.ts` | Testes Vitest |
| `artifacts/seshat/src/pages/sala-recursos/gestao.tsx` | Página principal |
| `artifacts/seshat/src/pages/sala-recursos/professores.tsx` | Visão professor regente |
| `artifacts/seshat/src/pages/sala-recursos/analise.tsx` | Relatórios gerenciais |
| `.specs/features/sala-recursos.md` | Spec completa |
```

- [ ] **Step 3: Commit final**

```bash
git add .specs/features/sala-recursos.md .claude/skills/seshat-sala-recursos/SKILL.md
git commit -m "docs: spec e skill AEE Sala de Recursos"
```

- [ ] **Step 4: Push**

```bash
git push -u origin claude/wonderful-feynman-Klc3C
```
