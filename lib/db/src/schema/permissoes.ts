import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const permissoesTable = pgTable("permissoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  recurso: text("recurso").notNull(),
  acao: text("acao").notNull(),
  descricao: text("descricao"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_permissoes_recurso_acao").on(t.recurso, t.acao),
]);

export type Permissao = typeof permissoesTable.$inferSelect;
