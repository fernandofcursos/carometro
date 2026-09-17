import {
  pgTable, uuid, varchar, text, smallint, timestamp,
  boolean, date, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { escolasTable } from "./escolas";
import { usuariosTable } from "./usuarios";

export const eeaaEstudantesTable = pgTable("eeaa_estudantes", {
  id:             uuid("id").primaryKey().defaultRandom(),
  escolaId:       uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  usuarioId:      uuid("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  necessidades:   text("necessidades"),
  cid10:          varchar("cid10", { length: 10 }),
  profissionalId: uuid("profissional_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  ativo:          boolean("ativo").default(true).notNull(),
  criadoEm:       timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:   timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm:     timestamp("deletado_em",  { withTimezone: true }),
}, (t) => [
  index("idx_eeaa_estudantes_escola").on(t.escolaId),
  index("idx_eeaa_estudantes_usuario").on(t.usuarioId),
]);

export const eeaaPlanosTable = pgTable("eeaa_planos", {
  id:              uuid("id").primaryKey().defaultRandom(),
  escolaId:        uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteAeeId:  uuid("estudante_aee_id").notNull().references(() => eeaaEstudantesTable.id, { onDelete: "restrict" }),
  numero:          varchar("numero", { length: 20 }).notNull().unique(),
  versao:          smallint("versao").default(1).notNull(),
  status:          varchar("status", { length: 30 }).default("rascunho").notNull(),
  periodoInicio:   date("periodo_inicio"),
  periodoFim:      date("periodo_fim"),
  objetivosGerais: text("objetivos_gerais"),
  criadoPorId:     uuid("criado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  criadoEm:        timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:    timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm:      timestamp("deletado_em",  { withTimezone: true }),
}, (t) => [
  index("idx_eeaa_planos_estudante").on(t.estudanteAeeId),
]);

export const eeaaPlanoAssinaturasTable = pgTable("eeaa_plano_assinaturas", {
  id:          uuid("id").primaryKey().defaultRandom(),
  planoId:     uuid("plano_id").notNull().references(() => eeaaPlanosTable.id, { onDelete: "cascade" }),
  usuarioId:   uuid("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  papel:       varchar("papel", { length: 30 }).notNull(),
  metodo:      varchar("metodo", { length: 30 }).notNull(),
  tokenHash:   varchar("token_hash", { length: 64 }).notNull(),
  assinadoEm:  timestamp("assinado_em", { withTimezone: true }).defaultNow().notNull(),
  ipOrigem:    varchar("ip_origem", { length: 45 }),
}, (t) => [
  uniqueIndex("uq_eeaa_assinatura").on(t.planoId, t.usuarioId, t.papel),
]);

export const eeaaPlanoAdaptacoesTable = pgTable("eeaa_plano_adaptacoes", {
  id:        uuid("id").primaryKey().defaultRandom(),
  planoId:   uuid("plano_id").notNull().references(() => eeaaPlanosTable.id, { onDelete: "cascade" }),
  descricao: text("descricao").notNull(),
  area:      varchar("area", { length: 50 }).notNull(),
  criadoEm:  timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
});

export const eeaaMetasTable = pgTable("eeaa_metas", {
  id:           uuid("id").primaryKey().defaultRandom(),
  planoId:      uuid("plano_id").notNull().references(() => eeaaPlanosTable.id, { onDelete: "cascade" }),
  descricao:    text("descricao").notNull(),
  indicador:    text("indicador"),
  prazo:        date("prazo"),
  status:       varchar("status", { length: 30 }).default("nao_iniciada").notNull(),
  criadoEm:    timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
});

export const eeaaEvolucoesTable = pgTable("eeaa_evolucoes", {
  id:             uuid("id").primaryKey().defaultRandom(),
  metaId:         uuid("meta_id").notNull().references(() => eeaaMetasTable.id, { onDelete: "cascade" }),
  profissionalId: uuid("profissional_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  periodoRef:     varchar("periodo_ref", { length: 7 }).notNull(),
  observacao:     text("observacao").notNull(),
  percentual:     smallint("percentual"),
  registradoEm:   timestamp("registrado_em", { withTimezone: true }).defaultNow().notNull(),
});

export const eeaaSessoesTable = pgTable("eeaa_sessoes", {
  id:             uuid("id").primaryKey().defaultRandom(),
  escolaId:       uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteAeeId: uuid("estudante_aee_id").notNull().references(() => eeaaEstudantesTable.id, { onDelete: "restrict" }),
  profissionalId: uuid("profissional_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  dataSessao:     date("data_sessao").notNull(),
  duracaoMin:     smallint("duracao_min"),
  local:          varchar("local", { length: 100 }),
  observacoes:    text("observacoes"),
  criadoEm:       timestamp("criado_em",   { withTimezone: true }).defaultNow().notNull(),
  deletadoEm:     timestamp("deletado_em", { withTimezone: true }),
}, (t) => [
  index("idx_eeaa_sessoes_estudante").on(t.estudanteAeeId),
]);

export const eeaaLaudosTable = pgTable("eeaa_laudos", {
  id:              uuid("id").primaryKey().defaultRandom(),
  escolaId:        uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteAeeId:  uuid("estudante_aee_id").notNull().references(() => eeaaEstudantesTable.id, { onDelete: "restrict" }),
  tipo:            varchar("tipo", { length: 50 }).notNull(),
  titulo:          varchar("titulo", { length: 200 }).notNull(),
  conteudoEnc:     text("conteudo_enc").notNull(),
  chaveRef:        varchar("chave_ref", { length: 64 }).notNull(),
  profissionalExt: varchar("profissional_ext", { length: 200 }),
  dataLaudo:       date("data_laudo"),
  criadoPorId:     uuid("criado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  criadoEm:        timestamp("criado_em",   { withTimezone: true }).defaultNow().notNull(),
  deletadoEm:      timestamp("deletado_em", { withTimezone: true }),
}, (t) => [
  index("idx_eeaa_laudos_estudante").on(t.estudanteAeeId),
]);

export const eeaaLiberacoesTable = pgTable("eeaa_liberacoes", {
  id:             uuid("id").primaryKey().defaultRandom(),
  escolaId:       uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteAeeId: uuid("estudante_aee_id").notNull().references(() => eeaaEstudantesTable.id, { onDelete: "restrict" }),
  professorId:    uuid("professor_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  verAdaptacoes:  boolean("ver_adaptacoes").default(true).notNull(),
  verMetas:       boolean("ver_metas").default(false).notNull(),
  verResumoIa:    boolean("ver_resumo_ia").default(false).notNull(),
  concedidoPorId: uuid("concedido_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  concedidoEm:    timestamp("concedido_em", { withTimezone: true }).defaultNow().notNull(),
  revogadoEm:     timestamp("revogado_em",  { withTimezone: true }),
}, (t) => [
  index("idx_eeaa_liberacoes_estudante").on(t.estudanteAeeId),
  index("idx_eeaa_liberacoes_professor").on(t.professorId),
]);

export const eeaaAuditoriaTable = pgTable("eeaa_auditoria", {
  id:          uuid("id").primaryKey().defaultRandom(),
  escolaId:    uuid("escola_id").references(() => escolasTable.id, { onDelete: "set null" }),
  acao:        varchar("acao", { length: 50 }).notNull(),
  usuarioId:   uuid("usuario_id").notNull(),
  estudanteId: uuid("estudante_id"),
  recursoId:   uuid("recurso_id"),
  ipOrigem:    varchar("ip_origem", { length: 45 }),
  userAgent:   text("user_agent"),
  criadoEm:    timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_eeaa_auditoria_usuario").on(t.usuarioId),
  index("idx_eeaa_auditoria_estudante").on(t.estudanteId),
  index("idx_eeaa_auditoria_criado").on(t.criadoEm),
]);
