import { pgTable, uuid, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { avisosTable } from "./avisos";

export const avisosAnexosTable = pgTable("avisos_anexos", {
  id:           uuid("id").primaryKey().defaultRandom(),
  avisoId:      uuid("aviso_id").notNull().references(() => avisosTable.id, { onDelete: "cascade" }),
  nomeOriginal: varchar("nome_original", { length: 255 }).notNull(),
  nomeArquivo:  varchar("nome_arquivo", { length: 100 }).notNull(),
  mimeType:     varchar("mime_type", { length: 100 }).notNull(),
  tamanho:      integer("tamanho").notNull(),
  criadoEm:     timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
});
