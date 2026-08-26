import { pgTable, uuid, varchar, char, integer, timestamp, uniqueIndex, customType } from "drizzle-orm/pg-core";

const bytesAsBuffer = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return "bytea"; },
  toDriver(value: Buffer): Buffer { return value; },
  fromDriver(value: Buffer): Buffer { return value; },
});

export const fotosTable = pgTable("fotos", {
  id: uuid("id").primaryKey().defaultRandom(),
  entidadeTipo: varchar("entidade_tipo", { length: 20 }).notNull(),
  entidadeId: uuid("entidade_id").notNull(),
  mimeType: varchar("mime_type", { length: 20 }).notNull().default("image/jpeg"),
  tamanhoBytes: integer("tamanho_bytes").notNull(),
  iv: char("iv", { length: 24 }).notNull(),
  hashIntegridade: char("hash_integridade", { length: 64 }).notNull(),
  dados: bytesAsBuffer("dados").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_fotos_entidade").on(t.entidadeTipo, t.entidadeId),
]);

export type Foto = typeof fotosTable.$inferSelect;
