import { Router, Request, Response } from "express";
import { z } from "zod";
import { db, estudantesTable, turmasTable, cursosTable, turnosTable, eq, isNull, and, ilike } from "@workspace/db";
import {
  criptografarFoto,
  descriptografarFoto,
  verificarIntegridade,
} from "../lib/crypto.js";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

const insertEstudanteSchema = z.object({
  nome:      z.string().min(2).max(200),
  registro:  z.string().min(1).max(50),
  turmaId:   z.string().uuid(),
  observacao: z.string().optional(),
});

// GET /api/estudantes — listar estudantes ativos com dados de turma
// Filtros opcionais: ?turmaId=uuid&busca=texto
router.get("/", requirePermissao("estudantes:view"), async (req: Request, res: Response) => {
  try {
    const { turmaId, busca } = req.query;

    const condicoes = [isNull(estudantesTable.deletadoEm)];
    if (turmaId) condicoes.push(eq(estudantesTable.turmaId, turmaId as string));

    const rows = await db
      .select({
        id:          estudantesTable.id,
        nome:        estudantesTable.nome,
        registro:    estudantesTable.registro,
        observacao:  estudantesTable.observacao,
        turmaId:     estudantesTable.turmaId,
        temFoto:     estudantesTable.fotoStorageKey,
        criadoEm:    estudantesTable.criadoEm,
        atualizadoEm: estudantesTable.atualizadoEm,
        turmaSigla:  turmasTable.sigla,
        turmaDesc:   turmasTable.descricao,
        cursoNome:   cursosTable.nome,
        turnoNome:   turnosTable.nome,
      })
      .from(estudantesTable)
      .leftJoin(turmasTable, eq(estudantesTable.turmaId, turmasTable.id))
      .leftJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
      .leftJoin(turnosTable, eq(turmasTable.turnoId, turnosTable.id))
      .where(and(...condicoes))
      .orderBy(estudantesTable.nome);

    const estudantes = (busca
      ? rows.filter((r) => r.nome.toLowerCase().includes((busca as string).toLowerCase()) || r.registro.includes(busca as string))
      : rows
    ).map((r) => ({ ...r, temFoto: !!r.temFoto }));

    res.json({ estudantes });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar estudantes" });
  }
});

// GET /api/estudantes/:id
router.get("/:id", requirePermissao("estudantes:view"), async (req: Request, res: Response) => {
  try {
    const [e] = await db.select().from(estudantesTable).where(eq(estudantesTable.id, req.params.id));
    if (!e || e.deletadoEm) return res.status(404).json({ error: "Estudante não encontrado" });
    res.json({ ...e, temFoto: !!e.fotoStorageKey, fotoDados: undefined });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar estudante" });
  }
});

// GET /api/estudantes/:id/foto — servir foto descriptografada
router.get("/:id/foto", requirePermissao("estudantes:view"), async (req: Request, res: Response) => {
  try {
    const [e] = await db
      .select({
        fotoDados:           estudantesTable.fotoDados,
        fotoIv:              estudantesTable.fotoIv,
        fotoMimeType:        estudantesTable.fotoMimeType,
        fotoHashIntegridade: estudantesTable.fotoHashIntegridade,
      })
      .from(estudantesTable)
      .where(eq(estudantesTable.id, req.params.id));

    if (!e?.fotoDados || !e.fotoIv) return res.status(404).end();

    const dadosBrutos = descriptografarFoto(e.fotoDados, e.fotoIv);

    if (e.fotoHashIntegridade && !verificarIntegridade(dadosBrutos, e.fotoHashIntegridade)) {
      return res.status(500).json({ error: "Erro de integridade da foto" });
    }

    res.set("Cache-Control", "private, max-age=604800");
    res.set("Content-Type", e.fotoMimeType ?? "image/jpeg");
    res.send(dadosBrutos);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao servir foto" });
  }
});

// POST /api/estudantes — criar estudante
router.post("/", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const { fotoBase64, ...body } = req.body;
    const data = insertEstudanteSchema.parse(body);

    let fotoFields = {};
    if (fotoBase64) {
      if (fotoBase64.length > 5_000_000) return res.status(413).json({ error: "Foto muito grande. Máximo: ~3.7MB" });
      const foto = criptografarFoto(fotoBase64);
      const { randomUUID } = await import("crypto");
      fotoFields = {
        fotoStorageKey:      randomUUID(),
        fotoDados:           foto.dadosCriptografados,
        fotoIv:              foto.iv,
        fotoMimeType:        foto.mimeType,
        fotoTamanhoBytes:    foto.tamanhoBytes,
        fotoHashIntegridade: foto.hash,
      };
    }

    const [estudante] = await db.insert(estudantesTable).values({ ...data, ...fotoFields }).returning();

    await registrarAuditoria({
      tabela: "estudantes", operacao: "INSERT", registroId: estudante.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/estudantes", metodoHttp: "POST", statusHttp: 201,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.status(201).json({ ...estudante, temFoto: !!estudante.fotoStorageKey, fotoDados: undefined });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// POST /api/estudantes/:id/foto — atualizar foto de estudante existente
router.post("/:id/foto", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const { fotoBase64 } = z.object({ fotoBase64: z.string().min(1) }).parse(req.body);
    if (fotoBase64.length > 5_000_000) return res.status(413).json({ error: "Foto muito grande. Máximo: ~3.7MB" });

    const foto = criptografarFoto(fotoBase64);
    const { randomUUID } = await import("crypto");

    const [estudante] = await db
      .update(estudantesTable)
      .set({
        fotoStorageKey:      randomUUID(),
        fotoDados:           foto.dadosCriptografados,
        fotoIv:              foto.iv,
        fotoMimeType:        foto.mimeType,
        fotoTamanhoBytes:    foto.tamanhoBytes,
        fotoHashIntegridade: foto.hash,
        atualizadoEm:        new Date(),
      })
      .where(eq(estudantesTable.id, req.params.id))
      .returning({ id: estudantesTable.id });

    if (!estudante) return res.status(404).json({ error: "Estudante não encontrado" });

    await registrarAuditoria({
      tabela: "estudantes", operacao: "UPDATE", registroId: estudante.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: `POST /api/estudantes/${req.params.id}/foto`, metodoHttp: "POST", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.json({ ok: true, mimeType: foto.mimeType, tamanhoBytes: foto.tamanhoBytes });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// PUT /api/estudantes/:id — atualizar dados do estudante
router.put("/:id", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const data = insertEstudanteSchema.partial().parse(req.body);
    const [estudante] = await db
      .update(estudantesTable)
      .set({ ...data, atualizadoEm: new Date() })
      .where(eq(estudantesTable.id, req.params.id))
      .returning();
    if (!estudante) return res.status(404).json({ error: "Estudante não encontrado" });
    await registrarAuditoria({
      tabela: "estudantes", operacao: "UPDATE", registroId: estudante.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/estudantes/:id", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json({ ...estudante, temFoto: !!estudante.fotoStorageKey, fotoDados: undefined });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// DELETE /api/estudantes/:id — soft delete
router.delete("/:id", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const [estudante] = await db
      .update(estudantesTable)
      .set({ deletadoEm: new Date() })
      .where(eq(estudantesTable.id, req.params.id))
      .returning({ id: estudantesTable.id });
    if (!estudante) return res.status(404).json({ error: "Estudante não encontrado" });
    await registrarAuditoria({
      tabela: "estudantes", operacao: "DELETE", registroId: estudante.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "DELETE /api/estudantes/:id", metodoHttp: "DELETE", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao excluir estudante" });
  }
});

export default router;
