import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const tiposAvisosInformesTable = pgTable("tipos_avisos_informes", {
  id:             uuid("id").primaryKey().defaultRandom(),
  nome:           varchar("nome", { length: 100 }).notNull().unique(),
  descricao:      text("descricao"),
  categoria:      varchar("categoria", { length: 10 }).notNull(), // 'aviso' | 'informe'
  ehCardapio:     boolean("eh_cardapio").notNull().default(false),
  // JSON array de nomes de roles: ["estudante","professor","coordenador","pai_responsavel","equipe_gestora","todos"]
  perfisDestino:  text("perfis_destino").array().notNull().default([]),
  ativo:          boolean("ativo").notNull().default(true),
  criadoEm:       timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:   timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm:     timestamp("deletado_em",   { withTimezone: true }),
});

export const insertTipoAvisoSchema = createInsertSchema(tiposAvisosInformesTable, {
  nome:       (s) => s.min(1, "Informe o nome do tipo.").max(100),
  categoria:  z.enum(["aviso", "informe"]),
  perfisDestino: z.array(z.string()).default([]),
}).omit({ id: true, criadoEm: true, atualizadoEm: true, deletadoEm: true });

export type TipoAvisoInforme = typeof tiposAvisosInformesTable.$inferSelect;
