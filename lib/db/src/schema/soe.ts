import {
  pgTable, uuid, varchar, text, timestamp,
  date, index,
} from "drizzle-orm/pg-core";
import { escolasTable } from "./escolas";
import { usuariosTable } from "./usuarios";

export const soeAtendimentosTable = pgTable("soe_atendimentos", {
  id:               uuid("id").primaryKey().defaultRandom(),
  escolaId:         uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteId:      uuid("estudante_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  orientadoraId:    uuid("orientadora_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  encaminhamentoId: uuid("encaminhamento_id"),  // FK added later to avoid circular
  dataAtendimento:  date("data_atendimento").notNull(),
  tipo:             varchar("tipo", { length: 20 }).notNull(),
  motivo:           text("motivo").notNull(),
  registroEnc:      text("registro_enc"),
  chaveRef:         varchar("chave_ref", { length: 64 }),
  status:           varchar("status", { length: 30 }).default("aberto").notNull(),
  criadoEm:         timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:     timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm:       timestamp("deletado_em",  { withTimezone: true }),
}, (t) => [
  index("idx_soe_atendimentos_escola").on(t.escolaId),
  index("idx_soe_atendimentos_estudante").on(t.estudanteId),
]);

export const soeEncaminhamentosTable = pgTable("soe_encaminhamentos", {
  id:               uuid("id").primaryKey().defaultRandom(),
  escolaId:         uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteId:      uuid("estudante_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  encaminhadoPorId: uuid("encaminhado_por_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  motivo:           text("motivo").notNull(),
  prioridade:       varchar("prioridade", { length: 10 }).default("normal").notNull(),
  status:           varchar("status", { length: 20 }).default("pendente").notNull(),
  observacaoEnc:    text("observacao_enc"),
  chaveRef:         varchar("chave_ref", { length: 64 }),
  criadoEm:         timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:     timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_soe_encaminhamentos_escola").on(t.escolaId),
  index("idx_soe_encaminhamentos_estudante").on(t.estudanteId),
  index("idx_soe_encaminhamentos_por").on(t.encaminhadoPorId),
]);

export const soeAcoesTable = pgTable("soe_acoes", {
  id:             uuid("id").primaryKey().defaultRandom(),
  escolaId:       uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  tipo:           varchar("tipo", { length: 15 }).notNull(),
  titulo:         varchar("titulo", { length: 200 }).notNull(),
  descricao:      text("descricao"),
  responsavelId:  uuid("responsavel_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  estudanteId:    uuid("estudante_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  atendimentoId:  uuid("atendimento_id").references(() => soeAtendimentosTable.id, { onDelete: "set null" }),
  prazo:          date("prazo"),
  status:         varchar("status", { length: 20 }).default("pendente").notNull(),
  criadoPorId:    uuid("criado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  criadoEm:       timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:   timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_soe_acoes_escola").on(t.escolaId),
  index("idx_soe_acoes_responsavel").on(t.responsavelId),
  index("idx_soe_acoes_estudante").on(t.estudanteId),
]);

export const soeEstudosDeCasoTable = pgTable("soe_estudos_de_caso", {
  id:              uuid("id").primaryKey().defaultRandom(),
  escolaId:        uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  estudanteId:     uuid("estudante_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  dataReuniao:     date("data_reuniao").notNull(),
  participantes:   text("participantes"),
  deliberacoes:    text("deliberacoes"),
  proximosPassos:  text("proximos_passos"),
  status:          varchar("status", { length: 15 }).default("agendado").notNull(),
  criadoPorId:     uuid("criado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  criadoEm:        timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:    timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_soe_estudos_escola").on(t.escolaId),
  index("idx_soe_estudos_estudante").on(t.estudanteId),
]);

export const soeAuditoriaTable = pgTable("soe_auditoria", {
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
  index("idx_soe_auditoria_usuario").on(t.usuarioId),
  index("idx_soe_auditoria_estudante").on(t.estudanteId),
  index("idx_soe_auditoria_criado").on(t.criadoEm),
]);
