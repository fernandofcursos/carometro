# Skill: Quadro de Horários

## Status: Implementado

## Menu

```
Grupo: "Modulação"  (canManageGeral — turmas:manage | cursos:manage | turnos:manage)
└── "Quadro de Horários" → /horarios   (visível só se canManageHorarios = hasAny("horarios:manage"))
```

Ícone: `CalendarDays` (lucide-react). Declarado em `layout.tsx`:
```typescript
const canManageHorarios = hasAny("horarios:manage");
// no grupo Modulação:
...(canManageHorarios ? [nav("Quadro de Horários", "/horarios", CalendarDays)] : []),
```

## Permissão

`horarios:manage` — deve ser inserida na tabela `permissoes`:

```sql
INSERT INTO permissoes (recurso, acao) VALUES ('horarios', 'manage')
ON CONFLICT (recurso, acao) DO NOTHING;
```

## Schema (`lib/db/src/schema/horarios.ts`)

```typescript
export const horariosAulasTable = pgTable("horarios_aulas", {
  id, turmaId (FK turmas CASCADE), disciplinaOfertaId (FK disciplina_ofertas SET NULL),
  diaSemana (smallint 1–5), horaInicio (time), horaFim (time),
  sala (varchar 50), ano (integer), semestre (smallint 1|2),
  criadoEm, atualizadoEm
}, [
  uniqueIndex("uq_slot_turma").on(turmaId, diaSemana, horaInicio, ano, semestre),
  index("idx_horarios_turma").on(turmaId, ano, semestre),
]);
```

Exportado em `lib/db/src/schema/index.ts`:
```typescript
export * from "./horarios";
```

## API (`artifacts/api-server/src/routes/horarios.ts`)

| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/api/horarios?turmaId=&ano=&semestre=` | requireAuth | Lista slots com joins disciplina/curso/turno |
| GET | `/api/horarios/disciplinas-oferta?turmaId=` | requireAuth | Disciplinas disponíveis para a turma (filtra por curso) |
| POST | `/api/horarios` | `horarios:manage` | Cria slot; 409 se conflito de unique |
| PUT | `/api/horarios/:id` | `horarios:manage` | Atualiza slot parcialmente |
| DELETE | `/api/horarios/:id` | `horarios:manage` | Remove slot |

Registrado em `artifacts/api-server/src/index.ts`:
```typescript
import horariosRouter from "./routes/horarios.js";
app.use("/api/horarios", horariosRouter);
```

## UI (`artifacts/seshat/src/pages/horarios/index.tsx`)

- **Filtros**: Select de Turma (usa `GET /api/turmas`), Input de Ano, Select de Semestre
- **Grade 5 colunas** (Seg–Sex) com header colorido por dia
  - `1=azul, 2=violeta, 3=esmeralda, 4=âmbar, 5=rosa`
- **SlotCard**: mostra disciplina, horário, sala; hover revela botão Trash2 para deletar
- **SlotModal**: Dialog com select de dia, time pickers início/fim, input de sala, select de disciplina (carregado via `/api/horarios/disciplinas-oferta?turmaId=`)
- Clique em slot → `openEdit(slot)` → SlotModal em modo edição
- Clique em "+ Adicionar" de cada coluna → `openCreate(dia)` → SlotModal pré-preenchido com o dia
- **AlertDialog** de confirmação antes de deletar

Rota registrada em `artifacts/seshat/src/App.tsx`:
```typescript
import HorariosPage from "@/pages/horarios/index";
<Route path="/horarios" component={HorariosPage} />
```

## Dashboard do estudante

`GET /api/portal/dashboard` retorna `agenda[]` com os horários da semana atual.
Quando a tabela `horarios_aulas` não existir ainda, a query é envolvida em try/catch
e `agendaDisponivel: false` é retornado — a UI exibe "Em breve".

## Migração SQL

Execute **depois** de `scripts/migrate-dashboard.sql` (que já contém a DDL da tabela):

```sql
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
INSERT INTO permissoes (recurso, acao) VALUES ('horarios', 'manage') ON CONFLICT DO NOTHING;
```

## Arquivos implementados

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/horarios.ts` | Schema Drizzle |
| `lib/db/src/schema/index.ts` | Exporta schema |
| `artifacts/api-server/src/routes/horarios.ts` | CRUD completo + disciplinas-oferta |
| `artifacts/api-server/src/index.ts` | Registra `/api/horarios` |
| `artifacts/seshat/src/pages/horarios/index.tsx` | UI: grade + SlotModal + AlertDialog |
| `artifacts/seshat/src/App.tsx` | Rota `/horarios` |
| `artifacts/seshat/src/components/layout.tsx` | Menu + permissão `horarios:manage` |
