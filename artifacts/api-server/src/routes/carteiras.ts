import { Router, Request, Response } from "express";
import { createHmac } from "crypto";
import {
  db, carteirasTable, usuariosTable, matriculasTable, turmasTable, cursosTable,
  eq, and, inArray,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";

const router = Router();
router.use(requireAuth);

const HMAC_KEY = process.env.SESSION_SECRET ?? "carometro-secret";

// ── helper: gerar + armazenar carteira ───────────────────────────────────────

export function gerarTokenCarteira(usuarioId: string, tipo: string, ano: number, semestre: number): string {
  const payload = JSON.stringify({ usuarioId, tipo, ano, semestre, ts: Date.now() });
  const encoded = Buffer.from(payload).toString("base64url");
  const sig     = createHmac("sha256", HMAC_KEY).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verificarTokenCarteira(token: string): { usuarioId: string; tipo: string; ano: number; semestre: number; ts: number } | null {
  try {
    const [encoded, sig] = token.split(".");
    if (!encoded || !sig) return null;
    const expected = createHmac("sha256", HMAC_KEY).update(encoded).digest("base64url");
    if (expected !== sig) return null;
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// Emite carteira e cartão semestral para um estudante ao enturmar
export async function emitirCarteirasParaMatricula(
  usuarioId: string,
  matriculaId: string,
  ano: number,
  semestre: number,
): Promise<void> {
  const tipos: ("carteira" | "cartao-semestral")[] = ["carteira", "cartao-semestral"];

  for (const tipo of tipos) {
    // Verificar se já existe carteira ativa para este período e tipo
    const [existente] = await db
      .select({ id: carteirasTable.id })
      .from(carteirasTable)
      .where(and(
        eq(carteirasTable.usuarioId, usuarioId),
        eq(carteirasTable.tipo, tipo),
        eq(carteirasTable.ano, ano),
        eq(carteirasTable.semestre, semestre),
        eq(carteirasTable.status, "ativa"),
      ));

    if (existente) continue; // Já possui carteira ativa para este período

    const token = gerarTokenCarteira(usuarioId, tipo, ano, semestre);
    await db.insert(carteirasTable).values({
      usuarioId, matriculaId, tipo, ano, semestre, status: "ativa", token,
    });
  }
}

// ── GET /api/carteiras — listar para gestão (coordenador / equipe gestora) ───
router.get("/", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const { usuarioId: filterUsuarioId, ano, semestre, status } = req.query as Record<string, string>;

    const rows = await db
      .select({
        id:          carteirasTable.id,
        usuarioId:   carteirasTable.usuarioId,
        nomeEstudante: usuariosTable.nome,
        matriculaId: carteirasTable.matriculaId,
        tipo:        carteirasTable.tipo,
        ano:         carteirasTable.ano,
        semestre:    carteirasTable.semestre,
        status:      carteirasTable.status,
        canceladoEm: carteirasTable.canceladoEm,
        criadoEm:    carteirasTable.criadoEm,
      })
      .from(carteirasTable)
      .innerJoin(usuariosTable, eq(carteirasTable.usuarioId, usuariosTable.id))
      .where(and(
        filterUsuarioId ? eq(carteirasTable.usuarioId, filterUsuarioId) : undefined,
        ano      ? eq(carteirasTable.ano,      Number(ano))      : undefined,
        semestre ? eq(carteirasTable.semestre, Number(semestre) as 1 | 2) : undefined,
        status   ? eq(carteirasTable.status,   status)           : undefined,
      ))
      .orderBy(carteirasTable.ano, carteirasTable.semestre, carteirasTable.criadoEm);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar carteiras" });
  }
});

// ── GET /api/carteiras/:id — detalhe ─────────────────────────────────────────
router.get("/:id", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const [row] = await db
      .select()
      .from(carteirasTable)
      .where(eq(carteirasTable.id, req.params.id));

    if (!row) return res.status(404).json({ error: "Carteira não encontrada." });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar carteira" });
  }
});

// ── POST /api/carteiras/:id/cancelar — cancelar (coordenador) ────────────────
router.post("/:id/cancelar", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const operadorId = req.usuarioId!;
    const { motivo } = req.body as { motivo?: string };

    const [carteira] = await db
      .select({ id: carteirasTable.id, status: carteirasTable.status })
      .from(carteirasTable)
      .where(eq(carteirasTable.id, req.params.id));

    if (!carteira) return res.status(404).json({ error: "Carteira não encontrada." });
    if (carteira.status !== "ativa") {
      return res.status(409).json({ error: `Carteira já está ${carteira.status}.` });
    }

    await db
      .update(carteirasTable)
      .set({ status: "cancelada", canceladoEm: new Date(), canceladoPorId: operadorId, atualizadoEm: new Date() })
      .where(eq(carteirasTable.id, carteira.id));

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao cancelar carteira" });
  }
});

// ── POST /api/carteiras/:id/revogar — revogar (equipe gestora) ────────────────
router.post("/:id/revogar", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const operadorId = req.usuarioId!;

    const [carteira] = await db
      .select({ id: carteirasTable.id, status: carteirasTable.status })
      .from(carteirasTable)
      .where(eq(carteirasTable.id, req.params.id));

    if (!carteira) return res.status(404).json({ error: "Carteira não encontrada." });
    if (carteira.status === "revogada") {
      return res.status(409).json({ error: "Carteira já está revogada." });
    }

    await db
      .update(carteirasTable)
      .set({ status: "revogada", canceladoEm: new Date(), canceladoPorId: operadorId, atualizadoEm: new Date() })
      .where(eq(carteirasTable.id, carteira.id));

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao revogar carteira" });
  }
});

// ── POST /api/carteiras/renovar/:usuarioId — renovar para novo semestre ──────
router.post("/renovar/:usuarioId", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const { ano, semestre } = req.body as { ano: number; semestre: 1 | 2 };
    if (!ano || !semestre || ![1, 2].includes(semestre)) {
      return res.status(400).json({ error: "Informe ano e semestre (1 ou 2)." });
    }

    const { usuarioId } = req.params;

    // Buscar matrícula ativa do estudante para o novo período
    const [mat] = await db
      .select({ id: matriculasTable.id })
      .from(matriculasTable)
      .where(and(eq(matriculasTable.usuarioId, usuarioId), eq(matriculasTable.ativo, true)))
      .limit(1);

    await emitirCarteirasParaMatricula(usuarioId, mat?.id ?? null as unknown as string, ano, semestre);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao renovar carteira" });
  }
});

// ── GET /api/verificar/:token — verificação pública ──────────────────────────
// Exportado para registrar sem requireAuth no index.ts
export function criarRotaVerificacaoCarteira() {
  const pub = Router();

  pub.get("/:token", async (req: Request, res: Response) => {
    const dados = verificarTokenCarteira(req.params.token);
    if (!dados) return res.status(400).json({ valido: false, erro: "Token inválido ou adulterado." });

    try {
      // Verificar no banco se a carteira está ativa (revogação real)
      const [carteira] = await db
        .select({ status: carteirasTable.status, tipo: carteirasTable.tipo, ano: carteirasTable.ano, semestre: carteirasTable.semestre })
        .from(carteirasTable)
        .where(eq(carteirasTable.token, req.params.token));

      if (!carteira) return res.status(404).json({ valido: false, erro: "Documento não encontrado." });
      if (carteira.status !== "ativa") {
        return res.status(200).json({ valido: false, status: carteira.status, tipo: carteira.tipo });
      }

      const [usuario] = await db
        .select({ nome: usuariosTable.nome, fotoId: usuariosTable.fotoId })
        .from(usuariosTable)
        .where(eq(usuariosTable.id, dados.usuarioId));

      res.json({
        valido:    true,
        status:    carteira.status,
        tipo:      carteira.tipo,
        validade:  `${carteira.semestre}º semestre / ${carteira.ano}`,
        nome:      usuario?.nome ?? null,
        fotoUrl:   usuario?.fotoId ? `/api/fotos/${usuario.fotoId}` : null,
        emitidoEm: new Date(dados.ts).toISOString(),
      });
    } catch (err) {
      res.status(500).json({ valido: false, erro: err instanceof Error ? err.message : "Erro ao verificar" });
    }
  });

  return pub;
}

export default router;
