import {
  pgTable, uuid, varchar, text, smallint, timestamp,
  boolean, integer, primaryKey, index, uniqueIndex, date, time,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { estudantesTable } from "./estudantes";
import { usuariosTable } from "./usuarios";

// =============================================================================
// requerimento_tipos — categorias de requerimento (2NF: sem grupos repetidos)
// =============================================================================
export const requerimentoTiposTable = pgTable("requerimento_tipos", {
  id:     uuid("id").primaryKey().defaultRandom(),
  nome:   varchar("nome", { length: 100 }).notNull(),
  ordem:  smallint("ordem").default(0).notNull(),
  ativo:  boolean("ativo").default(true).notNull(),
});

// =============================================================================
// requerimento_assuntos — itens dentro de cada tipo (normalização 2NF)
// =============================================================================
export const requerimentoAssuntosTable = pgTable("requerimento_assuntos", {
  id:             uuid("id").primaryKey().defaultRandom(),
  tipoId:         uuid("tipo_id").notNull().references(() => requerimentoTiposTable.id, { onDelete: "cascade" }),
  nome:           varchar("nome", { length: 200 }).notNull(),
  descricao:      text("descricao"),
  slug:            varchar("slug", { length: 50 }),   // 'saida-semestral' | 'saida-eventual' | null
  requerMotivos:   boolean("requer_motivos").default(false).notNull(),
  requerDataHora:  boolean("requer_data_hora").default(false).notNull(), // data+hora obrigatórios
  ordem:           smallint("ordem").default(0).notNull(),
  ativo:           boolean("ativo").default(true).notNull(),
}, (t) => [
  index("idx_req_assuntos_tipo").on(t.tipoId),
]);

// =============================================================================
// requerimentos — registro principal (1 linha por requerimento)
// Mantém 3NF: cada atributo depende somente da PK.
// =============================================================================
export const requerimentosTable = pgTable("requerimentos", {
  id:               uuid("id").primaryKey().defaultRandom(),
  numero:           varchar("numero", { length: 20 }).notNull().unique(), // REQ-2026-0001
  estudanteId:      uuid("estudante_id").notNull().references(() => estudantesTable.id, { onDelete: "restrict" }),
  requerenteId:     uuid("requerente_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  tipoRequerente:   varchar("tipo_requerente", { length: 20 }).notNull(), // 'estudante' | 'pai_responsavel'
  assuntoId:        uuid("assunto_id").notNull().references(() => requerimentoAssuntosTable.id, { onDelete: "restrict" }),
  exposicaoMotivos:  text("exposicao_motivos"),   // max 1000 palavras — validado na app
  dataSolicitacao:   date("data_solicitacao"),    // data desejada (obrigatório quando assunto.requerDataHora)
  horaSolicitacao:   time("hora_solicitacao"),    // horário desejado (obrigatório se dataSolicitacao preenchida)
  status:            varchar("status", { length: 20 }).default("pendente").notNull(),
  // pendente | em_analise | deferido | indeferido
  parecer:           text("parecer"),             // motivo do indeferimento — max 1000 palavras
  analisadoPorId:    uuid("analisado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  analisadoEm:       timestamp("analisado_em", { withTimezone: true }),
  criadoEm:          timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:      timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_requerimentos_estudante").on(t.estudanteId),
  index("idx_requerimentos_requerente").on(t.requerenteId),
  index("idx_requerimentos_status").on(t.status),
]);

// =============================================================================
// requerimento_assinaturas — assinaturas eletrônicas (3NF: tabela separada)
// Requerente + Analisador assinam em momentos distintos.
// =============================================================================
export const requerimentoAssinaturasTable = pgTable("requerimento_assinaturas", {
  id:              uuid("id").primaryKey().defaultRandom(),
  requerimentoId:  uuid("requerimento_id").notNull().references(() => requerimentosTable.id, { onDelete: "cascade" }),
  usuarioId:       uuid("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  papel:           varchar("papel", { length: 20 }).notNull(),  // 'requerente' | 'analisador'
  metodo:          varchar("metodo", { length: 30 }).notNull(), // 'senha' | 'gov_br' | 'certificado_digital'
  tokenHash:       varchar("token_hash", { length: 64 }).notNull(), // SHA-256
  assinadoEm:      timestamp("assinado_em", { withTimezone: true }).defaultNow().notNull(),
  ipOrigem:        varchar("ip_origem", { length: 45 }),
}, (t) => [
  uniqueIndex("uq_assinatura_req_usuario_papel").on(t.requerimentoId, t.usuarioId, t.papel),
  index("idx_assinaturas_requerimento").on(t.requerimentoId),
]);

// =============================================================================
// Zod schemas para validação na API
// =============================================================================
export const insertRequerimentoSchema = createInsertSchema(requerimentosTable, {
  assuntoId:        z.string().uuid("Assunto inválido."),
  estudanteId:      z.string().uuid("Estudante inválido."),
  tipoRequerente:   z.enum(["estudante", "pai_responsavel"]),
  exposicaoMotivos: z.string().max(10000).optional().nullable(),
}).omit({ id: true, numero: true, status: true, parecer: true,
          analisadoPorId: true, analisadoEm: true, criadoEm: true, atualizadoEm: true });

export const analisarRequerimentoSchema = z.object({
  status:  z.enum(["deferido", "indeferido"]),
  parecer: z.string().max(10000).optional().nullable(),
});

export const assinarRequerimentoSchema = z.object({
  metodo: z.enum(["senha", "gov_br", "certificado_digital"]),
  senha:  z.string().optional(),      // obrigatório se metodo=senha
  token:  z.string().optional(),      // para gov.br / certificado
});

export type Requerimento          = typeof requerimentosTable.$inferSelect;
export type RequerimentoTipo      = typeof requerimentoTiposTable.$inferSelect;
export type RequerimentoAssunto   = typeof requerimentoAssuntosTable.$inferSelect;
export type RequerimentoAssinatura = typeof requerimentoAssinaturasTable.$inferSelect;
