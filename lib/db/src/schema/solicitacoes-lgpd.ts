import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usuariosTable } from "./usuarios";

export const tipoSolicitacaoLgpdEnum = pgEnum("tipo_solicitacao_lgpd", [
  "acesso",
  "correcao",
  "exclusao",
  "portabilidade",
  "oposicao",
  "anonimizacao",
  "revogacao_consentimento",
]);

export const statusSolicitacaoLgpdEnum = pgEnum("status_solicitacao_lgpd", [
  "pendente",
  "em_analise",
  "concluido",
  "negado",
  "cancelado",
]);

export const solicitacoesLgpdTable = pgTable("solicitacoes_lgpd", {
  id: uuid("id").primaryKey().defaultRandom(),
  usuarioId: uuid("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  tipo: tipoSolicitacaoLgpdEnum("tipo").notNull(),
  status: statusSolicitacaoLgpdEnum("status").notNull().default("pendente"),
  motivo: text("motivo"),
  respostaDpo: text("resposta_dpo"),
  prazoLegal: timestamp("prazo_legal", { withTimezone: true }),
  concluidoEm: timestamp("concluido_em", { withTimezone: true }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
});

export type SolicitacaoLgpd = typeof solicitacoesLgpdTable.$inferSelect;
