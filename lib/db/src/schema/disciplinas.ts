import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const disciplinasTable = pgTable("disciplinas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull().unique(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
});

export const insertDisciplinaSchema = createInsertSchema(disciplinasTable).omit({ id: true, criadoEm: true, atualizadoEm: true });
export type InsertDisciplina = z.infer<typeof insertDisciplinaSchema>;
export type Disciplina = typeof disciplinasTable.$inferSelect;
