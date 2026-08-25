import { Router, Request, Response } from "express";
import {
  db, usuarioDisciplinasTable, disciplinaOfertasTable, disciplinasTable,
  cursosTable, turnosTable,
  eq, and,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";

const router = Router();
router.use(requireAuth);

// GET /api/usuario-disciplinas/ofertas — todas as ofertas com nomes (para o selector)
router.get("/ofertas", requirePermissao("estudantes:manage"), async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id:             disciplinaOfertasTable.id,
        disciplinaId:   disciplinaOfertasTable.disciplinaId,
        disciplinaNome: disciplinasTable.nome,
        cursoId:        disciplinaOfertasTable.cursoId,
        cursoNome:      cursosTable.nome,
        moduloMenor:    cursosTable.moduloMenor,
        turnoId:        disciplinaOfertasTable.turnoId,
        turnoNome:      turnosTable.nome,
      })
      .from(disciplinaOfertasTable)
      .innerJoin(disciplinasTable, eq(disciplinaOfertasTable.disciplinaId, disciplinasTable.id))
      .innerJoin(cursosTable,      eq(disciplinaOfertasTable.cursoId,      cursosTable.id))
      .innerJoin(turnosTable,      eq(disciplinaOfertasTable.turnoId,      turnosTable.id))
      .where(eq(disciplinaOfertasTable.ativo, true))
      .orderBy(cursosTable.nome, turnosTable.nome, disciplinasTable.nome);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar ofertas" });
  }
});

// GET /api/usuario-disciplinas/:usuarioId — disciplinas do usuário
router.get("/:usuarioId", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({ disciplinaOfertaId: usuarioDisciplinasTable.disciplinaOfertaId })
      .from(usuarioDisciplinasTable)
      .where(eq(usuarioDisciplinasTable.usuarioId, String(req.params.usuarioId)));

    res.json(rows.map((r) => r.disciplinaOfertaId));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar disciplinas" });
  }
});

// PUT /api/usuario-disciplinas/:usuarioId — substituição em bloco
router.put("/:usuarioId", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const usuarioId = String(req.params.usuarioId);
    const ids = (req.body as { disciplinaOfertaIds?: string[] }).disciplinaOfertaIds ?? [];

    // Regra: módulo menor — máximo 2 disciplinas por curso
    if (ids.length > 0) {
      const ofertaRows = await db
        .select({ id: disciplinaOfertasTable.id, cursoId: disciplinaOfertasTable.cursoId, moduloMenor: cursosTable.moduloMenor })
        .from(disciplinaOfertasTable)
        .innerJoin(cursosTable, eq(disciplinaOfertasTable.cursoId, cursosTable.id))
        .where(eq(disciplinaOfertasTable.ativo, true));

      const ofertaMap = new Map(ofertaRows.map((r) => [r.id, r]));
      const contPorCurso = new Map<string, { count: number; moduloMenor: boolean }>();

      for (const id of ids) {
        const oferta = ofertaMap.get(id);
        if (!oferta) continue;
        const entry = contPorCurso.get(oferta.cursoId) ?? { count: 0, moduloMenor: oferta.moduloMenor };
        entry.count++;
        contPorCurso.set(oferta.cursoId, entry);
      }

      for (const [, entry] of contPorCurso) {
        if (entry.moduloMenor && entry.count > 2) {
          return res.status(422).json({
            error: "Estudantes de módulo menor não podem cursar mais de 2 disciplinas por curso.",
          });
        }
      }
    }

    // Remove todas as disciplinas atuais e insere as novas (bulk replace)
    await db.delete(usuarioDisciplinasTable)
      .where(eq(usuarioDisciplinasTable.usuarioId, usuarioId));

    if (ids.length > 0) {
      await db.insert(usuarioDisciplinasTable)
        .values(ids.map((disciplinaOfertaId) => ({ usuarioId, disciplinaOfertaId })));
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao salvar disciplinas" });
  }
});

export default router;
