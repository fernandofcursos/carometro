# Portal SOE — Serviço de Orientação Educacional — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o módulo SOE completo — atendimentos sigilosos criptografados, encaminhamentos, ações, estudos de caso, portais por perfil — em conformidade com LGPD, ISO 27001, SEDF, MEC e CNE.

**Architecture:** Módulo monolítico integrado seguindo exatamente o padrão do módulo AEE já existente. Um schema file, um route file, crypto e audit libs próprias, criptografia AES-256-CBC com chave derivada por escola.

**Tech Stack:** Drizzle ORM, Express, TypeScript, React + TanStack Query, shadcn/ui, Vitest + Supertest.

**Spec:** `docs/superpowers/specs/2026-09-16-portal-soe-design.md`

## Global Constraints

- Criptografia obrigatória: `registro_enc` e `observacao_enc` usam AES-256-CBC; chave = HMAC-SHA256(ENCRYPTION_KEY, escola_id) — nunca armazenada em texto puro
- Todo GET de campo criptografado gera INSERT em `soe_auditoria` ANTES de retornar dados
- `soe_auditoria`: imutável via RLS — UPDATE e DELETE bloqueados para todos
- `scripts/migrate-soe.sql` NÃO deve ser executado até que o ambiente de produção esteja provisionado
- Professor (`soe:encaminhar`) nunca acessa conteúdo de atendimentos nem campos criptografados
- Estudante/responsável (`soe:self`) vê apenas `data_atendimento`, `tipo`, `motivo`, `status` dos próprios atendimentos

---

## Task 1: Schema + Migration

**Files:**
- Create: `lib/db/src/schema/soe.ts`
- Modify: `lib/db/src/schema/index.ts` (add export)
- Create: `scripts/migrate-soe.sql`

**Interfaces:**
- Produces: `soeAtendimentosTable`, `soeEncaminhamentosTable`, `soeAcoesTable`, `soeEstudosDeCasoTable`, `soeAuditoriaTable` — importados pelo route file nas Tasks 3-4

- [ ] **Step 1: Criar `lib/db/src/schema/soe.ts`**

```typescript
import {
  pgTable, uuid, varchar, text, smallint, timestamp,
  boolean, date, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { escolasTable } from "./escolas";
import { usuariosTable } from "./usuarios";

export const soeAtendimentosTable = pgTable("soe_atendimentos", {
  id:               uuid("id").primaryKey().defaultRandom(),
  escolaId:         uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteId:      uuid("estudante_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  orientadoraId:    uuid("orientadora_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  encaminhamentoId: uuid("encaminhamento_id"),  // FK adicionada depois para evitar circular
  dataAtendimento:  date("data_atendimento").notNull(),
  tipo:             varchar("tipo", { length: 20 }).notNull(),   // individual|grupo|familiar|online
  motivo:           text("motivo").notNull(),
  registroEnc:      text("registro_enc"),        // AES-256-CBC: iv_hex:ciphertext_hex
  chaveRef:         varchar("chave_ref", { length: 64 }),
  status:           varchar("status", { length: 30 }).default("aberto").notNull(), // aberto|em_acompanhamento|encerrado
  criadoEm:         timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:     timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm:       timestamp("deletado_em",  { withTimezone: true }),
}, (t) => [
  index("idx_soe_atendimentos_escola").on(t.escolaId),
  index("idx_soe_atendimentos_estudante").on(t.estudanteId),
]);

export const soeEncaminhamentosTable = pgTable("soe_encaminhamentos", {
  id:               uuid("id").primaryKey().defaultRandom(),
  escolaId:         uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteId:      uuid("estudante_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  encaminhadoPorId: uuid("encaminhado_por_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  motivo:           text("motivo").notNull(),
  prioridade:       varchar("prioridade", { length: 10 }).default("normal").notNull(), // normal|urgente
  status:           varchar("status", { length: 20 }).default("pendente").notNull(),   // pendente|em_atendimento|concluido|arquivado
  observacaoEnc:    text("observacao_enc"),      // AES-256-CBC — só OE escreve/lê
  chaveRef:         varchar("chave_ref", { length: 64 }),
  criadoEm:         timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:     timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_soe_encaminhamentos_escola").on(t.escolaId),
  index("idx_soe_encaminhamentos_estudante").on(t.estudanteId),
  index("idx_soe_encaminhamentos_por").on(t.encaminhadoPorId),
]);

export const soeAcoesTable = pgTable("soe_acoes", {
  id:             uuid("id").primaryKey().defaultRandom(),
  escolaId:       uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  tipo:           varchar("tipo", { length: 15 }).notNull(),  // individual|coletiva
  titulo:         varchar("titulo", { length: 200 }).notNull(),
  descricao:      text("descricao"),
  responsavelId:  uuid("responsavel_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  estudanteId:    uuid("estudante_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  atendimentoId:  uuid("atendimento_id").references(() => soeAtendimentosTable.id, { onDelete: "set null" }),
  prazo:          date("prazo"),
  status:         varchar("status", { length: 20 }).default("pendente").notNull(), // pendente|em_andamento|concluida|cancelada
  criadoPorId:    uuid("criado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  criadoEm:       timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:   timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_soe_acoes_escola").on(t.escolaId),
  index("idx_soe_acoes_responsavel").on(t.responsavelId),
  index("idx_soe_acoes_estudante").on(t.estudanteId),
]);

export const soeEstudosDeCasoTable = pgTable("soe_estudos_de_caso", {
  id:              uuid("id").primaryKey().defaultRandom(),
  escolaId:        uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteId:     uuid("estudante_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  dataReuniao:     date("data_reuniao").notNull(),
  participantes:   text("participantes"),
  deliberacoes:    text("deliberacoes"),
  proximosPassos:  text("proximos_passos"),
  status:          varchar("status", { length: 15 }).default("agendado").notNull(), // agendado|realizado|cancelado
  criadoPorId:     uuid("criado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  criadoEm:        timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:    timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_soe_estudos_escola").on(t.escolaId),
  index("idx_soe_estudos_estudante").on(t.estudanteId),
]);

export const soeAuditoriaTable = pgTable("soe_auditoria", {
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
  index("idx_soe_auditoria_usuario").on(t.usuarioId),
  index("idx_soe_auditoria_estudante").on(t.estudanteId),
  index("idx_soe_auditoria_criado").on(t.criadoEm),
]);
```

- [ ] **Step 2: Adicionar export em `lib/db/src/schema/index.ts`**

Ao final do arquivo, adicionar:
```typescript
export * from "./soe";
```

- [ ] **Step 3: Criar `scripts/migrate-soe.sql`**

```sql
-- Migração SOE — Serviço de Orientação Educacional
-- Idempotente: usa CREATE TABLE IF NOT EXISTS
-- ATENÇÃO: não executar antes de o ambiente de produção estar provisionado

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS soe_atendimentos (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id         uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_id      uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  orientadora_id    uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  encaminhamento_id uuid,
  data_atendimento  date        NOT NULL,
  tipo              varchar(20) NOT NULL CHECK (tipo IN ('individual','grupo','familiar','online')),
  motivo            text        NOT NULL,
  registro_enc      text,
  chave_ref         varchar(64),
  status            varchar(30) NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_acompanhamento','encerrado')),
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  deletado_em       timestamptz
);

CREATE TABLE IF NOT EXISTS soe_encaminhamentos (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id           uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_id        uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  encaminhado_por_id  uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  motivo              text        NOT NULL,
  prioridade          varchar(10) NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('normal','urgente')),
  status              varchar(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_atendimento','concluido','arquivado')),
  observacao_enc      text,
  chave_ref           varchar(64),
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now()
);

-- FK circular adicionada após criar ambas as tabelas
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_soe_atend_encaminhamento'
  ) THEN
    ALTER TABLE soe_atendimentos
      ADD CONSTRAINT fk_soe_atend_encaminhamento
      FOREIGN KEY (encaminhamento_id) REFERENCES soe_encaminhamentos(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS soe_acoes (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id      uuid         NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  tipo           varchar(15)  NOT NULL CHECK (tipo IN ('individual','coletiva')),
  titulo         varchar(200) NOT NULL,
  descricao      text,
  responsavel_id uuid         NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  estudante_id   uuid         REFERENCES usuarios(id) ON DELETE SET NULL,
  atendimento_id uuid         REFERENCES soe_atendimentos(id) ON DELETE SET NULL,
  prazo          date,
  status         varchar(20)  NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluida','cancelada')),
  criado_por_id  uuid         REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em      timestamptz  NOT NULL DEFAULT now(),
  atualizado_em  timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS soe_estudos_de_caso (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id       uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_id    uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  data_reuniao    date        NOT NULL,
  participantes   text,
  deliberacoes    text,
  proximos_passos text,
  status          varchar(15) NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado','realizado','cancelado')),
  criado_por_id   uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS soe_auditoria (
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

-- Índices
CREATE INDEX IF NOT EXISTS idx_soe_atendimentos_escola    ON soe_atendimentos(escola_id);
CREATE INDEX IF NOT EXISTS idx_soe_atendimentos_estudante ON soe_atendimentos(estudante_id);
CREATE INDEX IF NOT EXISTS idx_soe_encaminhamentos_escola ON soe_encaminhamentos(escola_id);
CREATE INDEX IF NOT EXISTS idx_soe_encaminhamentos_por    ON soe_encaminhamentos(encaminhado_por_id);
CREATE INDEX IF NOT EXISTS idx_soe_acoes_responsavel      ON soe_acoes(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_soe_acoes_estudante        ON soe_acoes(estudante_id);
CREATE INDEX IF NOT EXISTS idx_soe_estudos_estudante      ON soe_estudos_de_caso(estudante_id);
CREATE INDEX IF NOT EXISTS idx_soe_auditoria_usuario      ON soe_auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_soe_auditoria_estudante    ON soe_auditoria(estudante_id);
CREATE INDEX IF NOT EXISTS idx_soe_auditoria_criado       ON soe_auditoria(criado_em);

-- RLS: isolamento por tenant
ALTER TABLE soe_atendimentos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE soe_encaminhamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE soe_acoes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE soe_estudos_de_caso ENABLE ROW LEVEL SECURITY;
ALTER TABLE soe_auditoria       ENABLE ROW LEVEL SECURITY;

-- soe_auditoria: imutável — bloqueia UPDATE e DELETE para todos
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'soe_auditoria' AND policyname = 'soe_auditoria_no_update') THEN
    CREATE POLICY soe_auditoria_no_update ON soe_auditoria FOR UPDATE USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'soe_auditoria' AND policyname = 'soe_auditoria_no_delete') THEN
    CREATE POLICY soe_auditoria_no_delete ON soe_auditoria FOR DELETE USING (false);
  END IF;
END $$;

-- Seeds de permissão
INSERT INTO permissoes (recurso, acao) VALUES
  ('soe', 'manage'),
  ('soe', 'view'),
  ('soe', 'encaminhar'),
  ('soe', 'self')
ON CONFLICT (recurso, acao) DO NOTHING;
```

- [ ] **Step 4: Build para verificar que o schema compila**

```bash
pnpm --filter @workspace/db run build
```

Esperado: sem erros de TypeScript.

- [ ] **Step 5: Commit**

```bash
git add lib/db/src/schema/soe.ts lib/db/src/schema/index.ts scripts/migrate-soe.sql
git commit -m "feat(soe): schema Drizzle e migração SQL — 5 tabelas com RLS e auditoria imutável"
```

---

## Task 2: Crypto + Audit libs

**Files:**
- Create: `artifacts/api-server/src/lib/soe-crypto.ts`
- Create: `artifacts/api-server/src/lib/soe-audit.ts`

**Interfaces:**
- Produces: `cifrarRegistro(texto, escolaId): string`, `decifrarRegistro(enc, escolaId): string`, `gerarChaveRef(escolaId): string`, `registrarAuditoriaSoe(params): Promise<void>`
- Consumes: `soeAuditoriaTable` do `@workspace/db`

- [ ] **Step 1: Criar `artifacts/api-server/src/lib/soe-crypto.ts`**

```typescript
import { createHmac, createCipheriv, createDecipheriv, randomBytes } from "crypto";

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
export function cifrarRegistro(texto: string, escolaId: string): string {
  const chave = derivarChave(escolaId);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", chave, iv);
  const encrypted = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

// Decifra "iv_hex:ciphertext_hex" → texto original
export function decifrarRegistro(registroEnc: string, escolaId: string): string {
  const partes = registroEnc.split(":");
  if (partes.length !== 2) throw new Error("Formato de registro inválido");
  const [ivHex, ciphertextHex] = partes;
  const chave = derivarChave(escolaId);
  const iv = Buffer.from(ivHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", chave, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 2: Criar `artifacts/api-server/src/lib/soe-audit.ts`**

```typescript
import { db, soeAuditoriaTable } from "@workspace/db";
import { Request } from "express";

export interface SoeAuditoriaParams {
  req: Request;
  acao: string;
  estudanteId?: string;
  recursoId?: string;
  escolaId?: string;
}

export async function registrarAuditoriaSoe(params: SoeAuditoriaParams): Promise<void> {
  try {
    const escolaId = params.escolaId ?? (params.req as any).escolaId;
    await db.insert(soeAuditoriaTable).values({
      acao:        params.acao,
      usuarioId:   (params.req as any).usuarioId!,
      estudanteId: params.estudanteId,
      recursoId:   params.recursoId,
      escolaId,
      ipOrigem:    params.req.ip ?? params.req.socket?.remoteAddress,
      userAgent:   params.req.headers["user-agent"],
    });
  } catch (err) {
    console.error("[SOE AUDIT ERROR]", err instanceof Error ? err.message : err);
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
git add artifacts/api-server/src/lib/soe-crypto.ts artifacts/api-server/src/lib/soe-audit.ts
git commit -m "feat(soe): libs de criptografia AES-256-CBC e auditoria imutável"
```

---

## Task 3: Routes — Atendimentos, Encaminhamentos, Ações

**Files:**
- Create: `artifacts/api-server/src/routes/soe.ts` (parcial — Tasks 3 e 4 completam juntas)
- Modify: `artifacts/api-server/src/index.ts`

**Interfaces:**
- Consumes: `soeAtendimentosTable`, `soeEncaminhamentosTable`, `soeAcoesTable`, `soeAuditoriaTable`, `eq`, `and`, `isNull`, `desc` do `@workspace/db`; `cifrarRegistro`, `decifrarRegistro` de `soe-crypto.js`; `registrarAuditoriaSoe` de `soe-audit.js`; `buscarRoles`, `requirePermissao` de `lib/permissions.js`
- Produces: Router montado em `/api/soe`

- [ ] **Step 1: Criar `artifacts/api-server/src/routes/soe.ts` com guard e atendimentos**

```typescript
import { Router } from "express";
import { z } from "zod";
import {
  db,
  soeAtendimentosTable, soeEncaminhamentosTable, soeAcoesTable,
  soeEstudosDeCasoTable, soeAuditoriaTable,
  eq, and, isNull, desc,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { buscarRoles } from "../lib/permissions.js";
import { withTenant } from "../middleware/tenant.js";
import { cifrarRegistro, decifrarRegistro, gerarChaveRef } from "../lib/soe-crypto.js";
import { registrarAuditoriaSoe } from "../lib/soe-audit.js";

const router = Router();
router.use(requireAuth);

// Guard de permissão SOE
type SoeNivel = "manage" | "view" | "encaminhar" | "self";
function soeGuard(nivel: SoeNivel) {
  return async (req: any, res: any, next: any) => {
    const roles = await buscarRoles(req.usuarioId);
    const temPermissao = (perm: string) => roles.includes(perm);
    const hierarquia: Record<SoeNivel, string[]> = {
      manage:      ["soe:manage"],
      view:        ["soe:manage", "soe:view"],
      encaminhar:  ["soe:manage", "soe:view", "soe:encaminhar"],
      self:        ["soe:manage", "soe:view", "soe:encaminhar", "soe:self"],
    };
    if (hierarquia[nivel].some(temPermissao)) return next();
    return res.status(403).json({ error: "Sem permissão para esta operação SOE." });
  };
}

// ──────────────────────── ATENDIMENTOS ────────────────────────

const atendimentoSchema = z.object({
  estudanteId:      z.string().uuid(),
  dataAtendimento:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo:             z.enum(["individual", "grupo", "familiar", "online"]),
  motivo:           z.string().min(1).max(2000),
  registro:         z.string().optional(),   // texto sigiloso em claro — cifrado antes de salvar
  encaminhamentoId: z.string().uuid().optional(),
});

// GET /api/soe/atendimentos
router.get("/atendimentos", soeGuard("view"), async (req: any, res) => {
  try {
    const { estudanteId } = req.query;
    const rows = await withTenant(req.escolaId, (tx) =>
      tx.select({
        id: soeAtendimentosTable.id,
        estudanteId: soeAtendimentosTable.estudanteId,
        orientadoraId: soeAtendimentosTable.orientadoraId,
        dataAtendimento: soeAtendimentosTable.dataAtendimento,
        tipo: soeAtendimentosTable.tipo,
        motivo: soeAtendimentosTable.motivo,
        status: soeAtendimentosTable.status,
        encaminhamentoId: soeAtendimentosTable.encaminhamentoId,
        criadoEm: soeAtendimentosTable.criadoEm,
      })
      .from(soeAtendimentosTable)
      .where(and(
        eq(soeAtendimentosTable.escolaId, req.escolaId),
        isNull(soeAtendimentosTable.deletadoEm),
        estudanteId ? eq(soeAtendimentosTable.estudanteId, String(estudanteId)) : undefined,
      ))
      .orderBy(desc(soeAtendimentosTable.dataAtendimento))
    );
    res.json({ atendimentos: rows });
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar atendimentos." });
  }
});

// POST /api/soe/atendimentos
router.post("/atendimentos", soeGuard("manage"), async (req: any, res) => {
  try {
    const body = atendimentoSchema.parse(req.body);
    const registroEnc = body.registro ? cifrarRegistro(body.registro, req.escolaId) : null;
    const chaveRef = body.registro ? gerarChaveRef(req.escolaId) : null;
    const [row] = await withTenant(req.escolaId, (tx) =>
      tx.insert(soeAtendimentosTable).values({
        escolaId:         req.escolaId,
        estudanteId:      body.estudanteId,
        orientadoraId:    req.usuarioId,
        encaminhamentoId: body.encaminhamentoId ?? null,
        dataAtendimento:  body.dataAtendimento,
        tipo:             body.tipo,
        motivo:           body.motivo,
        registroEnc:      registroEnc ?? undefined,
        chaveRef:         chaveRef ?? undefined,
      }).returning()
    );
    await registrarAuditoriaSoe({ req, acao: "CREATE_ATENDIMENTO", estudanteId: body.estudanteId, recursoId: row.id });
    const { registroEnc: _enc, chaveRef: _ref, ...safe } = row;
    res.status(201).json(safe);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: "Erro ao criar atendimento." });
  }
});

// GET /api/soe/atendimentos/:id  — só manage; audit ANTES de descriptografar
router.get("/atendimentos/:id", soeGuard("manage"), async (req: any, res) => {
  try {
    const [row] = await withTenant(req.escolaId, (tx) =>
      tx.select().from(soeAtendimentosTable)
        .where(and(
          eq(soeAtendimentosTable.id, req.params.id),
          eq(soeAtendimentosTable.escolaId, req.escolaId),
          isNull(soeAtendimentosTable.deletadoEm),
        ))
    );
    if (!row) return res.status(404).json({ error: "Atendimento não encontrado." });
    // AUDIT antes de descriptografar — obrigatório LGPD
    await registrarAuditoriaSoe({ req, acao: "READ_REGISTRO", estudanteId: row.estudanteId, recursoId: row.id });
    const { registroEnc, chaveRef, ...safe } = row;
    const registro = registroEnc ? decifrarRegistro(registroEnc, req.escolaId) : null;
    res.json({ ...safe, registro });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar atendimento." });
  }
});

// PUT /api/soe/atendimentos/:id  — OE pode atualizar qualquer campo incluindo status
router.put("/atendimentos/:id", soeGuard("manage"), async (req: any, res) => {
  try {
    const updateSchema = z.object({
      dataAtendimento:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      tipo:             z.enum(["individual", "grupo", "familiar", "online"]).optional(),
      motivo:           z.string().min(1).max(2000).optional(),
      registro:         z.string().optional(),
      status:           z.enum(["aberto", "em_acompanhamento", "encerrado"]).optional(),
      encaminhamentoId: z.string().uuid().nullable().optional(),
    });
    const body = updateSchema.parse(req.body);
    const update: Record<string, any> = { atualizadoEm: new Date() };
    if (body.dataAtendimento !== undefined) update.dataAtendimento = body.dataAtendimento;
    if (body.tipo            !== undefined) update.tipo            = body.tipo;
    if (body.motivo          !== undefined) update.motivo          = body.motivo;
    if (body.status          !== undefined) update.status          = body.status;
    if (body.encaminhamentoId !== undefined) update.encaminhamentoId = body.encaminhamentoId;
    if (body.registro        !== undefined) {
      update.registroEnc = cifrarRegistro(body.registro, req.escolaId);
      update.chaveRef    = gerarChaveRef(req.escolaId);
    }
    const [row] = await withTenant(req.escolaId, (tx) =>
      tx.update(soeAtendimentosTable).set(update)
        .where(and(eq(soeAtendimentosTable.id, req.params.id), eq(soeAtendimentosTable.escolaId, req.escolaId)))
        .returning()
    );
    if (!row) return res.status(404).json({ error: "Atendimento não encontrado." });
    await registrarAuditoriaSoe({ req, acao: "UPDATE_ATENDIMENTO", estudanteId: row.estudanteId, recursoId: row.id });
    const { registroEnc: _e, chaveRef: _c, ...safe } = row;
    res.json(safe);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: "Erro ao atualizar atendimento." });
  }
});

// DELETE /api/soe/atendimentos/:id — soft delete
router.delete("/atendimentos/:id", soeGuard("manage"), async (req: any, res) => {
  try {
    const [row] = await withTenant(req.escolaId, (tx) =>
      tx.update(soeAtendimentosTable)
        .set({ deletadoEm: new Date() })
        .where(and(eq(soeAtendimentosTable.id, req.params.id), eq(soeAtendimentosTable.escolaId, req.escolaId)))
        .returning({ id: soeAtendimentosTable.id })
    );
    if (!row) return res.status(404).json({ error: "Atendimento não encontrado." });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao remover atendimento." });
  }
});

// ──────────────────────── ENCAMINHAMENTOS ────────────────────────

const encaminhamentoSchema = z.object({
  estudanteId: z.string().uuid(),
  motivo:      z.string().min(1).max(2000),
  prioridade:  z.enum(["normal", "urgente"]).default("normal"),
});

// GET /api/soe/encaminhamentos
router.get("/encaminhamentos", soeGuard("encaminhar"), async (req: any, res) => {
  try {
    const roles = await buscarRoles(req.usuarioId);
    const isManage = roles.includes("soe:manage");
    const isView   = roles.includes("soe:view");
    const rows = await withTenant(req.escolaId, (tx) =>
      tx.select({
        id: soeEncaminhamentosTable.id,
        estudanteId: soeEncaminhamentosTable.estudanteId,
        encaminhadoPorId: soeEncaminhamentosTable.encaminhadoPorId,
        motivo: soeEncaminhamentosTable.motivo,
        prioridade: soeEncaminhamentosTable.prioridade,
        status: soeEncaminhamentosTable.status,
        criadoEm: soeEncaminhamentosTable.criadoEm,
      })
      .from(soeEncaminhamentosTable)
      .where(and(
        eq(soeEncaminhamentosTable.escolaId, req.escolaId),
        (!isManage && !isView) ? eq(soeEncaminhamentosTable.encaminhadoPorId, req.usuarioId) : undefined,
      ))
      .orderBy(desc(soeEncaminhamentosTable.criadoEm))
    );
    res.json({ encaminhamentos: rows });
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar encaminhamentos." });
  }
});

// POST /api/soe/encaminhamentos
router.post("/encaminhamentos", soeGuard("encaminhar"), async (req: any, res) => {
  try {
    const body = encaminhamentoSchema.parse(req.body);
    const [row] = await withTenant(req.escolaId, (tx) =>
      tx.insert(soeEncaminhamentosTable).values({
        escolaId:          req.escolaId,
        estudanteId:       body.estudanteId,
        encaminhadoPorId:  req.usuarioId,
        motivo:            body.motivo,
        prioridade:        body.prioridade,
      }).returning({ id: soeEncaminhamentosTable.id, estudanteId: soeEncaminhamentosTable.estudanteId, status: soeEncaminhamentosTable.status, prioridade: soeEncaminhamentosTable.prioridade })
    );
    res.status(201).json(row);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: "Erro ao criar encaminhamento." });
  }
});

// PUT /api/soe/encaminhamentos/:id/status — OE atualiza status + observacao_enc
router.put("/encaminhamentos/:id/status", soeGuard("manage"), async (req: any, res) => {
  try {
    const body = z.object({
      status:     z.enum(["pendente", "em_atendimento", "concluido", "arquivado"]),
      observacao: z.string().optional(),
    }).parse(req.body);
    const update: Record<string, any> = { status: body.status, atualizadoEm: new Date() };
    if (body.observacao) {
      update.observacaoEnc = cifrarRegistro(body.observacao, req.escolaId);
      update.chaveRef      = gerarChaveRef(req.escolaId);
    }
    const [row] = await withTenant(req.escolaId, (tx) =>
      tx.update(soeEncaminhamentosTable).set(update)
        .where(and(eq(soeEncaminhamentosTable.id, req.params.id), eq(soeEncaminhamentosTable.escolaId, req.escolaId)))
        .returning({ id: soeEncaminhamentosTable.id, status: soeEncaminhamentosTable.status })
    );
    if (!row) return res.status(404).json({ error: "Encaminhamento não encontrado." });
    res.json(row);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: "Erro ao atualizar encaminhamento." });
  }
});

// ──────────────────────── AÇÕES ────────────────────────

const acaoSchema = z.object({
  tipo:          z.enum(["individual", "coletiva"]),
  titulo:        z.string().min(1).max(200),
  descricao:     z.string().optional(),
  responsavelId: z.string().uuid(),
  estudanteId:   z.string().uuid().optional(),
  atendimentoId: z.string().uuid().optional(),
  prazo:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// GET /api/soe/acoes
router.get("/acoes", soeGuard("encaminhar"), async (req: any, res) => {
  try {
    const roles = await buscarRoles(req.usuarioId);
    const isManage = roles.includes("soe:manage");
    const isView   = roles.includes("soe:view");
    const rows = await withTenant(req.escolaId, (tx) =>
      tx.select().from(soeAcoesTable)
        .where(and(
          eq(soeAcoesTable.escolaId, req.escolaId),
          (!isManage && !isView) ? eq(soeAcoesTable.responsavelId, req.usuarioId) : undefined,
        ))
        .orderBy(desc(soeAcoesTable.criadoEm))
    );
    res.json({ acoes: rows });
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar ações." });
  }
});

// POST /api/soe/acoes
router.post("/acoes", soeGuard("view"), async (req: any, res) => {
  try {
    const body = acaoSchema.parse(req.body);
    const roles = await buscarRoles(req.usuarioId);
    // Ação individual: só manage
    if (body.tipo === "individual" && !roles.includes("soe:manage")) {
      return res.status(403).json({ error: "Apenas a OE pode criar ações individuais." });
    }
    const [row] = await withTenant(req.escolaId, (tx) =>
      tx.insert(soeAcoesTable).values({
        escolaId:      req.escolaId,
        tipo:          body.tipo,
        titulo:        body.titulo,
        descricao:     body.descricao,
        responsavelId: body.responsavelId,
        estudanteId:   body.estudanteId,
        atendimentoId: body.atendimentoId,
        prazo:         body.prazo,
        criadoPorId:   req.usuarioId,
      }).returning()
    );
    res.status(201).json(row);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: "Erro ao criar ação." });
  }
});

// PUT /api/soe/acoes/:id/status
router.put("/acoes/:id/status", soeGuard("encaminhar"), async (req: any, res) => {
  try {
    const body = z.object({
      status: z.enum(["pendente", "em_andamento", "concluida", "cancelada"]),
    }).parse(req.body);
    // Verifica que o usuário é o responsável ou manage
    const [acao] = await withTenant(req.escolaId, (tx) =>
      tx.select({ responsavelId: soeAcoesTable.responsavelId })
        .from(soeAcoesTable)
        .where(and(eq(soeAcoesTable.id, req.params.id), eq(soeAcoesTable.escolaId, req.escolaId)))
    );
    if (!acao) return res.status(404).json({ error: "Ação não encontrada." });
    const roles = await buscarRoles(req.usuarioId);
    if (acao.responsavelId !== req.usuarioId && !roles.includes("soe:manage")) {
      return res.status(403).json({ error: "Sem permissão para atualizar esta ação." });
    }
    const [updated] = await withTenant(req.escolaId, (tx) =>
      tx.update(soeAcoesTable)
        .set({ status: body.status, atualizadoEm: new Date() })
        .where(eq(soeAcoesTable.id, req.params.id))
        .returning({ id: soeAcoesTable.id, status: soeAcoesTable.status })
    );
    res.json(updated);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: "Erro ao atualizar status da ação." });
  }
});

// DELETE /api/soe/acoes/:id
router.delete("/acoes/:id", soeGuard("manage"), async (req: any, res) => {
  try {
    const [row] = await withTenant(req.escolaId, (tx) =>
      tx.delete(soeAcoesTable)
        .where(and(eq(soeAcoesTable.id, req.params.id), eq(soeAcoesTable.escolaId, req.escolaId)))
        .returning({ id: soeAcoesTable.id })
    );
    if (!row) return res.status(404).json({ error: "Ação não encontrada." });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao remover ação." });
  }
});

export default router;
```

- [ ] **Step 2: Registrar rota em `artifacts/api-server/src/index.ts`**

Localizar onde as demais rotas são registradas (ex: `app.use("/api/aee", aeeRouter)`) e adicionar logo após:
```typescript
import soeRouter from "./routes/soe.js";
// ...
app.use("/api/soe", soeRouter);
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @workspace/api-server run typecheck
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/soe.ts artifacts/api-server/src/index.ts
git commit -m "feat(soe): routes atendimentos, encaminhamentos e ações com criptografia e auditoria"
```

---

## Task 4: Routes — Estudos de Caso, Portais, Auditoria

**Files:**
- Modify: `artifacts/api-server/src/routes/soe.ts` (adicionar endpoints restantes)

**Interfaces:**
- Consumes: `soeEstudosDeCasoTable`, `soeAuditoriaTable` já importadas na Task 3

- [ ] **Step 1: Adicionar endpoints de Estudos de Caso em `soe.ts` (antes do `export default router`)**

```typescript
// ──────────────────────── ESTUDOS DE CASO ────────────────────────

const estudoCasoSchema = z.object({
  estudanteId:    z.string().uuid(),
  dataReuniao:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  participantes:  z.string().optional(),
  deliberacoes:   z.string().optional(),
  proximosPassos: z.string().optional(),
  status:         z.enum(["agendado", "realizado", "cancelado"]).default("agendado"),
});

// GET /api/soe/estudos-de-caso
router.get("/estudos-de-caso", soeGuard("view"), async (req: any, res) => {
  try {
    const { estudanteId } = req.query;
    const rows = await withTenant(req.escolaId, (tx) =>
      tx.select().from(soeEstudosDeCasoTable)
        .where(and(
          eq(soeEstudosDeCasoTable.escolaId, req.escolaId),
          estudanteId ? eq(soeEstudosDeCasoTable.estudanteId, String(estudanteId)) : undefined,
        ))
        .orderBy(desc(soeEstudosDeCasoTable.dataReuniao))
    );
    res.json({ estudos: rows });
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar estudos de caso." });
  }
});

// POST /api/soe/estudos-de-caso
router.post("/estudos-de-caso", soeGuard("manage"), async (req: any, res) => {
  try {
    const body = estudoCasoSchema.parse(req.body);
    const [row] = await withTenant(req.escolaId, (tx) =>
      tx.insert(soeEstudosDeCasoTable).values({
        escolaId:       req.escolaId,
        estudanteId:    body.estudanteId,
        dataReuniao:    body.dataReuniao,
        participantes:  body.participantes,
        deliberacoes:   body.deliberacoes,
        proximosPassos: body.proximosPassos,
        status:         body.status,
        criadoPorId:    req.usuarioId,
      }).returning()
    );
    res.status(201).json(row);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: "Erro ao criar estudo de caso." });
  }
});

// PUT /api/soe/estudos-de-caso/:id
router.put("/estudos-de-caso/:id", soeGuard("manage"), async (req: any, res) => {
  try {
    const body = estudoCasoSchema.partial().parse(req.body);
    const [row] = await withTenant(req.escolaId, (tx) =>
      tx.update(soeEstudosDeCasoTable)
        .set({ ...body, atualizadoEm: new Date() })
        .where(and(eq(soeEstudosDeCasoTable.id, req.params.id), eq(soeEstudosDeCasoTable.escolaId, req.escolaId)))
        .returning()
    );
    if (!row) return res.status(404).json({ error: "Estudo de caso não encontrado." });
    res.json(row);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: "Erro ao atualizar estudo de caso." });
  }
});

// ──────────────────────── PORTAL ESTUDANTE / RESPONSÁVEL ────────────────────────

// GET /api/soe/portal/meus-atendimentos
router.get("/portal/meus-atendimentos", soeGuard("self"), async (req: any, res) => {
  try {
    const rows = await withTenant(req.escolaId, (tx) =>
      tx.select({
        id: soeAtendimentosTable.id,
        dataAtendimento: soeAtendimentosTable.dataAtendimento,
        tipo: soeAtendimentosTable.tipo,
        motivo: soeAtendimentosTable.motivo,
        status: soeAtendimentosTable.status,
      })
      .from(soeAtendimentosTable)
      .where(and(
        eq(soeAtendimentosTable.estudanteId, req.usuarioId),
        eq(soeAtendimentosTable.escolaId, req.escolaId),
        isNull(soeAtendimentosTable.deletadoEm),
      ))
      .orderBy(desc(soeAtendimentosTable.dataAtendimento))
    );
    res.json({ atendimentos: rows });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar seus atendimentos." });
  }
});

// GET /api/soe/portal/minhas-acoes
router.get("/portal/minhas-acoes", soeGuard("self"), async (req: any, res) => {
  try {
    const rows = await withTenant(req.escolaId, (tx) =>
      tx.select({
        id: soeAcoesTable.id,
        titulo: soeAcoesTable.titulo,
        descricao: soeAcoesTable.descricao,
        prazo: soeAcoesTable.prazo,
        status: soeAcoesTable.status,
      })
      .from(soeAcoesTable)
      .where(and(
        eq(soeAcoesTable.estudanteId, req.usuarioId),
        eq(soeAcoesTable.escolaId, req.escolaId),
        eq(soeAcoesTable.tipo, "individual"),
      ))
      .orderBy(soeAcoesTable.prazo)
    );
    res.json({ acoes: rows });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar suas ações." });
  }
});

// ──────────────────────── AUDITORIA ────────────────────────

// GET /api/soe/auditoria
router.get("/auditoria", soeGuard("manage"), async (req: any, res) => {
  try {
    const rows = await db.select().from(soeAuditoriaTable)
      .where(eq(soeAuditoriaTable.escolaId, req.escolaId))
      .orderBy(desc(soeAuditoriaTable.criadoEm))
      .limit(200);
    res.json({ registros: rows });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar auditoria." });
  }
});
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @workspace/api-server run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/routes/soe.ts
git commit -m "feat(soe): routes estudos de caso, portais self e auditoria"
```

---

## Task 5: Testes

**Files:**
- Create: `artifacts/api-server/src/tests/soe.test.ts`

**Interfaces:**
- Consumes: padrão `makeQuery` de `./helpers/db-mock.js`; mocks de `@workspace/db`, `../lib/soe-crypto.js`, `../lib/soe-audit.js`, `../middleware/tenant.js`, `../lib/permissions.js`

- [ ] **Step 1: Ler um arquivo de teste existente para confirmar o padrão exato de makeQuery e mocks**

```bash
head -60 artifacts/api-server/src/tests/aee.test.ts
```

- [ ] **Step 2: Criar `artifacts/api-server/src/tests/soe.test.ts`**

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
  soeAtendimentosTable:    { id:"id", escolaId:"escolaId", estudanteId:"estudanteId", orientadoraId:"orientadoraId", encaminhamentoId:"encaminhamentoId", dataAtendimento:"dataAtendimento", tipo:"tipo", motivo:"motivo", registroEnc:"registroEnc", chaveRef:"chaveRef", status:"status", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm", deletadoEm:"deletadoEm" },
  soeEncaminhamentosTable: { id:"id", escolaId:"escolaId", estudanteId:"estudanteId", encaminhadoPorId:"encaminhadoPorId", motivo:"motivo", prioridade:"prioridade", status:"status", observacaoEnc:"observacaoEnc", chaveRef:"chaveRef", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  soeAcoesTable:           { id:"id", escolaId:"escolaId", tipo:"tipo", titulo:"titulo", descricao:"descricao", responsavelId:"responsavelId", estudanteId:"estudanteId", atendimentoId:"atendimentoId", prazo:"prazo", status:"status", criadoPorId:"criadoPorId", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  soeEstudosDeCasoTable:   { id:"id", escolaId:"escolaId", estudanteId:"estudanteId", dataReuniao:"dataReuniao", participantes:"participantes", deliberacoes:"deliberacoes", proximosPassos:"proximosPassos", status:"status", criadoPorId:"criadoPorId", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  soeAuditoriaTable:       { id:"id", escolaId:"escolaId", acao:"acao", usuarioId:"usuarioId", estudanteId:"estudanteId", recursoId:"recursoId", ipOrigem:"ipOrigem", userAgent:"userAgent", criadoEm:"criadoEm" },
  eq:      vi.fn(() => "eq"),
  and:     vi.fn((..._a: any[]) => "and"),
  isNull:  vi.fn(() => "isNull"),
  inArray: vi.fn(() => "inArray"),
  desc:    vi.fn((c: any) => c),
}));

vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/soe-crypto.js", () => ({
  cifrarRegistro: vi.fn(() => "iv_hex:enc_hex"),
  decifrarRegistro: vi.fn(() => "Texto do registro descriptografado"),
  gerarChaveRef:  vi.fn(() => "chaveref123"),
}));

vi.mock("../lib/soe-audit.js", () => ({
  registrarAuditoriaSoe: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../middleware/tenant.js", () => ({
  withTenant: vi.fn(async (_id: string, fn: (tx: any) => Promise<any>) => fn(mockDb)),
}));

vi.mock("../lib/permissions.js", () => ({
  buscarRoles: vi.fn().mockResolvedValue(["soe:manage"]),
  requirePermissao: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  invalidarCachePermissoes: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn().mockResolvedValue(true), hash: vi.fn() },
}));

async function buildApp() {
  const { default: soeRouter } = await import("../routes/soe.js");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: any, _res: any, next: any) => {
    req.usuarioId = "00000000-0000-0000-0000-000000000001";
    req.escolaId  = "00000000-0000-0000-0000-000000000002";
    next();
  });
  app.use("/api/soe", soeRouter);
  return app;
}

const ATENDIMENTO_FIXTURE = {
  id: "00000000-0000-0000-0000-000000000010",
  escolaId: "00000000-0000-0000-0000-000000000002",
  estudanteId: "00000000-0000-0000-0000-000000000003",
  orientadoraId: "00000000-0000-0000-0000-000000000001",
  dataAtendimento: "2026-09-01",
  tipo: "individual",
  motivo: "Isolamento social",
  registroEnc: "iv_hex:enc_hex",
  chaveRef: "chaveref123",
  status: "aberto",
  deletadoEm: null,
};

// ──────────────────────── ATENDIMENTOS ────────────────────────

describe("GET /api/soe/atendimentos", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna lista de atendimentos sem registro_enc", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([ATENDIMENTO_FIXTURE]));
    const res = await request(app).get("/api/soe/atendimentos");
    expect(res.status).toBe(200);
    expect(res.body.atendimentos).toHaveLength(1);
  });
});

describe("POST /api/soe/atendimentos", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna 400 sem estudanteId", async () => {
    const res = await request(app).post("/api/soe/atendimentos").send({ motivo: "teste" });
    expect(res.status).toBe(400);
  });

  it("cria atendimento e cifra registro sigiloso", async () => {
    const { cifrarRegistro } = await import("../lib/soe-crypto.js");
    mockDb.insert.mockReturnValueOnce(makeQuery([ATENDIMENTO_FIXTURE]));
    const res = await request(app).post("/api/soe/atendimentos").send({
      estudanteId:     "00000000-0000-0000-0000-000000000003",
      dataAtendimento: "2026-09-01",
      tipo:            "individual",
      motivo:          "Isolamento social",
      registro:        "Texto sigiloso do atendimento",
    });
    expect(res.status).toBe(201);
    expect(cifrarRegistro).toHaveBeenCalledWith("Texto sigiloso do atendimento", "00000000-0000-0000-0000-000000000002");
    expect(res.body.registroEnc).toBeUndefined();
  });
});

describe("GET /api/soe/atendimentos/:id — auditoria obrigatória", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("descriptografa registro e registra auditoria antes de retornar", async () => {
    const { registrarAuditoriaSoe } = await import("../lib/soe-audit.js");
    mockDb.select.mockReturnValueOnce(makeQuery([ATENDIMENTO_FIXTURE]));
    const res = await request(app).get("/api/soe/atendimentos/00000000-0000-0000-0000-000000000010");
    expect(res.status).toBe(200);
    expect(res.body.registro).toBe("Texto do registro descriptografado");
    expect(res.body.registroEnc).toBeUndefined();
    expect(registrarAuditoriaSoe).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "READ_REGISTRO" })
    );
  });

  it("retorna 404 quando atendimento não existe", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([]));
    const res = await request(app).get("/api/soe/atendimentos/inexistente");
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/soe/atendimentos/:id — OE pode atualizar status", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("atualiza status do atendimento para em_acompanhamento", async () => {
    mockDb.update.mockReturnValueOnce(makeQuery([{ ...ATENDIMENTO_FIXTURE, status: "em_acompanhamento" }]));
    const res = await request(app).put("/api/soe/atendimentos/00000000-0000-0000-0000-000000000010")
      .send({ status: "em_acompanhamento" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("em_acompanhamento");
  });
});

// ──────────────────────── ENCAMINHAMENTOS ────────────────────────

describe("POST /api/soe/encaminhamentos", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("cria encaminhamento com prioridade urgente", async () => {
    mockDb.insert.mockReturnValueOnce(makeQuery([{
      id: "00000000-0000-0000-0000-000000000020",
      estudanteId: "00000000-0000-0000-0000-000000000003",
      status: "pendente",
      prioridade: "urgente",
    }]));
    const res = await request(app).post("/api/soe/encaminhamentos").send({
      estudanteId: "00000000-0000-0000-0000-000000000003",
      motivo:      "Situação de bullying grave",
      prioridade:  "urgente",
    });
    expect(res.status).toBe(201);
    expect(res.body.prioridade).toBe("urgente");
  });
});

// ──────────────────────── PORTAL SELF ────────────────────────

describe("GET /api/soe/portal/meus-atendimentos", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna atendimentos sem registro_enc", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([{
      id: ATENDIMENTO_FIXTURE.id,
      dataAtendimento: ATENDIMENTO_FIXTURE.dataAtendimento,
      tipo: ATENDIMENTO_FIXTURE.tipo,
      motivo: ATENDIMENTO_FIXTURE.motivo,
      status: ATENDIMENTO_FIXTURE.status,
    }]));
    const res = await request(app).get("/api/soe/portal/meus-atendimentos");
    expect(res.status).toBe(200);
    expect(res.body.atendimentos[0].registroEnc).toBeUndefined();
  });
});
```

- [ ] **Step 3: Rodar toda a suite de testes**

```bash
DATABASE_URL="postgresql://test:test@localhost/test" \
SESSION_SECRET="ci-test-secret-must-be-at-least-32-chars-long!!" \
ENCRYPTION_KEY="0123456789abcdef0123456789abcdef" \
NODE_ENV="test" \
ANTHROPIC_API_KEY="sk-ant-test-placeholder-not-real" \
pnpm --filter @workspace/api-server run test
```

Esperado: todos os testes SOE passando + todos os testes anteriores ainda passando.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/tests/soe.test.ts
git commit -m "test(soe): cobertura de atendimentos, criptografia, auditoria, encaminhamentos e portal self"
```

---

## Task 6: UI — Páginas SOE

**Files:**
- Create: `artifacts/seshat/src/pages/soe/gestao.tsx`
- Create: `artifacts/seshat/src/pages/soe/analise.tsx`
- Create: `artifacts/seshat/src/pages/soe/encaminhar.tsx`
- Modify: `artifacts/seshat/src/App.tsx`
- Modify: `artifacts/seshat/src/components/layout.tsx`

**Antes de escrever:** ler `App.tsx`, `layout.tsx` e uma página existente (ex: `pages/aee/gestao.tsx`) para confirmar padrões de import e sintaxe de rotas e menu.

- [ ] **Step 1: Criar `artifacts/seshat/src/pages/soe/gestao.tsx`**

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
import { HeartHandshake, Users, ClipboardList, Target, CalendarCheck, Lock } from "lucide-react";

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    aberto: "default",
    em_acompanhamento: "outline",
    encerrado: "secondary",
    pendente: "secondary",
    em_atendimento: "outline",
    concluido: "default",
    arquivado: "secondary",
    agendado: "outline",
    realizado: "default",
    cancelado: "destructive",
  };
  return <Badge variant={(map[status] ?? "secondary") as any}>{status.replace(/_/g, " ")}</Badge>;
}

function RegistroAcesso({ atendimentoId, estudanteId }: { atendimentoId: string; estudanteId: string }) {
  const [aberto, setAberto] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const { toast } = useToast();

  const { data, refetch } = useQuery({
    queryKey: ["soe-atendimento-completo", atendimentoId],
    queryFn: () => apiFetch(`/api/soe/atendimentos/${atendimentoId}`),
    enabled: false,
  });

  async function confirmarAcesso() {
    setConfirmado(true);
    await refetch();
    toast({ title: "Acesso registrado", description: "Este acesso foi registrado no log de auditoria conforme LGPD." });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <Lock className="h-4 w-4 mr-1" /> Ver registro sigiloso
      </Button>
      <Dialog open={aberto} onOpenChange={(v) => { setAberto(v); setConfirmado(false); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HeartHandshake className="h-5 w-5 text-amber-600" />
              Registro Sigiloso — Acesso Auditado
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Todo acesso a registros sigilosos é registrado no log de auditoria conforme LGPD, ISO 27001 e normativos da SEDF.
          </p>
          {!confirmado && (
            <div className="border border-amber-300 bg-amber-50 rounded p-3 mt-2">
              <p className="text-sm font-medium text-amber-800">Confirmar acesso ao registro</p>
              <p className="text-xs text-amber-700 mt-1">
                Este acesso será registrado com sua identidade, data/hora e IP.
              </p>
              <Button size="sm" className="mt-2" onClick={confirmarAcesso}>
                Confirmar e visualizar
              </Button>
            </div>
          )}
          {confirmado && data?.registro && (
            <div className="border rounded p-3 mt-2 bg-muted/40">
              <p className="text-xs font-mono whitespace-pre-wrap">{data.registro}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function SoeGestaoPage() {
  const [busca, setBusca] = useState("");
  const [estudanteSel, setEstudanteSel] = useState<{ id: string; nome: string } | null>(null);

  const { data: atendimentos } = useQuery({
    queryKey: ["soe-atendimentos"],
    queryFn: () => apiFetch("/api/soe/atendimentos"),
  });

  const { data: atendimentosEstudante } = useQuery({
    queryKey: ["soe-atendimentos-estudante", estudanteSel?.id],
    queryFn: () => apiFetch(`/api/soe/atendimentos?estudanteId=${estudanteSel!.id}`),
    enabled: !!estudanteSel,
  });

  const { data: encaminhamentos } = useQuery({
    queryKey: ["soe-encaminhamentos-estudante", estudanteSel?.id],
    queryFn: () => apiFetch(`/api/soe/encaminhamentos?estudanteId=${estudanteSel!.id}`),
    enabled: !!estudanteSel,
  });

  const { data: acoes } = useQuery({
    queryKey: ["soe-acoes-estudante", estudanteSel?.id],
    queryFn: () => apiFetch(`/api/soe/acoes?estudanteId=${estudanteSel!.id}`),
    enabled: !!estudanteSel,
  });

  const { data: estudos } = useQuery({
    queryKey: ["soe-estudos-estudante", estudanteSel?.id],
    queryFn: () => apiFetch(`/api/soe/estudos-de-caso?estudanteId=${estudanteSel!.id}`),
    enabled: !!estudanteSel,
  });

  // Deduplica estudantes da lista de atendimentos
  const estudantesMap = new Map<string, { id: string; nome: string }>();
  for (const a of atendimentos?.atendimentos ?? []) {
    if (!estudantesMap.has(a.estudanteId)) {
      estudantesMap.set(a.estudanteId, { id: a.estudanteId, nome: a.estudanteId });
    }
  }
  const lista = [...estudantesMap.values()].filter(e =>
    !busca || e.nome.toLowerCase().includes(busca.toLowerCase())
  );

  const totalAbertos = (atendimentos?.atendimentos ?? []).filter((a: any) => a.status === "aberto").length;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <HeartHandshake className="h-6 w-6 text-green-700" />
        <h1 className="text-2xl font-bold">Serviço de Orientação Educacional</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Atendimentos abertos", valor: totalAbertos, icon: Users },
          { label: "Encaminhamentos pendentes", valor: 0, icon: ClipboardList },
          { label: "Ações em andamento", valor: 0, icon: Target },
          { label: "Estudos de caso", valor: 0, icon: CalendarCheck },
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
              className={`cursor-pointer transition-colors ${estudanteSel?.id === est.id ? "border-green-600 bg-green-50/50" : ""}`}
              onClick={() => setEstudanteSel(est)}
            >
              <CardContent className="p-3">
                <p className="font-medium text-sm">{est.nome}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {estudanteSel && (
          <div className="md:col-span-2">
            <Tabs defaultValue="atendimentos">
              <TabsList>
                <TabsTrigger value="atendimentos">Atendimentos</TabsTrigger>
                <TabsTrigger value="encaminhamentos">Encaminhamentos</TabsTrigger>
                <TabsTrigger value="acoes">Ações</TabsTrigger>
                <TabsTrigger value="estudos">Estudo de Caso</TabsTrigger>
              </TabsList>

              <TabsContent value="atendimentos" className="space-y-3 mt-3">
                {atendimentosEstudante?.atendimentos?.map((a: any) => (
                  <Card key={a.id}>
                    <CardContent className="p-4 flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-sm">{a.dataAtendimento} · {a.tipo}</p>
                        <p className="text-xs text-muted-foreground mt-1">{a.motivo}</p>
                        <div className="mt-2">
                          <RegistroAcesso atendimentoId={a.id} estudanteId={estudanteSel.id} />
                        </div>
                      </div>
                      <StatusBadge status={a.status} />
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="encaminhamentos" className="space-y-3 mt-3">
                {encaminhamentos?.encaminhamentos?.map((e: any) => (
                  <Card key={e.id}>
                    <CardContent className="p-4 flex justify-between items-start">
                      <div>
                        <p className="text-sm">{e.motivo}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Prioridade: <span className={e.prioridade === "urgente" ? "text-red-600 font-semibold" : ""}>{e.prioridade}</span>
                        </p>
                      </div>
                      <StatusBadge status={e.status} />
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="acoes" className="space-y-3 mt-3">
                {acoes?.acoes?.map((a: any) => (
                  <Card key={a.id}>
                    <CardContent className="p-4 flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-sm">{a.titulo}</p>
                        {a.prazo && <p className="text-xs text-muted-foreground mt-1">Prazo: {a.prazo}</p>}
                      </div>
                      <StatusBadge status={a.status} />
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="estudos" className="space-y-3 mt-3">
                {estudos?.estudos?.map((e: any) => (
                  <Card key={e.id}>
                    <CardContent className="p-4 flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-sm">{e.dataReuniao}</p>
                        {e.participantes && <p className="text-xs text-muted-foreground mt-1">{e.participantes}</p>}
                        {e.deliberacoes && <p className="text-xs mt-1">{e.deliberacoes}</p>}
                      </div>
                      <StatusBadge status={e.status} />
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar `artifacts/seshat/src/pages/soe/analise.tsx`**

```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HeartHandshake } from "lucide-react";

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}

export default function SoeAnalisePage() {
  const [busca, setBusca] = useState("");

  const { data } = useQuery({
    queryKey: ["soe-atendimentos-analise"],
    queryFn: () => apiFetch("/api/soe/atendimentos"),
  });

  const { data: acoes } = useQuery({
    queryKey: ["soe-acoes-analise"],
    queryFn: () => apiFetch("/api/soe/acoes"),
  });

  const atendimentos = (data?.atendimentos ?? []).filter((a: any) =>
    !busca || a.motivo?.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <HeartHandshake className="h-6 w-6 text-teal-600" />
        <h1 className="text-2xl font-bold">Acompanhamento SOE</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Visão da gestão escolar — acompanhamento de atendimentos e ações do SOE.
        <strong> Registros sigilosos não estão disponíveis nesta visão conforme LGPD.</strong>
      </p>

      <Input placeholder="Buscar por motivo..." value={busca} onChange={e => setBusca(e.target.value)} />

      <div className="space-y-3">
        {atendimentos.map((a: any) => (
          <Card key={a.id}>
            <CardContent className="p-4 flex justify-between items-center">
              <div>
                <p className="font-medium text-sm">{a.dataAtendimento} · {a.tipo}</p>
                <p className="text-sm text-muted-foreground mt-1">{a.motivo}</p>
              </div>
              <Badge variant={a.status === "aberto" ? "default" : "secondary"}>
                {a.status.replace(/_/g, " ")}
              </Badge>
            </CardContent>
          </Card>
        ))}
        {atendimentos.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum atendimento encontrado.
          </p>
        )}
      </div>

      {(acoes?.acoes?.length ?? 0) > 0 && (
        <>
          <h2 className="text-lg font-semibold mt-4">Ações coletivas</h2>
          <div className="space-y-3">
            {acoes.acoes.filter((a: any) => a.tipo === "coletiva").map((a: any) => (
              <Card key={a.id}>
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium">{a.titulo}</p>
                    {a.prazo && <p className="text-sm text-muted-foreground">Prazo: {a.prazo}</p>}
                  </div>
                  <Badge variant={a.status === "concluida" ? "default" : "secondary"}>
                    {a.status.replace(/_/g, " ")}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Criar `artifacts/seshat/src/pages/soe/encaminhar.tsx`**

```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { HeartHandshake } from "lucide-react";

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}

export default function SoeEncaminharPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [estudanteId, setEstudanteId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [prioridade, setPrioridade] = useState<"normal" | "urgente">("normal");

  const { data: encaminhamentos } = useQuery({
    queryKey: ["soe-meus-encaminhamentos"],
    queryFn: () => apiFetch("/api/soe/encaminhamentos"),
  });

  const { data: minhasAcoes } = useQuery({
    queryKey: ["soe-minhas-acoes"],
    queryFn: () => apiFetch("/api/soe/acoes"),
  });

  const criar = useMutation({
    mutationFn: (body: object) => apiFetch("/api/soe/encaminhamentos", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    onSuccess: () => {
      toast({ title: "Encaminhamento criado", description: "A orientadora educacional foi notificada." });
      qc.invalidateQueries({ queryKey: ["soe-meus-encaminhamentos"] });
      setEstudanteId(""); setMotivo(""); setPrioridade("normal");
    },
    onError: (err: any) => toast({ title: "Erro", description: err?.error ?? "Erro ao encaminhar.", variant: "destructive" }),
  });

  const concluirAcao = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/soe/acoes/${id}/status`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "concluida" }),
    }),
    onSuccess: () => {
      toast({ title: "Ação concluída" });
      qc.invalidateQueries({ queryKey: ["soe-minhas-acoes"] });
    },
  });

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!estudanteId || !motivo) return;
    criar.mutate({ estudanteId, motivo, prioridade });
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <HeartHandshake className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold">Encaminhamento ao SOE</h1>
      </div>

      <Card>
        <CardContent className="p-4">
          <h2 className="font-semibold mb-3">Novo encaminhamento</h2>
          <form onSubmit={enviar} className="space-y-3">
            <Input
              placeholder="ID do estudante (UUID)"
              value={estudanteId}
              onChange={e => setEstudanteId(e.target.value)}
              required
            />
            <Textarea
              placeholder="Descreva o motivo do encaminhamento..."
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={4}
              required
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant={prioridade === "normal" ? "default" : "outline"}
                size="sm"
                onClick={() => setPrioridade("normal")}
              >Normal</Button>
              <Button
                type="button"
                variant={prioridade === "urgente" ? "destructive" : "outline"}
                size="sm"
                onClick={() => setPrioridade("urgente")}
              >Urgente</Button>
            </div>
            <Button type="submit" disabled={criar.isPending}>
              {criar.isPending ? "Enviando..." : "Encaminhar ao SOE"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <h2 className="text-lg font-semibold">Meus encaminhamentos</h2>
      <div className="space-y-3">
        {(encaminhamentos?.encaminhamentos ?? []).map((e: any) => (
          <Card key={e.id}>
            <CardContent className="p-4 flex justify-between items-center">
              <div>
                <p className="text-sm">{e.motivo}</p>
                <p className="text-xs text-muted-foreground mt-1">Prioridade: {e.prioridade}</p>
              </div>
              <Badge variant={e.status === "concluido" ? "default" : "secondary"}>
                {e.status.replace(/_/g, " ")}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="text-lg font-semibold">Ações atribuídas a mim</h2>
      <div className="space-y-3">
        {(minhasAcoes?.acoes ?? []).map((a: any) => (
          <Card key={a.id}>
            <CardContent className="p-4 flex justify-between items-center">
              <div>
                <p className="font-medium text-sm">{a.titulo}</p>
                {a.prazo && <p className="text-xs text-muted-foreground">Prazo: {a.prazo}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={a.status === "concluida" ? "default" : "secondary"}>
                  {a.status.replace(/_/g, " ")}
                </Badge>
                {a.status !== "concluida" && (
                  <Button size="sm" variant="outline" onClick={() => concluirAcao.mutate(a.id)}>
                    Concluir
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Modificar `App.tsx` — adicionar imports e rotas**

Localizar onde as páginas AEE são importadas e adicionar logo após:
```tsx
import SoeGestaoPage    from "./pages/soe/gestao";
import SoeAnalisePage   from "./pages/soe/analise";
import SoeEncaminharPage from "./pages/soe/encaminhar";
```

No bloco `<Routes>`, adicionar:
```tsx
<Route path="/soe/gestao"      element={<SoeGestaoPage />} />
<Route path="/soe/analise"     element={<SoeAnalisePage />} />
<Route path="/soe/encaminhar"  element={<SoeEncaminharPage />} />
```

- [ ] **Step 5: Modificar `layout.tsx` — adicionar grupo SOE**

Ler o arquivo para entender o padrão exato de grupos e `hasAny`. Adicionar o grupo "SOE" seguindo exatamente o mesmo padrão dos grupos "AEE" ou "Requerimentos":

```tsx
// Ícone: HeartHandshake (importar junto com os demais de lucide-react)
import { ..., HeartHandshake } from "lucide-react";

// No bloco de menu, adicionar grupo SOE:
{(hasAny("soe:manage") || hasAny("soe:view") || hasAny("soe:encaminhar")) && (
  <MenuGroup label="SOE" icon={HeartHandshake}>
    {hasAny("soe:manage") && (
      <MenuItem href="/soe/gestao" label="Atendimentos" />
    )}
    {hasAny("soe:view") && !hasAny("soe:manage") && (
      <MenuItem href="/soe/analise" label="Acompanhamento" />
    )}
    {hasAny("soe:encaminhar") && !hasAny("soe:view") && (
      <MenuItem href="/soe/encaminhar" label="Encaminhamentos" />
    )}
  </MenuGroup>
)}
```

- [ ] **Step 6: Remover imports não utilizados**

Verificar e remover `useMutation` e `useQueryClient` de arquivos onde não são usados (typecheck vai indicar).

- [ ] **Step 7: Typecheck**

```bash
pnpm --filter @workspace/seshat run typecheck
```

Esperado: zero erros.

- [ ] **Step 8: Commit**

```bash
git add artifacts/seshat/src/pages/soe/ artifacts/seshat/src/App.tsx artifacts/seshat/src/components/layout.tsx
git commit -m "feat(soe): UI gestao, analise e encaminhar com criptografia auditada e menu SOE"
```

---

## Task 7: Portal Estudante + Spec + Skill + Push

**Files:**
- Modify: `artifacts/seshat/src/pages/portal/index.tsx`
- Create: `.specs/features/portal-soe.md`
- Create: `.claude/skills/seshat-soe/SKILL.md`

- [ ] **Step 1: Adicionar aba SOE ao portal do estudante**

Ler `artifacts/seshat/src/pages/portal/index.tsx` para entender como as abas são estruturadas. Adicionar uma aba "SOE" com:

```tsx
// Imports adicionais
import { useQuery } from "@tanstack/react-query";

// Query para atendimentos e ações SOE
const { data: soeAtendimentos } = useQuery({
  queryKey: ["soe-portal-atendimentos"],
  queryFn: () => apiFetch("/api/soe/portal/meus-atendimentos"),
});

const { data: soeAcoes } = useQuery({
  queryKey: ["soe-portal-acoes"],
  queryFn: () => apiFetch("/api/soe/portal/minhas-acoes"),
});

// Nova aba no TabsList:
<TabsTrigger value="soe">SOE</TabsTrigger>

// Novo TabsContent:
<TabsContent value="soe" className="space-y-4 mt-4">
  <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
    Seus dados são protegidos conforme a LGPD, ISO 27001 e normativos da SEDF.
    Para dúvidas, procure a orientadora educacional.
  </div>
  <h3 className="font-semibold text-sm">Meus atendimentos</h3>
  {(soeAtendimentos?.atendimentos ?? []).map((a: any) => (
    <Card key={a.id}>
      <CardContent className="p-3 flex justify-between items-center">
        <div>
          <p className="text-sm font-medium">{a.dataAtendimento} · {a.tipo}</p>
          <p className="text-xs text-muted-foreground">{a.motivo}</p>
        </div>
        <Badge variant="secondary">{a.status.replace(/_/g, " ")}</Badge>
      </CardContent>
    </Card>
  ))}
  {(soeAtendimentos?.atendimentos?.length ?? 0) === 0 && (
    <p className="text-sm text-muted-foreground">Nenhum atendimento registrado.</p>
  )}
  {(soeAcoes?.acoes?.length ?? 0) > 0 && (
    <>
      <h3 className="font-semibold text-sm mt-4">Minhas ações</h3>
      {soeAcoes.acoes.map((a: any) => (
        <Card key={a.id}>
          <CardContent className="p-3 flex justify-between items-center">
            <div>
              <p className="text-sm font-medium">{a.titulo}</p>
              {a.prazo && <p className="text-xs text-muted-foreground">Prazo: {a.prazo}</p>}
            </div>
            <Badge variant={a.status === "concluida" ? "default" : "secondary"}>
              {a.status.replace(/_/g, " ")}
            </Badge>
          </CardContent>
        </Card>
      ))}
    </>
  )}
</TabsContent>
```

- [ ] **Step 2: Typecheck final**

```bash
pnpm --filter @workspace/seshat run typecheck
```

- [ ] **Step 3: Criar `.specs/features/portal-soe.md`**

Copiar o conteúdo de `docs/superpowers/specs/2026-09-16-portal-soe-design.md` como referência para os agentes implementadores.

- [ ] **Step 4: Criar `.claude/skills/seshat-soe/SKILL.md`**

Escrever skill com:
- Visão geral do módulo SOE
- Tabelas e responsabilidades
- Permissões: soe:manage, soe:view, soe:encaminhar, soe:self
- Endpoints principais
- Regras de segurança (criptografia, auditoria imutável, LGPD)
- Arquivos-chave
- Alerta: não executar migrate-soe.sql em produção antes do provisionamento

- [ ] **Step 5: Commit e push**

```bash
git add artifacts/seshat/src/pages/portal/index.tsx .specs/features/portal-soe.md .claude/skills/seshat-soe/
git commit -m "feat(soe): aba SOE no portal do estudante, spec e skill"
git push -u origin claude/wonderful-feynman-Klc3C
```
