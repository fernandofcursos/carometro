import { pgTable, uuid, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { usuariosTable } from "./usuarios";
import { rolesTable } from "./roles";

export const usuariosRolesTable = pgTable("usuarios_roles", {
  usuarioId: uuid("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => rolesTable.id, { onDelete: "cascade" }),
  concedidoEm: timestamp("concedido_em", { withTimezone: true }).defaultNow().notNull(),
  concedidoPor: uuid("concedido_por"),
  expiraEm: timestamp("expira_em", { withTimezone: true }),
}, (t) => [
  primaryKey({ columns: [t.usuarioId, t.roleId] }),
]);
