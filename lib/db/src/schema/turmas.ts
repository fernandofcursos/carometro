import { pgTable, uuid, text, timestamp, boolean, varchar, uniqueIndex, integer, smallint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { cursosTable } from "./cursos";

export const turmasTable = pgTable("turmas", {
  id: uuid("id").primaryKey().defaultRandom(),
  sigla: varchar("sigla", { length: 10 }).notNull(),
  descricao: text("descricao").notNull(),
  cursoId: uuid("curso_id").notNull().references(() => cursosTable.id, { onDelete: "restrict" }),
  ano: integer("ano"),
  semestre: smallint("semestre"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm: timestamp("deletado_em", { withTimezone: true }),
}, (t) => [uniqueIndex("uq_turmas_sigla_curso").on(t.sigla, t.cursoId)]);

export const insertTurmaSchema = createInsertSchema(turmasTable, {
  turnoIds: z.array(z.string().uuid()).min(1, "Ao menos um turno é obrigatório"),
}).omit({
  id: true, criadoEm: true, atualizadoEm: true, deletadoEm: true,
}).extend({
  turnoIds: z.array(z.string().uuid()).min(1, "Ao menos um turno é obrigatório"),
});
export type InsertTurma = z.infer<typeof insertTurmaSchema>;
export type Turma = typeof turmasTable.$inferSelect;
