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

    // Regras de seleção de disciplinas por módulo
    if (ids.length > 0) {
      const ofertaRows = await db
        .select({ id: disciplinaOfertasTable.id, cursoId: disciplinaOfertasTable.cursoId, turnoId: disciplinaOfertasTable.turnoId, moduloMenor: cursosTable.moduloMenor })
        .from(disciplinaOfertasTable)
        .innerJoin(cursosTable, eq(disciplinaOfertasTable.cursoId, cursosTable.id))
        .where(eq(disciplinaOfertasTable.ativo, true));

      const ofertaMap = new Map(ofertaRows.map((r) => [r.id, r]));

      // Agrupar selecionados por cursoId+turnoId
      type GrupoKey = string;
      const contPorGrupo = new Map<GrupoKey, { count: number; moduloMenor: boolean; cursoId: string; turnoId: string }>();
      for (const id of ids) {
        const oferta = ofertaMap.get(id);
        if (!oferta) continue;
        const key = `${oferta.cursoId}:${oferta.turnoId}`;
        const entry = contPorGrupo.get(key) ?? { count: 0, moduloMenor: oferta.moduloMenor, cursoId: oferta.cursoId, turnoId: oferta.turnoId };
        entry.count++;
        contPorGrupo.set(key, entry);
      }

      // Total de ofertas por cursoId+turnoId (para validar módulo maior)
      const totalPorGrupo = new Map<GrupoKey, number>();
      for (const o of ofertaRows) {
        const key = `${o.cursoId}:${o.turnoId}`;
        totalPorGrupo.set(key, (totalPorGrupo.get(key) ?? 0) + 1);
      }

      for (const [key, entry] of contPorGrupo) {
        if (entry.moduloMenor && entry.count > 3) {
          return res.status(422).json({ error: "Módulo menor: máximo 3 disciplinas por turno." });
        }
        if (!entry.moduloMenor) {
          const total = totalPorGrupo.get(key) ?? 0;
          if (total > 1 && entry.count > 1 && entry.count < total) {
            return res.status(422).json({ error: "Módulo maior: selecione uma ou todas as disciplinas do turno." });
          }
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
