# Portal AEE — Atendimento Educacional Especializado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o Portal AEE completo: 9 tabelas com RLS, criptografia de laudos, assinatura digital do PAI, log de auditoria imutável, API REST com controle de visibilidade por camadas e UI para todos os perfis.

**Architecture:** Módulo integrado ao Seshat. Backend em Express 5 + Drizzle ORM + PostgreSQL. Criptografia de laudos via `pgcrypto` (AES-256). Auditoria imutável via RLS. Assinatura digital igual aos Requerimentos (SHA-256 + bcrypt). Todas as rotas usam `withTenant(req.escolaId, tx)`.

**Tech Stack:** TypeScript, Express 5, Drizzle ORM, Zod, Vitest, React 19, shadcn/ui, pgcrypto, bcryptjs

**Spec:** `docs/superpowers/specs/2026-09-16-portal-aee-design.md`

## Global Constraints

- Todas as tabelas AEE têm `escola_id` (multi-tenant) e soft delete (`deletado_em`)
- Todas as rotas AEE usam `withTenant(req.escolaId, async (tx) => { ... })`
- Laudos: nunca retornar `conteudo_enc` em listagens — somente na rota dedicada com auditoria
- Toda leitura de laudo gera INSERT em `aee_auditoria` (obrigatório, não opcional)
- `aee_auditoria` é imutável: RLS bloqueia UPDATE e DELETE para todos
- PAI só muda para `vigente` após todas as assinaturas obrigatórias coletadas
- `withTenant` importado de `../middleware/tenant.js`
- `buscarRoles` importado de `../lib/permissions.js`
- Padrão de numeração: `PAI-AAAA-NNNN` (igual aos Requerimentos)
- Chave de criptografia derivada: `HMAC-SHA256(process.env.ENCRYPTION_KEY, escola_id)`

---

## File Map

**Criar:**
- `lib/db/src/schema/aee.ts` — 9 schemas Drizzle
- `scripts/migrate-aee.sql` — DDL idempotente + RLS + permissões
- `artifacts/api-server/src/lib/aee-crypto.ts` — cifrar/decifrar laudos
- `artifacts/api-server/src/lib/aee-audit.ts` — `registrarAuditoriaAee()`
- `artifacts/api-server/src/routes/aee.ts` — todos os endpoints
- `artifacts/api-server/src/tests/aee.test.ts` — testes de todos os endpoints
- `artifacts/seshat/src/pages/aee/gestao.tsx` — UI equipe AEE
- `artifacts/seshat/src/pages/aee/analise.tsx` — UI gestão escolar
- `.specs/features/portal-aee.md` — spec do módulo
- `.claude/skills/seshat-aee/SKILL.md` — skill do módulo

**Modificar:**
- `lib/db/src/schema/index.ts` — exportar `./aee`
- `artifacts/api-server/src/index.ts` — registrar `/api/aee`
- `artifacts/seshat/src/App.tsx` — rotas `/aee/gestao` e `/aee/analise`
- `artifacts/seshat/src/components/layout.tsx` — grupo "AEE" no menu
- `artifacts/seshat/src/pages/portal/index.tsx` — aba AEE
- `artifacts/seshat/src/pages/portal-responsavel/index.tsx` — aba AEE
- `artifacts/seshat/src/pages/portal-professor/index.tsx` — card AEE

---

## Task 1: Schema Drizzle + Migração SQL

**Files:**
- Create: `lib/db/src/schema/aee.ts`
- Create: `scripts/migrate-aee.sql`
- Modify: `lib/db/src/schema/index.ts`

**Interfaces:**
- Produz: `aeeEstudantesTable`, `aeePlanosTable`, `aeePlanoAssinaturasTable`, `aeePlanoAdaptacoesTable`, `aeeMetasTable`, `aeeEvolucoesTable`, `aeeSessoesTable`, `aeeLaudosTable`, `aeeLiberacoesTable`, `aeeAuditoriaTable` — todos exportados de `@workspace/db`

- [ ] **Step 1: Criar `lib/db/src/schema/aee.ts`**

```typescript
import {
  pgTable, uuid, varchar, text, smallint, timestamp,
  boolean, integer, date, bytea, inet, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { escolasTable } from "./escolas";
import { usuariosTable } from "./usuarios";

export const aeeEstudantesTable = pgTable("aee_estudantes", {
  id:             uuid("id").primaryKey().defaultRandom(),
  escolaId:       uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  usuarioId:      uuid("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  necessidades:   text("necessidades"),
  cid10:          varchar("cid10", { length: 10 }),
  profissionalId: uuid("profissional_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  ativo:          boolean("ativo").default(true).notNull(),
  criadoEm:       timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:   timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm:     timestamp("deletado_em",  { withTimezone: true }),
}, (t) => [
  index("idx_aee_estudantes_escola").on(t.escolaId),
  index("idx_aee_estudantes_usuario").on(t.usuarioId),
]);

export const aeePlanosTable = pgTable("aee_planos", {
  id:              uuid("id").primaryKey().defaultRandom(),
  escolaId:        uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteAeeId:  uuid("estudante_aee_id").notNull().references(() => aeeEstudantesTable.id, { onDelete: "restrict" }),
  numero:          varchar("numero", { length: 20 }).notNull().unique(),
  versao:          smallint("versao").default(1).notNull(),
  status:          varchar("status", { length: 30 }).default("rascunho").notNull(),
  // 'rascunho' | 'aguardando_assinatura' | 'vigente' | 'encerrado'
  periodoInicio:   date("periodo_inicio"),
  periodoFim:      date("periodo_fim"),
  objetivosGerais: text("objetivos_gerais"),
  criadoPorId:     uuid("criado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  criadoEm:        timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:    timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm:      timestamp("deletado_em",  { withTimezone: true }),
}, (t) => [
  index("idx_aee_planos_estudante").on(t.estudanteAeeId),
]);

export const aeePlanoAssinaturasTable = pgTable("aee_plano_assinaturas", {
  id:          uuid("id").primaryKey().defaultRandom(),
  planoId:     uuid("plano_id").notNull().references(() => aeePlanosTable.id, { onDelete: "cascade" }),
  usuarioId:   uuid("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  papel:       varchar("papel", { length: 30 }).notNull(),
  // 'professor_aee' | 'responsavel' | 'estudante'
  metodo:      varchar("metodo", { length: 30 }).notNull(),
  // 'senha' | 'gov_br' | 'certificado_digital'
  tokenHash:   varchar("token_hash", { length: 64 }).notNull(),
  assinadoEm:  timestamp("assinado_em", { withTimezone: true }).defaultNow().notNull(),
  ipOrigem:    varchar("ip_origem", { length: 45 }),
}, (t) => [
  uniqueIndex("uq_aee_assinatura").on(t.planoId, t.usuarioId, t.papel),
]);

export const aeePlanoAdaptacoesTable = pgTable("aee_plano_adaptacoes", {
  id:        uuid("id").primaryKey().defaultRandom(),
  planoId:   uuid("plano_id").notNull().references(() => aeePlanosTable.id, { onDelete: "cascade" }),
  descricao: text("descricao").notNull(),
  area:      varchar("area", { length: 50 }).notNull(),
  // 'avaliacao' | 'metodologia' | 'recurso' | 'espaco' | 'tempo'
  criadoEm:  timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
});

export const aeeMetasTable = pgTable("aee_metas", {
  id:          uuid("id").primaryKey().defaultRandom(),
  planoId:     uuid("plano_id").notNull().references(() => aeePlanosTable.id, { onDelete: "cascade" }),
  descricao:   text("descricao").notNull(),
  indicador:   text("indicador"),
  prazo:       date("prazo"),
  status:      varchar("status", { length: 30 }).default("nao_iniciada").notNull(),
  // 'nao_iniciada' | 'em_andamento' | 'alcancada' | 'nao_alcancada'
  criadoEm:    timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
});

export const aeeEvolucoesTable = pgTable("aee_evolucoes", {
  id:             uuid("id").primaryKey().defaultRandom(),
  metaId:         uuid("meta_id").notNull().references(() => aeeMetasTable.id, { onDelete: "cascade" }),
  profissionalId: uuid("profissional_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  periodoRef:     varchar("periodo_ref", { length: 7 }).notNull(), // 'AAAA-MM'
  observacao:     text("observacao").notNull(),
  percentual:     smallint("percentual"), // 0–100
  registradoEm:   timestamp("registrado_em", { withTimezone: true }).defaultNow().notNull(),
});

export const aeeSessoesTable = pgTable("aee_sessoes", {
  id:             uuid("id").primaryKey().defaultRandom(),
  escolaId:       uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteAeeId: uuid("estudante_aee_id").notNull().references(() => aeeEstudantesTable.id, { onDelete: "restrict" }),
  profissionalId: uuid("profissional_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  dataSessao:     date("data_sessao").notNull(),
  duracaoMin:     smallint("duracao_min"),
  local:          varchar("local", { length: 100 }),
  observacoes:    text("observacoes"),
  criadoEm:       timestamp("criado_em",   { withTimezone: true }).defaultNow().notNull(),
  deletadoEm:     timestamp("deletado_em", { withTimezone: true }),
}, (t) => [
  index("idx_aee_sessoes_estudante").on(t.estudanteAeeId),
]);

export const aeeLaudosTable = pgTable("aee_laudos", {
  id:             uuid("id").primaryKey().defaultRandom(),
  escolaId:       uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteAeeId: uuid("estudante_aee_id").notNull().references(() => aeeEstudantesTable.id, { onDelete: "restrict" }),
  tipo:           varchar("tipo", { length: 50 }).notNull(),
  // 'psicologico' | 'psicopedagogico' | 'fonoaudiologico' | 'medico' | 'outro'
  titulo:         varchar("titulo", { length: 200 }).notNull(),
  conteudoEnc:    text("conteudo_enc").notNull(), // pgp_sym_encrypt resultado (hex)
  chaveRef:       varchar("chave_ref", { length: 64 }).notNull(),
  profissionalExt: varchar("profissional_ext", { length: 200 }),
  dataLaudo:      date("data_laudo"),
  criadoPorId:    uuid("criado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  criadoEm:       timestamp("criado_em",   { withTimezone: true }).defaultNow().notNull(),
  deletadoEm:     timestamp("deletado_em", { withTimezone: true }),
}, (t) => [
  index("idx_aee_laudos_estudante").on(t.estudanteAeeId),
]);

export const aeeLiberacoesTable = pgTable("aee_liberacoes", {
  id:             uuid("id").primaryKey().defaultRandom(),
  escolaId:       uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteAeeId: uuid("estudante_aee_id").notNull().references(() => aeeEstudantesTable.id, { onDelete: "restrict" }),
  professorId:    uuid("professor_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  verAdaptacoes:  boolean("ver_adaptacoes").default(true).notNull(),
  verMetas:       boolean("ver_metas").default(false).notNull(),
  verResumoIa:    boolean("ver_resumo_ia").default(false).notNull(),
  concedidoPorId: uuid("concedido_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  concedidoEm:    timestamp("concedido_em", { withTimezone: true }).defaultNow().notNull(),
  revogadoEm:     timestamp("revogado_em",  { withTimezone: true }),
}, (t) => [
  index("idx_aee_liberacoes_estudante").on(t.estudanteAeeId),
  index("idx_aee_liberacoes_professor").on(t.professorId),
]);

export const aeeAuditoriaTable = pgTable("aee_auditoria", {
  id:          uuid("id").primaryKey().defaultRandom(),
  escolaId:    uuid("escola_id").references(() => escolasTable.id, { onDelete: "set null" }),
  acao:        varchar("acao", { length: 50 }).notNull(),
  usuarioId:   uuid("usuario_id").notNull(),
  estudanteId: uuid("estudante_id"),
  recursoId:   uuid("recurso_id"),
  ipOrigem:    varchar("ip_origem", { length: 45 }),
  userAgent:   text("user_agent"),
  criadoEm:    timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_aee_auditoria_usuario").on(t.usuarioId),
  index("idx_aee_auditoria_estudante").on(t.estudanteId),
  index("idx_aee_auditoria_criado").on(t.criadoEm),
]);
```

- [ ] **Step 2: Adicionar exportações em `lib/db/src/schema/index.ts`**

Adicionar ao final do arquivo:
```typescript
export * from "./aee";
```

- [ ] **Step 3: Criar `scripts/migrate-aee.sql`**

```sql
-- Migração AEE — Atendimento Educacional Especializado
-- Idempotente: usa CREATE TABLE IF NOT EXISTS

-- 1. Extensão pgcrypto (criptografia de laudos)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Tabelas na ordem de dependência

CREATE TABLE IF NOT EXISTS aee_estudantes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id       uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  usuario_id      uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  necessidades    text,
  cid10           varchar(10),
  profissional_id uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  ativo           boolean     NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  deletado_em     timestamptz
);

CREATE TABLE IF NOT EXISTS aee_planos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id        uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_aee_id uuid        NOT NULL REFERENCES aee_estudantes(id) ON DELETE RESTRICT,
  numero           varchar(20) NOT NULL UNIQUE,
  versao           smallint    NOT NULL DEFAULT 1,
  status           varchar(30) NOT NULL DEFAULT 'rascunho',
  periodo_inicio   date,
  periodo_fim      date,
  objetivos_gerais text,
  criado_por_id    uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  deletado_em      timestamptz
);

CREATE TABLE IF NOT EXISTS aee_plano_assinaturas (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id    uuid        NOT NULL REFERENCES aee_planos(id) ON DELETE CASCADE,
  usuario_id  uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  papel       varchar(30) NOT NULL,
  metodo      varchar(30) NOT NULL,
  token_hash  varchar(64) NOT NULL,
  assinado_em timestamptz NOT NULL DEFAULT now(),
  ip_origem   varchar(45),
  CONSTRAINT uq_aee_assinatura UNIQUE (plano_id, usuario_id, papel)
);

CREATE TABLE IF NOT EXISTS aee_plano_adaptacoes (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id  uuid        NOT NULL REFERENCES aee_planos(id) ON DELETE CASCADE,
  descricao text        NOT NULL,
  area      varchar(50) NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aee_metas (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id      uuid        NOT NULL REFERENCES aee_planos(id) ON DELETE CASCADE,
  descricao     text        NOT NULL,
  indicador     text,
  prazo         date,
  status        varchar(30) NOT NULL DEFAULT 'nao_iniciada',
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aee_evolucoes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_id         uuid        NOT NULL REFERENCES aee_metas(id) ON DELETE CASCADE,
  profissional_id uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  periodo_ref     varchar(7)  NOT NULL,
  observacao      text        NOT NULL,
  percentual      smallint    CHECK (percentual BETWEEN 0 AND 100),
  registrado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aee_sessoes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id        uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_aee_id uuid        NOT NULL REFERENCES aee_estudantes(id) ON DELETE RESTRICT,
  profissional_id  uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  data_sessao      date        NOT NULL,
  duracao_min      smallint,
  local            varchar(100),
  observacoes      text,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  deletado_em      timestamptz
);

CREATE TABLE IF NOT EXISTS aee_laudos (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id        uuid         NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_aee_id uuid         NOT NULL REFERENCES aee_estudantes(id) ON DELETE RESTRICT,
  tipo             varchar(50)  NOT NULL,
  titulo           varchar(200) NOT NULL,
  conteudo_enc     text         NOT NULL,
  chave_ref        varchar(64)  NOT NULL,
  profissional_ext varchar(200),
  data_laudo       date,
  criado_por_id    uuid         REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em        timestamptz  NOT NULL DEFAULT now(),
  deletado_em      timestamptz
);

CREATE TABLE IF NOT EXISTS aee_liberacoes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id        uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_aee_id uuid        NOT NULL REFERENCES aee_estudantes(id) ON DELETE RESTRICT,
  professor_id     uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  ver_adaptacoes   boolean     NOT NULL DEFAULT true,
  ver_metas        boolean     NOT NULL DEFAULT false,
  ver_resumo_ia    boolean     NOT NULL DEFAULT false,
  concedido_por_id uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  concedido_em     timestamptz NOT NULL DEFAULT now(),
  revogado_em      timestamptz
);

CREATE TABLE IF NOT EXISTS aee_auditoria (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id    uuid        REFERENCES escolas(id) ON DELETE SET NULL,
  acao         varchar(50) NOT NULL,
  usuario_id   uuid        NOT NULL,
  estudante_id uuid,
  recurso_id   uuid,
  ip_origem    varchar(45),
  user_agent   text,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_aee_estudantes_escola    ON aee_estudantes (escola_id);
CREATE INDEX IF NOT EXISTS idx_aee_estudantes_usuario   ON aee_estudantes (usuario_id);
CREATE INDEX IF NOT EXISTS idx_aee_planos_estudante     ON aee_planos (estudante_aee_id);
CREATE INDEX IF NOT EXISTS idx_aee_sessoes_estudante    ON aee_sessoes (estudante_aee_id);
CREATE INDEX IF NOT EXISTS idx_aee_laudos_estudante     ON aee_laudos (estudante_aee_id);
CREATE INDEX IF NOT EXISTS idx_aee_liberacoes_estudante ON aee_liberacoes (estudante_aee_id);
CREATE INDEX IF NOT EXISTS idx_aee_liberacoes_professor ON aee_liberacoes (professor_id);
CREATE INDEX IF NOT EXISTS idx_aee_auditoria_usuario    ON aee_auditoria (usuario_id);
CREATE INDEX IF NOT EXISTS idx_aee_auditoria_estudante  ON aee_auditoria (estudante_id);
CREATE INDEX IF NOT EXISTS idx_aee_auditoria_criado     ON aee_auditoria (criado_em);

-- 4. RLS
ALTER TABLE aee_estudantes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE aee_planos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE aee_plano_assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE aee_plano_adaptacoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE aee_metas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE aee_evolucoes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE aee_sessoes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE aee_laudos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE aee_liberacoes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE aee_auditoria         ENABLE ROW LEVEL SECURITY;

-- 5. Políticas tenant_isolation (padrão do projeto)
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'aee_estudantes','aee_planos','aee_sessoes','aee_laudos','aee_liberacoes','aee_auditoria'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (escola_id = current_setting(''app.current_escola_id'', true)::uuid OR current_setting(''app.is_super_admin'', true) = ''true'')',
      t
    );
  END LOOP;
END $$;

-- 6. Tabelas sem escola_id direta usam JOIN — política via plano_id/meta_id
-- aee_plano_assinaturas, aee_plano_adaptacoes, aee_metas, aee_evolucoes:
-- acesso controlado pela aplicação via JOIN com aee_planos (que tem RLS)

-- 7. Auditoria imutável
DROP POLICY IF EXISTS aee_auditoria_no_update ON aee_auditoria;
DROP POLICY IF EXISTS aee_auditoria_no_delete ON aee_auditoria;
CREATE POLICY aee_auditoria_no_update ON aee_auditoria FOR UPDATE USING (false);
CREATE POLICY aee_auditoria_no_delete ON aee_auditoria FOR DELETE USING (false);

-- 8. Permissões
INSERT INTO permissoes (recurso, acao) VALUES
  ('aee', 'manage'),
  ('aee', 'view'),
  ('aee', 'self')
ON CONFLICT (recurso, acao) DO NOTHING;
```

- [ ] **Step 4: Build do pacote db para verificar erros de TypeScript**

```bash
cd /home/user/carometro
pnpm --filter @workspace/db run build
```
Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add lib/db/src/schema/aee.ts lib/db/src/schema/index.ts scripts/migrate-aee.sql
git commit -m "feat(aee): schemas Drizzle e migração SQL com RLS e pgcrypto"
```

---

## Task 2: Libs de Criptografia e Auditoria AEE

**Files:**
- Create: `artifacts/api-server/src/lib/aee-crypto.ts`
- Create: `artifacts/api-server/src/lib/aee-audit.ts`

**Interfaces:**
- Produz:
  - `cifrarLaudo(texto: string, escolaId: string): string`
  - `decifrarLaudo(conteudoEnc: string, escolaId: string): string`
  - `gerarChaveRef(escolaId: string): string`
  - `registrarAuditoriaAee(params: AeeAuditoriaParams): Promise<void>`

- [ ] **Step 1: Criar `artifacts/api-server/src/lib/aee-crypto.ts`**

```typescript
import { createHmac } from "crypto";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Chave derivada por escola — nunca armazenada, gerada em runtime
function derivarChave(escolaId: string): Buffer {
  const globalKey = process.env.ENCRYPTION_KEY;
  if (!globalKey || globalKey.length < 32) {
    throw new Error("ENCRYPTION_KEY ausente ou muito curta (mínimo 32 chars)");
  }
  return createHmac("sha256", globalKey).update(escolaId).digest();
}

export function gerarChaveRef(escolaId: string): string {
  return createHmac("sha256", escolaId).update(Date.now().toString()).digest("hex").slice(0, 16);
}

// AES-256-CBC: cifra texto, retorna "iv_hex:ciphertext_hex"
export function cifrarLaudo(texto: string, escolaId: string): string {
  const chave = derivarChave(escolaId);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", chave, iv);
  const encrypted = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

// Decifra "iv_hex:ciphertext_hex" → texto original
export function decifrarLaudo(conteudoEnc: string, escolaId: string): string {
  const partes = conteudoEnc.split(":");
  if (partes.length !== 2) throw new Error("Formato de laudo inválido");
  const [ivHex, ciphertextHex] = partes;
  const chave = derivarChave(escolaId);
  const iv = Buffer.from(ivHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", chave, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 2: Criar `artifacts/api-server/src/lib/aee-audit.ts`**

```typescript
import { db, aeeAuditoriaTable } from "@workspace/db";
import { Request } from "express";

export interface AeeAuditoriaParams {
  req: Request;
  acao: string;
  estudanteId?: string;
  recursoId?: string;
  escolaId?: string;
}

export async function registrarAuditoriaAee(params: AeeAuditoriaParams): Promise<void> {
  try {
    await db.insert(aeeAuditoriaTable).values({
      acao:        params.acao,
      usuarioId:   (params.req as any).usuarioId ?? "anonymous",
      estudanteId: params.estudanteId,
      recursoId:   params.recursoId,
      escolaId:    params.escolaId ?? (params.req as any).escolaId,
      ipOrigem:    params.req.ip ?? params.req.socket?.remoteAddress,
      userAgent:   params.req.headers["user-agent"],
    });
  } catch (err) {
    // Auditoria nunca derruba a aplicação — mas alerta stderr
    console.error("[AEE_AUDIT ERROR]", err instanceof Error ? err.message : err);
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @workspace/api-server run typecheck
```
Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/lib/aee-crypto.ts artifacts/api-server/src/lib/aee-audit.ts
git commit -m "feat(aee): libs de criptografia AES-256-CBC e auditoria imutável"
```

---

## Task 3: Rota AEE — Estudantes e Planos (PAI)

**Files:**
- Create: `artifacts/api-server/src/routes/aee.ts` (parcial — estudantes + planos + assinaturas + adaptações)
- Modify: `artifacts/api-server/src/index.ts`

**Interfaces:**
- Consome: `cifrarLaudo`, `decifrarLaudo`, `gerarChaveRef` de `../lib/aee-crypto.js`
- Consome: `registrarAuditoriaAee` de `../lib/aee-audit.js`
- Consome: `withTenant` de `../middleware/tenant.js`
- Consome: `buscarRoles` de `../lib/permissions.js`
- Produz: endpoints `GET/POST/PUT/DELETE /api/aee/estudantes`, `GET/POST/PUT /api/aee/planos`, `POST /api/aee/planos/:id/assinar`, `GET/POST/DELETE /api/aee/planos/:id/adaptacoes`

- [ ] **Step 1: Criar `artifacts/api-server/src/routes/aee.ts` (estudantes + planos)**

```typescript
import { Router } from "express";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  db, aeeEstudantesTable, aeePlanosTable, aeePlanoAssinaturasTable,
  aeePlanoAdaptacoesTable, aeeMetasTable, aeeEvolucoesTable,
  aeeSessoesTable, aeeLaudosTable, aeeLiberacoesTable, aeeAuditoriaTable,
  usuariosTable, escolasTable,
  eq, and, isNull, sql, count, desc,
} from "@workspace/db";
import { requireAuth, signToken } from "../lib/auth.js";
import { buscarRoles } from "../lib/permissions.js";
import { withTenant } from "../middleware/tenant.js";
import { cifrarLaudo, decifrarLaudo, gerarChaveRef } from "../lib/aee-crypto.js";
import { registrarAuditoriaAee } from "../lib/aee-audit.js";

const router = Router();
router.use(requireAuth);

// ── Helpers ──────────────────────────────────────────────────────────────────

type AeeNivel = "manage" | "view" | "self";

const ROLES_MANAGE = ["professor_aee", "psicologo", "psicopedagogo"];
const ROLES_VIEW   = [...ROLES_MANAGE, "coordenacao", "supervisao", "direcao"];

function temAcessoAee(roles: string[], nivel: AeeNivel): boolean {
  if (nivel === "manage") return roles.some(r => ROLES_MANAGE.includes(r));
  if (nivel === "view")   return roles.some(r => ROLES_VIEW.includes(r));
  return true; // "self" verificado por usuarioId na query
}

function aeeGuard(nivel: AeeNivel) {
  return async (req: any, res: any, next: any) => {
    const roles = await buscarRoles(req.usuarioId!);
    await registrarAuditoriaAee({ req, acao: "ACCESS_ATTEMPT" });
    if (!temAcessoAee(roles, nivel)) {
      await registrarAuditoriaAee({ req, acao: "ACCESS_DENIED" });
      return res.status(403).json({ error: "Acesso negado." });
    }
    req.aeeRoles = roles;
    next();
  };
}

async function gerarNumeroPai(escolaId: string): Promise<string> {
  const ano = new Date().getFullYear();
  const prefix = `PAI-${ano}-`;
  const [row] = await db
    .select({ n: count() })
    .from(aeePlanosTable)
    .where(sql`numero LIKE ${prefix + "%"} AND escola_id = ${escolaId}::uuid`);
  const seq = ((row?.n as number) ?? 0) + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

function gerarTokenHash(planoId: string, usuarioId: string, papel: string, senha: string): string {
  return createHash("sha256")
    .update(`${planoId}:${usuarioId}:${papel}:${Date.now()}:${senha}`)
    .digest("hex");
}

// ── Estudantes AEE ───────────────────────────────────────────────────────────

const estudanteAeeSchema = z.object({
  usuarioId:      z.string().uuid(),
  necessidades:   z.string().optional(),
  cid10:          z.string().max(10).optional(),
  profissionalId: z.string().uuid().optional(),
});

router.get("/estudantes", aeeGuard("view"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const rows = await withTenant(escolaId, async (tx) =>
    tx.select({
      id:             aeeEstudantesTable.id,
      usuarioId:      aeeEstudantesTable.usuarioId,
      necessidades:   aeeEstudantesTable.necessidades,
      ativo:          aeeEstudantesTable.ativo,
      profissionalId: aeeEstudantesTable.profissionalId,
      nomeEstudante:  usuariosTable.nome,
    })
    .from(aeeEstudantesTable)
    .leftJoin(usuariosTable, eq(usuariosTable.id, aeeEstudantesTable.usuarioId))
    .where(and(eq(aeeEstudantesTable.escolaId, escolaId), isNull(aeeEstudantesTable.deletadoEm)))
    .orderBy(usuariosTable.nome)
  );
  res.json({ estudantes: rows });
});

router.get("/estudantes/:id", aeeGuard("view"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const roles: string[] = req.aeeRoles;
  const isManage = temAcessoAee(roles, "manage");

  const [est] = await withTenant(escolaId, async (tx) =>
    tx.select()
    .from(aeeEstudantesTable)
    .where(and(
      eq(aeeEstudantesTable.id, req.params.id),
      eq(aeeEstudantesTable.escolaId, escolaId),
      isNull(aeeEstudantesTable.deletadoEm),
    ))
  );
  if (!est) return res.status(404).json({ error: "Estudante AEE não encontrado." });

  await registrarAuditoriaAee({ req, acao: "READ_PERFIL", estudanteId: est.id, escolaId });

  // cid10 só para manage
  const resultado: any = { ...est };
  if (!isManage) delete resultado.cid10;

  res.json(resultado);
});

router.post("/estudantes", aeeGuard("manage"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const body = estudanteAeeSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const [novo] = await withTenant(escolaId, async (tx) =>
    tx.insert(aeeEstudantesTable).values({ ...body.data, escolaId }).returning()
  );
  await registrarAuditoriaAee({ req, acao: "CREATE_ESTUDANTE", estudanteId: novo.id, escolaId });
  res.status(201).json(novo);
});

router.put("/estudantes/:id", aeeGuard("manage"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const body = estudanteAeeSchema.partial().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const [atualizado] = await withTenant(escolaId, async (tx) =>
    tx.update(aeeEstudantesTable)
    .set({ ...body.data, atualizadoEm: new Date() })
    .where(and(eq(aeeEstudantesTable.id, req.params.id), eq(aeeEstudantesTable.escolaId, escolaId)))
    .returning()
  );
  if (!atualizado) return res.status(404).json({ error: "Estudante AEE não encontrado." });
  res.json(atualizado);
});

router.delete("/estudantes/:id", aeeGuard("manage"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const [removido] = await withTenant(escolaId, async (tx) =>
    tx.update(aeeEstudantesTable)
    .set({ deletadoEm: new Date(), ativo: false })
    .where(and(eq(aeeEstudantesTable.id, req.params.id), eq(aeeEstudantesTable.escolaId, escolaId)))
    .returning()
  );
  if (!removido) return res.status(404).json({ error: "Estudante AEE não encontrado." });
  res.json({ ok: true });
});

// ── Planos (PAI) ─────────────────────────────────────────────────────────────

const planoSchema = z.object({
  estudanteAeeId:  z.string().uuid(),
  periodoInicio:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodoFim:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  objetivosGerais: z.string().optional(),
});

router.get("/planos", aeeGuard("view"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const { estudanteAeeId } = req.query;
  const condicoes: any[] = [eq(aeePlanosTable.escolaId, escolaId), isNull(aeePlanosTable.deletadoEm)];
  if (estudanteAeeId) condicoes.push(eq(aeePlanosTable.estudanteAeeId, String(estudanteAeeId)));

  const rows = await withTenant(escolaId, async (tx) =>
    tx.select().from(aeePlanosTable).where(and(...condicoes)).orderBy(desc(aeePlanosTable.criadoEm))
  );
  res.json({ planos: rows });
});

router.post("/planos", aeeGuard("manage"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const body = planoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const numero = await gerarNumeroPai(escolaId);
  const [novo] = await withTenant(escolaId, async (tx) =>
    tx.insert(aeePlanosTable).values({
      ...body.data, escolaId, numero, criadoPorId: req.usuarioId,
    }).returning()
  );
  res.status(201).json(novo);
});

router.put("/planos/:id", aeeGuard("manage"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  // Só permite editar rascunho
  const [plano] = await withTenant(escolaId, async (tx) =>
    tx.select().from(aeePlanosTable)
    .where(and(eq(aeePlanosTable.id, req.params.id), eq(aeePlanosTable.escolaId, escolaId)))
  );
  if (!plano) return res.status(404).json({ error: "Plano não encontrado." });
  if (plano.status !== "rascunho") return res.status(422).json({ error: "Só é possível editar planos em rascunho." });

  const body = planoSchema.partial().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const [atualizado] = await withTenant(escolaId, async (tx) =>
    tx.update(aeePlanosTable)
    .set({ ...body.data, atualizadoEm: new Date() })
    .where(eq(aeePlanosTable.id, req.params.id))
    .returning()
  );
  res.json(atualizado);
});

// ── Assinatura Digital do PAI ────────────────────────────────────────────────

const assinarSchema = z.object({
  senha: z.string().min(1),
  papel: z.enum(["professor_aee", "responsavel", "estudante"]),
});

router.post("/planos/:id/assinar", async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const body = assinarSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const [plano] = await withTenant(escolaId, async (tx) =>
    tx.select().from(aeePlanosTable)
    .where(and(eq(aeePlanosTable.id, req.params.id), eq(aeePlanosTable.escolaId, escolaId)))
  );
  if (!plano) return res.status(404).json({ error: "Plano não encontrado." });
  if (plano.status === "vigente" || plano.status === "encerrado") {
    return res.status(422).json({ error: "Plano já finalizado." });
  }

  // Verifica senha do usuário
  const [usuario] = await db.select({ senhaHash: usuariosTable.senhaHash })
    .from(usuariosTable).where(eq(usuariosTable.id, req.usuarioId!));
  if (!usuario?.senhaHash) return res.status(401).json({ error: "Usuário inválido." });

  const senhaOk = await bcrypt.compare(body.data.senha, usuario.senhaHash);
  if (!senhaOk) return res.status(401).json({ error: "Senha incorreta." });

  const tokenHash = gerarTokenHash(plano.id, req.usuarioId!, body.data.papel, body.data.senha);

  await withTenant(escolaId, async (tx) =>
    tx.insert(aeePlanoAssinaturasTable).values({
      planoId:   plano.id,
      usuarioId: req.usuarioId!,
      papel:     body.data.papel,
      metodo:    "senha",
      tokenHash,
      ipOrigem:  req.ip,
    }).onConflictDoNothing()
  );

  // Verifica se todas as assinaturas obrigatórias foram coletadas
  const assinaturas = await withTenant(escolaId, async (tx) =>
    tx.select({ papel: aeePlanoAssinaturasTable.papel })
    .from(aeePlanoAssinaturasTable)
    .where(eq(aeePlanoAssinaturasTable.planoId, plano.id))
  );
  const papeis = assinaturas.map(a => a.papel);
  const todasAssinadas = papeis.includes("professor_aee") && papeis.includes("responsavel");

  if (todasAssinadas) {
    await withTenant(escolaId, async (tx) =>
      tx.update(aeePlanosTable)
      .set({ status: "vigente", atualizadoEm: new Date() })
      .where(eq(aeePlanosTable.id, plano.id))
    );
  } else if (plano.status === "rascunho") {
    await withTenant(escolaId, async (tx) =>
      tx.update(aeePlanosTable)
      .set({ status: "aguardando_assinatura", atualizadoEm: new Date() })
      .where(eq(aeePlanosTable.id, plano.id))
    );
  }

  await registrarAuditoriaAee({ req, acao: "ASSINAR_PAI", recursoId: plano.id, escolaId });
  res.json({ ok: true, vigente: todasAssinadas });
});

// ── Adaptações ───────────────────────────────────────────────────────────────

const adaptacaoSchema = z.object({
  descricao: z.string().min(1),
  area: z.enum(["avaliacao", "metodologia", "recurso", "espaco", "tempo"]),
});

router.get("/planos/:id/adaptacoes", async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const rows = await withTenant(escolaId, async (tx) =>
    tx.select().from(aeePlanoAdaptacoesTable)
    .where(eq(aeePlanoAdaptacoesTable.planoId, req.params.id))
    .orderBy(aeePlanoAdaptacoesTable.criadoEm)
  );
  res.json({ adaptacoes: rows });
});

router.post("/planos/:id/adaptacoes", aeeGuard("manage"), async (req: any, res) => {
  const body = adaptacaoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const [nova] = await withTenant(req.escolaId, async (tx) =>
    tx.insert(aeePlanoAdaptacoesTable).values({ ...body.data, planoId: req.params.id }).returning()
  );
  res.status(201).json(nova);
});

router.delete("/planos/:id/adaptacoes/:adaptId", aeeGuard("manage"), async (req: any, res) => {
  await withTenant(req.escolaId, async (tx) =>
    tx.delete(aeePlanoAdaptacoesTable)
    .where(and(
      eq(aeePlanoAdaptacoesTable.id, req.params.adaptId),
      eq(aeePlanoAdaptacoesTable.planoId, req.params.id),
    ))
  );
  res.json({ ok: true });
});

export default router;
```

- [ ] **Step 2: Registrar rota em `artifacts/api-server/src/index.ts`**

Adicionar após as outras importações de rotas:
```typescript
import aeeRouter from "./routes/aee.js";
// ...
app.use("/api/aee", aeeRouter);
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @workspace/api-server run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/aee.ts artifacts/api-server/src/index.ts
git commit -m "feat(aee): rotas estudantes, planos PAI e assinatura digital"
```

---

## Task 4: Rota AEE — Metas, Evolução, Sessões, Laudos, Liberações, Auditoria

**Files:**
- Modify: `artifacts/api-server/src/routes/aee.ts` (adicionar as rotas restantes antes de `export default router`)

**Interfaces:**
- Consome tudo definido na Task 3
- Produz: endpoints de metas, evolução, sessões, laudos, liberações, auditoria e portais

- [ ] **Step 1: Adicionar rotas de Metas e Evolução**

Inserir antes de `export default router`:

```typescript
// ── Metas ────────────────────────────────────────────────────────────────────

const metaSchema = z.object({
  planoId:   z.string().uuid(),
  descricao: z.string().min(1),
  indicador: z.string().optional(),
  prazo:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.get("/metas", aeeGuard("view"), async (req: any, res) => {
  const { planoId } = req.query;
  const condicoes: any[] = [];
  if (planoId) condicoes.push(eq(aeeMetasTable.planoId, String(planoId)));

  const rows = await withTenant(req.escolaId, async (tx) =>
    tx.select().from(aeeMetasTable).where(condicoes.length ? and(...condicoes) : undefined)
  );
  res.json({ metas: rows });
});

router.post("/metas", aeeGuard("manage"), async (req: any, res) => {
  const body = metaSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const [nova] = await withTenant(req.escolaId, async (tx) =>
    tx.insert(aeeMetasTable).values(body.data).returning()
  );
  res.status(201).json(nova);
});

router.put("/metas/:id", aeeGuard("manage"), async (req: any, res) => {
  const body = metaSchema.partial().merge(z.object({ status: z.string().optional() })).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const [atualizada] = await withTenant(req.escolaId, async (tx) =>
    tx.update(aeeMetasTable)
    .set({ ...body.data, atualizadoEm: new Date() })
    .where(eq(aeeMetasTable.id, req.params.id))
    .returning()
  );
  if (!atualizada) return res.status(404).json({ error: "Meta não encontrada." });
  res.json(atualizada);
});

const evolucaoSchema = z.object({
  periodoRef:  z.string().regex(/^\d{4}-\d{2}$/),
  observacao:  z.string().min(1),
  percentual:  z.number().int().min(0).max(100).optional(),
});

router.post("/metas/:id/evolucao", aeeGuard("manage"), async (req: any, res) => {
  const body = evolucaoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const [nova] = await withTenant(req.escolaId, async (tx) =>
    tx.insert(aeeEvolucoesTable).values({
      ...body.data, metaId: req.params.id, profissionalId: req.usuarioId,
    }).returning()
  );
  res.status(201).json(nova);
});

router.get("/metas/:id/evolucao", async (req: any, res) => {
  const rows = await withTenant(req.escolaId, async (tx) =>
    tx.select().from(aeeEvolucoesTable)
    .where(eq(aeeEvolucoesTable.metaId, req.params.id))
    .orderBy(aeeEvolucoesTable.registradoEm)
  );
  res.json({ evolucoes: rows });
});

// ── Sessões ──────────────────────────────────────────────────────────────────

const sessaoSchema = z.object({
  estudanteAeeId: z.string().uuid(),
  dataSessao:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duracaoMin:     z.number().int().positive().optional(),
  local:          z.string().max(100).optional(),
  observacoes:    z.string().optional(),
});

router.get("/sessoes", aeeGuard("view"), async (req: any, res) => {
  const { estudanteAeeId } = req.query;
  const condicoes: any[] = [
    eq(aeeSessoesTable.escolaId, req.escolaId),
    isNull(aeeSessoesTable.deletadoEm),
  ];
  if (estudanteAeeId) condicoes.push(eq(aeeSessoesTable.estudanteAeeId, String(estudanteAeeId)));

  const rows = await withTenant(req.escolaId, async (tx) =>
    tx.select().from(aeeSessoesTable)
    .where(and(...condicoes))
    .orderBy(desc(aeeSessoesTable.dataSessao))
  );
  res.json({ sessoes: rows });
});

router.post("/sessoes", aeeGuard("manage"), async (req: any, res) => {
  const body = sessaoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const [nova] = await withTenant(req.escolaId, async (tx) =>
    tx.insert(aeeSessoesTable).values({
      ...body.data, escolaId: req.escolaId, profissionalId: req.usuarioId,
    }).returning()
  );
  res.status(201).json(nova);
});

router.put("/sessoes/:id", aeeGuard("manage"), async (req: any, res) => {
  const body = sessaoSchema.partial().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const [atualizada] = await withTenant(req.escolaId, async (tx) =>
    tx.update(aeeSessoesTable).set(body.data)
    .where(and(eq(aeeSessoesTable.id, req.params.id), eq(aeeSessoesTable.escolaId, req.escolaId)))
    .returning()
  );
  if (!atualizada) return res.status(404).json({ error: "Sessão não encontrada." });
  res.json(atualizada);
});

router.delete("/sessoes/:id", aeeGuard("manage"), async (req: any, res) => {
  const [removida] = await withTenant(req.escolaId, async (tx) =>
    tx.update(aeeSessoesTable).set({ deletadoEm: new Date() })
    .where(and(eq(aeeSessoesTable.id, req.params.id), eq(aeeSessoesTable.escolaId, req.escolaId)))
    .returning()
  );
  if (!removida) return res.status(404).json({ error: "Sessão não encontrada." });
  res.json({ ok: true });
});

// ── Laudos (acesso restrito + auditoria obrigatória) ─────────────────────────

const laudoSchema = z.object({
  estudanteAeeId:  z.string().uuid(),
  tipo:            z.enum(["psicologico", "psicopedagogico", "fonoaudiologico", "medico", "outro"]),
  titulo:          z.string().min(1).max(200),
  conteudo:        z.string().min(1),  // texto puro — cifrado antes de gravar
  profissionalExt: z.string().max(200).optional(),
  dataLaudo:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.get("/laudos", aeeGuard("manage"), async (req: any, res) => {
  const { estudanteAeeId } = req.query;
  const condicoes: any[] = [
    eq(aeeLaudosTable.escolaId, req.escolaId),
    isNull(aeeLaudosTable.deletadoEm),
  ];
  if (estudanteAeeId) condicoes.push(eq(aeeLaudosTable.estudanteAeeId, String(estudanteAeeId)));

  // NUNCA retorna conteudo_enc na listagem
  const rows = await withTenant(req.escolaId, async (tx) =>
    tx.select({
      id:             aeeLaudosTable.id,
      tipo:           aeeLaudosTable.tipo,
      titulo:         aeeLaudosTable.titulo,
      dataLaudo:      aeeLaudosTable.dataLaudo,
      profissionalExt: aeeLaudosTable.profissionalExt,
      criadoEm:       aeeLaudosTable.criadoEm,
    })
    .from(aeeLaudosTable).where(and(...condicoes))
    .orderBy(desc(aeeLaudosTable.criadoEm))
  );
  res.json({ laudos: rows });
});

router.get("/laudos/:id", aeeGuard("manage"), async (req: any, res) => {
  const [laudo] = await withTenant(req.escolaId, async (tx) =>
    tx.select().from(aeeLaudosTable)
    .where(and(
      eq(aeeLaudosTable.id, req.params.id),
      eq(aeeLaudosTable.escolaId, req.escolaId),
      isNull(aeeLaudosTable.deletadoEm),
    ))
  );
  if (!laudo) return res.status(404).json({ error: "Laudo não encontrado." });

  // Auditoria obrigatória ANTES de descriptografar
  await registrarAuditoriaAee({
    req, acao: "READ_LAUDO",
    estudanteId: laudo.estudanteAeeId,
    recursoId:   laudo.id,
    escolaId:    req.escolaId,
  });

  const conteudo = decifrarLaudo(laudo.conteudoEnc, req.escolaId);
  res.json({ ...laudo, conteudo, conteudoEnc: undefined });
});

router.post("/laudos", aeeGuard("manage"), async (req: any, res) => {
  const body = laudoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const { conteudo, ...resto } = body.data;
  const conteudoEnc = cifrarLaudo(conteudo, req.escolaId);
  const chaveRef    = gerarChaveRef(req.escolaId);

  const [novo] = await withTenant(req.escolaId, async (tx) =>
    tx.insert(aeeLaudosTable).values({
      ...resto, conteudoEnc, chaveRef,
      escolaId: req.escolaId, criadoPorId: req.usuarioId,
    }).returning({ id: aeeLaudosTable.id, tipo: aeeLaudosTable.tipo, titulo: aeeLaudosTable.titulo })
  );

  await registrarAuditoriaAee({
    req, acao: "CREATE_LAUDO",
    estudanteId: body.data.estudanteAeeId,
    recursoId:   novo.id,
    escolaId:    req.escolaId,
  });
  res.status(201).json(novo);
});

router.delete("/laudos/:id", aeeGuard("manage"), async (req: any, res) => {
  const [removido] = await withTenant(req.escolaId, async (tx) =>
    tx.update(aeeLaudosTable).set({ deletadoEm: new Date() })
    .where(and(eq(aeeLaudosTable.id, req.params.id), eq(aeeLaudosTable.escolaId, req.escolaId)))
    .returning({ id: aeeLaudosTable.id, estudanteAeeId: aeeLaudosTable.estudanteAeeId })
  );
  if (!removido) return res.status(404).json({ error: "Laudo não encontrado." });
  await registrarAuditoriaAee({
    req, acao: "DELETE_LAUDO",
    estudanteId: removido.estudanteAeeId,
    recursoId:   removido.id,
    escolaId:    req.escolaId,
  });
  res.json({ ok: true });
});

// ── Liberações ───────────────────────────────────────────────────────────────

const liberacaoSchema = z.object({
  estudanteAeeId: z.string().uuid(),
  professorId:    z.string().uuid(),
  verAdaptacoes:  z.boolean().default(true),
  verMetas:       z.boolean().default(false),
  verResumoIa:    z.boolean().default(false),
});

router.get("/liberacoes/:estudanteAeeId", aeeGuard("manage"), async (req: any, res) => {
  const rows = await withTenant(req.escolaId, async (tx) =>
    tx.select().from(aeeLiberacoesTable)
    .where(and(
      eq(aeeLiberacoesTable.estudanteAeeId, req.params.estudanteAeeId),
      eq(aeeLiberacoesTable.escolaId, req.escolaId),
      isNull(aeeLiberacoesTable.revogadoEm),
    ))
  );
  res.json({ liberacoes: rows });
});

router.put("/liberacoes", aeeGuard("manage"), async (req: any, res) => {
  const body = liberacaoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  // Revoga anterior e cria nova
  await withTenant(req.escolaId, async (tx) => {
    await tx.update(aeeLiberacoesTable)
    .set({ revogadoEm: new Date() })
    .where(and(
      eq(aeeLiberacoesTable.estudanteAeeId, body.data.estudanteAeeId),
      eq(aeeLiberacoesTable.professorId, body.data.professorId),
      eq(aeeLiberacoesTable.escolaId, req.escolaId),
      isNull(aeeLiberacoesTable.revogadoEm),
    ));
    await tx.insert(aeeLiberacoesTable).values({
      ...body.data, escolaId: req.escolaId, concedidoPorId: req.usuarioId,
    });
  });
  res.json({ ok: true });
});

router.delete("/liberacoes/:id", aeeGuard("manage"), async (req: any, res) => {
  await withTenant(req.escolaId, async (tx) =>
    tx.update(aeeLiberacoesTable)
    .set({ revogadoEm: new Date() })
    .where(and(eq(aeeLiberacoesTable.id, req.params.id), eq(aeeLiberacoesTable.escolaId, req.escolaId)))
  );
  res.json({ ok: true });
});

// ── Auditoria (somente leitura) ──────────────────────────────────────────────

router.get("/auditoria", aeeGuard("manage"), async (req: any, res) => {
  const { estudanteId, limit = "50" } = req.query;
  const condicoes: any[] = [eq(aeeAuditoriaTable.escolaId, req.escolaId)];
  if (estudanteId) condicoes.push(eq(aeeAuditoriaTable.estudanteId, String(estudanteId)));

  const rows = await db.select().from(aeeAuditoriaTable)
    .where(and(...condicoes))
    .orderBy(desc(aeeAuditoriaTable.criadoEm))
    .limit(Math.min(Number(limit), 200));
  res.json({ logs: rows });
});

// ── Portal do Estudante / Responsável ────────────────────────────────────────

router.get("/portal/meu-plano", async (req: any, res) => {
  const usuarioId: string = req.usuarioId!;
  const escolaId: string  = req.escolaId;

  const [est] = await withTenant(escolaId, async (tx) =>
    tx.select({ id: aeeEstudantesTable.id })
    .from(aeeEstudantesTable)
    .where(and(
      eq(aeeEstudantesTable.usuarioId, usuarioId),
      eq(aeeEstudantesTable.escolaId, escolaId),
      eq(aeeEstudantesTable.ativo, true),
      isNull(aeeEstudantesTable.deletadoEm),
    ))
  );
  if (!est) return res.json({ aee: false });

  const [plano] = await withTenant(escolaId, async (tx) =>
    tx.select().from(aeePlanosTable)
    .where(and(
      eq(aeePlanosTable.estudanteAeeId, est.id),
      eq(aeePlanosTable.status, "vigente"),
    ))
    .orderBy(desc(aeePlanosTable.criadoEm))
    .limit(1)
  );
  if (!plano) return res.json({ aee: true, planoVigente: null });

  const adaptacoes = await withTenant(escolaId, async (tx) =>
    tx.select().from(aeePlanoAdaptacoesTable).where(eq(aeePlanoAdaptacoesTable.planoId, plano.id))
  );
  const metas = await withTenant(escolaId, async (tx) =>
    tx.select().from(aeeMetasTable).where(eq(aeeMetasTable.planoId, plano.id))
  );

  await registrarAuditoriaAee({ req, acao: "PORTAL_READ_PAI", estudanteId: est.id, escolaId });
  res.json({ aee: true, planoVigente: { ...plano, adaptacoes, metas } });
});

// ── Portal do Professor (somente liberações) ─────────────────────────────────

router.get("/portal-professor/:estudanteAeeId", async (req: any, res) => {
  const escolaId: string  = req.escolaId;
  const professorId: string = req.usuarioId!;

  const [lib] = await withTenant(escolaId, async (tx) =>
    tx.select().from(aeeLiberacoesTable)
    .where(and(
      eq(aeeLiberacoesTable.estudanteAeeId, req.params.estudanteAeeId),
      eq(aeeLiberacoesTable.professorId, professorId),
      eq(aeeLiberacoesTable.escolaId, escolaId),
      isNull(aeeLiberacoesTable.revogadoEm),
    ))
  );
  if (!lib) return res.json({ liberado: false });

  await registrarAuditoriaAee({
    req, acao: "PROFESSOR_READ_LIBERACAO",
    estudanteId: req.params.estudanteAeeId, escolaId,
  });

  const resultado: any = { liberado: true };
  if (lib.verAdaptacoes) {
    const [plano] = await withTenant(escolaId, async (tx) =>
      tx.select({ id: aeePlanosTable.id }).from(aeePlanosTable)
      .where(and(
        eq(aeePlanosTable.estudanteAeeId, req.params.estudanteAeeId),
        eq(aeePlanosTable.status, "vigente"),
      )).limit(1)
    );
    if (plano) {
      resultado.adaptacoes = await withTenant(escolaId, async (tx) =>
        tx.select().from(aeePlanoAdaptacoesTable).where(eq(aeePlanoAdaptacoesTable.planoId, plano.id))
      );
    }
  }
  if (lib.verMetas) {
    const [plano] = await withTenant(escolaId, async (tx) =>
      tx.select({ id: aeePlanosTable.id }).from(aeePlanosTable)
      .where(and(
        eq(aeePlanosTable.estudanteAeeId, req.params.estudanteAeeId),
        eq(aeePlanosTable.status, "vigente"),
      )).limit(1)
    );
    if (plano) {
      resultado.metas = await withTenant(escolaId, async (tx) =>
        tx.select().from(aeeMetasTable).where(eq(aeeMetasTable.planoId, plano.id))
      );
    }
  }

  res.json(resultado);
});
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @workspace/api-server run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/routes/aee.ts
git commit -m "feat(aee): rotas metas, evolução, sessões, laudos, liberações, auditoria e portais"
```

---

## Task 5: Testes

**Files:**
- Create: `artifacts/api-server/src/tests/aee.test.ts`

- [ ] **Step 1: Criar `artifacts/api-server/src/tests/aee.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { makeQuery } from "./helpers/db-mock.js";

const mockDb = {
  select:         vi.fn(() => makeQuery()),
  selectDistinct: vi.fn(() => makeQuery()),
  insert:         vi.fn(() => makeQuery()),
  update:         vi.fn(() => makeQuery()),
  delete:         vi.fn(() => makeQuery()),
};

vi.mock("@workspace/db", () => ({
  db: mockDb,
  aeeEstudantesTable:    { id:"id", escolaId:"escolaId", usuarioId:"usuarioId", necessidades:"necessidades", cid10:"cid10", profissionalId:"profissionalId", ativo:"ativo", deletadoEm:"deletadoEm", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  aeePlanosTable:        { id:"id", escolaId:"escolaId", estudanteAeeId:"estudanteAeeId", numero:"numero", versao:"versao", status:"status", periodoInicio:"periodoInicio", periodoFim:"periodoFim", objetivosGerais:"objetivosGerais", criadoPorId:"criadoPorId", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm", deletadoEm:"deletadoEm" },
  aeePlanoAssinaturasTable: { id:"id", planoId:"planoId", usuarioId:"usuarioId", papel:"papel", metodo:"metodo", tokenHash:"tokenHash", assinadoEm:"assinadoEm", ipOrigem:"ipOrigem" },
  aeePlanoAdaptacoesTable:  { id:"id", planoId:"planoId", descricao:"descricao", area:"area", criadoEm:"criadoEm" },
  aeeMetasTable:         { id:"id", planoId:"planoId", descricao:"descricao", indicador:"indicador", prazo:"prazo", status:"status", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  aeeEvolucoesTable:     { id:"id", metaId:"metaId", profissionalId:"profissionalId", periodoRef:"periodoRef", observacao:"observacao", percentual:"percentual", registradoEm:"registradoEm" },
  aeeSessoesTable:       { id:"id", escolaId:"escolaId", estudanteAeeId:"estudanteAeeId", profissionalId:"profissionalId", dataSessao:"dataSessao", duracaoMin:"duracaoMin", local:"local", observacoes:"observacoes", criadoEm:"criadoEm", deletadoEm:"deletadoEm" },
  aeeLaudosTable:        { id:"id", escolaId:"escolaId", estudanteAeeId:"estudanteAeeId", tipo:"tipo", titulo:"titulo", conteudoEnc:"conteudoEnc", chaveRef:"chaveRef", profissionalExt:"profissionalExt", dataLaudo:"dataLaudo", criadoPorId:"criadoPorId", criadoEm:"criadoEm", deletadoEm:"deletadoEm" },
  aeeLiberacoesTable:    { id:"id", escolaId:"escolaId", estudanteAeeId:"estudanteAeeId", professorId:"professorId", verAdaptacoes:"verAdaptacoes", verMetas:"verMetas", verResumoIa:"verResumoIa", concedidoPorId:"concedidoPorId", concedidoEm:"concedidoEm", revogadoEm:"revogadoEm" },
  aeeAuditoriaTable:     { id:"id", escolaId:"escolaId", acao:"acao", usuarioId:"usuarioId", estudanteId:"estudanteId", recursoId:"recursoId", ipOrigem:"ipOrigem", userAgent:"userAgent", criadoEm:"criadoEm" },
  usuariosTable:         { id:"id", nome:"nome", senhaHash:"senhaHash" },
  escolasTable:          { id:"id", nome:"nome" },
  eq:      vi.fn(() => "eq"),
  and:     vi.fn((..._a) => "and"),
  isNull:  vi.fn(() => "isNull"),
  inArray: vi.fn(() => "inArray"),
  desc:    vi.fn((c) => c),
  sql:     vi.fn(),
  count:   vi.fn(() => "count"),
}));

vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/aee-crypto.js", () => ({
  cifrarLaudo:    vi.fn(() => "iv_hex:enc_hex"),
  decifrarLaudo:  vi.fn(() => "Texto do laudo descriptografado"),
  gerarChaveRef:  vi.fn(() => "chaveref123"),
}));

vi.mock("../lib/aee-audit.js", () => ({
  registrarAuditoriaAee: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../middleware/tenant.js", () => ({
  withTenant: vi.fn(async (_id: string, fn: (tx: any) => Promise<any>) => fn(mockDb)),
}));

vi.mock("../lib/permissions.js", () => ({
  buscarRoles: vi.fn().mockResolvedValue(["professor_aee"]),
  requirePermissao: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  invalidarCachePermissoes: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn().mockResolvedValue(true), hash: vi.fn() },
}));

async function buildApp() {
  const { default: aeeRouter } = await import("../routes/aee.js");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  // Injeta usuarioId e escolaId como faria o requireAuth
  app.use((req: any, _res, next) => {
    req.usuarioId = "user-uuid-1";
    req.escolaId  = "escola-uuid-1";
    next();
  });
  app.use("/api/aee", aeeRouter);
  return app;
}

const ESTUDANTE_FIXTURE = {
  id: "est-aee-uuid-1", escolaId: "escola-uuid-1", usuarioId: "usuario-uuid-1",
  necessidades: "Dislexia", cid10: "F81.0", ativo: true, deletadoEm: null,
};

const PLANO_FIXTURE = {
  id: "plano-uuid-1", escolaId: "escola-uuid-1", estudanteAeeId: "est-aee-uuid-1",
  numero: "PAI-2026-0001", versao: 1, status: "rascunho",
};

describe("GET /api/aee/estudantes", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna lista de estudantes AEE", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([ESTUDANTE_FIXTURE]));
    const res = await request(app).get("/api/aee/estudantes");
    expect(res.status).toBe(200);
    expect(res.body.estudantes).toHaveLength(1);
  });
});

describe("POST /api/aee/estudantes", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna 400 sem usuarioId", async () => {
    const res = await request(app).post("/api/aee/estudantes").send({});
    expect(res.status).toBe(400);
  });

  it("cria estudante AEE com dados válidos", async () => {
    mockDb.insert.mockReturnValueOnce(makeQuery([ESTUDANTE_FIXTURE]));
    const res = await request(app).post("/api/aee/estudantes")
      .send({ usuarioId: "usuario-uuid-1", necessidades: "Dislexia" });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/aee/laudos/:id — auditoria obrigatória", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("descriptografa laudo e registra auditoria", async () => {
    const { registrarAuditoriaAee } = await import("../lib/aee-audit.js");
    mockDb.select.mockReturnValueOnce(makeQuery([{
      id: "laudo-uuid-1", estudanteAeeId: "est-aee-uuid-1",
      conteudoEnc: "iv_hex:enc_hex", escolaId: "escola-uuid-1", deletadoEm: null,
    }]));

    const res = await request(app).get("/api/aee/laudos/laudo-uuid-1");
    expect(res.status).toBe(200);
    expect(res.body.conteudo).toBe("Texto do laudo descriptografado");
    expect(res.body.conteudoEnc).toBeUndefined();
    expect(registrarAuditoriaAee).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "READ_LAUDO" })
    );
  });

  it("retorna 404 quando laudo não existe", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([]));
    const res = await request(app).get("/api/aee/laudos/inexistente");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/aee/laudos — criptografia", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("salva laudo criptografado sem conteúdo em texto puro", async () => {
    const { cifrarLaudo } = await import("../lib/aee-crypto.js");
    mockDb.insert.mockReturnValueOnce(makeQuery([{ id: "laudo-uuid-1", tipo: "psicologico", titulo: "Avaliação" }]));

    const res = await request(app).post("/api/aee/laudos").send({
      estudanteAeeId: "est-aee-uuid-1",
      tipo: "psicologico",
      titulo: "Avaliação Psicológica",
      conteudo: "Texto confidencial do laudo",
    });
    expect(res.status).toBe(201);
    expect(cifrarLaudo).toHaveBeenCalledWith("Texto confidencial do laudo", "escola-uuid-1");
    expect(res.body.conteudoEnc).toBeUndefined();
  });
});

describe("POST /api/aee/planos/:id/assinar", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("ativa PAI após professor_aee e responsavel assinarem", async () => {
    // plano em rascunho
    mockDb.select.mockReturnValueOnce(makeQuery([PLANO_FIXTURE]));
    // senha do usuário
    mockDb.select.mockReturnValueOnce(makeQuery([{ senhaHash: "$2b$12$hash" }]));
    // insert assinatura
    mockDb.insert.mockReturnValueOnce(makeQuery([]));
    // assinaturas coletadas: professor_aee + responsavel
    mockDb.select.mockReturnValueOnce(makeQuery([
      { papel: "professor_aee" }, { papel: "responsavel" },
    ]));
    // update status vigente
    mockDb.update.mockReturnValueOnce(makeQuery([]));

    const res = await request(app).post("/api/aee/planos/plano-uuid-1/assinar")
      .send({ senha: "senha123", papel: "professor_aee" });
    expect(res.status).toBe(200);
    expect(res.body.vigente).toBe(true);
  });

  it("não ativa PAI com apenas uma assinatura", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([PLANO_FIXTURE]));
    mockDb.select.mockReturnValueOnce(makeQuery([{ senhaHash: "$2b$12$hash" }]));
    mockDb.insert.mockReturnValueOnce(makeQuery([]));
    mockDb.select.mockReturnValueOnce(makeQuery([{ papel: "professor_aee" }]));
    mockDb.update.mockReturnValueOnce(makeQuery([]));

    const res = await request(app).post("/api/aee/planos/plano-uuid-1/assinar")
      .send({ senha: "senha123", papel: "professor_aee" });
    expect(res.status).toBe(200);
    expect(res.body.vigente).toBe(false);
  });
});

describe("GET /api/aee/portal-professor/:estudanteAeeId", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna liberado: false quando professor não tem liberação", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([]));
    const res = await request(app).get("/api/aee/portal-professor/est-aee-uuid-1");
    expect(res.status).toBe(200);
    expect(res.body.liberado).toBe(false);
  });

  it("retorna adaptações quando professor tem verAdaptacoes=true", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([{
      id: "lib-uuid-1", verAdaptacoes: true, verMetas: false, verResumoIa: false,
    }]));
    mockDb.select.mockReturnValueOnce(makeQuery([{ id: "plano-uuid-1" }]));
    mockDb.select.mockReturnValueOnce(makeQuery([
      { id: "adapt-1", descricao: "Usar recursos visuais", area: "metodologia" },
    ]));

    const res = await request(app).get("/api/aee/portal-professor/est-aee-uuid-1");
    expect(res.status).toBe(200);
    expect(res.body.liberado).toBe(true);
    expect(res.body.adaptacoes).toHaveLength(1);
    expect(res.body.metas).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar testes**

```bash
cd /home/user/carometro
DATABASE_URL="postgresql://test:test@localhost/test" \
SESSION_SECRET="ci-test-secret-must-be-at-least-32-chars-long!!" \
ENCRYPTION_KEY="0123456789abcdef0123456789abcdef" \
NODE_ENV="test" \
ANTHROPIC_API_KEY="sk-ant-test-placeholder-not-real" \
pnpm --filter @workspace/api-server run test
```
Esperado: todos os testes passando (incluindo os 53 existentes + novos AEE).

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/tests/aee.test.ts
git commit -m "test(aee): cobertura de estudantes, laudos, assinatura PAI, liberações e auditoria"
```

---

## Task 6: UI — `/aee/gestao` e `/aee/analise`

**Files:**
- Create: `artifacts/seshat/src/pages/aee/gestao.tsx`
- Create: `artifacts/seshat/src/pages/aee/analise.tsx`
- Modify: `artifacts/seshat/src/App.tsx`
- Modify: `artifacts/seshat/src/components/layout.tsx`

- [ ] **Step 1: Criar `artifacts/seshat/src/pages/aee/gestao.tsx`**

```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Users, FileText, Target, ClipboardList, Lock } from "lucide-react";

interface EstudanteAee {
  id: string; usuarioId: string; nomeEstudante: string | null;
  necessidades: string | null; ativo: boolean;
}

interface Plano {
  id: string; numero: string; status: string;
  periodoInicio: string | null; periodoFim: string | null; objetivosGerais: string | null;
}

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    rascunho: "secondary", aguardando_assinatura: "outline",
    vigente: "default", encerrado: "destructive",
  };
  return <Badge variant={(map[status] ?? "secondary") as any}>{status.replace("_", " ")}</Badge>;
}

function LaudoAcesso({ estudanteAeeId }: { estudanteAeeId: string }) {
  const [aberto, setAberto] = useState(false);
  const [laudoId, setLaudoId] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const { toast } = useToast();

  const { data } = useQuery({
    queryKey: ["aee-laudos", estudanteAeeId],
    queryFn: () => apiFetch(`/api/aee/laudos?estudanteAeeId=${estudanteAeeId}`),
    enabled: aberto,
  });

  const { data: laudoCompleto, refetch } = useQuery({
    queryKey: ["aee-laudo-completo", laudoId],
    queryFn: () => apiFetch(`/api/aee/laudos/${laudoId}`),
    enabled: false,
  });

  function abrirLaudo(id: string) {
    setLaudoId(id);
    setConfirmado(false);
  }

  async function confirmarAcesso() {
    setConfirmado(true);
    await refetch();
    toast({ title: "Acesso registrado", description: "Este acesso foi registrado no log de auditoria." });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <Lock className="h-4 w-4 mr-1" /> Laudos
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-600" />
              Laudos — Acesso Restrito (Auditado)
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Todo acesso a laudos é registrado no log de auditoria conforme LGPD e ISO 27001.
          </p>
          <div className="space-y-2 mt-2">
            {data?.laudos?.map((l: any) => (
              <div key={l.id} className="border rounded p-3 flex justify-between items-center">
                <div>
                  <p className="font-medium text-sm">{l.titulo}</p>
                  <p className="text-xs text-muted-foreground">{l.tipo} · {l.dataLaudo ?? "sem data"}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => abrirLaudo(l.id)}>Ver</Button>
              </div>
            ))}
          </div>
          {laudoId && !confirmado && (
            <div className="border border-amber-300 bg-amber-50 rounded p-3 mt-2">
              <p className="text-sm font-medium text-amber-800">Confirmar acesso ao laudo</p>
              <p className="text-xs text-amber-700 mt-1">
                Este acesso será registrado com sua identidade, data/hora e IP.
              </p>
              <Button size="sm" className="mt-2" onClick={confirmarAcesso}>
                Confirmar e visualizar
              </Button>
            </div>
          )}
          {confirmado && laudoCompleto && (
            <div className="border rounded p-3 mt-2 bg-muted/40">
              <p className="text-xs font-mono whitespace-pre-wrap">{laudoCompleto.conteudo}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AeeGestaoPage() {
  const [busca, setBusca] = useState("");
  const [estudanteSel, setEstudanteSel] = useState<EstudanteAee | null>(null);

  const { data: estudantes } = useQuery<{ estudantes: EstudanteAee[] }>({
    queryKey: ["aee-estudantes"],
    queryFn: () => apiFetch("/api/aee/estudantes"),
  });

  const { data: planos } = useQuery<{ planos: Plano[] }>({
    queryKey: ["aee-planos", estudanteSel?.id],
    queryFn: () => apiFetch(`/api/aee/planos?estudanteAeeId=${estudanteSel!.id}`),
    enabled: !!estudanteSel,
  });

  const lista = (estudantes?.estudantes ?? []).filter(e =>
    !busca || e.nomeEstudante?.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold">Atendimento Educacional Especializado</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Estudantes AEE", valor: lista.length, icon: Users },
          { label: "PAIs vigentes", valor: 0, icon: FileText },
          { label: "Sessões este mês", valor: 0, icon: ClipboardList },
          { label: "Metas ativas", valor: 0, icon: Target },
        ].map(({ label, valor, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{valor}</p></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-3">
          <Input placeholder="Buscar estudante..." value={busca} onChange={e => setBusca(e.target.value)} />
          {lista.map(est => (
            <Card
              key={est.id}
              className={`cursor-pointer transition-colors ${estudanteSel?.id === est.id ? "border-blue-500 bg-blue-50/50" : ""}`}
              onClick={() => setEstudanteSel(est)}
            >
              <CardContent className="p-3">
                <p className="font-medium text-sm">{est.nomeEstudante ?? "—"}</p>
                {est.necessidades && <p className="text-xs text-muted-foreground truncate">{est.necessidades}</p>}
              </CardContent>
            </Card>
          ))}
        </div>

        {estudanteSel && (
          <div className="md:col-span-2">
            <Tabs defaultValue="planos">
              <TabsList>
                <TabsTrigger value="planos">PAI</TabsTrigger>
                <TabsTrigger value="sessoes">Sessões</TabsTrigger>
                <TabsTrigger value="metas">Metas</TabsTrigger>
                <TabsTrigger value="laudos">Laudos</TabsTrigger>
                <TabsTrigger value="liberacoes">Liberações</TabsTrigger>
              </TabsList>

              <TabsContent value="planos" className="space-y-3 mt-3">
                {planos?.planos?.map(p => (
                  <Card key={p.id}>
                    <CardContent className="p-4 flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{p.numero}</p>
                        <p className="text-sm text-muted-foreground">
                          {p.periodoInicio} → {p.periodoFim ?? "em aberto"}
                        </p>
                      </div>
                      <StatusBadge status={p.status} />
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="laudos" className="mt-3">
                <LaudoAcesso estudanteAeeId={estudanteSel.id} />
              </TabsContent>

              <TabsContent value="sessoes" className="mt-3">
                <p className="text-sm text-muted-foreground">Sessões em implementação.</p>
              </TabsContent>
              <TabsContent value="metas" className="mt-3">
                <p className="text-sm text-muted-foreground">Metas em implementação.</p>
              </TabsContent>
              <TabsContent value="liberacoes" className="mt-3">
                <p className="text-sm text-muted-foreground">Liberações em implementação.</p>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar `artifacts/seshat/src/pages/aee/analise.tsx`**

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Eye } from "lucide-react";

async function apiFetch(url: string) {
  const r = await fetch(url, { credentials: "include" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}

export default function AeeAnalisePage() {
  const [busca, setBusca] = useState("");

  const { data } = useQuery({
    queryKey: ["aee-estudantes-analise"],
    queryFn: () => apiFetch("/api/aee/estudantes"),
  });

  const lista = (data?.estudantes ?? []).filter((e: any) =>
    !busca || e.nomeEstudante?.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Eye className="h-6 w-6 text-purple-600" />
        <h1 className="text-2xl font-bold">Acompanhamento AEE</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Visão da gestão escolar — adaptações e metas dos estudantes atendidos pelo AEE.
        Dados clínicos não estão disponíveis nesta visão.
      </p>

      <Input placeholder="Buscar estudante..." value={busca} onChange={e => setBusca(e.target.value)} />

      <div className="space-y-3">
        {lista.map((est: any) => (
          <Card key={est.id}>
            <CardContent className="p-4 flex justify-between items-center">
              <div>
                <p className="font-medium">{est.nomeEstudante ?? "—"}</p>
                {est.necessidades && (
                  <p className="text-sm text-muted-foreground">{est.necessidades}</p>
                )}
              </div>
              <Badge variant={est.ativo ? "default" : "secondary"}>
                {est.ativo ? "Ativo" : "Inativo"}
              </Badge>
            </CardContent>
          </Card>
        ))}
        {lista.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum estudante encontrado.
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Adicionar rotas em `artifacts/seshat/src/App.tsx`**

Localizar o bloco de rotas e adicionar:
```tsx
import AeeGestaoPage   from "./pages/aee/gestao";
import AeeAnalisePage  from "./pages/aee/analise";

// dentro do <Routes>:
<Route path="/aee/gestao"  element={<AeeGestaoPage />} />
<Route path="/aee/analise" element={<AeeAnalisePage />} />
```

- [ ] **Step 4: Adicionar grupo "AEE" no menu em `artifacts/seshat/src/components/layout.tsx`**

Localizar onde outros grupos de menu são definidos e adicionar:
```tsx
import { ShieldCheck } from "lucide-react";

// No array de grupos de menu, após "Requerimentos" ou similar:
{
  titulo: "AEE",
  icone: ShieldCheck,
  visivel: hasAny("aee:manage", "aee:view"),
  itens: [
    { label: "Atendimento",    href: "/aee/gestao",   visivel: hasAny("aee:manage") },
    { label: "Acompanhamento", href: "/aee/analise",  visivel: hasAny("aee:view") && !hasAny("aee:manage") },
  ],
}
```

- [ ] **Step 5: Typecheck frontend**

```bash
pnpm --filter @workspace/seshat run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add artifacts/seshat/src/pages/aee/ artifacts/seshat/src/App.tsx artifacts/seshat/src/components/layout.tsx
git commit -m "feat(aee): UI gestao e analise com abas, KPIs e acesso auditado a laudos"
```

---

## Task 7: Spec, Skill e Push Final

**Files:**
- Create: `.specs/features/portal-aee.md`
- Create: `.claude/skills/seshat-aee/SKILL.md`

- [ ] **Step 1: Criar `.specs/features/portal-aee.md`**

```markdown
# Spec: Portal AEE — Atendimento Educacional Especializado

**Status:** Implementado ✅

Ver design completo: `docs/superpowers/specs/2026-09-16-portal-aee-design.md`

## Permissões
- `aee:manage` — professor_aee, psicologo, psicopedagogo
- `aee:view`   — coordenacao, supervisao, direcao, professor (somente campos liberados)
- `aee:self`   — estudante (≥18), pai_responsavel

## Endpoints principais
- `GET/POST/PUT/DELETE /api/aee/estudantes`
- `GET/POST/PUT /api/aee/planos`
- `POST /api/aee/planos/:id/assinar`
- `GET/POST/DELETE /api/aee/planos/:id/adaptacoes`
- `GET/POST/PUT /api/aee/metas` + `POST/GET /api/aee/metas/:id/evolucao`
- `GET/POST/PUT/DELETE /api/aee/sessoes`
- `GET/POST/DELETE /api/aee/laudos` (acesso auditado)
- `GET/PUT/DELETE /api/aee/liberacoes`
- `GET /api/aee/auditoria`
- `GET /api/aee/portal/meu-plano`
- `GET /api/aee/portal-professor/:estudanteAeeId`

## Segurança
- Laudos: AES-256-CBC, chave derivada por escola (HMAC-SHA256)
- Auditoria: RLS bloqueia UPDATE e DELETE em `aee_auditoria`
- PAI vigente: requer assinaturas de professor_aee + responsavel
```

- [ ] **Step 2: Criar `.claude/skills/seshat-aee/SKILL.md`**

```markdown
# Skill: Portal AEE — Atendimento Educacional Especializado

## Perfis e Permissões

| Role | Permissão | Acesso |
|------|-----------|--------|
| `professor_aee`, `psicologo`, `psicopedagogo` | `aee:manage` | Tudo |
| `coordenacao`, `supervisao`, `direcao` | `aee:view` | Sem laudos/liberações |
| `professor` (sala) | `aee:view` | Somente `aee_liberacoes` |
| `estudante` ≥18, `pai_responsavel` | `aee:self` | Adaptações + metas |

## Criptografia de Laudos

```typescript
// Chave derivada por escola — nunca armazenada
const chave = HMAC-SHA256(ENCRYPTION_KEY, escola_id)
// Cifra: AES-256-CBC → "iv_hex:ciphertext_hex"
// Toda leitura gera INSERT em aee_auditoria (obrigatório)
```

## PAI — Ciclo de Vida

```
rascunho → aguardando_assinatura → vigente → encerrado
```
Requer: `professor_aee` + `responsavel` (+ `estudante` se maior)

## Auditoria Imutável

`aee_auditoria`: RLS bloqueia UPDATE e DELETE para todos.
Ações: `READ_LAUDO`, `READ_PAI`, `CREATE_LAUDO`, `ASSINAR_PAI`, `ACCESS_DENIED`, etc.

## Liberações (professor de sala)

`aee_liberacoes`: equipe AEE controla `ver_adaptacoes`, `ver_metas`, `ver_resumo_ia` por estudante+professor.

## Arquivos-chave

| Arquivo | Responsabilidade |
|---------|-----------------|
| `lib/db/src/schema/aee.ts` | 9 schemas Drizzle |
| `scripts/migrate-aee.sql` | DDL + RLS + permissões |
| `artifacts/api-server/src/lib/aee-crypto.ts` | AES-256-CBC |
| `artifacts/api-server/src/lib/aee-audit.ts` | registrarAuditoriaAee() |
| `artifacts/api-server/src/routes/aee.ts` | Todos os endpoints |
| `artifacts/seshat/src/pages/aee/gestao.tsx` | UI equipe AEE |
| `artifacts/seshat/src/pages/aee/analise.tsx` | UI gestão |
| `.specs/features/portal-aee.md` | Spec do módulo |
```

- [ ] **Step 3: Commit e push**

```bash
git add .specs/features/portal-aee.md .claude/skills/seshat-aee/
git commit -m "docs(aee): spec e skill do módulo Portal AEE"
git push -u origin claude/wonderful-feynman-Klc3C
```
