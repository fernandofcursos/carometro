import { pgTable, uuid, text, timestamp, boolean, char } from "drizzle-orm/pg-core";
import { usuariosTable } from "./usuarios";

export const tokensSessaoTable = pgTable("tokens_sessao", {
  id: uuid("id").primaryKey().defaultRandom(),
  usuarioId: uuid("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  tokenHash: char("token_hash", { length: 64 }).notNull().unique(),
  expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
  revogado: boolean("revogado").notNull().default(false),
  ipOrigem: text("ip_origem"),
  userAgent: text("user_agent"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
});

export type TokenSessao = typeof tokensSessaoTable.$inferSelect;
