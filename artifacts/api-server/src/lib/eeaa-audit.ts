import { db, eeaaAuditoriaTable } from "@workspace/db";
import { Request } from "express";

export interface EeaaAuditoriaParams {
  req: Request;
  acao: string;
  estudanteId?: string;
  recursoId?: string;
  escolaId?: string;
}

export async function registrarAuditoriaEeaa(params: EeaaAuditoriaParams): Promise<void> {
  try {
    const escolaId = params.escolaId ?? (params.req as any).escolaId;
    await db.insert(eeaaAuditoriaTable).values({
      acao:        params.acao,
      usuarioId:   (params.req as any).usuarioId!,
      estudanteId: params.estudanteId,
      recursoId:   params.recursoId,
      escolaId:    escolaId,
      ipOrigem:    params.req.ip ?? params.req.socket?.remoteAddress,
      userAgent:   params.req.headers["user-agent"],
    });
  } catch (err) {
    // Falha de auditoria não derruba a operação, mas alerta em stderr
    console.error("[EEAA AUDIT ERROR]", err instanceof Error ? err.message : err);
  }
}
