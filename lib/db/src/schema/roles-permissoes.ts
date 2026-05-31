import { pgTable, uuid, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { rolesTable } from "./roles";
import { permissoesTable } from "./permissoes";

export const rolesPermissoesTable = pgTable("roles_permissoes", {
  roleId: uuid("role_id").notNull().references(() => rolesTable.id, { onDelete: "cascade" }),
  permissaoId: uuid("permissao_id").notNull().references(() => permissoesTable.id, { onDelete: "cascade" }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.roleId, t.permissaoId] }),
]);
