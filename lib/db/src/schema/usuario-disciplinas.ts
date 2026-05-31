import { pgTable, uuid, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { usuariosTable } from "./usuarios";
import { disciplinaOfertasTable } from "./disciplina-ofertas";

export const usuarioDisciplinasTable = pgTable("usuario_disciplinas", {
  usuarioId: uuid("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  disciplinaOfertaId: uuid("disciplina_oferta_id").notNull().references(() => disciplinaOfertasTable.id, { onDelete: "cascade" }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.usuarioId, t.disciplinaOfertaId] })]);
