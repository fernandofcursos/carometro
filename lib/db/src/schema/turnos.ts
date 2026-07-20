import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const turnosTable = pgTable("turnos", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull().unique(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
});

export const insertTurnoSchema = createInsertSchema(turnosTable).omit({ id: true, criadoEm: true });
export type InsertTurno = z.infer<typeof insertTurnoSchema>;
export type Turno = typeof turnosTable.$inferSelect;
