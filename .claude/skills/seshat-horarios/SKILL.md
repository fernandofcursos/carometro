# Skill: Quadro de Horários

## Menu

```
Grupo: "Modulação"  (canManageGeral — turmas:manage | cursos:manage | turnos:manage)
└── "Quadro de Horários" → /horarios   (visível só se canManageHorarios = hasAny("horarios:manage"))
```

Ícone: `CalendarDays` (lucide-react).

## Permissão

`horarios:manage` — deve ser inserida na tabela `permissoes`:

```sql
INSERT INTO permissoes (recurso, acao) VALUES ('horarios', 'manage')
ON CONFLICT (recurso, acao) DO NOTHING;
```

## Schema (`lib/db/src/schema/horarios.ts`)

```typescript
import { pgTable, uuid, smallint, time, varchar, integer, timestamp, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { turmasTable } from "./turmas";
import { disciplinaOfertasTable } from "./disciplina-ofertas";

export const horariosAulasTable = pgTable("horarios_aulas", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  turmaId:             uuid("turma_id").notNull().references(() => turmasTable.id, { onDelete: "cascade" }),
  disciplinaOfertaId:  uuid("disciplina_oferta_id").references(() => disciplinaOfertasTable.id, { onDelete: "set null" }),
  diaSemana:           smallint("dia_semana").notNull(),           // 1=seg … 5=sex
  horaInicio:          time("hora_inicio").notNull(),
  horaFim:             time("hora_fim").notNull(),
  sala:                varchar("sala", { length: 50 }),
  ano:                 integer("ano").notNull(),
  semestre:            smallint("semestre").notNull(),
  criadoEm:            timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:        timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_slot_turma").on(t.turmaId, t.diaSemana, t.horaInicio, t.ano, t.semestre),
  index("idx_horarios_turma").on(t.turmaId, t.ano, t.semestre),
]);

export type HorarioAula = typeof horariosAulasTable.$inferSelect;
```

Exportar em `lib/db/src/schema/index.ts`:
```typescript
export * from "./horarios";
```

## API (`artifacts/api-server/src/routes/horarios.ts`)

```typescript
import { Router } from "express";
import { z } from "zod";
import { db, horariosAulasTable, disciplinaOfertasTable, disciplinasTable,
         usuariosTable, eq, and } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";

const router = Router();
router.use(requireAuth);

// GET /api/horarios?turmaId=&ano=&semestre=
router.get("/", async (req, res) => {
  const { turmaId, ano, semestre } = req.query;
  const rows = await db
    .select({
      id: horariosAulasTable.id,
      diaSemana: horariosAulasTable.diaSemana,
      horaInicio: horariosAulasTable.horaInicio,
      horaFim: horariosAulasTable.horaFim,
      sala: horariosAulasTable.sala,
      disciplinaNome: disciplinasTable.nome,
    })
    .from(horariosAulasTable)
    .leftJoin(disciplinaOfertasTable, eq(disciplinaOfertasTable.id, horariosAulasTable.disciplinaOfertaId))
    .leftJoin(disciplinasTable, eq(disciplinasTable.id, disciplinaOfertasTable.disciplinaId))
    .where(and(
      eq(horariosAulasTable.turmaId, String(turmaId)),
      eq(horariosAulasTable.ano, Number(ano)),
      eq(horariosAulasTable.semestre, Number(semestre) as 1|2),
    ))
    .orderBy(horariosAulasTable.diaSemana, horariosAulasTable.horaInicio);
  res.json({ turmaId, ano: Number(ano), semestre: Number(semestre), slots: rows });
});

// POST/PUT/DELETE seguem o mesmo padrão do resto do projeto
export default router;
```

Registrar em `artifacts/api-server/src/index.ts`:
```typescript
import horariosRouter from "./routes/horarios.js";
app.use("/api/horarios", horariosRouter);
```

## Dashboard do estudante

`GET /api/portal/dashboard` retorna `agenda[]` com os horários da semana atual.
Quando a tabela `horarios_aulas` não existir ainda, a query é envolvida em try/catch
e `agendaDisponivel: false` é retornado — a UI exibe "Em breve".

## UI (`artifacts/seshat/src/pages/horarios/index.tsx`)

- Filtros no topo: select de Turma, input de Ano, select de Semestre
- Grade 5 colunas (Seg–Sex) × linhas de horário
- Clique em slot existente → `SlotModal` (edição)
- Clique em célula vazia → `SlotModal` (criação pré-preenchida)
- `SlotModal`: disciplina (select de `disciplina_ofertas`), sala, hora início/fim

## Migração SQL

```sql
-- Já presente em scripts/migrate-dashboard.sql
CREATE TABLE IF NOT EXISTS horarios_aulas (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id              uuid        NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  disciplina_oferta_id  uuid        REFERENCES disciplina_ofertas(id) ON DELETE SET NULL,
  dia_semana            smallint    NOT NULL CHECK (dia_semana BETWEEN 1 AND 5),
  hora_inicio           time        NOT NULL,
  hora_fim              time        NOT NULL,
  sala                  varchar(50),
  ano                   integer     NOT NULL,
  semestre              smallint    NOT NULL CHECK (semestre IN (1, 2)),
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_horario_valido CHECK (hora_fim > hora_inicio),
  CONSTRAINT uq_slot_turma UNIQUE (turma_id, dia_semana, hora_inicio, ano, semestre)
);
```
