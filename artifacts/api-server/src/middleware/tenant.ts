import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function withTenant<T>(escolaId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.current_escola_id = ${escolaId}`);
    await tx.execute(sql`SET LOCAL app.is_super_admin = 'false'`);
    return await fn(tx);
  });
}

export async function withSuperAdmin<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.is_super_admin = 'true'`);
    return await fn(tx);
  });
}

export function requireTenant(req: Request, res: Response, next: NextFunction) {
  const escolaId = (req as any).escolaId;
  if (!escolaId) {
    return res.status(400).json({ error: "Contexto de escola não definido." });
  }
  res.locals.escolaId = escolaId;
  next();
}
