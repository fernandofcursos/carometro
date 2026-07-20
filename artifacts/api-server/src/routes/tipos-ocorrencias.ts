import { Router, Request, Response } from "express";
import { db, tiposOcorrenciasTable, eq } from "@workspace/db";
import { insertTipoOcorrenciaSchema } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

// GET /api/tipos-ocorrencias — listar todos os tipos ordenados por descrição
router.get("/", requirePermissao("tipos-ocorrencias:manage"), async (req: Request, res: Response) => {
  try {
    const tipos = await db.select().from(tiposOcorrenciasTable).orderBy(tiposOcorrenciasTable.descricao);
    res.json({ tipos });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar tipos de ocorrência" });
  }
});

// GET /api/tipos-ocorrencias/:id
router.get("/:id", requirePermissao("tipos-ocorrencias:manage"), async (req: Request, res: Response) => {
  try {
    const [tipo] = await db.select().from(tiposOcorrenciasTable).where(eq(tiposOcorrenciasTable.id, req.params.id));
    if (!tipo) return res.status(404).json({ error: "Tipo de ocorrência não encontrado" });
    res.json(tipo);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar tipo de ocorrência" });
  }
});

// POST /api/tipos-ocorrencias — criar tipo
router.post("/", requirePermissao("tipos-ocorrencias:manage"), async (req: Request, res: Response) => {
  try {
    const data = insertTipoOcorrenciaSchema.parse(req.body);
    const [tipo] = await db.insert(tiposOcorrenciasTable).values(data).returning();
    await registrarAuditoria({
      tabela: "tipos_ocorrencias", operacao: "INSERT", registroId: tipo.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/tipos-ocorrencias", metodoHttp: "POST", statusHttp: 201,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.status(201).json(tipo);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// PUT /api/tipos-ocorrencias/:id — atualizar tipo
router.put("/:id", requirePermissao("tipos-ocorrencias:manage"), async (req: Request, res: Response) => {
  try {
    const data = insertTipoOcorrenciaSchema.parse(req.body);
    const [tipo] = await db
      .update(tiposOcorrenciasTable)
      .set({ ...data, atualizadoEm: new Date() })
      .where(eq(tiposOcorrenciasTable.id, req.params.id))
      .returning();
    if (!tipo) return res.status(404).json({ error: "Tipo de ocorrência não encontrado" });
    await registrarAuditoria({
      tabela: "tipos_ocorrencias", operacao: "UPDATE", registroId: tipo.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/tipos-ocorrencias/:id", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json(tipo);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// DELETE /api/tipos-ocorrencias/:id — excluir tipo (hard delete — sem soft delete nesta entidade)
router.delete("/:id", requirePermissao("tipos-ocorrencias:manage"), async (req: Request, res: Response) => {
  try {
    const [tipo] = await db.delete(tiposOcorrenciasTable).where(eq(tiposOcorrenciasTable.id, req.params.id)).returning();
    if (!tipo) return res.status(404).json({ error: "Tipo de ocorrência não encontrado" });
    await registrarAuditoria({
      tabela: "tipos_ocorrencias", operacao: "DELETE", registroId: tipo.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "DELETE /api/tipos-ocorrencias/:id", metodoHttp: "DELETE", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao excluir tipo de ocorrência" });
  }
});

export default router;
