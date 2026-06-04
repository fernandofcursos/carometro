import { Router, Request, Response } from "express";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";

// Placeholder para rota /api/turmas
const router = Router();
router.use(requireAuth);

// GET, POST, PUT, DELETE — TODO: Implementar na Fase 1
router.get("/", async (_req: Request, res: Response) => res.json([]));
router.post("/", requirePermissao("turmas:manage"), async (_req: Request, res: Response) => res.status(201).json({ message: "Não implementado" }));
router.put("/:id", requirePermissao("turmas:manage"), async (_req: Request, res: Response) => res.json({ message: "Não implementado" }));
router.delete("/:id", requirePermissao("turmas:manage"), async (_req: Request, res: Response) => res.status(204).end());

export default router;
