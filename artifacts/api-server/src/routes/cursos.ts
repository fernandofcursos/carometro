import { Router, Request, Response } from "express";
import { db, cursosTable, eq, isNull } from "@workspace/db";
import { insertCursoSchema } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

// GET /api/cursos — listar cursos ativos (excluir soft-deleted)
router.get("/", requirePermissao("cursos:manage"), async (req: Request, res: Response) => {
  try {
    const cursos = await db
      .select()
      .from(cursosTable)
      .where(isNull(cursosTable.deletadoEm))
      .orderBy(cursosTable.nome);
    res.json(cursos);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar cursos" });
  }
});

// GET /api/cursos/:id
router.get("/:id", requirePermissao("cursos:manage"), async (req: Request, res: Response) => {
  try {
    const [curso] = await db.select().from(cursosTable).where(eq(cursosTable.id, String(req.params.id)));
    if (!curso || curso.deletadoEm) return res.status(404).json({ error: "Curso não encontrado" });
    res.json(curso);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar curso" });
  }
});

// POST /api/cursos — criar curso
router.post("/", requirePermissao("cursos:manage"), async (req: Request, res: Response) => {
  try {
    const data = insertCursoSchema.parse(req.body);
    const [curso] = await db.insert(cursosTable).values(data).returning();
    await registrarAuditoria({
      tabela: "cursos", operacao: "INSERT", registroId: curso.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/cursos", metodoHttp: "POST", statusHttp: 201,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.status(201).json(curso);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// PUT /api/cursos/:id — atualizar curso
router.put("/:id", requirePermissao("cursos:manage"), async (req: Request, res: Response) => {
  try {
    const data = insertCursoSchema.parse(req.body);
    const [curso] = await db
      .update(cursosTable)
      .set({ ...data, atualizadoEm: new Date() })
      .where(eq(cursosTable.id, String(req.params.id)))
      .returning();
    if (!curso) return res.status(404).json({ error: "Curso não encontrado" });
    await registrarAuditoria({
      tabela: "cursos", operacao: "UPDATE", registroId: curso.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/cursos/:id", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json(curso);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// DELETE /api/cursos/:id — soft delete
router.delete("/:id", requirePermissao("cursos:manage"), async (req: Request, res: Response) => {
  try {
    const [curso] = await db
      .update(cursosTable)
      .set({ deletadoEm: new Date(), ativo: false })
      .where(eq(cursosTable.id, String(req.params.id)))
      .returning();
    if (!curso) return res.status(404).json({ error: "Curso não encontrado" });
    await registrarAuditoria({
      tabela: "cursos", operacao: "DELETE", registroId: curso.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "DELETE /api/cursos/:id", metodoHttp: "DELETE", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao excluir curso" });
  }
});

export default router;
