import { Router } from "express";
import { z } from "zod";
import {
  db, horariosAulasTable, disciplinaOfertasTable, disciplinasTable,
  turmasTable, cursosTable, turnosTable, turmaTurnosTable,
  eq, and, ilike, or,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";

const router = Router();
router.use(requireAuth);

const slotSchema = z.object({
  turmaId:            z.string().uuid(),
  disciplinaOfertaId: z.string().uuid().nullable().optional(),
  diaSemana:          z.number().int().min(1).max(5),
  horaInicio:         z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  horaFim:            z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
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
        id:                 horariosAulasTable.id,
        diaSemana:          horariosAulasTable.diaSemana,
        horaInicio:         horariosAulasTable.horaInicio,
        horaFim:            horariosAulasTable.horaFim,
        sala:               horariosAulasTable.sala,
        disciplinaOfertaId: horariosAulasTable.disciplinaOfertaId,
        disciplinaNome:     disciplinasTable.nome,
        cursoNome:          cursosTable.nome,
        turnoNome:          turnosTable.nome,
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

// GET /api/horarios/turma-info?turmaId=  — retorna dados da turma + turnos vinculados
router.get("/turma-info", async (req, res) => {
  try {
    const { turmaId } = req.query;
    if (!turmaId) return res.status(400).json({ error: "turmaId obrigatório." });

    const [turma] = await db
      .select({ id: turmasTable.id, sigla: turmasTable.sigla, cursoNome: cursosTable.nome })
      .from(turmasTable)
      .innerJoin(cursosTable, eq(cursosTable.id, turmasTable.cursoId))
      .where(eq(turmasTable.id, String(turmaId)));

    if (!turma) return res.status(404).json({ error: "Turma não encontrada." });

    const turnos = await db
      .select({ id: turnosTable.id, nome: turnosTable.nome })
      .from(turmaTurnosTable)
      .innerJoin(turnosTable, eq(turnosTable.id, turmaTurnosTable.turnoId))
      .where(eq(turmaTurnosTable.turmaId, String(turmaId)))
      .orderBy(turnosTable.nome);

    res.json({ ...turma, turnos });
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Erro ao buscar informações da turma." });
  }
});

// GET /api/horarios/disciplinas-oferta?turmaId=&turnoId=
router.get("/disciplinas-oferta", async (req, res) => {
  try {
    const { turmaId, turnoId } = req.query;
    if (!turmaId) return res.status(400).json({ error: "turmaId obrigatório." });

    const [turma] = await db
      .select({ cursoId: turmasTable.cursoId })
      .from(turmasTable)
      .where(eq(turmasTable.id, String(turmaId)));

    if (!turma) return res.status(404).json({ error: "Turma não encontrada." });

    const filters = [eq(disciplinaOfertasTable.cursoId, turma.cursoId)];
    if (turnoId) filters.push(eq(disciplinaOfertasTable.turnoId, String(turnoId)));

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
      .where(and(...filters))
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
    // Normaliza HH:MM sem segundos
    const hi = body.horaInicio.slice(0, 5);
    const hf = body.horaFim.slice(0, 5);
    if (hf <= hi) {
      return res.status(400).json({ error: "Hora de fim deve ser posterior à hora de início." });
    }

    const [row] = await db
      .insert(horariosAulasTable)
      .values({
        turmaId:            body.turmaId,
        disciplinaOfertaId: body.disciplinaOfertaId ?? null,
        diaSemana:          body.diaSemana,
        horaInicio:         hi,
        horaFim:            hf,
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
    const hi = body.horaInicio ? body.horaInicio.slice(0, 5) : undefined;
    const hf = body.horaFim ? body.horaFim.slice(0, 5) : undefined;
    if (hi && hf && hf <= hi) {
      return res.status(400).json({ error: "Hora de fim deve ser posterior à hora de início." });
    }

    const [row] = await db
      .update(horariosAulasTable)
      .set({ ...body, horaInicio: hi, horaFim: hf, atualizadoEm: new Date() })
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

// POST /api/horarios/importar-urania — importação em lote do sistema Urania (JSON)
const uraniaHorarioSchema = z.object({
  diaSemana:  z.number().int().min(1).max(5),
  horaInicio: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  horaFim:    z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  disciplina: z.string().optional(),  // nome Urania — tentativa de match
  sala:       z.string().max(50).optional(),
});

const uraniaSchema = z.object({
  turmaId:  z.string().uuid(),
  ano:      z.number().int().min(2020).max(2100),
  semestre: z.union([z.literal(1), z.literal(2)]),
  horarios: z.array(uraniaHorarioSchema).min(1).max(500),
});

router.post("/importar-urania", requirePermissao("horarios:manage"), async (req, res) => {
  try {
    const body = uraniaSchema.parse(req.body);

    // Busca cursoId da turma para filtragem de disciplinas
    const [turma] = await db
      .select({ cursoId: turmasTable.cursoId })
      .from(turmasTable)
      .where(eq(turmasTable.id, body.turmaId));

    if (!turma) return res.status(404).json({ error: "Turma não encontrada." });

    // Carrega todas as disciplinas do curso para matching por nome
    const ofertasDB = await db
      .select({ id: disciplinaOfertasTable.id, disciplinaNome: disciplinasTable.nome })
      .from(disciplinaOfertasTable)
      .innerJoin(disciplinasTable, eq(disciplinasTable.id, disciplinaOfertasTable.disciplinaId))
      .where(eq(disciplinaOfertasTable.cursoId, turma.cursoId));

    function matchDisciplina(nomUrania: string | undefined): string | null {
      if (!nomUrania) return null;
      const busca = nomUrania.trim().toLowerCase();
      // Tenta match exato do nome
      const exato = ofertasDB.find((o) => o.disciplinaNome.toLowerCase() === busca);
      if (exato) return exato.id;
      // Tenta containment bidirecional
      const parcial = ofertasDB.find((o) =>
        o.disciplinaNome.toLowerCase().includes(busca) ||
        busca.includes(o.disciplinaNome.toLowerCase().substring(0, 6)),
      );
      return parcial?.id ?? null;
    }

    let criados = 0;
    let atualizados = 0;
    const naoCorrespondidos: string[] = [];

    for (const h of body.horarios) {
      const hi = h.horaInicio.slice(0, 5);
      const hf = h.horaFim.slice(0, 5);
      if (hf <= hi) continue;

      const disciplinaOfertaId = matchDisciplina(h.disciplina);
      if (h.disciplina && !disciplinaOfertaId && !naoCorrespondidos.includes(h.disciplina)) {
        naoCorrespondidos.push(h.disciplina);
      }

      try {
        await db
          .insert(horariosAulasTable)
          .values({
            turmaId:            body.turmaId,
            disciplinaOfertaId,
            diaSemana:          h.diaSemana,
            horaInicio:         hi,
            horaFim:            hf,
            sala:               h.sala ?? null,
            ano:                body.ano,
            semestre:           body.semestre,
          });
        criados++;
      } catch (e) {
        const code = (e as any)?.cause?.code ?? (e as any)?.code;
        if (code === "23505") {
          // Slot já existe — atualiza disciplina e sala se informados
          await db
            .update(horariosAulasTable)
            .set({ disciplinaOfertaId, sala: h.sala ?? null, atualizadoEm: new Date() })
            .where(and(
              eq(horariosAulasTable.turmaId, body.turmaId),
              eq(horariosAulasTable.diaSemana, h.diaSemana),
              eq(horariosAulasTable.horaInicio, hi),
              eq(horariosAulasTable.ano, body.ano),
              eq(horariosAulasTable.semestre, body.semestre),
            ));
          atualizados++;
        }
      }
    }

    res.json({
      total: body.horarios.length,
      criados,
      atualizados,
      semDisciplina: body.horarios.filter((h) => !matchDisciplina(h.disciplina)).length,
      naoCorrespondidos,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    req.log?.error(err);
    res.status(500).json({ error: "Erro ao importar horários." });
  }
});

export default router;
