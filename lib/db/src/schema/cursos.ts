import { pgTable, uuid, text, timestamp, boolean, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const cursosTable = pgTable("cursos", {
  id: uuid("id").primaryKey().defaultRandom(),
  sigla: varchar("sigla", { length: 4 }).notNull().unique(),
  nome: text("nome").notNull().unique(),
  descricao: text("descricao"),
  // Cursos de módulo menor têm limite de 2 disciplinas por estudante
  moduloMenor: boolean("modulo_menor").notNull().default(false),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm: timestamp("deletado_em", { withTimezone: true }),
});

export const insertCursoSchema = createInsertSchema(cursosTable, {
  sigla: z.string().min(1).max(4).toUpperCase(),
}).omit({
  id: true, criadoEm: true, atualizadoEm: true, deletadoEm: true,
});
export type InsertCurso = z.infer<typeof insertCursoSchema>;
export type Curso = typeof cursosTable.$inferSelect;
