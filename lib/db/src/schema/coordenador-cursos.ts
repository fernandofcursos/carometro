import { pgTable, uuid, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { usuariosTable } from "./usuarios";
import { cursosTable } from "./cursos";

export const coordenadorCursosTable = pgTable("coordenador_cursos", {
  usuarioId: uuid("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  cursoId: uuid("curso_id").notNull().references(() => cursosTable.id, { onDelete: "cascade" }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.usuarioId, t.cursoId] })]);
