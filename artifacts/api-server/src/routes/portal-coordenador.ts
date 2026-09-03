import { Router, Request, Response } from "express";
import {
  db,
  usuariosTable,
  cursosTable,
  turmasTable,
  turnosTable,
  matriculasTable,
  estudantesTable,
  ocorrenciasTable,
  tiposOcorrenciasTable,
  eq,
  and,
  isNull,
  desc,
  gte,
  count,
  inArray,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { z, ZodError } from "zod";

// coordenadorCursosTable pode ainda não existir — importar com try/catch
let coordenadorCursosTable: any = null;
try {
  const mod = await import("@workspace/db/schema") as any;
  coordenadorCursosTable = mod.coordenadorCursosTable ?? null;
} catch { /* tabela ainda não existe */ }

const router = Router();
router.use(requireAuth);

// ── helpers ───────────────────────────────────────────────────────────────────

async function getCursoIds(usuarioId: string): Promise<string[]> {
  if (!coordenadorCursosTable) return [];
  try {
    const rows = await db
      .select({ cursoId: coordenadorCursosTable.cursoId })
      .from(coordenadorCursosTable)
      .where(eq(coordenadorCursosTable.usuarioId, usuarioId));
    return rows.map((r: any) => r.cursoId);
  } catch { return []; }
}

// ── GET /api/portal-coordenador/me ────────────────────────────────────────────

router.get("/me", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;

    const [usuario] = await db
      .select({ id: usuariosTable.id, nome: usuariosTable.nome, fotoId: usuariosTable.fotoId })
      .from(usuariosTable)
      .where(and(eq(usuariosTable.id, usuarioId), isNull(usuariosTable.deletadoEm)));

    if (!usuario) return res.status(404).json({ error: "Coordenador não encontrado." });

    const fotoUrl = usuario.fotoId ? `/api/fotos/${usuarioId}` : null;

    const cursoIds = await getCursoIds(usuarioId);
    let cursos: { cursoId: string; cursoNome: string }[] = [];
    if (cursoIds.length > 0) {
      const rows = await db
        .select({ cursoId: cursosTable.id, cursoNome: cursosTable.nome })
        .from(cursosTable)
        .where(inArray(cursosTable.id, cursoIds))
        .orderBy(cursosTable.nome);
      cursos = rows;
    }

    res.json({ ...usuario, fotoUrl, cursos });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar dados do coordenador." });
  }
});

// ── GET /api/portal-coordenador/dashboard ────────────────────────────────────

router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;
    const cursoIds = await getCursoIds(usuarioId);

    // Cursos do coordenador
    let cursos: { cursoId: string; cursoNome: string }[] = [];
    if (cursoIds.length > 0) {
      const rows = await db
        .select({ cursoId: cursosTable.id, cursoNome: cursosTable.nome })
        .from(cursosTable)
        .where(inArray(cursosTable.id, cursoIds))
        .orderBy(cursosTable.nome);
      cursos = rows;
    }

    // Stats
    let totalEstudantes = 0;
    let totalTurmas = 0;
    let ocorrenciasSemana = 0;

    if (cursoIds.length > 0) {
      // Total de turmas
      const turmasRows = await db
        .select({ id: turmasTable.id })
        .from(turmasTable)
        .where(and(inArray(turmasTable.cursoId, cursoIds), isNull(turmasTable.deletadoEm)));
      totalTurmas = turmasRows.length;
      const turmaIds = turmasRows.map((t) => t.id);

      // Total de estudantes matriculados
      if (turmaIds.length > 0) {
        const [countRow] = await db
          .select({ total: count() })
          .from(matriculasTable)
          .where(and(
            inArray(matriculasTable.turmaId, turmaIds),
            eq(matriculasTable.ativo, true),
            isNull(matriculasTable.deletadoEm),
          ));
        totalEstudantes = Number(countRow?.total ?? 0);

        // Estudantes nos cursos para buscar ocorrências
        const matriculaRows = await db
          .select({ usuarioId: matriculasTable.usuarioId })
          .from(matriculasTable)
          .where(and(
            inArray(matriculasTable.turmaId, turmaIds),
            eq(matriculasTable.ativo, true),
            isNull(matriculasTable.deletadoEm),
          ));
        const estudanteUserIds = matriculaRows.map((m) => m.usuarioId);

        if (estudanteUserIds.length > 0) {
          // Estudantes (tabela estudantes linkada)
          const estudantesRows = await db
            .select({ id: estudantesTable.id })
            .from(estudantesTable)
            .where(inArray(estudantesTable.usuarioId, estudanteUserIds));
          const estudanteIds = estudantesRows.map((e) => e.id);

          // Ocorrências na semana
          const umaSemanaAtras = new Date();
          umaSemanaAtras.setDate(umaSemanaAtras.getDate() - 7);
          const semanaStr = umaSemanaAtras.toISOString().slice(0, 10);

          if (estudanteIds.length > 0) {
            const [ocSemana] = await db
              .select({ total: count() })
              .from(ocorrenciasTable)
              .where(and(
                inArray(ocorrenciasTable.estudanteId, estudanteIds),
                isNull(ocorrenciasTable.deletadoEm),
                gte(ocorrenciasTable.dataOcorrencia, semanaStr),
              ));
            ocorrenciasSemana = Number(ocSemana?.total ?? 0);
          }
        }
      }
    }

    // Ocorrências recentes (até 10)
    let ocorrenciasRecentes: any[] = [];
    if (cursoIds.length > 0) {
      try {
        const turmasRows = await db
          .select({ id: turmasTable.id, cursoId: turmasTable.cursoId })
          .from(turmasTable)
          .where(and(inArray(turmasTable.cursoId, cursoIds), isNull(turmasTable.deletadoEm)));
        const turmaIds = turmasRows.map((t) => t.id);

        if (turmaIds.length > 0) {
          const matriculaRows = await db
            .select({ usuarioId: matriculasTable.usuarioId })
            .from(matriculasTable)
            .where(and(
              inArray(matriculasTable.turmaId, turmaIds),
              eq(matriculasTable.ativo, true),
              isNull(matriculasTable.deletadoEm),
            ));
          const estudanteUserIds = matriculaRows.map((m) => m.usuarioId);

          if (estudanteUserIds.length > 0) {
            const estudantesRows = await db
              .select({ id: estudantesTable.id, nome: estudantesTable.nome })
              .from(estudantesTable)
              .where(inArray(estudantesTable.usuarioId, estudanteUserIds));
            const estudanteIds = estudantesRows.map((e) => e.id);

            if (estudanteIds.length > 0) {
              const rows = await db
                .select({
                  id:             ocorrenciasTable.id,
                  estudanteId:    ocorrenciasTable.estudanteId,
                  estudanteNome:  estudantesTable.nome,
                  tipoDescricao:  tiposOcorrenciasTable.descricao,
                  dataOcorrencia: ocorrenciasTable.dataOcorrencia,
                  cienteEm:       ocorrenciasTable.cienteEm,
                  cursoId:        turmasTable.cursoId,
                  cursoNome:      cursosTable.nome,
                })
                .from(ocorrenciasTable)
                .innerJoin(estudantesTable, eq(estudantesTable.id, ocorrenciasTable.estudanteId))
                .innerJoin(tiposOcorrenciasTable, eq(tiposOcorrenciasTable.id, ocorrenciasTable.tipoOcorrenciaId))
                .innerJoin(matriculasTable, and(
                  eq(matriculasTable.usuarioId, estudantesTable.usuarioId),
                  eq(matriculasTable.ativo, true),
                  isNull(matriculasTable.deletadoEm),
                ))
                .innerJoin(turmasTable, eq(turmasTable.id, matriculasTable.turmaId))
                .innerJoin(cursosTable, eq(cursosTable.id, turmasTable.cursoId))
                .where(and(
                  inArray(ocorrenciasTable.estudanteId, estudanteIds),
                  isNull(ocorrenciasTable.deletadoEm),
                ))
                .orderBy(desc(ocorrenciasTable.dataOcorrencia))
                .limit(10);
              ocorrenciasRecentes = rows;
            }
          }
        }
      } catch { /* ignore */ }
    }

    // Avisos do coordenador
    let avisos: any[] = [];
    try {
      const { avisosTable } = await import("@workspace/db/schema") as any;
      if (avisosTable) {
        const rows = await db
          .select({
            id: avisosTable.id, titulo: avisosTable.titulo,
            tipo: avisosTable.tipo, publicoAlvo: avisosTable.publicoAlvo,
            turmaSigla: turmasTable.sigla, criadoEm: avisosTable.criadoEm,
          })
          .from(avisosTable)
          .leftJoin(turmasTable, eq(turmasTable.id, avisosTable.turmaId))
          .where(and(eq(avisosTable.autorId, usuarioId), isNull(avisosTable.deletadoEm)))
          .orderBy(desc(avisosTable.criadoEm))
          .limit(10);
        avisos = rows;
      }
    } catch { /* avisos ainda não existe */ }

    res.json({
      cursos,
      stats: { totalEstudantes, totalTurmas, ocorrenciasSemana },
      ocorrenciasRecentes,
      avisos,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar dashboard." });
  }
});

// ── GET /api/portal-coordenador/ocorrencias ───────────────────────────────────

router.get("/ocorrencias", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;
    const cursoIds = await getCursoIds(usuarioId);

    if (cursoIds.length === 0) return res.json([]);

    const turmasRows = await db
      .select({ id: turmasTable.id })
      .from(turmasTable)
      .where(and(inArray(turmasTable.cursoId, cursoIds), isNull(turmasTable.deletadoEm)));
    const turmaIds = turmasRows.map((t) => t.id);

    if (turmaIds.length === 0) return res.json([]);

    const matriculaRows = await db
      .select({ usuarioId: matriculasTable.usuarioId })
      .from(matriculasTable)
      .where(and(
        inArray(matriculasTable.turmaId, turmaIds),
        eq(matriculasTable.ativo, true),
        isNull(matriculasTable.deletadoEm),
      ));
    const estudanteUserIds = matriculaRows.map((m) => m.usuarioId);

    if (estudanteUserIds.length === 0) return res.json([]);

    const estudantesRows = await db
      .select({ id: estudantesTable.id })
      .from(estudantesTable)
      .where(inArray(estudantesTable.usuarioId, estudanteUserIds));
    const estudanteIds = estudantesRows.map((e) => e.id);

    if (estudanteIds.length === 0) return res.json([]);

    const rows = await db
      .select({
        id:             ocorrenciasTable.id,
        estudanteId:    ocorrenciasTable.estudanteId,
        estudanteNome:  estudantesTable.nome,
        tipoDescricao:  tiposOcorrenciasTable.descricao,
        dataOcorrencia: ocorrenciasTable.dataOcorrencia,
        observacao:     ocorrenciasTable.observacao,
        cienteEm:       ocorrenciasTable.cienteEm,
        cientePorId:    ocorrenciasTable.cientePorId,
        criadoEm:       ocorrenciasTable.criadoEm,
        cursoNome:      cursosTable.nome,
        turmaSigla:     turmasTable.sigla,
      })
      .from(ocorrenciasTable)
      .innerJoin(estudantesTable, eq(estudantesTable.id, ocorrenciasTable.estudanteId))
      .innerJoin(tiposOcorrenciasTable, eq(tiposOcorrenciasTable.id, ocorrenciasTable.tipoOcorrenciaId))
      .innerJoin(matriculasTable, and(
        eq(matriculasTable.usuarioId, estudantesTable.usuarioId),
        eq(matriculasTable.ativo, true),
        isNull(matriculasTable.deletadoEm),
      ))
      .innerJoin(turmasTable, eq(turmasTable.id, matriculasTable.turmaId))
      .innerJoin(cursosTable, eq(cursosTable.id, turmasTable.cursoId))
      .where(and(
        inArray(ocorrenciasTable.estudanteId, estudanteIds),
        isNull(ocorrenciasTable.deletadoEm),
      ))
      .orderBy(desc(ocorrenciasTable.dataOcorrencia));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar ocorrências." });
  }
});

// ── POST /api/portal-coordenador/ocorrencias/:id/ciente ───────────────────────

router.post("/ocorrencias/:id/ciente", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;
    const id = req.params.id!;

    const [existente] = await db
      .select({ id: ocorrenciasTable.id, estudanteId: ocorrenciasTable.estudanteId })
      .from(ocorrenciasTable)
      .where(and(eq(ocorrenciasTable.id, id), isNull(ocorrenciasTable.deletadoEm)));

    if (!existente) return res.status(404).json({ error: "Ocorrência não encontrada." });

    const [atualizada] = await db
      .update(ocorrenciasTable)
      .set({ cienteEm: new Date(), cientePorId: usuarioId })
      .where(eq(ocorrenciasTable.id, id))
      .returning();

    res.json(atualizada);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao registrar ciente." });
  }
});

// ── GET /api/portal-coordenador/avisos ───────────────────────────────────────

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

// ── POST /api/portal-coordenador/avisos ──────────────────────────────────────

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

// ── PUT /api/portal-coordenador/avisos/:id ───────────────────────────────────

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

// ── DELETE /api/portal-coordenador/avisos/:id ────────────────────────────────

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
