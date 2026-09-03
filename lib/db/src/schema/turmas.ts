import { pgTable, uuid, text, timestamp, boolean, varchar, uniqueIndex, integer, smallint, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { cursosTable } from "./cursos";

export const MODULOS = ["I", "II", "III", "IV", "V", "VI"] as const;
export type Modulo = typeof MODULOS[number];

export const turmasTable = pgTable("turmas", {
  id: uuid("id").primaryKey().defaultRandom(),
  sigla: varchar("sigla", { length: 30 }).notNull(),
  descricao: text("descricao").notNull(),
  cursoId: uuid("curso_id").notNull().references(() => cursosTable.id, { onDelete: "restrict" }),
  // Módulo do curso: I a VI — seleção obrigatória única (um por turma)
  modulo: varchar("modulo", { length: 4 }),
  ano: integer("ano"),
  semestre: smallint("semestre"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm: timestamp("deletado_em", { withTimezone: true }),
}, (t) => [
  uniqueIndex("uq_turmas_sigla_curso").on(t.sigla, t.cursoId),
  check("ck_turma_modulo", sql`${t.modulo} IN ('I','II','III','IV','V','VI')`),
]);

export const insertTurmaSchema = createInsertSchema(turmasTable, {
  turnoIds: z.array(z.string().uuid()).min(1, "Ao menos um turno é obrigatório"),
  modulo: z.enum(MODULOS, { required_error: "Selecione o módulo da turma." }),
}).omit({
  id: true, criadoEm: true, atualizadoEm: true, deletadoEm: true,
}).extend({
  turnoIds: z.array(z.string().uuid()).min(1, "Ao menos um turno é obrigatório"),
  modulo: z.enum(MODULOS, { required_error: "Selecione o módulo da turma." }),
});
export type InsertTurma = z.infer<typeof insertTurmaSchema>;
export type Turma = typeof turmasTable.$inferSelect;
