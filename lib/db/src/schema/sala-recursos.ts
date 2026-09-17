import {
  pgTable, uuid, varchar, text, timestamp,
  date, boolean, smallint, integer, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { escolasTable } from "./escolas";
import { usuariosTable } from "./usuarios";

export const srEstudantesEneeTable = pgTable("sr_estudantes_enee", {
  id:               uuid("id").primaryKey().defaultRandom(),
  escolaId:         uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  usuarioId:        uuid("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  laudo:            varchar("laudo", { length: 20 }).notNull().$type<"DI"|"DF"|"DOWN"|"TEA"|"AH_SD">(),
  dataLaudo:        date("data_laudo"),
  instituicaoLaudo: varchar("instituicao_laudo", { length: 200 }),
  observacoes:      text("observacoes"),
  ativo:            boolean("ativo").default(true).notNull(),
  criadoEm:         timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:     timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm:       timestamp("deletado_em",  { withTimezone: true }),
}, (t) => [
  index("idx_sr_enee_escola").on(t.escolaId),
  uniqueIndex("uq_sr_enee_usuario_escola").on(t.escolaId, t.usuarioId).where(sql`${t.deletadoEm} IS NULL`),
]);

export const srAtendimentosTable = pgTable("sr_atendimentos", {
  id:               uuid("id").primaryKey().defaultRandom(),
  escolaId:         uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteId:      uuid("estudante_id").notNull().references(() => srEstudantesEneeTable.id, { onDelete: "restrict" }),
  dataAtendimento:  date("data_atendimento").notNull(),
  duracaoMin:       smallint("duracao_min"),
  tipo:             varchar("tipo", { length: 30 }).notNull(),
  narrativa:        text("narrativa"),
  registradoPorId:  uuid("registrado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  criadoEm:         timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:     timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm:       timestamp("deletado_em",  { withTimezone: true }),
}, (t) => [
  index("idx_sr_atendimentos_escola").on(t.escolaId),
  index("idx_sr_atendimentos_estudante").on(t.estudanteId),
]);

export const srPlanosAeeTable = pgTable("sr_planos_aee", {
  id:            uuid("id").primaryKey().defaultRandom(),
  escolaId:      uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteId:   uuid("estudante_id").notNull().references(() => srEstudantesEneeTable.id, { onDelete: "restrict" }),
  objetivos:     text("objetivos").notNull(),
  estrategias:   text("estrategias").notNull(),
  avaliacao:     text("avaliacao").notNull(),
  prazo:         date("prazo").notNull(),
  observacoes:   text("observacoes"),
  status:        varchar("status", { length: 20 }).default("rascunho").notNull().$type<"rascunho"|"ativo"|"encerrado">(),
  elaboradoPorId: uuid("elaborado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  ano:           integer("ano").notNull(),
  semestre:      smallint("semestre").notNull(),
  criadoEm:      timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:  timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_sr_planos_escola").on(t.escolaId),
  index("idx_sr_planos_estudante").on(t.estudanteId),
]);

export const srEsvTable = pgTable("sr_esv", {
  id:             uuid("id").primaryKey().defaultRandom(),
  escolaId:       uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteId:    uuid("estudante_id").notNull().references(() => srEstudantesEneeTable.id, { onDelete: "restrict" }),
  nome:           varchar("nome", { length: 200 }).notNull(),
  contato:        varchar("contato", { length: 200 }),
  periodoInicio:  date("periodo_inicio").notNull(),
  periodoFim:     date("periodo_fim"),
  observacoes:    text("observacoes"),
  ativo:          boolean("ativo").default(true).notNull(),
  criadoEm:       timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:   timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_sr_esv_escola").on(t.escolaId),
]);

export const srEstudosCasoTable = pgTable("sr_estudos_caso", {
  id:                         uuid("id").primaryKey().defaultRandom(),
  escolaId:                   uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteId:                uuid("estudante_id").notNull().references(() => srEstudantesEneeTable.id, { onDelete: "restrict" }),
  dataRealizacao:             date("data_realizacao").notNull(),
  participantes:              text("participantes"),
  sintese:                    text("sintese").notNull(),
  encaminhamentosResultantes: text("encaminhamentos_resultantes"),
  status:                     varchar("status", { length: 20 }).default("aberto").notNull(),
  criadoEm:                   timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:               timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_sr_estudos_caso_escola").on(t.escolaId),
]);

export const srEncaminhamentosTable = pgTable("sr_encaminhamentos", {
  id:              uuid("id").primaryKey().defaultRandom(),
  escolaId:        uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteId:     uuid("estudante_id").notNull().references(() => srEstudantesEneeTable.id, { onDelete: "restrict" }),
  descricao:       text("descricao").notNull(),
  destinatarioId:  uuid("destinatario_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  status:          varchar("status", { length: 20 }).default("pendente").notNull(),
  prazo:           date("prazo"),
  resposta:        text("resposta"),
  criadoPorId:     uuid("criado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  criadoEm:        timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:    timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_sr_encaminhamentos_escola").on(t.escolaId),
]);

export const encaminhamentosEventosTable = pgTable("encaminhamentos_eventos", {
  id:             uuid("id").primaryKey().defaultRandom(),
  escolaId:       uuid("escola_id").references(() => escolasTable.id, { onDelete: "set null" }),
  origemModulo:   varchar("origem_modulo", { length: 30 }).notNull(),
  destinoModulo:  varchar("destino_modulo", { length: 30 }).notNull(),
  estudanteId:    uuid("estudante_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  referenciaId:   uuid("referencia_id"),
  referenciaTipo: varchar("referencia_tipo", { length: 50 }),
  mensagem:       text("mensagem"),
  status:         varchar("status", { length: 20 }).default("pendente").notNull(),
  criadoPorId:    uuid("criado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  recebidoPorId:  uuid("recebido_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  criadoEm:       timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:   timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  tipoDemanda:    varchar("tipo_demanda", { length: 100 }),
  cids:           text("cids").array(),
  resolucao:      text("resolucao"),
  paiId:          uuid("pai_id").references((): AnyPgColumn => encaminhamentosEventosTable.id, { onDelete: "set null" }),
}, (t) => [
  index("idx_enc_eventos_escola").on(t.escolaId),
  index("idx_enc_eventos_destino").on(t.destinoModulo, t.status),
  index("idx_enc_eventos_pai").on(t.paiId),
]);
