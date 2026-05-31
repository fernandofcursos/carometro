import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const disciplinasTable = pgTable("disciplinas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull().unique(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
});

export type Disciplina = typeof disciplinasTable.$inferSelect;
