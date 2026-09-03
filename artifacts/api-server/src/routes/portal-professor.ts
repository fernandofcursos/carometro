import { Router, Request, Response } from "express";
import {
  db,
  usuariosTable,
  disciplinasTable,
  disciplinaOfertasTable,
  usuarioDisciplinasTable,
  turmasTable,
  cursosTable,
  turnosTable,
  ocorrenciasTable,
  tiposOcorrenciasTable,
  estudantesTable,
  matriculasTable,
  eq,
  and,
  isNull,
  inArray,
  desc,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { registrarAuditoria } from "../lib/audit.js";
import { z, ZodError } from "zod";

const router = Router();
router.use(requireAuth);

// ── helpers ───────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json() as T;
}

// ── GET /api/portal-professor/me ──────────────────────────────────────────────
// Dados do professor logado + disciplinas vinculadas (curso/turno)

router.get("/me", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;

    const [usuario] = await db
      .select({ id: usuariosTable.id, nome: usuariosTable.nome, fotoId: usuariosTable.fotoId })
      .from(usuariosTable)
      .where(and(eq(usuariosTable.id, usuarioId), isNull(usuariosTable.deletadoEm)));

    if (!usuario) return res.status(404).json({ error: "Professor não encontrado." });

    const fotoUrl = usuario.fotoId
      ? `/api/fotos/${usuarioId}`
      : null;

    // Disciplinas vinculadas ao professor
    const discRows = await db
      .select({
        ofertaId:        disciplinaOfertasTable.id,
        disciplinaId:    disciplinasTable.id,
        disciplinaNome:  disciplinasTable.nome,
        disciplinaSigla: disciplinasTable.sigla,
        cursoId:         cursosTable.id,
        cursoNome:       cursosTable.nome,
        turnoId:         turnosTable.id,
        turnoNome:       turnosTable.nome,
        turmaId:         turmasTable.id,
        turmaSigla:      turmasTable.sigla,
      })
      .from(usuarioDisciplinasTable)
      .innerJoin(disciplinaOfertasTable, eq(disciplinaOfertasTable.id, usuarioDisciplinasTable.disciplinaOfertaId))
      .innerJoin(disciplinasTable, eq(disciplinasTable.id, disciplinaOfertasTable.disciplinaId))
      .innerJoin(cursosTable, eq(cursosTable.id, disciplinaOfertasTable.cursoId))
      .innerJoin(turnosTable, eq(turnosTable.id, disciplinaOfertasTable.turnoId))
      .leftJoin(turmasTable, and(eq(turmasTable.cursoId, cursosTable.id), isNull(turmasTable.deletadoEm)))
      .where(eq(usuarioDisciplinasTable.usuarioId, usuarioId))
      .orderBy(cursosTable.nome, disciplinasTable.nome);

    res.json({ ...usuario, fotoUrl, disciplinas: discRows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar dados do professor." });
  }
});

// ── GET /api/portal-professor/dashboard ───────────────────────────────────────
// Dados consolidados do dashboard: horários por curso, cardápio, calendário

router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;
    const hoje = new Date();
    const hojeStr = hoje.toISOString().slice(0, 10);
    const diaSemana = hoje.getDay(); // 0=dom…6=sab

    const DIA_NOME = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

    // Disciplinas do professor → turmas vinculadas
    const ofertaRows = await db
      .select({
        ofertaId:        disciplinaOfertasTable.id,
        disciplinaId:    disciplinasTable.id,
        disciplinaNome:  disciplinasTable.nome,
        disciplinaSigla: disciplinasTable.sigla,
        cursoId:         cursosTable.id,
        cursoNome:       cursosTable.nome,
        turnoId:         turnosTable.id,
        turnoNome:       turnosTable.nome,
      })
      .from(usuarioDisciplinasTable)
      .innerJoin(disciplinaOfertasTable, eq(disciplinaOfertasTable.id, usuarioDisciplinasTable.disciplinaOfertaId))
      .innerJoin(disciplinasTable, eq(disciplinasTable.id, disciplinaOfertasTable.disciplinaId))
      .innerJoin(cursosTable, eq(cursosTable.id, disciplinaOfertasTable.cursoId))
      .innerJoin(turnosTable, eq(turnosTable.id, disciplinaOfertasTable.turnoId))
      .where(eq(usuarioDisciplinasTable.usuarioId, usuarioId));

    const ofertaIds = ofertaRows.map((o) => o.ofertaId);

    // Quadro de horários por curso (agrupa horários das turmas que o professor leciona)
    type HorarioCurso = {
      cursoId: string; cursoNome: string;
      turnoId: string; turnoNome: string;
      agenda: { dia: number; diaNome: string; aulas: { horaInicio: string; horaFim: string; disciplinaNome: string; disciplinaSigla: string; turmaSigla: string; sala: string | null }[] }[];
    };

    let horariosPorCurso: HorarioCurso[] = [];
    let horariosDisponiveis = false;

    try {
      const { horariosAulasTable } = await import("@workspace/db/schema") as any;
      if (horariosAulasTable && ofertaIds.length > 0) {
        const anoAtual = hoje.getFullYear();
        const semestreAtual: 1 | 2 = hoje.getMonth() < 6 ? 1 : 2;

        const slots = await db
          .select({
            dia:             horariosAulasTable.diaSemana,
            horaInicio:      horariosAulasTable.horaInicio,
            horaFim:         horariosAulasTable.horaFim,
            sala:            horariosAulasTable.sala,
            disciplinaNome:  disciplinasTable.nome,
            disciplinaSigla: disciplinasTable.sigla,
            cursoId:         cursosTable.id,
            cursoNome:       cursosTable.nome,
            turnoId:         turnosTable.id,
            turnoNome:       turnosTable.nome,
            turmaSigla:      turmasTable.sigla,
          })
          .from(horariosAulasTable)
          .innerJoin(disciplinaOfertasTable, eq(disciplinaOfertasTable.id, horariosAulasTable.disciplinaOfertaId))
          .innerJoin(disciplinasTable, eq(disciplinasTable.id, disciplinaOfertasTable.disciplinaId))
          .innerJoin(cursosTable, eq(cursosTable.id, disciplinaOfertasTable.cursoId))
          .innerJoin(turnosTable, eq(turnosTable.id, disciplinaOfertasTable.turnoId))
          .innerJoin(turmasTable, eq(turmasTable.id, horariosAulasTable.turmaId))
          .where(and(
            inArray(horariosAulasTable.disciplinaOfertaId, ofertaIds),
            eq(horariosAulasTable.ano, anoAtual),
            eq(horariosAulasTable.semestre, semestreAtual),
          ))
          .orderBy(horariosAulasTable.diaSemana, horariosAulasTable.horaInicio);

        horariosDisponiveis = true;

        // Agrupar por curso+turno
        const cursoMap = new Map<string, HorarioCurso>();
        for (const s of slots) {
          const key = `${s.cursoId}:${s.turnoId}`;
          if (!cursoMap.has(key)) {
            cursoMap.set(key, {
              cursoId: s.cursoId, cursoNome: s.cursoNome,
              turnoId: s.turnoId, turnoNome: s.turnoNome,
              agenda: [1, 2, 3, 4, 5].map((d) => ({ dia: d, diaNome: DIA_NOME[d], aulas: [] })),
            });
          }
          const diaAgenda = cursoMap.get(key)!.agenda.find((a) => a.dia === s.dia);
          if (diaAgenda) {
            diaAgenda.aulas.push({
              horaInicio: String(s.horaInicio).slice(0, 5),
              horaFim: String(s.horaFim).slice(0, 5),
              disciplinaNome: s.disciplinaNome,
              disciplinaSigla: s.disciplinaSigla ?? s.disciplinaNome.slice(0, 6),
              turmaSigla: s.turmaSigla,
              sala: s.sala,
            });
          }
        }
        horariosPorCurso = [...cursoMap.values()];
      }
    } catch { /* horarios_aulas ainda não existe */ }

    // Cardápio da semana (compartilhado)
    let cardapioDisponivel = false;
    let cardapio: { dia: number; diaNome: string; data: string; itens: { refeicao: string; descricao: string }[] }[] = [];
    try {
      const { cardapiosTable } = await import("@workspace/db/schema") as any;
      if (cardapiosTable) {
        const { gte, lte } = await import("@workspace/db") as any;
        const seg = new Date(hoje);
        seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
        const sex = new Date(seg); sex.setDate(seg.getDate() + 4);
        const segStr = seg.toISOString().slice(0, 10);
        const sexStr = sex.toISOString().slice(0, 10);
        const rows = await db
          .select({ data: cardapiosTable.data, refeicao: cardapiosTable.refeicao, descricao: cardapiosTable.descricao })
          .from(cardapiosTable)
          .where(and(
            gte(cardapiosTable.data, segStr),
            lte(cardapiosTable.data, sexStr),
            eq(cardapiosTable.publicado, true),
          ));
        if (rows.length > 0) {
          cardapioDisponivel = true;
          const byData = new Map<string, typeof rows>();
          for (const r of rows) {
            const d = String(r.data);
            if (!byData.has(d)) byData.set(d, []);
            byData.get(d)!.push(r);
          }
          const DIAS_PT = ["", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];
          cardapio = [...byData.entries()].map(([data, itens]) => {
            const dt = new Date(data + "T12:00:00");
            const dia = dt.getDay() === 0 ? 7 : dt.getDay();
            return { dia, diaNome: DIAS_PT[dia] ?? data, data, itens: itens.map((i) => ({ refeicao: i.refeicao, descricao: i.descricao })) };
          }).sort((a, b) => a.dia - b.dia);
        }
      }
    } catch { /* cardapios ainda não existe */ }

    // Avisos publicados (do próprio professor + turmas em que leciona)
    let avisos: { id: string; titulo: string; conteudo: string; tipo: string; publicoAlvo: string; turmaSigla: string | null; criadoEm: string }[] = [];
    try {
      const { avisosTable } = await import("@workspace/db/schema") as any;
      if (avisosTable) {
        const rows = await db
          .select({
            id:          avisosTable.id,
            titulo:      avisosTable.titulo,
            conteudo:    avisosTable.conteudo,
            tipo:        avisosTable.tipo,
            publicoAlvo: avisosTable.publicoAlvo,
            turmaSigla:  turmasTable.sigla,
            criadoEm:    avisosTable.criadoEm,
          })
          .from(avisosTable)
          .leftJoin(turmasTable, eq(turmasTable.id, avisosTable.turmaId))
          .where(and(eq(avisosTable.autorId, usuarioId), isNull(avisosTable.deletadoEm)))
          .orderBy(desc(avisosTable.criadoEm))
          .limit(20);
        avisos = rows;
      }
    } catch { /* avisos ainda não existe */ }

    res.json({
      hoje: hojeStr,
      diaSemana,
      horariosDisponiveis,
      horariosPorCurso,
      cardapioDisponivel,
      cardapio,
      avisos,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar dashboard." });
  }
});

// ── GET /api/portal-professor/ocorrencias ─────────────────────────────────────
// Ocorrências registradas pelo professor logado

router.get("/ocorrencias", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;
    const rows = await db
      .select({
        id:              ocorrenciasTable.id,
        estudanteId:     ocorrenciasTable.estudanteId,
        estudanteNome:   estudantesTable.nome,
        tipoDescricao:   tiposOcorrenciasTable.descricao,
        disciplinaNome:  disciplinasTable.nome,
        dataOcorrencia:  ocorrenciasTable.dataOcorrencia,
        observacao:      ocorrenciasTable.observacao,
        cienteEm:        ocorrenciasTable.cienteEm,
        criadoEm:        ocorrenciasTable.criadoEm,
      })
      .from(ocorrenciasTable)
      .innerJoin(estudantesTable, eq(estudantesTable.id, ocorrenciasTable.estudanteId))
      .innerJoin(tiposOcorrenciasTable, eq(tiposOcorrenciasTable.id, ocorrenciasTable.tipoOcorrenciaId))
      .leftJoin(disciplinasTable, eq(disciplinasTable.id, ocorrenciasTable.disciplinaId))
      .where(and(eq(ocorrenciasTable.registradoPorId, usuarioId), isNull(ocorrenciasTable.deletadoEm)))
      .orderBy(desc(ocorrenciasTable.dataOcorrencia));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar ocorrências." });
  }
});

// ── POST /api/portal-professor/ocorrencias ────────────────────────────────────
// Professor registra ocorrência

const ocorrenciaSchema = z.object({
  estudanteId:      z.string().uuid(),
  tipoOcorrenciaId: z.string().uuid(),
  disciplinaId:     z.string().uuid().nullable().optional(),
  turnoId:          z.string().uuid().nullable().optional(),
  dataOcorrencia:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observacao:       z.string().max(300).nullable().optional(),
});

router.post("/ocorrencias", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;
    const data = ocorrenciaSchema.parse(req.body);
    const [ocorrencia] = await db
      .insert(ocorrenciasTable)
      .values({ ...data, registradoPorId: usuarioId })
      .returning();
    await registrarAuditoria({
      tabela: "ocorrencias", operacao: "INSERT", registroId: ocorrencia.id,
      usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/portal-professor/ocorrencias", metodoHttp: "POST", statusHttp: 201,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.status(201).json(ocorrencia);
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.errors[0]?.message ?? "Dados inválidos." });
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao registrar ocorrência." });
  }
});

// ── PUT /api/portal-professor/ocorrencias/:id ─────────────────────────────────
// Professor edita sua própria ocorrência

router.put("/ocorrencias/:id", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;
    const id = req.params.id!;
    const data = ocorrenciaSchema.partial().parse(req.body);

    // Verificar que a ocorrência pertence ao professor
    const [existente] = await db
      .select({ registradoPorId: ocorrenciasTable.registradoPorId })
      .from(ocorrenciasTable)
      .where(and(eq(ocorrenciasTable.id, id), isNull(ocorrenciasTable.deletadoEm)));
    if (!existente) return res.status(404).json({ error: "Ocorrência não encontrada." });
    if (existente.registradoPorId !== usuarioId) return res.status(403).json({ error: "Sem permissão para editar esta ocorrência." });

    const [atualizada] = await db
      .update(ocorrenciasTable)
      .set({ ...data, atualizadoEm: new Date() })
      .where(eq(ocorrenciasTable.id, id))
      .returning();
    res.json(atualizada);
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.errors[0]?.message ?? "Dados inválidos." });
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao atualizar ocorrência." });
  }
});

// ── DELETE /api/portal-professor/ocorrencias/:id ──────────────────────────────
// Professor exclui (soft-delete) sua própria ocorrência

router.delete("/ocorrencias/:id", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;
    const id = req.params.id!;

    const [existente] = await db
      .select({ registradoPorId: ocorrenciasTable.registradoPorId })
      .from(ocorrenciasTable)
      .where(and(eq(ocorrenciasTable.id, id), isNull(ocorrenciasTable.deletadoEm)));
    if (!existente) return res.status(404).json({ error: "Ocorrência não encontrada." });
    if (existente.registradoPorId !== usuarioId) return res.status(403).json({ error: "Sem permissão para excluir esta ocorrência." });

    await db.update(ocorrenciasTable)
      .set({ deletadoEm: new Date() })
      .where(eq(ocorrenciasTable.id, id));
    await registrarAuditoria({
      tabela: "ocorrencias", operacao: "DELETE", registroId: id,
      usuarioId, ipOrigem: req.ip,
      endpoint: `DELETE /api/portal-professor/ocorrencias/${id}`, metodoHttp: "DELETE", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao excluir ocorrência." });
  }
});

// ── GET /api/portal-professor/avisos ─────────────────────────────────────────
// Lista avisos do professor logado

router.get("/avisos", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;
    const { avisosTable } = await import("@workspace/db/schema") as any;
    if (!avisosTable) return res.json([]);
    const rows = await db
      .select({
        id: avisosTable.id, titulo: avisosTable.titulo, conteudo: avisosTable.conteudo,
        tipo: avisosTable.tipo, publicoAlvo: avisosTable.publicoAlvo,
        turmaId: avisosTable.turmaId, turmaSigla: turmasTable.sigla,
        publicado: avisosTable.publicado, criadoEm: avisosTable.criadoEm,
      })
      .from(avisosTable)
      .leftJoin(turmasTable, eq(turmasTable.id, avisosTable.turmaId))
      .where(and(eq(avisosTable.autorId, usuarioId), isNull(avisosTable.deletadoEm)))
      .orderBy(desc(avisosTable.criadoEm));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar avisos." });
  }
});

// ── POST /api/portal-professor/avisos ────────────────────────────────────────

const avisoSchema = z.object({
  titulo:      z.string().min(1, "Informe o título.").max(200),
  conteudo:    z.string().min(1, "Informe o conteúdo."),
  tipo:        z.enum(["aviso", "informe"]),
  publicoAlvo: z.enum(["estudantes", "responsaveis", "todos"]),
  turmaId:     z.string().uuid().nullable().optional(),
  publicado:   z.boolean().optional().default(false),
});

router.post("/avisos", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;
    const data = avisoSchema.parse(req.body);
    const { avisosTable } = await import("@workspace/db/schema") as any;
    if (!avisosTable) return res.status(503).json({ error: "Funcionalidade de avisos não disponível ainda." });
    const [aviso] = await db.insert(avisosTable).values({ ...data, autorId: usuarioId }).returning();
    res.status(201).json(aviso);
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.errors[0]?.message ?? "Dados inválidos." });
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao criar aviso." });
  }
});

// ── PUT /api/portal-professor/avisos/:id ─────────────────────────────────────

router.put("/avisos/:id", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;
    const id = req.params.id!;
    const data = avisoSchema.partial().parse(req.body);
    const { avisosTable } = await import("@workspace/db/schema") as any;
    if (!avisosTable) return res.status(503).json({ error: "Funcionalidade de avisos não disponível ainda." });

    const [existente] = await db.select({ autorId: avisosTable.autorId })
      .from(avisosTable).where(and(eq(avisosTable.id, id), isNull(avisosTable.deletadoEm)));
    if (!existente) return res.status(404).json({ error: "Aviso não encontrado." });
    if (existente.autorId !== usuarioId) return res.status(403).json({ error: "Sem permissão para editar este aviso." });

    const [atualizado] = await db.update(avisosTable)
      .set({ ...data, atualizadoEm: new Date() })
      .where(eq(avisosTable.id, id))
      .returning();
    res.json(atualizado);
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.errors[0]?.message ?? "Dados inválidos." });
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao atualizar aviso." });
  }
});

// ── DELETE /api/portal-professor/avisos/:id ───────────────────────────────────

router.delete("/avisos/:id", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;
    const id = req.params.id!;
    const { avisosTable } = await import("@workspace/db/schema") as any;
    if (!avisosTable) return res.status(503).json({ error: "Funcionalidade de avisos não disponível ainda." });

    const [existente] = await db.select({ autorId: avisosTable.autorId })
      .from(avisosTable).where(and(eq(avisosTable.id, id), isNull(avisosTable.deletadoEm)));
    if (!existente) return res.status(404).json({ error: "Aviso não encontrado." });
    if (existente.autorId !== usuarioId) return res.status(403).json({ error: "Sem permissão." });

    await db.update(avisosTable).set({ deletadoEm: new Date() }).where(eq(avisosTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao excluir aviso." });
  }
});

export default router;
