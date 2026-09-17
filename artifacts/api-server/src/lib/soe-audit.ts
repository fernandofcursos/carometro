import { db, soeAuditoriaTable } from "@workspace/db";
import { Request } from "express";

export interface SoeAuditoriaParams {
  req: Request;
  acao: string;
  estudanteId?: string;
  recursoId?: string;
  escolaId?: string;
}

export async function registrarAuditoriaSoe(params: SoeAuditoriaParams): Promise<void> {
  try {
    const escolaId = params.escolaId ?? (params.req as any).escolaId;
    await db.insert(soeAuditoriaTable).values({
      acao:        params.acao,
      usuarioId:   (params.req as any).usuarioId!,
      estudanteId: params.estudanteId,
      recursoId:   params.recursoId,
      escolaId,
      ipOrigem:    params.req.ip ?? (params.req.socket as any)?.remoteAddress,
      userAgent:   params.req.headers["user-agent"],
    });
  } catch (err) {
    console.error("[SOE AUDIT ERROR]", err instanceof Error ? err.message : err);
  }
}
