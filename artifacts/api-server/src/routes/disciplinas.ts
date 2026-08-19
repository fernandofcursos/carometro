import { Router, Request, Response } from "express";
import { ZodError } from "zod";
import { db, disciplinasTable, disciplinaOfertasTable, cursosTable, turnosTable, eq, inArray } from "@workspace/db";
import { insertDisciplinaSchema } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

function disciplinaErrorMessage(err: unknown): { status: number; error: string } {
  if (err instanceof ZodError) {
    const first = err.errors[0];
    if (first?.path[0] === "nome") return { status: 400, error: "Informe o nome da disciplina." };
    return { status: 400, error: first?.message ?? "Dados inválidos." };
  }
  const msg = err instanceof Error ? err.message : "";
  if (msg.includes("23505") || msg.includes("disciplinas_nome")) {
    return { status: 409, error: "Já existe uma disciplina com este nome." };
  }
  if (msg.includes("23503")) {
    return { status: 400, error: "Curso ou turno referenciado não existe. Atualize a página e tente novamente." };
  }
  return { status: 500, error: "Erro interno ao salvar a disciplina. Tente novamente." };
}

async function fetchOfertas(disciplinaIds: string[]) {
  if (!disciplinaIds.length) return [];
  return db
    .select({
      id:            disciplinaOfertasTable.id,
      disciplinaId:  disciplinaOfertasTable.disciplinaId,
      cursoId:       disciplinaOfertasTable.cursoId,
      cursoNome:     cursosTable.nome,
      turnoId:       disciplinaOfertasTable.turnoId,
      turnoNome:     turnosTable.nome,
    })
    .from(disciplinaOfertasTable)
    .leftJoin(cursosTable, eq(disciplinaOfertasTable.cursoId, cursosTable.id))
    .leftJoin(turnosTable, eq(disciplinaOfertasTable.turnoId, turnosTable.id))
    .where(inArray(disciplinaOfertasTable.disciplinaId, disciplinaIds));
}

// GET /api/disciplinas — listar disciplinas com suas ofertas (cursos × turnos)
router.get("/", requirePermissao("disciplinas:manage"), async (req: Request, res: Response) => {
  try {
    const disciplinas = await db.select().from(disciplinasTable).orderBy(disciplinasTable.nome);
    const ofertas = await fetchOfertas(disciplinas.map((d) => d.id));

    const ofertasByDisc = ofertas.reduce((acc, o) => {
      if (!acc[o.disciplinaId]) acc[o.disciplinaId] = [];
      acc[o.disciplinaId].push(o);
      return acc;
    }, {} as Record<string, typeof ofertas>);

    res.json(disciplinas.map((d) => ({ ...d, ofertas: ofertasByDisc[d.id] ?? [] })));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar disciplinas" });
  }
});

// GET /api/disciplinas/:id — buscar disciplina com suas ofertas
router.get("/:id", requirePermissao("disciplinas:manage"), async (req: Request, res: Response) => {
  try {
    const [disciplina] = await db.select().from(disciplinasTable).where(eq(disciplinasTable.id, String(req.params.id)));
    if (!disciplina) return res.status(404).json({ error: "Disciplina não encontrada" });
    const ofertas = await fetchOfertas([disciplina.id]);
    res.json({ ...disciplina, ofertas });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar disciplina" });
  }
});

// POST /api/disciplinas — criar disciplina
router.post("/", requirePermissao("disciplinas:manage"), async (req: Request, res: Response) => {
  try {
    const data = insertDisciplinaSchema.parse(req.body);
    const [disciplina] = await db.insert(disciplinasTable).values(data).returning();
    await registrarAuditoria({
      tabela: "disciplinas", operacao: "INSERT", registroId: disciplina.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/disciplinas", metodoHttp: "POST", statusHttp: 201,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.status(201).json({ ...disciplina, ofertas: [] });
  } catch (err) {
    const { status, error } = disciplinaErrorMessage(err);
    res.status(status).json({ error });
  }
});

// PUT /api/disciplinas/:id — atualizar nome da disciplina
router.put("/:id", requirePermissao("disciplinas:manage"), async (req: Request, res: Response) => {
  try {
    const data = insertDisciplinaSchema.parse(req.body);
    const [disciplina] = await db
      .update(disciplinasTable)
      .set({ ...data, atualizadoEm: new Date() })
      .where(eq(disciplinasTable.id, String(req.params.id)))
      .returning();
    if (!disciplina) return res.status(404).json({ error: "Disciplina não encontrada" });
    await registrarAuditoria({
      tabela: "disciplinas", operacao: "UPDATE", registroId: disciplina.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/disciplinas/:id", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    const ofertas = await fetchOfertas([disciplina.id]);
    res.json({ ...disciplina, ofertas });
  } catch (err) {
    const { status, error } = disciplinaErrorMessage(err);
    res.status(status).json({ error });
  }
});

// PUT /api/disciplinas/:id/ofertas — substituir ofertas (cursos × turnos) da disciplina
router.put("/:id/ofertas", requirePermissao("disciplinas:manage"), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const [disciplina] = await db.select().from(disciplinasTable).where(eq(disciplinasTable.id, id));
    if (!disciplina) return res.status(404).json({ error: "Disciplina não encontrada" });

    const { ofertas } = req.body as { ofertas: { cursoId: string; turnoId: string }[] };
    if (!Array.isArray(ofertas)) return res.status(400).json({ error: "Campo 'ofertas' deve ser um array." });

    // Substituir tudo
    await db.delete(disciplinaOfertasTable).where(eq(disciplinaOfertasTable.disciplinaId, id));
    if (ofertas.length > 0) {
      await db.insert(disciplinaOfertasTable)
        .values(ofertas.map((o) => ({ disciplinaId: id, cursoId: o.cursoId, turnoId: o.turnoId })))
        .onConflictDoNothing();
    }

    await registrarAuditoria({
      tabela: "disciplina_ofertas", operacao: "UPDATE", registroId: id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: `PUT /api/disciplinas/${id}/ofertas`, metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    const novasOfertas = await fetchOfertas([id]);
    res.json({ ok: true, total: novasOfertas.length, ofertas: novasOfertas });
  } catch (err) {
    const { status, error } = disciplinaErrorMessage(err);
    res.status(status).json({ error });
  }
});

// DELETE /api/disciplinas/:id — excluir disciplina (cascade em disciplina_ofertas)
router.delete("/:id", requirePermissao("disciplinas:manage"), async (req: Request, res: Response) => {
  try {
    const [disciplina] = await db.delete(disciplinasTable).where(eq(disciplinasTable.id, String(req.params.id))).returning();
    if (!disciplina) return res.status(404).json({ error: "Disciplina não encontrada" });
    await registrarAuditoria({
      tabela: "disciplinas", operacao: "DELETE", registroId: disciplina.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "DELETE /api/disciplinas/:id", metodoHttp: "DELETE", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao excluir disciplina" });
  }
});

export default router;
