import { pgTable, uuid, text, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { usuariosTable } from "./usuarios";
import { turmasTable } from "./turmas";

export const avisosTable = pgTable("avisos", {
  id:           uuid("id").primaryKey().defaultRandom(),
  titulo:       varchar("titulo", { length: 200 }).notNull(),
  conteudo:     text("conteudo").notNull(),
  tipo:         varchar("tipo", { length: 20 }).notNull().default("aviso"),  // 'aviso' | 'informe'
  publicoAlvo:  varchar("publico_alvo", { length: 30 }).notNull().default("todos"), // 'estudantes' | 'responsaveis' | 'todos'
  turmaId:      uuid("turma_id").references(() => turmasTable.id, { onDelete: "set null" }),  // null = todos
  autorId:      uuid("autor_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  publicado:    boolean("publicado").notNull().default(false),
  criadoEm:     timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm:   timestamp("deletado_em",   { withTimezone: true }),
});

export const insertAvisoSchema = createInsertSchema(avisosTable, {
  titulo:      (s) => s.min(1, "Informe o título.").max(200),
  conteudo:    (s) => s.min(1, "Informe o conteúdo."),
  tipo:        z.enum(["aviso", "informe"]),
  publicoAlvo: z.enum(["estudantes", "responsaveis", "todos"]),
}).omit({ id: true, criadoEm: true, atualizadoEm: true, deletadoEm: true });

export type InsertAviso = z.infer<typeof insertAvisoSchema>;
export type Aviso = typeof avisosTable.$inferSelect;
