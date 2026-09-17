import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tiposOcorrenciasTable } from "./tipos-ocorrencias";

export const textosPadraoOcorrenciasTable = pgTable("textos_padrao_ocorrencias", {
  id: uuid("id").primaryKey().defaultRandom(),
  tipoOcorrenciaId: uuid("tipo_ocorrencia_id")
    .notNull()
    .references(() => tiposOcorrenciasTable.id, { onDelete: "cascade" }),
  titulo: varchar("titulo", { length: 200 }).notNull(),
  corpo: text("corpo").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm: timestamp("deletado_em", { withTimezone: true }),
});

export const insertTextoPadraoSchema = createInsertSchema(textosPadraoOcorrenciasTable).omit({
  id: true,
  criadoEm: true,
  atualizadoEm: true,
  deletadoEm: true,
});

export type InsertTextoPadrao = z.infer<typeof insertTextoPadraoSchema>;
export type TextoPadrao = typeof textosPadraoOcorrenciasTable.$inferSelect;
