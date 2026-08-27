import { Router, Request, Response } from "express";
import {
  db,
  responsaveisEstudantesTable,
  cartoesSaidaTable,
  atestadosMedicosTable,
  estudantesTable,
  usuariosTable,
  eq, and, inArray,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { gerarTokenCartaoSaida } from "./portal-responsavel.js";
import { descriptografarFoto } from "../lib/crypto.js";

const router = Router();
router.use(requireAuth);

// ── Vínculos responsável↔estudante ────────────────────────────────────────────

// GET /api/responsaveis-estudantes — listar vínculos
router.get("/", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const { estudanteId, usuarioId } = req.query as Record<string, string>;

    const rows = await db
      .select({
        id:                   responsaveisEstudantesTable.id,
        usuarioId:            responsaveisEstudantesTable.usuarioId,
        nomeResponsavel:      usuariosTable.nome,
        estudanteId:          responsaveisEstudantesTable.estudanteId,
        nomeEstudante:        estudantesTable.nome,
        criadoEm:             responsaveisEstudantesTable.criadoEm,
      })
      .from(responsaveisEstudantesTable)
      .innerJoin(usuariosTable,   eq(responsaveisEstudantesTable.usuarioId,   usuariosTable.id))
      .innerJoin(estudantesTable, eq(responsaveisEstudantesTable.estudanteId, estudantesTable.id))
      .where(and(
        usuarioId   ? eq(responsaveisEstudantesTable.usuarioId,   usuarioId)   : undefined,
        estudanteId ? eq(responsaveisEstudantesTable.estudanteId, estudanteId) : undefined,
      ))
      .orderBy(estudantesTable.nome);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar vínculos" });
  }
});

// POST /api/responsaveis-estudantes — criar vínculo
router.post("/", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const operadorId = req.usuarioId!;
    const { usuarioId, estudanteId } = req.body as { usuarioId: string; estudanteId: string };
    if (!usuarioId || !estudanteId) return res.status(400).json({ error: "usuarioId e estudanteId são obrigatórios." });

    const [row] = await db
      .insert(responsaveisEstudantesTable)
      .values({ usuarioId, estudanteId, criadoPorId: operadorId })
      .onConflictDoNothing()
      .returning();

    res.status(201).json(row ?? { ok: true, info: "Vínculo já existia." });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao criar vínculo" });
  }
});

// DELETE /api/responsaveis-estudantes/:id — remover vínculo
router.delete("/:id", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    await db.delete(responsaveisEstudantesTable).where(eq(responsaveisEstudantesTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao remover vínculo" });
  }
});

// ── Gestão de cartões de saída ────────────────────────────────────────────────

// GET /api/cartoes-saida — listar para coordenador
router.get("/cartoes-saida", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const { estudanteId, status } = req.query as Record<string, string>;

    const rows = await db
      .select({
        id:                  cartoesSaidaTable.id,
        estudanteId:         cartoesSaidaTable.estudanteId,
        nomeEstudante:       estudantesTable.nome,
        responsavelId:       cartoesSaidaTable.responsavelId,
        nomeResponsavel:     usuariosTable.nome,
        dataSaida:           cartoesSaidaTable.dataSaida,
        horarioSaida:        cartoesSaidaTable.horarioSaida,
        motivo:              cartoesSaidaTable.motivo,
        status:              cartoesSaidaTable.status,
        aprovadoEm:          cartoesSaidaTable.aprovadoEm,
        observacaoAprovador: cartoesSaidaTable.observacaoAprovador,
        token:               cartoesSaidaTable.token,
        criadoEm:            cartoesSaidaTable.criadoEm,
      })
      .from(cartoesSaidaTable)
      .innerJoin(estudantesTable, eq(cartoesSaidaTable.estudanteId, estudantesTable.id))
      .innerJoin(usuariosTable,   eq(cartoesSaidaTable.responsavelId, usuariosTable.id))
      .where(and(
        estudanteId ? eq(cartoesSaidaTable.estudanteId, estudanteId) : undefined,
        status      ? eq(cartoesSaidaTable.status, status)           : undefined,
      ))
      .orderBy(cartoesSaidaTable.dataSaida);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar cartões de saída" });
  }
});

// POST /api/cartoes-saida/:id/aprovar — aprovar cartão de saída
router.post("/cartoes-saida/:id/aprovar", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const operadorId = req.usuarioId!;
    const { observacao } = req.body as { observacao?: string };

    const [cartao] = await db
      .select({ id: cartoesSaidaTable.id, status: cartoesSaidaTable.status, estudanteId: cartoesSaidaTable.estudanteId, dataSaida: cartoesSaidaTable.dataSaida })
      .from(cartoesSaidaTable)
      .where(eq(cartoesSaidaTable.id, req.params.id));

    if (!cartao) return res.status(404).json({ error: "Cartão não encontrado." });
    if (cartao.status !== "pendente") return res.status(409).json({ error: `Cartão já está ${cartao.status}.` });

    const token = gerarTokenCartaoSaida(cartao.id, cartao.estudanteId, cartao.dataSaida);

    await db
      .update(cartoesSaidaTable)
      .set({ status: "aprovado", aprovadoPorId: operadorId, aprovadoEm: new Date(), observacaoAprovador: observacao ?? null, token, atualizadoEm: new Date() })
      .where(eq(cartoesSaidaTable.id, cartao.id));

    res.json({ ok: true, token });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao aprovar cartão" });
  }
});

// POST /api/cartoes-saida/:id/recusar — recusar cartão de saída
router.post("/cartoes-saida/:id/recusar", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const operadorId = req.usuarioId!;
    const { observacao } = req.body as { observacao?: string };

    const [cartao] = await db
      .select({ id: cartoesSaidaTable.id, status: cartoesSaidaTable.status })
      .from(cartoesSaidaTable)
      .where(eq(cartoesSaidaTable.id, req.params.id));

    if (!cartao) return res.status(404).json({ error: "Cartão não encontrado." });
    if (cartao.status !== "pendente") return res.status(409).json({ error: `Cartão já está ${cartao.status}.` });

    await db
      .update(cartoesSaidaTable)
      .set({ status: "recusado", aprovadoPorId: operadorId, aprovadoEm: new Date(), observacaoAprovador: observacao ?? null, atualizadoEm: new Date() })
      .where(eq(cartoesSaidaTable.id, cartao.id));

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao recusar cartão" });
  }
});

// ── Gestão de atestados médicos ───────────────────────────────────────────────

// GET /api/atestados-medicos — listar para coordenador (metadados, sem o arquivo)
router.get("/atestados-medicos", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const { estudanteId } = req.query as Record<string, string>;

    const rows = await db
      .select({
        id:              atestadosMedicosTable.id,
        estudanteId:     atestadosMedicosTable.estudanteId,
        nomeEstudante:   estudantesTable.nome,
        responsavelId:   atestadosMedicosTable.responsavelId,
        nomeResponsavel: usuariosTable.nome,
        dataInicio:      atestadosMedicosTable.dataInicio,
        dataFim:         atestadosMedicosTable.dataFim,
        nomeArquivo:     atestadosMedicosTable.nomeArquivo,
        mimeType:        atestadosMedicosTable.mimeType,
        tamanhoBytes:    atestadosMedicosTable.tamanhoBytes,
        criadoEm:        atestadosMedicosTable.criadoEm,
      })
      .from(atestadosMedicosTable)
      .innerJoin(estudantesTable, eq(atestadosMedicosTable.estudanteId, estudantesTable.id))
      .innerJoin(usuariosTable,   eq(atestadosMedicosTable.responsavelId, usuariosTable.id))
      .where(estudanteId ? eq(atestadosMedicosTable.estudanteId, estudanteId) : undefined)
      .orderBy(atestadosMedicosTable.dataInicio);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar atestados" });
  }
});

// GET /api/atestados-medicos/:id/download — baixar atestado (coordenador)
router.get("/atestados-medicos/:id/download", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const { createDecipheriv } = await import("crypto");
    const { getChaveEncriptacao } = await import("../lib/crypto.js");

    const [atestado] = await db
      .select()
      .from(atestadosMedicosTable)
      .where(eq(atestadosMedicosTable.id, req.params.id));

    if (!atestado) return res.status(404).json({ error: "Atestado não encontrado." });

    const iv     = Buffer.from(atestado.iv, "base64");
    const chave  = getChaveEncriptacao();
    const dec    = createDecipheriv("aes-256-cbc", chave, iv);
    const dados  = Buffer.concat([dec.update(atestado.dados as Buffer), dec.final()]);

    res.set("Content-Type", atestado.mimeType);
    res.set("Content-Disposition", `attachment; filename="${encodeURIComponent(atestado.nomeArquivo)}"`);
    res.send(dados);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao baixar atestado" });
  }
});

export default router;
