import { Router } from "express";
import { z } from "zod";
import {
  db, encaminhamentosEventosTable,
  eq, and, sql,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { buscarRoles } from "../lib/permissions.js";
import { withTenant } from "../middleware/tenant.js";

const router = Router();
router.use(requireAuth);

const MODULO_PERMS: Record<string, string[]> = {
  sr:   ["sala_recursos:manage"],
  eeaa: ["eeaa:manage"],
  soe:  ["soe:manage"],
};

function temPermissaoModulo(roles: string[], modulo: string): boolean {
  return (MODULO_PERMS[modulo] ?? []).some(p => roles.includes(p));
}

async function encGuard(req: any, res: any, next: any) {
  const roles = await buscarRoles(req.usuarioId!);
  const temAlgum = Object.values(MODULO_PERMS).flat().some(p => roles.includes(p));
  if (!temAlgum) return res.status(403).json({ error: "Sem permissão." });
  req.encRoles = roles;
  next();
}

const MODULOS_VALIDOS = ["sr", "eeaa", "soe"] as const;

const criarSchema = z.object({
  estudanteId:   z.string().uuid(),
  origemModulo:  z.enum(MODULOS_VALIDOS),
  destinoModulo: z.enum(MODULOS_VALIDOS),
  mensagem:      z.string().min(1),
  tipoDemanda:   z.string().max(100).optional(),
  cids:          z.array(z.string().max(20)).optional(),
});

// GET /api/encaminhamentos?caixa=recebidos|enviados&modulo=sr|eeaa|soe
router.get("/", encGuard, async (req, res) => {
  try {
    const { caixa, modulo } = req.query as Record<string, string>;
    if (!modulo || !MODULOS_VALIDOS.includes(modulo as any))
      return res.status(400).json({ error: "modulo inválido. Use: sr, eeaa, soe." });
    if (!["recebidos", "enviados"].includes(caixa))
      return res.status(400).json({ error: "caixa inválida. Use: recebidos, enviados." });

    const escolaId = (req as any).escolaId;
    const campo = caixa === "recebidos"
      ? encaminhamentosEventosTable.destinoModulo
      : encaminhamentosEventosTable.origemModulo;

    const rows = await withTenant(escolaId, async (tx) => await tx
      .select()
      .from(encaminhamentosEventosTable)
      .where(and(
        eq(encaminhamentosEventosTable.escolaId, escolaId),
        eq(campo, modulo),
      ))
      .orderBy(sql`${encaminhamentosEventosTable.criadoEm} DESC`)
    );
    res.json({ encaminhamentos: rows });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao buscar encaminhamentos.", detail: err?.message });
  }
});

// POST /api/encaminhamentos
router.post("/", encGuard, async (req, res) => {
  try {
    const parsed = criarSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { origemModulo, destinoModulo, estudanteId, mensagem, tipoDemanda, cids } = parsed.data;
    const escolaId = (req as any).escolaId;

    if (origemModulo === destinoModulo)
      return res.status(422).json({ error: "Origem e destino não podem ser o mesmo módulo." });
    if (!temPermissaoModulo(req.encRoles, origemModulo))
      return res.status(403).json({ error: "Sem permissão no módulo de origem." });

    const [created] = await withTenant(escolaId, async (tx) => await tx
      .insert(encaminhamentosEventosTable)
      .values({
        escolaId,
        estudanteId,
        origemModulo,
        destinoModulo,
        mensagem,
        tipoDemanda,
        cids,
        status: "pendente",
        criadoPorId: req.usuarioId,
      })
      .returning()
    );
    res.status(201).json({ encaminhamento: created });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao criar encaminhamento.", detail: err?.message });
  }
});

// PUT /api/encaminhamentos/:id/aceitar
router.put("/:id/aceitar", encGuard, async (req, res) => {
  try {
    const escolaId = (req as any).escolaId;
    const [row] = await withTenant(escolaId, async (tx) => await tx
      .select()
      .from(encaminhamentosEventosTable)
      .where(and(
        eq(encaminhamentosEventosTable.id, req.params.id),
        eq(encaminhamentosEventosTable.escolaId, escolaId),
      ))
    );
    if (!row) return res.status(404).json({ error: "Encaminhamento não encontrado." });
    if (!temPermissaoModulo(req.encRoles, row.destinoModulo))
      return res.status(403).json({ error: "Sem permissão no módulo de destino." });
    if (row.status !== "pendente")
      return res.status(422).json({ error: "Apenas encaminhamentos pendentes podem ser aceitos." });

    const [updated] = await withTenant(escolaId, async (tx) => await tx
      .update(encaminhamentosEventosTable)
      .set({ status: "aceito", recebidoPorId: req.usuarioId, atualizadoEm: new Date() })
      .where(eq(encaminhamentosEventosTable.id, req.params.id))
      .returning()
    );
    res.json({ encaminhamento: updated });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao aceitar encaminhamento.", detail: err?.message });
  }
});

// PUT /api/encaminhamentos/:id/resolver
router.put("/:id/resolver", encGuard, async (req, res) => {
  try {
    const { resolucao } = req.body;
    if (!resolucao || typeof resolucao !== "string" || resolucao.trim().length === 0)
      return res.status(400).json({ error: "Resolução é obrigatória." });

    const escolaId = (req as any).escolaId;
    const [row] = await withTenant(escolaId, async (tx) => await tx
      .select()
      .from(encaminhamentosEventosTable)
      .where(and(
        eq(encaminhamentosEventosTable.id, req.params.id),
        eq(encaminhamentosEventosTable.escolaId, escolaId),
      ))
    );
    if (!row) return res.status(404).json({ error: "Encaminhamento não encontrado." });
    if (!temPermissaoModulo(req.encRoles, row.destinoModulo))
      return res.status(403).json({ error: "Sem permissão." });
    if (!["aceito", "em_andamento"].includes(row.status))
      return res.status(422).json({ error: "Status inválido para resolução." });

    const [updated] = await withTenant(escolaId, async (tx) => await tx
      .update(encaminhamentosEventosTable)
      .set({ status: "resolvido", resolucao, atualizadoEm: new Date() })
      .where(eq(encaminhamentosEventosTable.id, req.params.id))
      .returning()
    );
    res.json({ encaminhamento: updated });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao resolver encaminhamento.", detail: err?.message });
  }
});

// PUT /api/encaminhamentos/:id/devolver
router.put("/:id/devolver", encGuard, async (req, res) => {
  try {
    const { resolucao } = req.body;
    if (!resolucao || typeof resolucao !== "string" || resolucao.trim().length === 0)
      return res.status(400).json({ error: "Motivo da devolução é obrigatório." });

    const escolaId = (req as any).escolaId;
    const [row] = await withTenant(escolaId, async (tx) => await tx
      .select()
      .from(encaminhamentosEventosTable)
      .where(and(
        eq(encaminhamentosEventosTable.id, req.params.id),
        eq(encaminhamentosEventosTable.escolaId, escolaId),
      ))
    );
    if (!row) return res.status(404).json({ error: "Encaminhamento não encontrado." });
    if (!temPermissaoModulo(req.encRoles, row.destinoModulo))
      return res.status(403).json({ error: "Sem permissão." });

    const [updated] = await withTenant(escolaId, async (tx) => await tx
      .update(encaminhamentosEventosTable)
      .set({ status: "devolvido", resolucao, atualizadoEm: new Date() })
      .where(eq(encaminhamentosEventosTable.id, req.params.id))
      .returning()
    );
    res.json({ encaminhamento: updated });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao devolver encaminhamento.", detail: err?.message });
  }
});

// PUT /api/encaminhamentos/:id/reencaminhar
router.put("/:id/reencaminhar", encGuard, async (req, res) => {
  try {
    const { destinoModulo, mensagem } = req.body;
    if (!destinoModulo || !MODULOS_VALIDOS.includes(destinoModulo))
      return res.status(400).json({ error: "destinoModulo inválido. Use: sr, eeaa, soe." });
    if (!mensagem || typeof mensagem !== "string" || mensagem.trim().length === 0)
      return res.status(400).json({ error: "mensagem é obrigatória." });

    const escolaId = (req as any).escolaId;
    const [row] = await withTenant(escolaId, async (tx) => await tx
      .select()
      .from(encaminhamentosEventosTable)
      .where(and(
        eq(encaminhamentosEventosTable.id, req.params.id),
        eq(encaminhamentosEventosTable.escolaId, escolaId),
      ))
    );
    if (!row) return res.status(404).json({ error: "Encaminhamento não encontrado." });
    if (!temPermissaoModulo(req.encRoles, row.destinoModulo))
      return res.status(403).json({ error: "Sem permissão no módulo atual." });
    if (destinoModulo === row.destinoModulo)
      return res.status(422).json({ error: "Destino igual ao módulo atual." });
    if (!["pendente", "aceito", "em_andamento"].includes(row.status))
      return res.status(422).json({ error: "Não é possível re-encaminhar neste status." });

    const filho = await withTenant(escolaId, async (tx) => {
      await tx.update(encaminhamentosEventosTable)
        .set({ status: "em_andamento", atualizadoEm: new Date() })
        .where(eq(encaminhamentosEventosTable.id, req.params.id));

      const [created] = await tx.insert(encaminhamentosEventosTable)
        .values({
          escolaId,
          origemModulo:  row.destinoModulo,
          destinoModulo,
          estudanteId:   row.estudanteId,
          mensagem,
          tipoDemanda:   row.tipoDemanda,
          cids:          row.cids,
          status:        "pendente",
          criadoPorId:   req.usuarioId,
          paiId:         row.id,
        })
        .returning();
      return created;
    });
    res.status(201).json({ encaminhamento: filho });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao re-encaminhar.", detail: err?.message });
  }
});

export default router;
