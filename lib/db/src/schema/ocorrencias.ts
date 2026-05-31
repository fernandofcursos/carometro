import { pgTable, uuid, text, timestamp, date } from "drizzle-orm/pg-core";
import { estudantesTable } from "./estudantes";
import { tiposOcorrenciasTable } from "./tipos-ocorrencias";
import { disciplinasTable } from "./disciplinas";
import { usuariosTable } from "./usuarios";

export const ocorrenciasTable = pgTable("ocorrencias", {
  id: uuid("id").primaryKey().defaultRandom(),
  estudanteId: uuid("estudante_id").notNull().references(() => estudantesTable.id, { onDelete: "cascade" }),
  tipoOcorrenciaId: uuid("tipo_ocorrencia_id").notNull().references(() => tiposOcorrenciasTable.id, { onDelete: "restrict" }),
  disciplinaId: uuid("disciplina_id").references(() => disciplinasTable.id, { onDelete: "set null" }),
  registradoPorId: uuid("registrado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  dataOcorrencia: date("data_ocorrencia").notNull(),
  observacao: text("observacao"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm: timestamp("deletado_em", { withTimezone: true }),
});

export type Ocorrencia = typeof ocorrenciasTable.$inferSelect;
