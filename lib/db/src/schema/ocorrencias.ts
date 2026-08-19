import { pgTable, uuid, varchar, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { estudantesTable } from "./estudantes";
import { tiposOcorrenciasTable } from "./tipos-ocorrencias";
import { disciplinasTable } from "./disciplinas";
import { usuariosTable } from "./usuarios";
import { turnosTable } from "./turnos";

export const ocorrenciasTable = pgTable("ocorrencias", {
  id:                       uuid("id").primaryKey().defaultRandom(),
  estudanteId:              uuid("estudante_id").notNull().references(() => estudantesTable.id, { onDelete: "cascade" }),
  tipoOcorrenciaId:         uuid("tipo_ocorrencia_id").notNull().references(() => tiposOcorrenciasTable.id, { onDelete: "restrict" }),
  disciplinaId:             uuid("disciplina_id").references(() => disciplinasTable.id, { onDelete: "set null" }),
  turnoId:                  uuid("turno_id").references(() => turnosTable.id, { onDelete: "set null" }),
  registradoPorId:          uuid("registrado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  dataOcorrencia:           date("data_ocorrencia").notNull(),
  observacao:               varchar("observacao", { length: 300 }),
  cienteEm:                 timestamp("ciente_em", { withTimezone: true }),
  cientePorId:              uuid("ciente_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  notificacaoPaisEnviadaEm: timestamp("notificacao_pais_enviada_em", { withTimezone: true }),
  criadoEm:                 timestamp("criado_em",     { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm:             timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm:               timestamp("deletado_em",   { withTimezone: true }),
});

export const insertOcorrenciaSchema = createInsertSchema(ocorrenciasTable, {
  observacao: z.string().max(300).optional().nullable(),
}).omit({ id: true, criadoEm: true, atualizadoEm: true, deletadoEm: true, cienteEm: true, cientePorId: true, notificacaoPaisEnviadaEm: true });

export type InsertOcorrencia = z.infer<typeof insertOcorrenciaSchema>;
export type Ocorrencia = typeof ocorrenciasTable.$inferSelect;
