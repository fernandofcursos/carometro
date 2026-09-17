import { pgTable, uuid, varchar, primaryKey } from "drizzle-orm/pg-core";
import { avisosTable } from "./avisos";

export const avisosPublicosAlvoTable = pgTable("avisos_publicos_alvo", {
  avisoId: uuid("aviso_id").notNull().references(() => avisosTable.id, { onDelete: "cascade" }),
  perfil:  varchar("perfil", { length: 30 }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.avisoId, t.perfil] }),
]);

export type AvisoPublicoAlvo = typeof avisosPublicosAlvoTable.$inferSelect;
