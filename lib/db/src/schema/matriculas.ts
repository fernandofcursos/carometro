import { pgTable, uuid, varchar, integer, smallint, boolean, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { usuariosTable } from "./usuarios";
import { turmasTable } from "./turmas";

export const matriculasTable = pgTable("matriculas", {
  id:         uuid("id").primaryKey().defaultRandom(),
  usuarioId:  uuid("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  turmaId:    uuid("turma_id").notNull().references(() => turmasTable.id, { onDelete: "restrict" }),
  registro:   varchar("registro", { length: 20 }).notNull(),
  ano:        integer("ano").notNull(),
  semestre:   smallint("semestre").notNull(),
  principal:  boolean("principal").notNull().default(true),
  ativo:      boolean("ativo").notNull().default(true),
  criadoEm:   timestamp("criado_em",    { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm: timestamp("deletado_em",  { withTimezone: true }),
}, (t) => [
  uniqueIndex("uq_matricula").on(t.usuarioId, t.turmaId, t.ano, t.semestre),
  check("ck_semestre", sql`${t.semestre} IN (1, 2)`),
]);

export const insertMatriculaSchema = createInsertSchema(matriculasTable, {
  registro:  z.string().min(1).max(20).regex(/^\d+$/, "Registro deve ser numérico"),
  ano:       z.number().int().min(2000).max(2100),
  semestre:  z.number().int().refine((v) => v === 1 || v === 2, "Semestre deve ser 1 ou 2"),
}).omit({ id: true, criadoEm: true, atualizadoEm: true, deletadoEm: true });

export type InsertMatricula = z.infer<typeof insertMatriculaSchema>;
export type Matricula = typeof matriculasTable.$inferSelect;
