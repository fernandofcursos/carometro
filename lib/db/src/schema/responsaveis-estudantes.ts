import { pgTable, uuid, timestamp, unique } from "drizzle-orm/pg-core";
import { usuariosTable } from "./usuarios";
import { estudantesTable } from "./estudantes";

// Vincula um usuário com role 'pai_responsavel' a um ou mais estudantes
export const responsaveisEstudantesTable = pgTable("responsaveis_estudantes", {
  id:           uuid("id").primaryKey().defaultRandom(),
  usuarioId:    uuid("usuario_id").notNull().references(() => usuariosTable.id,   { onDelete: "cascade" }),
  estudanteId:  uuid("estudante_id").notNull().references(() => estudantesTable.id, { onDelete: "cascade" }),
  criadoEm:     timestamp("criado_em",  { withTimezone: true }).defaultNow().notNull(),
  criadoPorId:  uuid("criado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
}, (t) => [
  unique("uq_responsavel_estudante").on(t.usuarioId, t.estudanteId),
]);

export type ResponsavelEstudante = typeof responsaveisEstudantesTable.$inferSelect;
