import { pgTable, uuid, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { turmasTable } from "./turmas";
import { turnosTable } from "./turnos";

export const turmaTurnosTable = pgTable("turma_turnos", {
  turmaId: uuid("turma_id").notNull().references(() => turmasTable.id, { onDelete: "cascade" }),
  turnoId: uuid("turno_id").notNull().references(() => turnosTable.id, { onDelete: "restrict" }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("uq_turma_turno").on(t.turmaId, t.turnoId)]);

export type TurmaTurno = typeof turmaTurnosTable.$inferSelect;
