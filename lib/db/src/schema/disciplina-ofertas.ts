import { pgTable, uuid, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { disciplinasTable } from "./disciplinas";
import { cursosTable } from "./cursos";
import { turnosTable } from "./turnos";

export const disciplinaOfertasTable = pgTable("disciplina_ofertas", {
  id: uuid("id").primaryKey().defaultRandom(),
  disciplinaId: uuid("disciplina_id").notNull().references(() => disciplinasTable.id, { onDelete: "cascade" }),
  cursoId: uuid("curso_id").notNull().references(() => cursosTable.id, { onDelete: "cascade" }),
  turnoId: uuid("turno_id").notNull().references(() => turnosTable.id, { onDelete: "cascade" }),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("uq_disciplina_oferta").on(t.disciplinaId, t.cursoId, t.turnoId)]);

export type DisciplinaOferta = typeof disciplinaOfertasTable.$inferSelect;
