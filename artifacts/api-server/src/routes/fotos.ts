import { Router, Request, Response } from "express";
import { db, eq } from "@workspace/db";
import { fotosTable } from "@workspace/db/schema";
import { descriptografarFoto, verificarIntegridade } from "../lib/crypto.js";
import { requireAuth } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

// GET /api/fotos/:id — servir foto descriptografada da tabela fotos
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const [foto] = await db
      .select()
      .from(fotosTable)
      .where(eq(fotosTable.id, String(req.params.id)));

    if (!foto) return res.status(404).end();

    const dadosBrutos = descriptografarFoto(foto.dados, foto.iv);

    if (!verificarIntegridade(dadosBrutos, foto.hashIntegridade)) {
      return res.status(500).json({ error: "Erro de integridade da foto" });
    }

    res.set("Cache-Control", "private, max-age=86400");
    res.set("Content-Type", foto.mimeType ?? "image/jpeg");
    res.send(dadosBrutos);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao servir foto" });
  }
});

export default router;
