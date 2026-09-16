import { db, aeeAuditoriaTable } from "@workspace/db";
import { Request } from "express";

export interface AeeAuditoriaParams {
  req: Request;
  acao: string;
  estudanteId?: string;
  recursoId?: string;
  escolaId?: string;
}

export async function registrarAuditoriaAee(params: AeeAuditoriaParams): Promise<void> {
  try {
    const escolaId = params.escolaId ?? (params.req as any).escolaId;
    await db.insert(aeeAuditoriaTable).values({
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
    console.error("[AEE AUDIT ERROR]", err instanceof Error ? err.message : err);
  }
}
