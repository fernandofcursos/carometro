import { Router, Request, Response } from "express";
import { db, ocorrenciasTable, tiposOcorrenciasTable, estudantesTable, disciplinasTable, eq, isNull, and } from "@workspace/db";
import { insertOcorrenciaSchema } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

// GET /api/ocorrencias — listar ocorrências com joins para exibição
// Suporta filtro por estudanteId: ?estudanteId=uuid
router.get("/", requirePermissao("ocorrencias:view"), async (req: Request, res: Response) => {
  try {
    const { estudanteId } = req.query;
    const ocorrencias = await db
      .select({
        id:               ocorrenciasTable.id,
        dataOcorrencia:   ocorrenciasTable.dataOcorrencia,
        observacao:       ocorrenciasTable.observacao,
        criadoEm:         ocorrenciasTable.criadoEm,
        estudanteId:      ocorrenciasTable.estudanteId,
        tipoOcorrenciaId: ocorrenciasTable.tipoOcorrenciaId,
        disciplinaId:     ocorrenciasTable.disciplinaId,
        registradoPorId:  ocorrenciasTable.registradoPorId,
        tipoDescricao:    tiposOcorrenciasTable.descricao,
        estudanteNome:    estudantesTable.nome,
        disciplinaNome:   disciplinasTable.nome,
      })
      .from(ocorrenciasTable)
      .leftJoin(tiposOcorrenciasTable, eq(ocorrenciasTable.tipoOcorrenciaId, tiposOcorrenciasTable.id))
      .leftJoin(estudantesTable, eq(ocorrenciasTable.estudanteId, estudantesTable.id))
      .leftJoin(disciplinasTable, eq(ocorrenciasTable.disciplinaId, disciplinasTable.id))
      .where(
        estudanteId
          ? and(isNull(ocorrenciasTable.deletadoEm), eq(ocorrenciasTable.estudanteId, estudanteId as string))
          : isNull(ocorrenciasTable.deletadoEm)
      )
      .orderBy(ocorrenciasTable.dataOcorrencia);
    res.json(ocorrencias);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar ocorrências" });
  }
});

// GET /api/ocorrencias/:id
router.get("/:id", requirePermissao("ocorrencias:view"), async (req: Request, res: Response) => {
  try {
    const [ocorrencia] = await db.select().from(ocorrenciasTable).where(eq(ocorrenciasTable.id, req.params.id));
    if (!ocorrencia || ocorrencia.deletadoEm) return res.status(404).json({ error: "Ocorrência não encontrada" });
    res.json(ocorrencia);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar ocorrência" });
  }
});

// POST /api/ocorrencias — registrar nova ocorrência
router.post("/", requirePermissao("ocorrencias:create"), async (req: Request, res: Response) => {
  try {
    const data = insertOcorrenciaSchema.parse({
      ...req.body,
      registradoPorId: req.usuarioId,
    });
    const [ocorrencia] = await db.insert(ocorrenciasTable).values(data).returning();
    await registrarAuditoria({
      tabela: "ocorrencias", operacao: "INSERT", registroId: ocorrencia.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/ocorrencias", metodoHttp: "POST", statusHttp: 201,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.status(201).json(ocorrencia);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// PUT /api/ocorrencias/:id — editar ocorrência
router.put("/:id", requirePermissao("ocorrencias:create"), async (req: Request, res: Response) => {
  try {
    const data = insertOcorrenciaSchema.partial().parse(req.body);
    const [ocorrencia] = await db
      .update(ocorrenciasTable)
      .set({ ...data, atualizadoEm: new Date() })
      .where(eq(ocorrenciasTable.id, req.params.id))
      .returning();
    if (!ocorrencia) return res.status(404).json({ error: "Ocorrência não encontrada" });
    await registrarAuditoria({
      tabela: "ocorrencias", operacao: "UPDATE", registroId: ocorrencia.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/ocorrencias/:id", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json(ocorrencia);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// DELETE /api/ocorrencias/:id — soft delete
router.delete("/:id", requirePermissao("ocorrencias:create"), async (req: Request, res: Response) => {
  try {
    const [ocorrencia] = await db
      .update(ocorrenciasTable)
      .set({ deletadoEm: new Date() })
      .where(eq(ocorrenciasTable.id, req.params.id))
      .returning();
    if (!ocorrencia) return res.status(404).json({ error: "Ocorrência não encontrada" });
    await registrarAuditoria({
      tabela: "ocorrencias", operacao: "DELETE", registroId: ocorrencia.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "DELETE /api/ocorrencias/:id", metodoHttp: "DELETE", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao excluir ocorrência" });
  }
});

export default router;
