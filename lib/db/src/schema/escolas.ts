import { pgTable, uuid, varchar, char, boolean, timestamptz, jsonb } from "drizzle-orm/pg-core";

export const escolasTable = pgTable("escolas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: varchar("nome", { length: 300 }).notNull(),
  sigla: varchar("sigla", { length: 20 }).notNull().unique(),
  inep: varchar("inep", { length: 8 }).unique(),
  cnpj: varchar("cnpj", { length: 14 }),
  logradouro: varchar("logradouro", { length: 300 }),
  numero: varchar("numero", { length: 20 }),
  complemento: varchar("complemento", { length: 100 }),
  bairro: varchar("bairro", { length: 100 }),
  cidade: varchar("cidade", { length: 100 }).notNull().default("Brasília"),
  uf: char("uf", { length: 2 }).notNull().default("DF"),
  cep: varchar("cep", { length: 8 }),
  email: varchar("email", { length: 300 }),
  telefone: varchar("telefone", { length: 20 }),
  site: varchar("site", { length: 300 }),
  plano: varchar("plano", { length: 20 }).notNull().default("basico"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamptz("criado_em").notNull().defaultNow(),
  atualizadoEm: timestamptz("atualizado_em").notNull().defaultNow(),
  config: jsonb("config").notNull().default({}),
});

export type Escola = typeof escolasTable.$inferSelect;
export type NewEscola = typeof escolasTable.$inferInsert;
