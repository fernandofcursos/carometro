import { pgTable, uuid, text, timestamp, boolean, smallint, customType, char, varchar, integer } from "drizzle-orm/pg-core";

const bytesAsString = customType<{ data: string; driverData: Buffer }>({
  dataType() { return "bytea"; },
  toDriver(value: string): Buffer { return Buffer.from(value, "utf8"); },
  fromDriver(value: Buffer): string { return value.toString("utf8"); },
});

export const usuariosTable = pgTable("usuarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome"),
  emailEncrypted: bytesAsString("email_encrypted").notNull(),
  emailHash: char("email_hash", { length: 64 }).notNull().unique(),
  emailVerificado: boolean("email_verificado").notNull().default(false),
  senhaHash: text("senha_hash").notNull(),
  codigoAcesso: text("codigo_acesso").notNull().unique(),
  primeiroAcesso: boolean("primeiro_acesso").notNull().default(true),
  tentativasLoginFalhas: smallint("tentativas_login_falhas").notNull().default(0),
  bloqueadoAte: timestamp("bloqueado_ate", { withTimezone: true }),
  ultimoLoginEm: timestamp("ultimo_login_em", { withTimezone: true }),
  fotoStorageKey: varchar("foto_storage_key", { length: 200 }),
  fotoIv: char("foto_iv", { length: 24 }),
  fotoMimeType: varchar("foto_mime_type", { length: 20 }),
  fotoTamanhoBytes: integer("foto_tamanho_bytes"),
  fotoHashIntegridade: char("foto_hash_integridade", { length: 64 }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm: timestamp("deletado_em", { withTimezone: true }),
});

export type Usuario = typeof usuariosTable.$inferSelect;
