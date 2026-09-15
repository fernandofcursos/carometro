import {
  pgTable, uuid, integer, smallint, date, varchar, text,
  timestamp, uniqueIndex, index, check,
} from "drizzle-orm/pg-core";
import { usuariosTable } from "./usuarios";

export const calendarioSemestresTable = pgTable("calendario_semestres", {
  id:           uuid("id").primaryKey().defaultRandom(),
  ano:          integer("ano").notNull(),
  semestre:     smallint("semestre").notNull(),
  inicio:       date("inicio").notNull(),
  fim:          date("fim").notNull(),
  criadoEm:     timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em",{ withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_calendario_ano_semestre").on(t.ano, t.semestre),
]);

export const calendarioDiasTable = pgTable("calendario_dias", {
  id:           uuid("id").primaryKey().defaultRandom(),
  data:         date("data").notNull(),
  categoria:    varchar("categoria", { length: 30 }).notNull().default("letivo"),
  titulo:       varchar("titulo",    { length: 200 }),
  descricao:    text("descricao"),
  corOverride:  varchar("cor_override", { length: 7 }),
  icone:        varchar("icone",       { length: 10 }),
  criadoPor:    uuid("criado_por").references(() => usuariosTable.id, { onDelete: "set null" }),
  criadoEm:     timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em",{ withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_calendario_dias_data").on(t.data),
]);

export type CalendarioSemestre = typeof calendarioSemestresTable.$inferSelect;
export type CalendarioDia      = typeof calendarioDiasTable.$inferSelect;
