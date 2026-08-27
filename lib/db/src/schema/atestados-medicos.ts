import { pgTable, uuid, varchar, date, integer, char, timestamp, customType } from "drizzle-orm/pg-core";

const bytesAsBuffer = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return "bytea"; },
  toDriver(value: Buffer): Buffer { return value; },
  fromDriver(value: Buffer): Buffer { return value; },
});
import { estudantesTable } from "./estudantes";
import { usuariosTable } from "./usuarios";

// Atestado médico enviado pelo responsável — dados armazenados criptografados (LGPD art. 11 — dado sensível)
export const atestadosMedicosTable = pgTable("atestados_medicos", {
  id:               uuid("id").primaryKey().defaultRandom(),
  estudanteId:      uuid("estudante_id").notNull().references(() => estudantesTable.id, { onDelete: "cascade" }),
  responsavelId:    uuid("responsavel_id").notNull().references(() => usuariosTable.id,  { onDelete: "cascade" }),
  dataInicio:       date("data_inicio").notNull(),
  dataFim:          date("data_fim"),
  // Dados do arquivo (criptografado AES-256-CBC — chave via ENCRYPTION_KEY)
  nomeArquivo:      varchar("nome_arquivo", { length: 200 }).notNull(),
  mimeType:         varchar("mime_type",    { length: 60 }).notNull().default("application/pdf"),
  tamanhoBytes:     integer("tamanho_bytes").notNull(),
  iv:               char("iv", { length: 24 }).notNull(),
  hashIntegridade:  char("hash_integridade", { length: 64 }).notNull(),
  dados:            bytesAsBuffer("dados").notNull(),
  criadoEm:         timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:     timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
});

export type AtestadoMedico = typeof atestadosMedicosTable.$inferSelect;
