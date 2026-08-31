# Skill: Quadro de Horários

## Menu

```
Grupo: "Modulação"  (canManageGeral)
└── "Quadro de Horários" → /horarios   (visível só se canManageHorarios = hasAny("horarios:manage"))
```

Ícone: `CalendarDays` (lucide-react).

## Permissão

`horarios:manage` — inserida na tabela `permissoes`:

```sql
INSERT INTO permissoes (recurso, acao) VALUES ('horarios', 'manage')
ON CONFLICT (recurso, acao) DO NOTHING;
```

## Schema (`lib/db/src/schema/horarios.ts`)

```typescript
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
```

## API (`artifacts/api-server/src/routes/horarios.ts`)

Importar de `@workspace/db` (nunca direto de `drizzle-orm`):
```typescript
import { db, horariosAulasTable, turmaTurnosTable, turnosTable, turmasTable, cursosTable,
         disciplinaOfertasTable, disciplinasTable, eq, and } from "@workspace/db";
```

### Endpoints

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/horarios?turmaId=&ano=&semestre=` | Lista slots do quadro |
| GET | `/api/horarios/turma-info?turmaId=` | Turma + turnos vinculados |
| GET | `/api/horarios/disciplinas-oferta?turmaId=&turnoId=` | Disciplinas disponíveis |
| POST | `/api/horarios` | Criar slot |
| PUT | `/api/horarios/:id` | Editar slot |
| DELETE | `/api/horarios/:id` | Remover slot |
| POST | `/api/horarios/importar-urania` | Importação em lote (JSON) |

### `GET /api/horarios/turma-info`

```typescript
// Retorna:
{ id, sigla, cursoNome, turnos: [{ id, nome }] }

// Query:
const turnos = await db
  .select({ id: turnosTable.id, nome: turnosTable.nome })
  .from(turmaTurnosTable)
  .innerJoin(turnosTable, eq(turnosTable.id, turmaTurnosTable.turnoId))
  .where(eq(turmaTurnosTable.turmaId, turmaId));
```

### `POST /api/horarios/importar-urania`

```typescript
// Request body:
{
  turmaId: string, ano: number, semestre: 1|2,
  horarios: Array<{
    diaSemana: 1|2|3|4|5,
    horaInicio: string,   // "HH:MM"
    horaFim: string,
    disciplina?: string,  // nome tentativo para match
    sala?: string,
  }>
}
// Response:
{ total, criados, atualizados, semDisciplina, naoCorrespondidos: string[] }
```

**Match de disciplina:**
1. Exato por nome (case-insensitive)
2. Substring bidirecional
3. Sem match → slot criado sem `disciplinaOfertaId`

Conflito (23505) → atualiza disciplina + sala em vez de criar.

## Slots de Horário por Turno

**Fonte oficial:** documento "Horários das Aulas" — Centro de Educação Profissional Escola Técnica de Santa Maria (SEEDF/CRE Santa Maria). Cada período ≈ 50 min; intervalo entre 2º e 3º horário não aparece como linha na grade.

```typescript
// Horários oficiais SEEDF/Santa Maria
function getSlotsDoTurno(turnoNome: string): SlotHorario[] {
  const n = turnoNome.toLowerCase();
  if (n.includes("mat")) return [
    { inicio: "08:00", fim: "08:50", label: "1º  08:00 – 08:50" },
    { inicio: "08:50", fim: "09:40", label: "2º  08:50 – 09:40" },
    // intervalo: 09:40–10:10
    { inicio: "10:10", fim: "11:05", label: "3º  10:10 – 11:05" },
    { inicio: "11:05", fim: "12:00", label: "4º  11:05 – 12:00" },
  ];
  if (n.includes("ves") || n.includes("tar")) return [
    { inicio: "13:30", fim: "14:20", label: "1º  13:30 – 14:20" },
    { inicio: "14:20", fim: "15:10", label: "2º  14:20 – 15:10" },
    // intervalo: 15:10–15:40
    { inicio: "15:40", fim: "16:35", label: "3º  15:40 – 16:35" },
    { inicio: "16:35", fim: "17:30", label: "4º  16:35 – 17:30" },
  ];
  if (n.includes("not") || n.includes("notur")) return [
    { inicio: "19:00", fim: "19:45", label: "1º  19:00 – 19:45" },
    { inicio: "19:45", fim: "20:30", label: "2º  19:45 – 20:30" },
    // intervalo: 20:30–21:00
    { inicio: "21:00", fim: "21:45", label: "3º  21:00 – 21:45" },
    { inicio: "21:45", fim: "22:30", label: "4º  21:45 – 22:30" },
  ];
  return [];
}
```

Slots personalizados (fora do template) aparecem como linhas extras na grade.

## UI (`artifacts/seshat/src/pages/horarios/index.tsx`)

### Grade (tabela HTML)

Formato igual ao PDF do Urania:
- Linhas = slots de horário (08:00–09:00, 09:00–10:00, ...)
- Colunas = dias da semana (Seg, Ter, Qua, Qui, Sex)
- Célula vazia → botão `[+]` → SlotModal pré-preenchido
- Célula preenchida → clicável → SlotModal em edição

Chave do mapa de slots: `"${diaSemana}-${horaInicio.slice(0,5)}"`

### SlotModal

- Dia: botões Seg/Ter/Qua/Qui/Sex
- Horário: botões dos slots do turno; link "Personalizar" → inputs livres
- Disciplina: select filtrado por turnoId (se disponível)
- Sala: input de texto

**Reset de estado ao reabrir:** `useEffect` com `[open, slot?.id]` + `key={slot?.id ?? "novo"}` no SlotModal.

### ImportacaoModal

- Textarea com JSON
- Após importação: cards com totais + badges dos não correspondidos
- Guia o admin a atribuir disciplinas manualmente nos slots criados sem match

## Migração SQL

```sql
-- scripts/migrate-horarios.sql
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
CREATE INDEX IF NOT EXISTS idx_horarios_turma ON horarios_aulas (turma_id, ano, semestre);

INSERT INTO permissoes (recurso, acao) VALUES ('horarios', 'manage')
ON CONFLICT (recurso, acao) DO NOTHING;
```

## Anti-padrões

- ❌ Importar operadores (`eq`, `and`) de `drizzle-orm` direto — usar `@workspace/db`
- ❌ Grade em colunas por dia sem linhas de horário — o formato correto é tabela com linhas de hora
- ❌ Slots de horário hardcoded sem derivar do turno selecionado
- ❌ Modal sem reset de estado ao trocar de slot — usar `key={slot?.id ?? "novo"}` + `useEffect`
