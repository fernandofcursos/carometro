import { pgTable, uuid, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { usuariosTable } from "./usuarios";

export const baseLegalLgpdEnum = pgEnum("base_legal_lgpd", [
  "consentimento",
  "obrigacao_legal",
  "politicas_publicas",
  "pesquisa",
  "contrato",
  "exercicio_regular",
  "protecao_vida",
  "tutela_saude",
  "interesse_legitimo",
  "protecao_credito",
]);

export const consentimentosLgpdTable = pgTable("consentimentos_lgpd", {
  id: uuid("id").primaryKey().defaultRandom(),
  usuarioId: uuid("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  finalidade: text("finalidade").notNull(),
  versaoPolitica: text("versao_politica").notNull(),
  consentido: boolean("consentido").notNull(),
  ipOrigem: text("ip_origem"),
  userAgent: text("user_agent"),
  baseLegal: baseLegalLgpdEnum("base_legal").notNull(),
  consentidoEm: timestamp("consentido_em", { withTimezone: true }).defaultNow().notNull(),
  revogadoEm: timestamp("revogado_em", { withTimezone: true }),
  revogadoMotivo: text("revogado_motivo"),
});

export type ConsentimentoLgpd = typeof consentimentosLgpdTable.$inferSelect;
