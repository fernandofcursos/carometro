import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { estudantesTable } from "./estudantes";
import { usuariosTable } from "./usuarios";

export const estudanteNecessidadesEspeciaisTable = pgTable("estudante_necessidades_especiais", {
  id: uuid("id").primaryKey().defaultRandom(),
  estudanteId: uuid("estudante_id").notNull().references(() => estudantesTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  descricao: text("descricao"),
  laudoReferencia: text("laudo_referencia"),
  ativo: boolean("ativo").notNull().default(true),
  registradoEm: timestamp("registrado_em", { withTimezone: true }).defaultNow().notNull(),
  registradoPor: uuid("registrado_por").notNull().references(() => usuariosTable.id),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
});

export type EstudanteNecessidadeEspecial = typeof estudanteNecessidadesEspeciaisTable.$inferSelect;
