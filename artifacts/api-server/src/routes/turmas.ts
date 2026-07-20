import { Router, Request, Response } from "express";
import { db, turmasTable, cursosTable, turnosTable, eq, isNull, and } from "@workspace/db";
import { insertTurmaSchema } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

// GET /api/turmas — listar turmas ativas com dados de curso e turno
router.get("/", requirePermissao("turmas:manage"), async (req: Request, res: Response) => {
  try {
    const turmas = await db
      .select({
        id:          turmasTable.id,
        sigla:       turmasTable.sigla,
        descricao:   turmasTable.descricao,
        ativo:       turmasTable.ativo,
        criadoEm:   turmasTable.criadoEm,
        atualizadoEm: turmasTable.atualizadoEm,
        cursoId:     turmasTable.cursoId,
        turnoId:     turmasTable.turnoId,
        cursoNome:   cursosTable.nome,
        turnoNome:   turnosTable.nome,
      })
      .from(turmasTable)
      .leftJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
      .leftJoin(turnosTable, eq(turmasTable.turnoId, turnosTable.id))
      .where(isNull(turmasTable.deletadoEm))
      .orderBy(turmasTable.sigla);
    res.json({ turmas });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar turmas" });
  }
});

// GET /api/turmas/:id
router.get("/:id", requirePermissao("turmas:manage"), async (req: Request, res: Response) => {
  try {
    const [turma] = await db.select().from(turmasTable).where(eq(turmasTable.id, req.params.id));
    if (!turma || turma.deletadoEm) return res.status(404).json({ error: "Turma não encontrada" });
    res.json(turma);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar turma" });
  }
});

// POST /api/turmas — criar turma
router.post("/", requirePermissao("turmas:manage"), async (req: Request, res: Response) => {
  try {
    const data = insertTurmaSchema.parse(req.body);
    const [turma] = await db.insert(turmasTable).values(data).returning();
    await registrarAuditoria({
      tabela: "turmas", operacao: "INSERT", registroId: turma.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/turmas", metodoHttp: "POST", statusHttp: 201,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.status(201).json(turma);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// PUT /api/turmas/:id — atualizar turma
router.put("/:id", requirePermissao("turmas:manage"), async (req: Request, res: Response) => {
  try {
    const data = insertTurmaSchema.parse(req.body);
    const [turma] = await db
      .update(turmasTable)
      .set({ ...data, atualizadoEm: new Date() })
      .where(eq(turmasTable.id, req.params.id))
      .returning();
    if (!turma) return res.status(404).json({ error: "Turma não encontrada" });
    await registrarAuditoria({
      tabela: "turmas", operacao: "UPDATE", registroId: turma.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/turmas/:id", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json(turma);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// DELETE /api/turmas/:id — soft delete
router.delete("/:id", requirePermissao("turmas:manage"), async (req: Request, res: Response) => {
  try {
    const [turma] = await db
      .update(turmasTable)
      .set({ deletadoEm: new Date(), ativo: false })
      .where(eq(turmasTable.id, req.params.id))
      .returning();
    if (!turma) return res.status(404).json({ error: "Turma não encontrada" });
    await registrarAuditoria({
      tabela: "turmas", operacao: "DELETE", registroId: turma.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "DELETE /api/turmas/:id", metodoHttp: "DELETE", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao excluir turma" });
  }
});

export default router;
