import { pgTable, uuid, varchar, integer, smallint, text, time, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usuariosTable } from "./usuarios";
import { matriculasTable } from "./matriculas";

export const carteirasTable = pgTable("carteiras", {
  id:             uuid("id").primaryKey().defaultRandom(),
  usuarioId:      uuid("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  matriculaId:    uuid("matricula_id").references(() => matriculasTable.id, { onDelete: "set null" }),
  // 'carteira' = carteira de estudante  |  'cartao-semestral' = cartão de liberação semestral
  tipo:           varchar("tipo", { length: 20 }).notNull().default("carteira"),
  ano:            integer("ano").notNull(),
  semestre:       smallint("semestre").notNull(),
  // Horário de saída autorizado (obrigatório para cartao-semestral, null para carteira)
  horarioSaida:   time("horario_saida"),
  // 'ativa' | 'cancelada' | 'revogada'
  status:         varchar("status", { length: 20 }).notNull().default("ativa"),
  // Token HMAC-SHA256 armazenado para permitir revogação real
  token:          text("token").notNull(),
  canceladoEm:    timestamp("cancelado_em",     { withTimezone: true }),
  canceladoPorId: uuid("cancelado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  criadoEm:       timestamp("criado_em",        { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:   timestamp("atualizado_em",    { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("ck_carteira_semestre", sql`${t.semestre} IN (1, 2)`),
  check("ck_carteira_tipo",     sql`${t.tipo} IN ('carteira', 'cartao-semestral')`),
  check("ck_carteira_status",   sql`${t.status} IN ('ativa', 'cancelada', 'revogada')`),
]);

export type Carteira = typeof carteirasTable.$inferSelect;
