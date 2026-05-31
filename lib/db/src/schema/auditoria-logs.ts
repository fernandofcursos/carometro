import { pgTable, uuid, text, timestamp, jsonb, pgEnum, smallint, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const operacaoAuditoriaEnum = pgEnum("operacao_auditoria", [
  "INSERT", "UPDATE", "DELETE", "SELECT", "SELECT_SENSITIVE",
]);

export const auditoriaLogsTable = pgTable("auditoria_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  usuarioId: uuid("usuario_id"),
  tabela: text("tabela").notNull(),
  operacao: operacaoAuditoriaEnum("operacao").notNull(),
  registroId: uuid("registro_id"),
  dadosAntes: jsonb("dados_antes"),
  dadosDepois: jsonb("dados_depois"),
  ipOrigem: text("ip_origem"),
  userAgent: text("user_agent"),
  traceId: text("trace_id"),
  spanId: text("span_id"),
  servicoOrigem: text("servico_origem"),
  ambiente: text("ambiente"),
  versaoApp: text("versao_app"),
  metodoHttp: text("metodo_http"),
  endpoint: text("endpoint"),
  statusHttp: smallint("status_http"),
  duracaoMs: integer("duracao_ms"),
  criadoEm: timestamp("criado_em", { withTimezone: true, precision: 3 }).defaultNow().notNull(),
});

export type AuditoriaLog = typeof auditoriaLogsTable.$inferSelect;
