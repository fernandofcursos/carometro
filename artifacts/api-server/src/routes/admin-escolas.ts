import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { db, escolasTable, eq } from "@workspace/db";
import { withSuperAdmin } from "../middleware/tenant.js";

const router = Router();
router.use(requireAuth, requirePermissao("admin-escolas:manage"));

const escolaSchema = z.object({
  nome: z.string().min(2).max(300),
  sigla: z.string().min(1).max(20),
  inep: z.string().length(8).optional(),
  cnpj: z.string().length(14).optional(),
  cidade: z.string().max(100).optional(),
  uf: z.string().length(2).optional(),
  email: z.string().email().optional(),
  telefone: z.string().max(20).optional(),
  plano: z.enum(["basico", "pro", "enterprise"]).optional(),
  config: z.record(z.unknown()).optional(),
});

// GET /api/admin/escolas
router.get("/", async (_req, res) => {
  try {
    const escolas = await withSuperAdmin(async (tx) =>
      tx.select().from(escolasTable).orderBy(escolasTable.nome)
    );
    res.json(escolas);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar escolas" });
  }
});

// POST /api/admin/escolas
router.post("/", async (req, res) => {
  const parsed = escolaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos", issues: parsed.error.issues });

  try {
    const [escola] = await withSuperAdmin(async (tx) =>
      tx.insert(escolasTable).values(parsed.data).returning()
    );
    res.status(201).json(escola);
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar escola" });
  }
});

// GET /api/admin/escolas/:id
router.get("/:id", async (req, res) => {
  try {
    const [escola] = await withSuperAdmin(async (tx) =>
      tx.select().from(escolasTable).where(eq(escolasTable.id, req.params.id))
    );
    if (!escola) return res.status(404).json({ error: "Escola não encontrada" });
    res.json(escola);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar escola" });
  }
});

// PUT /api/admin/escolas/:id
router.put("/:id", async (req, res) => {
  const parsed = escolaSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos", issues: parsed.error.issues });

  try {
    const [escola] = await withSuperAdmin(async (tx) =>
      tx.update(escolasTable)
        .set({ ...parsed.data, atualizadoEm: new Date() })
        .where(eq(escolasTable.id, req.params.id))
        .returning()
    );
    if (!escola) return res.status(404).json({ error: "Escola não encontrada" });
    res.json(escola);
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar escola" });
  }
});

// DELETE /api/admin/escolas/:id — desativa (soft delete via ativo=false)
router.delete("/:id", async (req, res) => {
  try {
    await withSuperAdmin(async (tx) =>
      tx.update(escolasTable)
        .set({ ativo: false, atualizadoEm: new Date() })
        .where(eq(escolasTable.id, req.params.id))
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao desativar escola" });
  }
});

export default router;
