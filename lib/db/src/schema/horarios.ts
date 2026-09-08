import {
  pgTable, uuid, smallint, time, varchar, integer,
  timestamp, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { turmasTable } from "./turmas";
import { disciplinaOfertasTable } from "./disciplina-ofertas";

export const horariosAulasTable = pgTable("horarios_aulas", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  turmaId:            uuid("turma_id").notNull().references(() => turmasTable.id, { onDelete: "cascade" }),
  disciplinaOfertaId: uuid("disciplina_oferta_id").references(() => disciplinaOfertasTable.id, { onDelete: "set null" }),
  diaSemana:          smallint("dia_semana").notNull(),
  horaInicio:         time("hora_inicio").notNull(),
  horaFim:            time("hora_fim").notNull(),
  sala:               varchar("sala", { length: 50 }),
  ano:                integer("ano").notNull(),
  semestre:           smallint("semestre").notNull(),
  criadoEm:           timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:       timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_slot_turma").on(t.turmaId, t.diaSemana, t.horaInicio, t.ano, t.semestre),
  index("idx_horarios_turma").on(t.turmaId, t.ano, t.semestre),
]);

export type HorarioAula = typeof horariosAulasTable.$inferSelect;
