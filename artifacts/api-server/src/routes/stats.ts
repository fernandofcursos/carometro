import { Router, Request, Response } from "express";
import { db, estudantesTable, turmasTable, cursosTable, turnosTable, isNull, sql } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

// GET /api/stats — estatísticas gerais do sistema
router.get("/", async (req: Request, res: Response) => {
  try {
    const [[estudantes], [turmas], [cursos], [turnos]] = await Promise.all([
      db.select({ total: sql<number>`count(*)::int`, comFoto: sql<number>`count(*) filter (where foto_id is not null or foto_storage_key is not null)::int` })
        .from(estudantesTable)
        .where(isNull(estudantesTable.deletadoEm)),
      db.select({ total: sql<number>`count(*)::int` }).from(turmasTable),
      db.select({ total: sql<number>`count(*)::int` }).from(cursosTable),
      db.select({ total: sql<number>`count(*)::int` }).from(turnosTable),
    ]);

    const totalEstudantes = Number(estudantes?.total ?? 0);
    const comFoto = Number(estudantes?.comFoto ?? 0);

    res.json({
      totalEstudantes,
      totalTurmas: Number(turmas?.total ?? 0),
      totalCursos: Number(cursos?.total ?? 0),
      totalTurnos: Number(turnos?.total ?? 0),
      comFoto,
      semFoto: totalEstudantes - comFoto,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar estatísticas" });
  }
});

export default router;
