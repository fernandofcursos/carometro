import { Router, Request, Response } from "express";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";

// Placeholder para rota /api/import
const router = Router();
router.use(requireAuth);

// TODO: Implementar CRUD na Fase 1
router.get("/", async (_req: Request, res: Response) => res.json([]));
router.post("/", requirePermissao("import:manage"), async (_req: Request, res: Response) => res.status(201).json({ message: "Não implementado" }));
router.put("/:id", requirePermissao("import:manage"), async (_req: Request, res: Response) => res.json({ message: "Não implementado" }));
router.delete("/:id", requirePermissao("import:manage"), async (_req: Request, res: Response) => res.status(204).end());

export default router;
