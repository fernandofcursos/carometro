import { Router, Request, Response } from "express";
import {
  db,
  usuariosTable,
  rolesTable,
  usuariosRolesTable,
  turmasTable,
  matriculasTable,
  estudantesTable,
  ocorrenciasTable,
  tiposOcorrenciasTable,
  disciplinasTable,
  eq,
  and,
  isNull,
  desc,
  count,
  gte,
  sql,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { z, ZodError } from "zod";

const router = Router();
router.use(requireAuth);

// ── GET /api/portal-gestora/me ───────────────────────────────────────────────

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
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar dados." });
  }
});

// ── GET /api/portal-gestora/dashboard ───────────────────────────────────────

router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;
    const hoje = new Date();
    const hojeStr = hoje.toISOString().slice(0, 10);

    // totalEstudantes
    const [{ value: totalEstudantes }] = await db
      .select({ value: count() })
      .from(matriculasTable)
      .where(and(eq(matriculasTable.ativo, true), isNull(matriculasTable.deletadoEm)));

    // totalTurmas
    const [{ value: totalTurmas }] = await db
      .select({ value: count() })
      .from(turmasTable)
      .where(isNull(turmasTable.deletadoEm));

    // totalProfessores
    const profRows = await db
      .select({ id: usuariosTable.id })
      .from(usuariosTable)
      .innerJoin(usuariosRolesTable, eq(usuariosRolesTable.usuarioId, usuariosTable.id))
      .innerJoin(rolesTable, eq(rolesTable.id, usuariosRolesTable.roleId))
      .where(and(eq(rolesTable.nome, "professor"), isNull(usuariosTable.deletadoEm)));
    const totalProfessores = profRows.length;

    // ocorrenciasHoje
    const [{ value: ocorrenciasHoje }] = await db
      .select({ value: count() })
      .from(ocorrenciasTable)
      .where(and(
        eq(ocorrenciasTable.dataOcorrencia, hojeStr as any),
        isNull(ocorrenciasTable.deletadoEm),
      ));

    // ocorrenciasSemana — desde segunda-feira desta semana
    const seg = new Date(hoje);
    seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
    const segStr = seg.toISOString().slice(0, 10);
    const [{ value: ocorrenciasSemana }] = await db
      .select({ value: count() })
      .from(ocorrenciasTable)
      .where(and(
        gte(ocorrenciasTable.dataOcorrencia, segStr as any),
        isNull(ocorrenciasTable.deletadoEm),
      ));

    // ocorrenciasRecentes (limit 10)
    const ocorrenciasRecentes = await db
      .select({
        id:               ocorrenciasTable.id,
        estudanteNome:    estudantesTable.nome,
        tipoDescricao:    tiposOcorrenciasTable.descricao,
        disciplinaNome:   disciplinasTable.nome,
        dataOcorrencia:   ocorrenciasTable.dataOcorrencia,
        cienteEm:         ocorrenciasTable.cienteEm,
        registradoPorNome: usuariosTable.nome,
      })
      .from(ocorrenciasTable)
      .innerJoin(estudantesTable, eq(estudantesTable.id, ocorrenciasTable.estudanteId))
      .innerJoin(tiposOcorrenciasTable, eq(tiposOcorrenciasTable.id, ocorrenciasTable.tipoOcorrenciaId))
      .leftJoin(disciplinasTable, eq(disciplinasTable.id, ocorrenciasTable.disciplinaId))
      .leftJoin(usuariosTable, eq(usuariosTable.id, ocorrenciasTable.registradoPorId))
      .where(isNull(ocorrenciasTable.deletadoEm))
      .orderBy(desc(ocorrenciasTable.criadoEm))
      .limit(10);

    // avisos recentes (limit 10)
    let avisos: { id: string; titulo: string; tipo: string; publicoAlvo: string; turmaSigla: string | null; criadoEm: string }[] = [];
    try {
      const { avisosTable } = await import("@workspace/db/schema") as any;
      if (avisosTable) {
        const rows = await db
          .select({
            id:          avisosTable.id,
            titulo:      avisosTable.titulo,
            tipo:        avisosTable.tipo,
            publicoAlvo: avisosTable.publicoAlvo,
            turmaSigla:  turmasTable.sigla,
            criadoEm:    avisosTable.criadoEm,
          })
          .from(avisosTable)
          .leftJoin(turmasTable, eq(turmasTable.id, avisosTable.turmaId))
          .where(isNull(avisosTable.deletadoEm))
          .orderBy(desc(avisosTable.criadoEm))
          .limit(10);
        avisos = rows;
      }
    } catch { /* avisos ainda não existe */ }

    res.json({
      stats: {
        totalEstudantes: Number(totalEstudantes),
        totalTurmas: Number(totalTurmas),
        totalProfessores,
        ocorrenciasHoje: Number(ocorrenciasHoje),
        ocorrenciasSemana: Number(ocorrenciasSemana),
      },
      ocorrenciasRecentes,
      avisos,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar dashboard." });
  }
});

// ── GET /api/portal-gestora/ocorrencias ─────────────────────────────────────

router.get("/ocorrencias", async (req: Request, res: Response) => {
  try {
    const offset = Number(req.query.offset ?? 0);
    const rows = await db
      .select({
        id:               ocorrenciasTable.id,
        estudanteNome:    estudantesTable.nome,
        tipoDescricao:    tiposOcorrenciasTable.descricao,
        disciplinaNome:   disciplinasTable.nome,
        dataOcorrencia:   ocorrenciasTable.dataOcorrencia,
        observacao:       ocorrenciasTable.observacao,
        cienteEm:         ocorrenciasTable.cienteEm,
        registradoPorNome: usuariosTable.nome,
        criadoEm:         ocorrenciasTable.criadoEm,
      })
      .from(ocorrenciasTable)
      .innerJoin(estudantesTable, eq(estudantesTable.id, ocorrenciasTable.estudanteId))
      .innerJoin(tiposOcorrenciasTable, eq(tiposOcorrenciasTable.id, ocorrenciasTable.tipoOcorrenciaId))
      .leftJoin(disciplinasTable, eq(disciplinasTable.id, ocorrenciasTable.disciplinaId))
      .leftJoin(usuariosTable, eq(usuariosTable.id, ocorrenciasTable.registradoPorId))
      .where(isNull(ocorrenciasTable.deletadoEm))
      .orderBy(desc(ocorrenciasTable.dataOcorrencia))
      .limit(50)
      .offset(offset);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar ocorrências." });
  }
});

// ── GET /api/portal-gestora/avisos ──────────────────────────────────────────

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

// ── POST /api/portal-gestora/avisos ─────────────────────────────────────────

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

// ── PUT /api/portal-gestora/avisos/:id ──────────────────────────────────────

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

// ── DELETE /api/portal-gestora/avisos/:id ───────────────────────────────────

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
