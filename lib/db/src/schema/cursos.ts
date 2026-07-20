import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const cursosTable = pgTable("cursos", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull().unique(),
  descricao: text("descricao"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm: timestamp("deletado_em", { withTimezone: true }),
});

export const insertCursoSchema = createInsertSchema(cursosTable).omit({
  id: true, criadoEm: true, atualizadoEm: true, deletadoEm: true,
});
export type InsertCurso = z.infer<typeof insertCursoSchema>;
export type Curso = typeof cursosTable.$inferSelect;
