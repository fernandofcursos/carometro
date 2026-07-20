import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const statusEnum = pgEnum("status_ocorrencia", ["ativo", "inativo"]);

export const tiposOcorrenciasTable = pgTable("tipos_ocorrencias", {
  id: uuid("id").primaryKey().defaultRandom(),
  descricao: text("descricao").notNull().unique(),
  status: statusEnum("status").notNull().default("ativo"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
});

export const insertTipoOcorrenciaSchema = createInsertSchema(tiposOcorrenciasTable).omit({ id: true, criadoEm: true, atualizadoEm: true });
export type InsertTipoOcorrencia = z.infer<typeof insertTipoOcorrenciaSchema>;
export type TipoOcorrencia = typeof tiposOcorrenciasTable.$inferSelect;
