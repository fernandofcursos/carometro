import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";

// Re-exportar operadores do drizzle-orm para uso nos pacotes que dependem de @workspace/db
export { eq, and, or, isNull, isNotNull, gt, gte, lt, lte, ne, inArray, notInArray, like, ilike, sql } from "drizzle-orm";
export { desc, asc, count, alias } from "drizzle-orm"; // Fase 9: ordenação e agregação para auditoria
