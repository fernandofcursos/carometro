import { Router, Request, Response } from "express";
import { db, disciplinasTable, eq } from "@workspace/db";
import { insertDisciplinaSchema } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

// GET /api/disciplinas — listar disciplinas ordenadas por nome
router.get("/", requirePermissao("disciplinas:manage"), async (req: Request, res: Response) => {
  try {
    const disciplinas = await db.select().from(disciplinasTable).orderBy(disciplinasTable.nome);
    res.json(disciplinas);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar disciplinas" });
  }
});

// GET /api/disciplinas/:id
router.get("/:id", requirePermissao("disciplinas:manage"), async (req: Request, res: Response) => {
  try {
    const [disciplina] = await db.select().from(disciplinasTable).where(eq(disciplinasTable.id, req.params.id));
    if (!disciplina) return res.status(404).json({ error: "Disciplina não encontrada" });
    res.json(disciplina);
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
    res.status(201).json(disciplina);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// PUT /api/disciplinas/:id — atualizar disciplina
router.put("/:id", requirePermissao("disciplinas:manage"), async (req: Request, res: Response) => {
  try {
    const data = insertDisciplinaSchema.parse(req.body);
    const [disciplina] = await db
      .update(disciplinasTable)
      .set({ ...data, atualizadoEm: new Date() })
      .where(eq(disciplinasTable.id, req.params.id))
      .returning();
    if (!disciplina) return res.status(404).json({ error: "Disciplina não encontrada" });
    await registrarAuditoria({
      tabela: "disciplinas", operacao: "UPDATE", registroId: disciplina.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/disciplinas/:id", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json(disciplina);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// DELETE /api/disciplinas/:id — excluir disciplina (hard delete — sem soft delete nesta entidade)
router.delete("/:id", requirePermissao("disciplinas:manage"), async (req: Request, res: Response) => {
  try {
    const [disciplina] = await db.delete(disciplinasTable).where(eq(disciplinasTable.id, req.params.id)).returning();
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
