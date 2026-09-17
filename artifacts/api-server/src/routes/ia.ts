import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { streamChat } from "../lib/rag-engine.js";
import {
  db,
  iaDocumentosTable,
  iaConversasTable,
  iaMensagensTable,
  eq,
  and,
  desc,
} from "@workspace/db";

const router = Router();
router.use(requireAuth);

// POST /api/ia/chat — streaming SSE
router.post(
  "/chat",
  requirePermissao("ia:use"),
  async (req, res) => {
    const schema = z.object({
      mensagem: z.string().min(1),
      conversaId: z.string().uuid().optional(),
      contexto: z.enum(["geral", "estudante", "secretaria"]).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Dados inválidos" });

    const escolaId = req.escolaId;
    if (!escolaId) return res.status(400).json({ error: "Escola não definida no contexto" });

    await streamChat({
      escolaId,
      usuarioId: req.usuarioId!,
      conversaId: parsed.data.conversaId,
      mensagem: parsed.data.mensagem,
      contexto: parsed.data.contexto,
      res,
    });
  }
);

// POST /api/ia/busca — busca semântica (placeholder sem pgvector ainda)
router.post(
  "/busca",
  requirePermissao("ia:use"),
  async (req, res) => {
    const schema = z.object({
      query: z.string().min(1),
      tipos: z.array(z.string()).optional(),
      limite: z.number().int().min(1).max(20).optional().default(5),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Dados inválidos" });

    const escolaId = req.escolaId;
    if (!escolaId) return res.status(400).json({ error: "Escola não definida no contexto" });

    // TODO: implementar busca vetorial com pgvector após migration
    res.json({
      resultados: [],
      aviso: "Busca vetorial disponível após ativação do pgvector",
    });
  }
);

// GET /api/ia/conversas — listar conversas do usuário
router.get(
  "/conversas",
  requirePermissao("ia:use"),
  async (req, res) => {
    const escolaId = req.escolaId;
    if (!escolaId) return res.status(400).json({ error: "Escola não definida" });

    const conversas = await db
      .select()
      .from(iaConversasTable)
      .where(
        and(
          eq(iaConversasTable.escolaId, escolaId),
          eq(iaConversasTable.usuarioId, req.usuarioId!)
        )
      )
      .orderBy(desc(iaConversasTable.atualizadoEm))
      .limit(20);

    res.json(conversas);
  }
);

// DELETE /api/ia/conversas/:id — excluir conversa (LGPD)
router.delete(
  "/conversas/:id",
  requirePermissao("ia:use"),
  async (req, res) => {
    const escolaId = req.escolaId;
    if (!escolaId) return res.status(400).json({ error: "Escola não definida" });

    const idSchema = z.string().uuid();
    const parsedId = idSchema.safeParse(req.params.id);
    if (!parsedId.success) return res.status(400).json({ error: "ID inválido" });
    const conversaId = parsedId.data;

    await db
      .delete(iaMensagensTable)
      .where(
        and(eq(iaMensagensTable.conversaId, conversaId), eq(iaMensagensTable.escolaId, escolaId))
      );

    await db
      .delete(iaConversasTable)
      .where(
        and(
          eq(iaConversasTable.id, conversaId),
          eq(iaConversasTable.usuarioId, req.usuarioId!)
        )
      );

    res.json({ ok: true });
  }
);

// GET /api/ia/documentos — listar docs da base de conhecimento
router.get(
  "/documentos",
  requirePermissao("ia:manage"),
  async (req, res) => {
    const escolaId = req.escolaId;
    if (!escolaId) return res.status(400).json({ error: "Escola não definida" });

    const docs = await db
      .select()
      .from(iaDocumentosTable)
      .where(eq(iaDocumentosTable.escolaId, escolaId))
      .orderBy(desc(iaDocumentosTable.criadoEm));

    res.json(docs);
  }
);

export default router;
