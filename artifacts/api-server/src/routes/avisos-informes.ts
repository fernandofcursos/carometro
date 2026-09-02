import { Router, Request, Response } from "express";
import { z, ZodError } from "zod";
import {
  db,
  avisosTable,
  tiposAvisosInformesTable,
  eq, and, isNull, desc, or, sql,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const tipoBodySchema = z.object({
  nome:           z.string().min(1).max(100),
  descricao:      z.string().optional().nullable(),
  categoria:      z.enum(["aviso", "informe"]),
  ehCardapio:     z.boolean().default(false),
  perfisDestino:  z.array(z.string()).default([]),
  ativo:          z.boolean().default(true),
});

const avisoBodySchema = z.object({
  titulo:      z.string().min(1).max(200),
  conteudo:    z.string().min(1),
  tipo:        z.enum(["aviso", "informe"]),
  publicoAlvo: z.enum(["estudantes", "responsaveis", "todos"]).default("todos"),
  turmaId:     z.string().uuid().nullable().optional(),
  tipoId:      z.string().uuid().nullable().optional(),
  publicado:   z.boolean().default(false),
  dataInicio:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  dataFim:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function handleZodError(err: unknown, res: Response) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Dados inválidos.", detalhes: err.errors });
  }
  throw err;
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

// GET /tipos — listar tipos de avisos/informes
router.get("/tipos", requireAuth, async (req: Request, res: Response) => {
  try {
    const tipos = await db
      .select()
      .from(tiposAvisosInformesTable)
      .where(isNull(tiposAvisosInformesTable.deletadoEm))
      .orderBy(tiposAvisosInformesTable.nome);

    return res.json(tipos);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao listar tipos." });
  }
});

// POST /tipos — criar tipo
router.post("/tipos", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const data = tipoBodySchema.parse(req.body);
    const [tipo] = await db
      .insert(tiposAvisosInformesTable)
      .values(data)
      .returning();
    return res.status(201).json(tipo);
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    console.error(err);
    return res.status(500).json({ error: "Erro ao criar tipo." });
  }
});

// PUT /tipos/:id — editar tipo
router.put("/tipos/:id", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const data = tipoBodySchema.partial().parse(req.body);
    const [tipo] = await db
      .update(tiposAvisosInformesTable)
      .set({ ...data, atualizadoEm: new Date() })
      .where(and(eq(tiposAvisosInformesTable.id, String(req.params.id)), isNull(tiposAvisosInformesTable.deletadoEm)))
      .returning();
    if (!tipo) return res.status(404).json({ error: "Tipo não encontrado." });
    return res.json(tipo);
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    console.error(err);
    return res.status(500).json({ error: "Erro ao editar tipo." });
  }
});

// DELETE /tipos/:id — soft-delete tipo
router.delete("/tipos/:id", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const [tipo] = await db
      .update(tiposAvisosInformesTable)
      .set({ deletadoEm: new Date() })
      .where(and(eq(tiposAvisosInformesTable.id, String(req.params.id)), isNull(tiposAvisosInformesTable.deletadoEm)))
      .returning();
    if (!tipo) return res.status(404).json({ error: "Tipo não encontrado." });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao excluir tipo." });
  }
});

// ─── Avisos ───────────────────────────────────────────────────────────────────

// GET /avisos — listar avisos, query ?mes=YYYY-MM
router.get("/avisos", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const mes = req.query.mes as string | undefined;
    let whereClause;

    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      const [ano, m] = mes.split("-").map(Number);
      whereClause = and(
        eq(avisosTable.tipo, "aviso"),
        isNull(avisosTable.deletadoEm),
        sql`EXTRACT(year FROM ${avisosTable.dataInicio}) = ${ano} AND EXTRACT(month FROM ${avisosTable.dataInicio}) = ${m}`
      );
    } else {
      whereClause = and(eq(avisosTable.tipo, "aviso"), isNull(avisosTable.deletadoEm));
    }

    const avisos = await db
      .select()
      .from(avisosTable)
      .where(whereClause)
      .orderBy(desc(avisosTable.criadoEm));

    return res.json(avisos);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao listar avisos." });
  }
});

// POST /avisos — criar aviso
router.post("/avisos", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const data = avisoBodySchema.parse({ ...req.body, tipo: "aviso" });
    const autorId = (req as any).user?.id ?? null;
    const [aviso] = await db
      .insert(avisosTable)
      .values({ ...data, autorId })
      .returning();
    return res.status(201).json(aviso);
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    console.error(err);
    return res.status(500).json({ error: "Erro ao criar aviso." });
  }
});

// PUT /avisos/:id — editar aviso
router.put("/avisos/:id", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const data = avisoBodySchema.partial().parse(req.body);
    const [aviso] = await db
      .update(avisosTable)
      .set({ ...data, atualizadoEm: new Date() })
      .where(and(eq(avisosTable.id, String(req.params.id)), eq(avisosTable.tipo, "aviso"), isNull(avisosTable.deletadoEm)))
      .returning();
    if (!aviso) return res.status(404).json({ error: "Aviso não encontrado." });
    return res.json(aviso);
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    console.error(err);
    return res.status(500).json({ error: "Erro ao editar aviso." });
  }
});

// DELETE /avisos/:id — soft-delete aviso
router.delete("/avisos/:id", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const [aviso] = await db
      .update(avisosTable)
      .set({ deletadoEm: new Date() })
      .where(and(eq(avisosTable.id, String(req.params.id)), eq(avisosTable.tipo, "aviso"), isNull(avisosTable.deletadoEm)))
      .returning();
    if (!aviso) return res.status(404).json({ error: "Aviso não encontrado." });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao excluir aviso." });
  }
});

// ─── Informes ─────────────────────────────────────────────────────────────────

// GET /informes — listar informes, query ?mes=YYYY-MM
router.get("/informes", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const mes = req.query.mes as string | undefined;
    let whereClause;

    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      const [ano, m] = mes.split("-").map(Number);
      whereClause = and(
        eq(avisosTable.tipo, "informe"),
        isNull(avisosTable.deletadoEm),
        sql`EXTRACT(year FROM ${avisosTable.dataInicio}) = ${ano} AND EXTRACT(month FROM ${avisosTable.dataInicio}) = ${m}`
      );
    } else {
      whereClause = and(eq(avisosTable.tipo, "informe"), isNull(avisosTable.deletadoEm));
    }

    const informes = await db
      .select()
      .from(avisosTable)
      .where(whereClause)
      .orderBy(desc(avisosTable.criadoEm));

    return res.json(informes);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao listar informes." });
  }
});

// POST /informes — criar informe
router.post("/informes", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const data = avisoBodySchema.parse({ ...req.body, tipo: "informe" });
    const autorId = (req as any).user?.id ?? null;
    const [informe] = await db
      .insert(avisosTable)
      .values({ ...data, autorId })
      .returning();
    return res.status(201).json(informe);
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    console.error(err);
    return res.status(500).json({ error: "Erro ao criar informe." });
  }
});

// PUT /informes/:id — editar informe
router.put("/informes/:id", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const data = avisoBodySchema.partial().parse(req.body);
    const [informe] = await db
      .update(avisosTable)
      .set({ ...data, atualizadoEm: new Date() })
      .where(and(eq(avisosTable.id, String(req.params.id)), eq(avisosTable.tipo, "informe"), isNull(avisosTable.deletadoEm)))
      .returning();
    if (!informe) return res.status(404).json({ error: "Informe não encontrado." });
    return res.json(informe);
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    console.error(err);
    return res.status(500).json({ error: "Erro ao editar informe." });
  }
});

// DELETE /informes/:id — soft-delete informe
router.delete("/informes/:id", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const [informe] = await db
      .update(avisosTable)
      .set({ deletadoEm: new Date() })
      .where(and(eq(avisosTable.id, String(req.params.id)), eq(avisosTable.tipo, "informe"), isNull(avisosTable.deletadoEm)))
      .returning();
    if (!informe) return res.status(404).json({ error: "Informe não encontrado." });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao excluir informe." });
  }
});

// ─── Feed ─────────────────────────────────────────────────────────────────────

// GET /feed — feed para dashboards, query ?perfil=ROLE&limite=10
router.get("/feed", requireAuth, async (req: Request, res: Response) => {
  try {
    const limite = Math.min(Number(req.query.limite ?? 10), 100);
    const hoje = new Date().toISOString().slice(0, 10);

    const rows = await db
      .select({
        id:            avisosTable.id,
        titulo:        avisosTable.titulo,
        conteudo:      avisosTable.conteudo,
        tipo:          avisosTable.tipo,
        publicoAlvo:   avisosTable.publicoAlvo,
        turmaId:       avisosTable.turmaId,
        autorId:       avisosTable.autorId,
        publicado:     avisosTable.publicado,
        dataInicio:    avisosTable.dataInicio,
        dataFim:       avisosTable.dataFim,
        tipoId:        avisosTable.tipoId,
        criadoEm:      avisosTable.criadoEm,
        atualizadoEm:  avisosTable.atualizadoEm,
        tipoNome:      tiposAvisosInformesTable.nome,
        tipoCategoria: tiposAvisosInformesTable.categoria,
        perfisDestino: tiposAvisosInformesTable.perfisDestino,
        ehCardapio:    tiposAvisosInformesTable.ehCardapio,
      })
      .from(avisosTable)
      .leftJoin(tiposAvisosInformesTable, eq(avisosTable.tipoId, tiposAvisosInformesTable.id))
      .where(
        and(
          eq(avisosTable.publicado, true),
          isNull(avisosTable.deletadoEm),
          or(
            isNull(avisosTable.dataInicio),
            sql`${avisosTable.dataInicio} <= ${hoje}::date`
          ),
          or(
            isNull(avisosTable.dataFim),
            sql`${avisosTable.dataFim} >= ${hoje}::date`
          )
        )
      )
      .orderBy(desc(avisosTable.criadoEm))
      .limit(limite);

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao buscar feed." });
  }
});

export default router;
