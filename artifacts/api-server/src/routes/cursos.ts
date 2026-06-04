import { Router, Request, Response } from "express";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";

// Placeholder para rota /api/cursos
const router = Router();
router.use(requireAuth);

// GET /api/cursos
router.get("/", async (_req: Request, res: Response) => {
  res.json([]); // TODO: Implementar na Fase 1
});

// POST /api/cursos
router.post("/", requirePermissao("cursos:manage"), async (_req: Request, res: Response) => {
  res.status(201).json({ message: "Não implementado" }); // TODO
});

// PUT /api/cursos/:id
router.put("/:id", requirePermissao("cursos:manage"), async (_req: Request, res: Response) => {
  res.json({ message: "Não implementado" }); // TODO
});

// DELETE /api/cursos/:id
router.delete("/:id", requirePermissao("cursos:manage"), async (_req: Request, res: Response) => {
  res.status(204).end(); // TODO
});

export default router;
