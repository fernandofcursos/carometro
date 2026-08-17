import { pgTable, uuid, text, timestamp, date, integer, varchar, char, customType } from "drizzle-orm/pg-core";
import { turmasTable } from "./turmas";
import { usuariosTable } from "./usuarios";

// Fase 5: customType para armazenar bytes (foto criptografada AES-256) diretamente no PostgreSQL
const bytesAsBuffer = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return "bytea"; },
  toDriver(value: Buffer): Buffer { return value; },
  fromDriver(value: Buffer): Buffer { return value; },
});

export const estudantesTable = pgTable("estudantes", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  registro: text("registro").notNull().unique(),
  observacao: text("observacao"),
  turmaId: uuid("turma_id").notNull().references(() => turmasTable.id, { onDelete: "restrict" }),
  fotoStorageKey: varchar("foto_storage_key", { length: 200 }),
  fotoIv: char("foto_iv", { length: 24 }),
  fotoMimeType: varchar("foto_mime_type", { length: 20 }),
  fotoTamanhoBytes: integer("foto_tamanho_bytes"),
  fotoHashIntegridade: char("foto_hash_integridade", { length: 64 }),
  fotoDados: bytesAsBuffer("foto_dados"),
  dataNascimento: date("data_nascimento"),
  usuarioId: uuid("usuario_id").references(() => usuariosTable.id, { onDelete: "set null" }).unique(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm: timestamp("deletado_em", { withTimezone: true }),
});

export const estudanteEmailsTable = pgTable("estudante_emails", {
  id: uuid("id").primaryKey().defaultRandom(),
  estudanteId: uuid("estudante_id").notNull().references(() => estudantesTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  tipo: text("tipo").$type<"proprio" | "responsavel">().notNull(),
});

export type Estudante = typeof estudantesTable.$inferSelect;
export type EstudanteEmail = typeof estudanteEmailsTable.$inferSelect;
