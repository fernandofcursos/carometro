import { Router } from "express";
import { z } from "zod";
import {
  db, horariosAulasTable, disciplinaOfertasTable, disciplinasTable,
  turmasTable, cursosTable, turnosTable,
  eq, and,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";

const router = Router();
router.use(requireAuth);

const slotSchema = z.object({
  turmaId:            z.string().uuid(),
  disciplinaOfertaId: z.string().uuid().nullable().optional(),
  diaSemana:          z.number().int().min(1).max(5),
  horaInicio:         z.string().regex(/^\d{2}:\d{2}$/),
  horaFim:            z.string().regex(/^\d{2}:\d{2}$/),
  sala:               z.string().max(50).nullable().optional(),
  ano:                z.number().int().min(2020).max(2100),
  semestre:           z.union([z.literal(1), z.literal(2)]),
});

// GET /api/horarios?turmaId=&ano=&semestre=
router.get("/", async (req, res) => {
  try {
    const { turmaId, ano, semestre } = req.query;
    if (!turmaId || !ano || !semestre) {
      return res.status(400).json({ error: "Parâmetros turmaId, ano e semestre são obrigatórios." });
    }

    const slots = await db
      .select({
        id:               horariosAulasTable.id,
        diaSemana:        horariosAulasTable.diaSemana,
        horaInicio:       horariosAulasTable.horaInicio,
        horaFim:          horariosAulasTable.horaFim,
        sala:             horariosAulasTable.sala,
        disciplinaOfertaId: horariosAulasTable.disciplinaOfertaId,
        disciplinaNome:   disciplinasTable.nome,
        cursoNome:        cursosTable.nome,
        turnoNome:        turnosTable.nome,
      })
      .from(horariosAulasTable)
      .leftJoin(disciplinaOfertasTable, eq(disciplinaOfertasTable.id, horariosAulasTable.disciplinaOfertaId))
      .leftJoin(disciplinasTable, eq(disciplinasTable.id, disciplinaOfertasTable.disciplinaId))
      .leftJoin(cursosTable, eq(cursosTable.id, disciplinaOfertasTable.cursoId))
      .leftJoin(turnosTable, eq(turnosTable.id, disciplinaOfertasTable.turnoId))
      .where(and(
        eq(horariosAulasTable.turmaId, String(turmaId)),
        eq(horariosAulasTable.ano, Number(ano)),
        eq(horariosAulasTable.semestre, Number(semestre) as 1 | 2),
      ))
      .orderBy(horariosAulasTable.diaSemana, horariosAulasTable.horaInicio);

    res.json({ turmaId, ano: Number(ano), semestre: Number(semestre), slots });
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Erro ao buscar horários." });
  }
});

// GET /api/horarios/disciplinas-oferta?turmaId= — lista disciplinas disponíveis para uma turma
router.get("/disciplinas-oferta", async (req, res) => {
  try {
    const { turmaId } = req.query;
    if (!turmaId) return res.status(400).json({ error: "turmaId obrigatório." });

    // Busca cursoId da turma para filtrar disciplina_ofertas pelo curso
    const [turma] = await db
      .select({ cursoId: turmasTable.cursoId })
      .from(turmasTable)
      .where(eq(turmasTable.id, String(turmaId)));

    if (!turma) return res.status(404).json({ error: "Turma não encontrada." });

    const ofertas = await db
      .select({
        id:             disciplinaOfertasTable.id,
        disciplinaId:   disciplinaOfertasTable.disciplinaId,
        disciplinaNome: disciplinasTable.nome,
        turnoId:        disciplinaOfertasTable.turnoId,
        turnoNome:      turnosTable.nome,
      })
      .from(disciplinaOfertasTable)
      .innerJoin(disciplinasTable, eq(disciplinasTable.id, disciplinaOfertasTable.disciplinaId))
      .innerJoin(turnosTable, eq(turnosTable.id, disciplinaOfertasTable.turnoId))
      .where(eq(disciplinaOfertasTable.cursoId, turma.cursoId))
      .orderBy(disciplinasTable.nome);

    res.json(ofertas);
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Erro ao buscar disciplinas." });
  }
});

// POST /api/horarios
router.post("/", requirePermissao("horarios:manage"), async (req, res) => {
  try {
    const body = slotSchema.parse(req.body);
    if (body.horaFim <= body.horaInicio) {
      return res.status(400).json({ error: "Hora de fim deve ser posterior à hora de início." });
    }

    const [row] = await db
      .insert(horariosAulasTable)
      .values({
        turmaId:            body.turmaId,
        disciplinaOfertaId: body.disciplinaOfertaId ?? null,
        diaSemana:          body.diaSemana,
        horaInicio:         body.horaInicio,
        horaFim:            body.horaFim,
        sala:               body.sala ?? null,
        ano:                body.ano,
        semestre:           body.semestre,
      })
      .returning();

    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    const code = (err as any)?.cause?.code ?? (err as any)?.code;
    if (code === "23505") return res.status(409).json({ error: "Já existe um slot neste dia e horário para esta turma." });
    req.log?.error(err);
    res.status(500).json({ error: "Erro ao criar slot de horário." });
  }
});

// PUT /api/horarios/:id
router.put("/:id", requirePermissao("horarios:manage"), async (req, res) => {
  try {
    const body = slotSchema.partial().parse(req.body);
    if (body.horaInicio && body.horaFim && body.horaFim <= body.horaInicio) {
      return res.status(400).json({ error: "Hora de fim deve ser posterior à hora de início." });
    }

    const [row] = await db
      .update(horariosAulasTable)
      .set({ ...body, atualizadoEm: new Date() })
      .where(eq(horariosAulasTable.id, req.params.id))
      .returning();

    if (!row) return res.status(404).json({ error: "Slot não encontrado." });
    res.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    req.log?.error(err);
    res.status(500).json({ error: "Erro ao atualizar slot." });
  }
});

// DELETE /api/horarios/:id
router.delete("/:id", requirePermissao("horarios:manage"), async (req, res) => {
  try {
    const [row] = await db
      .delete(horariosAulasTable)
      .where(eq(horariosAulasTable.id, req.params.id))
      .returning({ id: horariosAulasTable.id });
    if (!row) return res.status(404).json({ error: "Slot não encontrado." });
    res.json({ ok: true });
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Erro ao excluir slot." });
  }
});

export default router;
