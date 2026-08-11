import { Router, Request, Response } from "express";
import { db, turmasTable, turmaTurnosTable, cursosTable, turnosTable, eq, isNull, inArray } from "@workspace/db";
import { insertTurmaSchema } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

// GET /api/turmas — listar turmas ativas com curso e lista de turnos
router.get("/", requirePermissao("turmas:manage"), async (req: Request, res: Response) => {
  try {
    const turmas = await db
      .select({
        id:           turmasTable.id,
        sigla:        turmasTable.sigla,
        descricao:    turmasTable.descricao,
        ativo:        turmasTable.ativo,
        ano:          turmasTable.ano,
        semestre:     turmasTable.semestre,
        cursoId:      turmasTable.cursoId,
        cursoNome:    cursosTable.nome,
        criadoEm:    turmasTable.criadoEm,
        atualizadoEm: turmasTable.atualizadoEm,
      })
      .from(turmasTable)
      .leftJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
      .where(isNull(turmasTable.deletadoEm))
      .orderBy(turmasTable.sigla);

    // Buscar turnos de cada turma
    const turmaIds = turmas.map((t) => t.id);
    const turnoLinks = turmaIds.length
      ? await db
          .select({
            turmaId:  turmaTurnosTable.turmaId,
            turnoId:  turmaTurnosTable.turnoId,
            turnoNome: turnosTable.nome,
          })
          .from(turmaTurnosTable)
          .leftJoin(turnosTable, eq(turmaTurnosTable.turnoId, turnosTable.id))
          .where(inArray(turmaTurnosTable.turmaId, turmaIds))
      : [];

    const turnosByTurma = turnoLinks.reduce((acc, r) => {
      if (!acc[r.turmaId]) acc[r.turmaId] = [];
      acc[r.turmaId].push({ id: r.turnoId, nome: r.turnoNome });
      return acc;
    }, {} as Record<string, { id: string; nome: string | null }[]>);

    res.json(turmas.map((t) => ({ ...t, turnos: turnosByTurma[t.id] ?? [] })));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar turmas" });
  }
});

// GET /api/turmas/:id
router.get("/:id", requirePermissao("turmas:manage"), async (req: Request, res: Response) => {
  try {
    const [turma] = await db.select().from(turmasTable).where(eq(turmasTable.id, String(req.params.id)));
    if (!turma || turma.deletadoEm) return res.status(404).json({ error: "Turma não encontrada" });

    const turnos = await db
      .select({ id: turnosTable.id, nome: turnosTable.nome })
      .from(turmaTurnosTable)
      .leftJoin(turnosTable, eq(turmaTurnosTable.turnoId, turnosTable.id))
      .where(eq(turmaTurnosTable.turmaId, turma.id));

    res.json({ ...turma, turnos });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar turma" });
  }
});

// POST /api/turmas — criar turma com múltiplos turnos
router.post("/", requirePermissao("turmas:manage"), async (req: Request, res: Response) => {
  try {
    const { turnoIds, ...turmaData } = insertTurmaSchema.parse(req.body);
    const [turma] = await db.insert(turmasTable).values(turmaData).returning();

    await db.insert(turmaTurnosTable).values(
      turnoIds.map((turnoId) => ({ turmaId: turma.id, turnoId }))
    ).onConflictDoNothing();

    await registrarAuditoria({
      tabela: "turmas", operacao: "INSERT", registroId: turma.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/turmas", metodoHttp: "POST", statusHttp: 201,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.status(201).json({ ...turma, turnoIds });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// PUT /api/turmas/:id — atualizar turma e seus turnos
router.put("/:id", requirePermissao("turmas:manage"), async (req: Request, res: Response) => {
  try {
    const { turnoIds, ...turmaData } = insertTurmaSchema.parse(req.body);
    const id = String(req.params.id);

    const [turma] = await db
      .update(turmasTable)
      .set({ ...turmaData, atualizadoEm: new Date() })
      .where(eq(turmasTable.id, id))
      .returning();
    if (!turma) return res.status(404).json({ error: "Turma não encontrada" });

    // Substituir turnos: delete todos e reinsere
    await db.delete(turmaTurnosTable).where(eq(turmaTurnosTable.turmaId, id));
    await db.insert(turmaTurnosTable).values(
      turnoIds.map((turnoId) => ({ turmaId: id, turnoId }))
    ).onConflictDoNothing();

    await registrarAuditoria({
      tabela: "turmas", operacao: "UPDATE", registroId: turma.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/turmas/:id", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json({ ...turma, turnoIds });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// DELETE /api/turmas/:id — soft delete (turma_turnos excluídos em cascade)
router.delete("/:id", requirePermissao("turmas:manage"), async (req: Request, res: Response) => {
  try {
    const [turma] = await db
      .update(turmasTable)
      .set({ deletadoEm: new Date(), ativo: false })
      .where(eq(turmasTable.id, String(req.params.id)))
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
