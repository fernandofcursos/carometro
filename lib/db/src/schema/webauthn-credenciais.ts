import { pgTable, uuid, text, timestamp, boolean, bigint, customType } from "drizzle-orm/pg-core";
import { usuariosTable } from "./usuarios.js";

const bytesAsBuffer = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return "bytea"; },
  toDriver(value: Buffer): Buffer { return value; },
  fromDriver(value: Buffer): Buffer { return value; },
});

// Credenciais WebAuthn (FIDO2) por dispositivo.
// A chave privada NUNCA sai do hardware do dispositivo — armazenamos apenas a pública.
export const webauthnCredenciaisTable = pgTable("webauthn_credenciais", {
  id:              uuid("id").primaryKey().defaultRandom(),
  usuarioId:       uuid("usuario_id").notNull().references(() => usuariosTable.id),
  credentialId:    text("credential_id").notNull().unique(), // base64url, ID do autenticador
  publicKey:       bytesAsBuffer("public_key").notNull(),   // chave pública COSE (não sensível)
  counter:         bigint("counter", { mode: "number" }).notNull().default(0), // anti-replay
  deviceType:      text("device_type"),        // "platform" | "cross-platform"
  backedUp:        boolean("backed_up").default(false), // true = iCloud Keychain, Google Sync etc.
  nomeDispositivo: text("nome_dispositivo"),   // label definido pelo usuário
  criadoEm:        timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  ultimoUsoEm:     timestamp("ultimo_uso_em", { withTimezone: true }),
});

export type WebauthnCredencial = typeof webauthnCredenciaisTable.$inferSelect;
export type NovaWebauthnCredencial = typeof webauthnCredenciaisTable.$inferInsert;
