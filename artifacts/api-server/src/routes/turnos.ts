import { Router, Request, Response } from "express";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";

// Criar router para rota /api/turnos
const router = Router();

// Todos os endpoints de turnos exigem autenticação
router.use(requireAuth);

// GET /api/turnos — listar todos os turnos ativos
// Retorna array de turnos ordenado por nome
router.get("/", async (req: Request, res: Response) => {
  try {
    // TODO: Implementar query ao banco
    // const turnos = await db.select().from(turnosTable).where(isNull(turnosTable.deletadoEm)).orderBy(turnosTable.nome);
    // res.json(turnos);

    // Resposta de exemplo
    res.json([
      { id: "1", nome: "Manhã", criadoEm: new Date() },
      { id: "2", nome: "Tarde", criadoEm: new Date() },
    ]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar turnos" });
  }
});

// POST /api/turnos — criar novo turno
// Requer permissão turnos:manage
router.post("/", requirePermissao("turnos:manage"), async (req: Request, res: Response) => {
  try {
    // TODO: Implementar validação com Zod e insert ao banco
    // const { nome } = req.body;
    // const [turno] = await db.insert(turnosTable).values({ nome }).returning();
    // res.status(201).json(turno);

    res.status(201).json({ message: "Turno criado (ainda não implementado)" });
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar turno" });
  }
});

// PUT /api/turnos/:id — atualizar turno
// Requer permissão turnos:manage
router.put("/:id", requirePermissao("turnos:manage"), async (req: Request, res: Response) => {
  try {
    // TODO: Implementar validação e update ao banco
    // const { nome } = req.body;
    // const [turno] = await db.update(turnosTable).set({ nome, atualizadoEm: new Date() }).where(eq(turnosTable.id, req.params.id)).returning();
    // res.json(turno);

    res.json({ message: "Turno atualizado (ainda não implementado)" });
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar turno" });
  }
});

// DELETE /api/turnos/:id — deletar turno (soft delete)
// Requer permissão turnos:manage
router.delete("/:id", requirePermissao("turnos:manage"), async (req: Request, res: Response) => {
  try {
    // TODO: Implementar soft delete (marcar como deletado)
    // await db.update(turnosTable).set({ deletadoEm: new Date() }).where(eq(turnosTable.id, req.params.id));
    // res.status(204).end();

    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: "Erro ao deletar turno" });
  }
});

// Exportar router para ser registrado em index.ts
export default router;
