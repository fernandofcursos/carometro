import { pgTable, uuid, varchar, text, integer, timestamptz } from "drizzle-orm/pg-core";
import { escolasTable } from "./escolas";
import { usuariosTable } from "./usuarios";

export const iaDocumentosTable = pgTable("ia_documentos", {
  id: uuid("id").primaryKey().defaultRandom(),
  escolaId: uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  titulo: varchar("titulo", { length: 300 }).notNull(),
  tipo: varchar("tipo", { length: 50 }).notNull(),
  fonte: varchar("fonte", { length: 500 }),
  conteudoRaw: text("conteudo_raw"),
  status: varchar("status", { length: 20 }).notNull().default("pendente"),
  indexadoEm: timestamptz("indexado_em"),
  criadoPorId: uuid("criado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  criadoEm: timestamptz("criado_em").notNull().defaultNow(),
  atualizadoEm: timestamptz("atualizado_em").notNull().defaultNow(),
});

export const iaChunksTable = pgTable("ia_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  escolaId: uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  documentoId: uuid("documento_id").notNull().references(() => iaDocumentosTable.id, { onDelete: "cascade" }),
  conteudo: text("conteudo").notNull(),
  posicao: integer("posicao").notNull(),
  tokens: integer("tokens"),
  criadoEm: timestamptz("criado_em").notNull().defaultNow(),
});

export const iaConversasTable = pgTable("ia_conversas", {
  id: uuid("id").primaryKey().defaultRandom(),
  escolaId: uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  usuarioId: uuid("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  titulo: varchar("titulo", { length: 300 }),
  contexto: varchar("contexto", { length: 50 }).notNull().default("geral"),
  tokensTotais: integer("tokens_totais").notNull().default(0),
  criadoEm: timestamptz("criado_em").notNull().defaultNow(),
  atualizadoEm: timestamptz("atualizado_em").notNull().defaultNow(),
});

export const iaMensagensTable = pgTable("ia_mensagens", {
  id: uuid("id").primaryKey().defaultRandom(),
  escolaId: uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  conversaId: uuid("conversa_id").notNull().references(() => iaConversasTable.id, { onDelete: "cascade" }),
  papel: varchar("papel", { length: 10 }).notNull(),
  conteudo: text("conteudo").notNull(),
  tokens: integer("tokens"),
  modelo: varchar("modelo", { length: 100 }),
  latenciaMs: integer("latencia_ms"),
  criadoEm: timestamptz("criado_em").notNull().defaultNow(),
});

export const iaCacheTable = pgTable("ia_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  escolaId: uuid("escola_id").notNull().references(() => escolasTable.id, { onDelete: "cascade" }),
  hashQuery: varchar("hash_query", { length: 64 }).notNull(),
  resposta: text("resposta").notNull(),
  hits: integer("hits").notNull().default(1),
  expiraEm: timestamptz("expira_em").notNull(),
  criadoEm: timestamptz("criado_em").notNull().defaultNow(),
});
