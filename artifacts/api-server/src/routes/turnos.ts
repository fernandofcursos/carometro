import { Router, Request, Response } from "express";
import { db, turnosTable, eq } from "@workspace/db";
import { insertTurnoSchema } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

// GET /api/turnos — listar todos os turnos ordenados por nome
router.get("/", requirePermissao("turnos:manage"), async (req: Request, res: Response) => {
  try {
    const turnos = await db.select().from(turnosTable).orderBy(turnosTable.nome);
    res.json(turnos);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar turnos" });
  }
});

// GET /api/turnos/:id — buscar turno por ID
router.get("/:id", requirePermissao("turnos:manage"), async (req: Request, res: Response) => {
  try {
    const [turno] = await db.select().from(turnosTable).where(eq(turnosTable.id, req.params.id));
    if (!turno) return res.status(404).json({ error: "Turno não encontrado" });
    res.json(turno);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar turno" });
  }
});

// POST /api/turnos — criar turno
router.post("/", requirePermissao("turnos:manage"), async (req: Request, res: Response) => {
  try {
    const data = insertTurnoSchema.parse(req.body);
    const [turno] = await db.insert(turnosTable).values(data).returning();
    await registrarAuditoria({
      tabela: "turnos", operacao: "INSERT", registroId: turno.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/turnos", metodoHttp: "POST", statusHttp: 201,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.status(201).json(turno);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// PUT /api/turnos/:id — atualizar turno
router.put("/:id", requirePermissao("turnos:manage"), async (req: Request, res: Response) => {
  try {
    const data = insertTurnoSchema.parse(req.body);
    const [turno] = await db.update(turnosTable).set(data).where(eq(turnosTable.id, req.params.id)).returning();
    if (!turno) return res.status(404).json({ error: "Turno não encontrado" });
    await registrarAuditoria({
      tabela: "turnos", operacao: "UPDATE", registroId: turno.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/turnos/:id", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json(turno);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// DELETE /api/turnos/:id — excluir turno (hard delete — sem soft delete nesta entidade)
router.delete("/:id", requirePermissao("turnos:manage"), async (req: Request, res: Response) => {
  try {
    const [turno] = await db.delete(turnosTable).where(eq(turnosTable.id, req.params.id)).returning();
    if (!turno) return res.status(404).json({ error: "Turno não encontrado" });
    await registrarAuditoria({
      tabela: "turnos", operacao: "DELETE", registroId: turno.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "DELETE /api/turnos/:id", metodoHttp: "DELETE", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao excluir turno" });
  }
});

export default router;
