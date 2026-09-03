import { pgTable, uuid, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const disciplinasTable = pgTable("disciplinas", {
  id:               uuid("id").primaryKey().defaultRandom(),
  nome:             text("nome").notNull().unique(),
  sigla:            varchar("sigla", { length: 20 }).notNull().unique(),
  codigoModulacao:  varchar("codigo_modulacao", { length: 50 }).notNull(),
  criadoEm:         timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:     timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
});

export const insertDisciplinaSchema = createInsertSchema(disciplinasTable, {
  nome:            (s) => s.min(1, "Informe o nome da unidade curricular."),
  sigla:           (s) => s.min(1, "Informe a sigla.").max(20, "Sigla deve ter no máximo 20 caracteres."),
  codigoModulacao: (s) => s.min(1, "Informe o código de modulação."),
}).omit({ id: true, criadoEm: true, atualizadoEm: true });

export type InsertDisciplina = z.infer<typeof insertDisciplinaSchema>;
export type Disciplina = typeof disciplinasTable.$inferSelect;
