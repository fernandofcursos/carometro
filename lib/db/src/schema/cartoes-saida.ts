import { pgTable, uuid, varchar, date, time, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { estudantesTable } from "./estudantes";
import { usuariosTable } from "./usuarios";

// Solicitação de cartão de saída antecipada — feita pelo responsável, aprovada pelo coordenador
export const cartoesSaidaTable = pgTable("cartoes_saida", {
  id:                   uuid("id").primaryKey().defaultRandom(),
  estudanteId:          uuid("estudante_id").notNull().references(() => estudantesTable.id, { onDelete: "cascade" }),
  responsavelId:        uuid("responsavel_id").notNull().references(() => usuariosTable.id,  { onDelete: "cascade" }),
  dataSaida:            date("data_saida").notNull(),
  horarioSaida:         time("horario_saida"),
  motivo:               varchar("motivo", { length: 300 }),
  // 'pendente' | 'aprovado' | 'recusado'
  status:               varchar("status", { length: 20 }).notNull().default("pendente"),
  aprovadoPorId:        uuid("aprovado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  aprovadoEm:           timestamp("aprovado_em",            { withTimezone: true }),
  observacaoAprovador:  varchar("observacao_aprovador", { length: 300 }),
  // Token para QR code do cartão aprovado
  token:                varchar("token", { length: 400 }),
  criadoEm:             timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:         timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("ck_cartao_saida_status", sql`${t.status} IN ('pendente', 'aprovado', 'recusado')`),
]);

export type CartaoSaida = typeof cartoesSaidaTable.$inferSelect;
