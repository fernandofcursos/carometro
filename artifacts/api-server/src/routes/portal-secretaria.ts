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
  requerimentosTable,
  requerimentoAssuntosTable,
  eq,
  and,
  isNull,
  desc,
  gte,
  count,
  sql,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { z, ZodError } from "zod";

const router = Router();
router.use(requireAuth);

// ── GET /api/portal-secretaria/me ─────────────────────────────────────────────

router.get("/me", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;

    const [usuario] = await db
      .select({ id: usuariosTable.id, nome: usuariosTable.nome, fotoId: usuariosTable.fotoId })
      .from(usuariosTable)
      .where(and(eq(usuariosTable.id, usuarioId), isNull(usuariosTable.deletadoEm)));

    if (!usuario) return res.status(404).json({ error: "Usuário não encontrado." });

    const fotoUrl = usuario.fotoId ? `/api/fotos/${usuarioId}` : null;

    res.json({ ...usuario, fotoUrl });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar dados do usuário." });
  }
});

// ── GET /api/portal-secretaria/dashboard ──────────────────────────────────────

router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    // Total de estudantes (matrículas ativas)
    const [{ n: totalEstudantes }] = await db
      .select({ n: count() })
      .from(matriculasTable)
      .where(and(eq(matriculasTable.ativo, true), isNull(matriculasTable.deletadoEm)));

    // Total de turmas ativas
    const [{ n: totalTurmas }] = await db
      .select({ n: count() })
      .from(turmasTable)
      .where(isNull(turmasTable.deletadoEm));

    // Requerimentos pendentes ou em análise
    const [{ n: requerimentosPendentes }] = await db
      .select({ n: count() })
      .from(requerimentosTable)
      .where(sql`status IN ('pendente', 'em_analise')`);

    // Ocorrências recentes (últimas 10 de todos os estudantes)
    let ocorrenciasRecentes: any[] = [];
    try {
      const rows = await db
        .select({
          id:             ocorrenciasTable.id,
          estudanteNome:  estudantesTable.nome,
          tipoDescricao:  tiposOcorrenciasTable.descricao,
          dataOcorrencia: ocorrenciasTable.dataOcorrencia,
          cienteEm:       ocorrenciasTable.cienteEm,
        })
        .from(ocorrenciasTable)
        .innerJoin(estudantesTable, eq(estudantesTable.id, ocorrenciasTable.estudanteId))
        .innerJoin(tiposOcorrenciasTable, eq(tiposOcorrenciasTable.id, ocorrenciasTable.tipoOcorrenciaId))
        .where(isNull(ocorrenciasTable.deletadoEm))
        .orderBy(desc(ocorrenciasTable.dataOcorrencia))
        .limit(10);
      ocorrenciasRecentes = rows;
    } catch { /* ignore */ }

    res.json({
      stats: {
        totalEstudantes: Number(totalEstudantes),
        totalTurmas: Number(totalTurmas),
        requerimentosPendentes: Number(requerimentosPendentes),
        ocorrenciasRecentes: ocorrenciasRecentes.length,
      },
      ocorrenciasRecentes,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar dashboard." });
  }
});

// ── GET /api/portal-secretaria/requerimentos ──────────────────────────────────

router.get("/requerimentos", async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id:          requerimentosTable.id,
        numero:      requerimentosTable.numero,
        status:      requerimentosTable.status,
        criadoEm:    requerimentosTable.criadoEm,
        assuntoNome: requerimentoAssuntosTable.nome,
        estudanteNome: estudantesTable.nome,
      })
      .from(requerimentosTable)
      .innerJoin(requerimentoAssuntosTable, eq(requerimentoAssuntosTable.id, requerimentosTable.assuntoId))
      .innerJoin(estudantesTable, eq(estudantesTable.id, requerimentosTable.estudanteId))
      .where(sql`${requerimentosTable.status} IN ('pendente', 'em_analise')`)
      .orderBy(desc(requerimentosTable.criadoEm));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar requerimentos." });
  }
});

// ── GET /api/portal-secretaria/ocorrencias ────────────────────────────────────

router.get("/ocorrencias", async (req: Request, res: Response) => {
  try {
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
      })
      .from(ocorrenciasTable)
      .innerJoin(estudantesTable, eq(estudantesTable.id, ocorrenciasTable.estudanteId))
      .innerJoin(tiposOcorrenciasTable, eq(tiposOcorrenciasTable.id, ocorrenciasTable.tipoOcorrenciaId))
      .where(isNull(ocorrenciasTable.deletadoEm))
      .orderBy(desc(ocorrenciasTable.dataOcorrencia))
      .limit(20);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar ocorrências." });
  }
});

// ── GET /api/portal-secretaria/avisos ─────────────────────────────────────────

router.get("/avisos", async (req: Request, res: Response) => {
  try {
    const { avisosTable } = await import("@workspace/db/schema") as any;
    if (!avisosTable) return res.json([]);
    const rows = await db
      .select({
        id:          avisosTable.id,
        titulo:      avisosTable.titulo,
        conteudo:    avisosTable.conteudo,
        tipo:        avisosTable.tipo,
        publicoAlvo: avisosTable.publicoAlvo,
        turmaId:     avisosTable.turmaId,
        turmaSigla:  turmasTable.sigla,
        publicado:   avisosTable.publicado,
        criadoEm:    avisosTable.criadoEm,
      })
      .from(avisosTable)
      .leftJoin(turmasTable, eq(turmasTable.id, avisosTable.turmaId))
      .where(isNull(avisosTable.deletadoEm))
      .orderBy(desc(avisosTable.criadoEm));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar avisos." });
  }
});

// ── POST /api/portal-secretaria/avisos ────────────────────────────────────────

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

// ── PUT /api/portal-secretaria/avisos/:id ─────────────────────────────────────

router.put("/avisos/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id!;
    const data = avisoSchema.partial().parse(req.body);
    const { avisosTable } = await import("@workspace/db/schema") as any;
    if (!avisosTable) return res.status(503).json({ error: "Funcionalidade de avisos não disponível ainda." });

    const [existente] = await db
      .select({ id: avisosTable.id })
      .from(avisosTable)
      .where(and(eq(avisosTable.id, id), isNull(avisosTable.deletadoEm)));
    if (!existente) return res.status(404).json({ error: "Aviso não encontrado." });

    const [atualizado] = await db
      .update(avisosTable)
      .set({ ...data, atualizadoEm: new Date() })
      .where(eq(avisosTable.id, id))
      .returning();
    res.json(atualizado);
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.errors[0]?.message ?? "Dados inválidos." });
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao atualizar aviso." });
  }
});

// ── DELETE /api/portal-secretaria/avisos/:id ──────────────────────────────────

router.delete("/avisos/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id!;
    const { avisosTable } = await import("@workspace/db/schema") as any;
    if (!avisosTable) return res.status(503).json({ error: "Funcionalidade de avisos não disponível ainda." });

    const [existente] = await db
      .select({ id: avisosTable.id })
      .from(avisosTable)
      .where(and(eq(avisosTable.id, id), isNull(avisosTable.deletadoEm)));
    if (!existente) return res.status(404).json({ error: "Aviso não encontrado." });

    await db.update(avisosTable).set({ deletadoEm: new Date() }).where(eq(avisosTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao excluir aviso." });
  }
});

export default router;
