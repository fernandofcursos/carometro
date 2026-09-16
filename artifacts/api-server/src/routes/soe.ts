import { Router } from "express";
import { z } from "zod";
import {
  db,
  soeAtendimentosTable, soeEncaminhamentosTable, soeAcoesTable,
  soeEstudosDeCasoTable, soeAuditoriaTable,
  eq, and, isNull, desc,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { buscarRoles } from "../lib/permissions.js";
import { withTenant } from "../middleware/tenant.js";
import { cifrarRegistro, decifrarRegistro, gerarChaveRef } from "../lib/soe-crypto.js";
import { registrarAuditoriaSoe } from "../lib/soe-audit.js";

const router = Router();
router.use(requireAuth);

type SoeNivel = "manage" | "view" | "encaminhar" | "self";
function soeGuard(nivel: SoeNivel) {
  return async (req: any, res: any, next: any) => {
    const roles = await buscarRoles(req.usuarioId);
    const temPermissao = (perm: string) => roles.includes(perm);
    const hierarquia: Record<SoeNivel, string[]> = {
      manage:      ["soe:manage"],
      view:        ["soe:manage", "soe:view"],
      encaminhar:  ["soe:manage", "soe:view", "soe:encaminhar"],
      self:        ["soe:manage", "soe:view", "soe:encaminhar", "soe:self"],
    };
    if (hierarquia[nivel].some(temPermissao)) return next();
    return res.status(403).json({ error: "Sem permissão para esta operação SOE." });
  };
}

// ── ATENDIMENTOS ──────────────────────────────────────────────────────────────

const atendimentoSchema = z.object({
  estudanteId:      z.string().uuid(),
  dataAtendimento:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo:             z.enum(["individual", "grupo", "familiar", "online"]),
  motivo:           z.string().min(1).max(2000),
  registro:         z.string().optional(),
  encaminhamentoId: z.string().uuid().optional(),
});

// GET /api/soe/atendimentos
router.get("/atendimentos", soeGuard("view"), async (req: any, res) => {
  try {
    const { estudanteId } = req.query;
    const conditions: any[] = [
      eq(soeAtendimentosTable.escolaId, req.escolaId),
      isNull(soeAtendimentosTable.deletadoEm),
    ];
    if (estudanteId) conditions.push(eq(soeAtendimentosTable.estudanteId, String(estudanteId)));
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select({
        id: soeAtendimentosTable.id,
        estudanteId: soeAtendimentosTable.estudanteId,
        orientadoraId: soeAtendimentosTable.orientadoraId,
        dataAtendimento: soeAtendimentosTable.dataAtendimento,
        tipo: soeAtendimentosTable.tipo,
        motivo: soeAtendimentosTable.motivo,
        status: soeAtendimentosTable.status,
        encaminhamentoId: soeAtendimentosTable.encaminhamentoId,
        criadoEm: soeAtendimentosTable.criadoEm,
      })
      .from(soeAtendimentosTable)
      .where(and(...conditions))
      .orderBy(desc(soeAtendimentosTable.dataAtendimento))
    );
    res.json({ atendimentos: rows });
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar atendimentos." });
  }
});

// POST /api/soe/atendimentos
router.post("/atendimentos", soeGuard("manage"), async (req: any, res) => {
  try {
    const body = atendimentoSchema.parse(req.body);
    const registroEnc = body.registro ? cifrarRegistro(body.registro, req.escolaId) : null;
    const chaveRef = body.registro ? gerarChaveRef(req.escolaId) : null;
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.insert(soeAtendimentosTable).values({
        escolaId:         req.escolaId,
        estudanteId:      body.estudanteId,
        orientadoraId:    req.usuarioId,
        encaminhamentoId: body.encaminhamentoId ?? null,
        dataAtendimento:  body.dataAtendimento,
        tipo:             body.tipo,
        motivo:           body.motivo,
        registroEnc:      registroEnc ?? undefined,
        chaveRef:         chaveRef ?? undefined,
      }).returning()
    );
    await registrarAuditoriaSoe({ req, acao: "CREATE_ATENDIMENTO", estudanteId: body.estudanteId, recursoId: row.id });
    const { registroEnc: _enc, chaveRef: _ref, ...safe } = row;
    res.status(201).json(safe);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: "Erro ao criar atendimento." });
  }
});

// GET /api/soe/atendimentos/:id — audit BEFORE decrypting
router.get("/atendimentos/:id", soeGuard("manage"), async (req: any, res) => {
  try {
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.select().from(soeAtendimentosTable)
        .where(and(
          eq(soeAtendimentosTable.id, req.params.id),
          eq(soeAtendimentosTable.escolaId, req.escolaId),
          isNull(soeAtendimentosTable.deletadoEm),
        ))
    );
    if (!row) return res.status(404).json({ error: "Atendimento não encontrado." });
    await registrarAuditoriaSoe({ req, acao: "READ_REGISTRO", estudanteId: row.estudanteId, recursoId: row.id });
    const { registroEnc, chaveRef, ...safe } = row;
    const registro = registroEnc ? decifrarRegistro(registroEnc, req.escolaId) : null;
    res.json({ ...safe, registro });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar atendimento." });
  }
});

// PUT /api/soe/atendimentos/:id
router.put("/atendimentos/:id", soeGuard("manage"), async (req: any, res) => {
  try {
    const updateSchema = z.object({
      dataAtendimento:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      tipo:             z.enum(["individual", "grupo", "familiar", "online"]).optional(),
      motivo:           z.string().min(1).max(2000).optional(),
      registro:         z.string().optional(),
      status:           z.enum(["aberto", "em_acompanhamento", "encerrado"]).optional(),
      encaminhamentoId: z.string().uuid().nullable().optional(),
    });
    const body = updateSchema.parse(req.body);
    const update: Record<string, any> = { atualizadoEm: new Date() };
    if (body.dataAtendimento !== undefined) update.dataAtendimento = body.dataAtendimento;
    if (body.tipo            !== undefined) update.tipo            = body.tipo;
    if (body.motivo          !== undefined) update.motivo          = body.motivo;
    if (body.status          !== undefined) update.status          = body.status;
    if (body.encaminhamentoId !== undefined) update.encaminhamentoId = body.encaminhamentoId;
    if (body.registro        !== undefined) {
      update.registroEnc = cifrarRegistro(body.registro, req.escolaId);
      update.chaveRef    = gerarChaveRef(req.escolaId);
    }
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(soeAtendimentosTable).set(update)
        .where(and(eq(soeAtendimentosTable.id, req.params.id), eq(soeAtendimentosTable.escolaId, req.escolaId)))
        .returning()
    );
    if (!row) return res.status(404).json({ error: "Atendimento não encontrado." });
    await registrarAuditoriaSoe({ req, acao: "UPDATE_ATENDIMENTO", estudanteId: row.estudanteId, recursoId: row.id });
    const { registroEnc: _e, chaveRef: _c, ...safe } = row;
    res.json(safe);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: "Erro ao atualizar atendimento." });
  }
});

// DELETE /api/soe/atendimentos/:id — soft delete
router.delete("/atendimentos/:id", soeGuard("manage"), async (req: any, res) => {
  try {
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(soeAtendimentosTable)
        .set({ deletadoEm: new Date() })
        .where(and(eq(soeAtendimentosTable.id, req.params.id), eq(soeAtendimentosTable.escolaId, req.escolaId)))
        .returning({ id: soeAtendimentosTable.id })
    );
    if (!row) return res.status(404).json({ error: "Atendimento não encontrado." });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao remover atendimento." });
  }
});

// ── ENCAMINHAMENTOS ───────────────────────────────────────────────────────────

const encaminhamentoSchema = z.object({
  estudanteId: z.string().uuid(),
  motivo:      z.string().min(1).max(2000),
  prioridade:  z.enum(["normal", "urgente"]).default("normal"),
});

router.get("/encaminhamentos", soeGuard("encaminhar"), async (req: any, res) => {
  try {
    const roles = await buscarRoles(req.usuarioId);
    const isManage = roles.includes("soe:manage");
    const isView   = roles.includes("soe:view");
    const conditions: any[] = [eq(soeEncaminhamentosTable.escolaId, req.escolaId)];
    if (!isManage && !isView) conditions.push(eq(soeEncaminhamentosTable.encaminhadoPorId, req.usuarioId));
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select({
        id: soeEncaminhamentosTable.id,
        estudanteId: soeEncaminhamentosTable.estudanteId,
        encaminhadoPorId: soeEncaminhamentosTable.encaminhadoPorId,
        motivo: soeEncaminhamentosTable.motivo,
        prioridade: soeEncaminhamentosTable.prioridade,
        status: soeEncaminhamentosTable.status,
        criadoEm: soeEncaminhamentosTable.criadoEm,
      })
      .from(soeEncaminhamentosTable)
      .where(and(...conditions))
      .orderBy(desc(soeEncaminhamentosTable.criadoEm))
    );
    res.json({ encaminhamentos: rows });
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar encaminhamentos." });
  }
});

router.post("/encaminhamentos", soeGuard("encaminhar"), async (req: any, res) => {
  try {
    const body = encaminhamentoSchema.parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.insert(soeEncaminhamentosTable).values({
        escolaId:          req.escolaId,
        estudanteId:       body.estudanteId,
        encaminhadoPorId:  req.usuarioId,
        motivo:            body.motivo,
        prioridade:        body.prioridade,
      }).returning({ id: soeEncaminhamentosTable.id, estudanteId: soeEncaminhamentosTable.estudanteId, status: soeEncaminhamentosTable.status, prioridade: soeEncaminhamentosTable.prioridade })
    );
    res.status(201).json(row);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: "Erro ao criar encaminhamento." });
  }
});

router.put("/encaminhamentos/:id/status", soeGuard("manage"), async (req: any, res) => {
  try {
    const body = z.object({
      status:     z.enum(["pendente", "em_atendimento", "concluido", "arquivado"]),
      observacao: z.string().optional(),
    }).parse(req.body);
    const update: Record<string, any> = { status: body.status, atualizadoEm: new Date() };
    if (body.observacao) {
      update.observacaoEnc = cifrarRegistro(body.observacao, req.escolaId);
      update.chaveRef      = gerarChaveRef(req.escolaId);
    }
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(soeEncaminhamentosTable).set(update)
        .where(and(eq(soeEncaminhamentosTable.id, req.params.id), eq(soeEncaminhamentosTable.escolaId, req.escolaId)))
        .returning({ id: soeEncaminhamentosTable.id, status: soeEncaminhamentosTable.status })
    );
    if (!row) return res.status(404).json({ error: "Encaminhamento não encontrado." });
    res.json(row);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: "Erro ao atualizar encaminhamento." });
  }
});

// ── AÇÕES ─────────────────────────────────────────────────────────────────────

const acaoSchema = z.object({
  tipo:          z.enum(["individual", "coletiva"]),
  titulo:        z.string().min(1).max(200),
  descricao:     z.string().optional(),
  responsavelId: z.string().uuid(),
  estudanteId:   z.string().uuid().optional(),
  atendimentoId: z.string().uuid().optional(),
  prazo:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.get("/acoes", soeGuard("encaminhar"), async (req: any, res) => {
  try {
    const roles = await buscarRoles(req.usuarioId);
    const isManage = roles.includes("soe:manage");
    const isView   = roles.includes("soe:view");
    const conditions: any[] = [eq(soeAcoesTable.escolaId, req.escolaId)];
    if (!isManage && !isView) conditions.push(eq(soeAcoesTable.responsavelId, req.usuarioId));
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select().from(soeAcoesTable)
        .where(and(...conditions))
        .orderBy(desc(soeAcoesTable.criadoEm))
    );
    res.json({ acoes: rows });
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar ações." });
  }
});

router.post("/acoes", soeGuard("view"), async (req: any, res) => {
  try {
    const body = acaoSchema.parse(req.body);
    const roles = await buscarRoles(req.usuarioId);
    if (body.tipo === "individual" && !roles.includes("soe:manage")) {
      return res.status(403).json({ error: "Apenas a OE pode criar ações individuais." });
    }
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.insert(soeAcoesTable).values({
        escolaId:      req.escolaId,
        tipo:          body.tipo,
        titulo:        body.titulo,
        descricao:     body.descricao,
        responsavelId: body.responsavelId,
        estudanteId:   body.estudanteId,
        atendimentoId: body.atendimentoId,
        prazo:         body.prazo,
        criadoPorId:   req.usuarioId,
      }).returning()
    );
    res.status(201).json(row);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: "Erro ao criar ação." });
  }
});

router.put("/acoes/:id/status", soeGuard("encaminhar"), async (req: any, res) => {
  try {
    const body = z.object({
      status: z.enum(["pendente", "em_andamento", "concluida", "cancelada"]),
    }).parse(req.body);
    const [acao] = await withTenant(req.escolaId, async (tx) =>
      await tx.select({ responsavelId: soeAcoesTable.responsavelId })
        .from(soeAcoesTable)
        .where(and(eq(soeAcoesTable.id, req.params.id), eq(soeAcoesTable.escolaId, req.escolaId)))
    );
    if (!acao) return res.status(404).json({ error: "Ação não encontrada." });
    const roles = await buscarRoles(req.usuarioId);
    if (acao.responsavelId !== req.usuarioId && !roles.includes("soe:manage")) {
      return res.status(403).json({ error: "Sem permissão para atualizar esta ação." });
    }
    const [updated] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(soeAcoesTable)
        .set({ status: body.status, atualizadoEm: new Date() })
        .where(eq(soeAcoesTable.id, req.params.id))
        .returning({ id: soeAcoesTable.id, status: soeAcoesTable.status })
    );
    res.json(updated);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: "Erro ao atualizar status da ação." });
  }
});

router.delete("/acoes/:id", soeGuard("manage"), async (req: any, res) => {
  try {
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.delete(soeAcoesTable)
        .where(and(eq(soeAcoesTable.id, req.params.id), eq(soeAcoesTable.escolaId, req.escolaId)))
        .returning({ id: soeAcoesTable.id })
    );
    if (!row) return res.status(404).json({ error: "Ação não encontrada." });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao remover ação." });
  }
});

// ── ESTUDOS DE CASO ───────────────────────────────────────────────────────────

const estudoCasoSchema = z.object({
  estudanteId:    z.string().uuid(),
  dataReuniao:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  participantes:  z.string().optional(),
  deliberacoes:   z.string().optional(),
  proximosPassos: z.string().optional(),
  status:         z.enum(["agendado", "realizado", "cancelado"]).default("agendado"),
});

router.get("/estudos-de-caso", soeGuard("view"), async (req: any, res) => {
  try {
    const { estudanteId } = req.query;
    const conditions: any[] = [eq(soeEstudosDeCasoTable.escolaId, req.escolaId)];
    if (estudanteId) conditions.push(eq(soeEstudosDeCasoTable.estudanteId, String(estudanteId)));
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select().from(soeEstudosDeCasoTable)
        .where(and(...conditions))
        .orderBy(desc(soeEstudosDeCasoTable.dataReuniao))
    );
    res.json({ estudos: rows });
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar estudos de caso." });
  }
});

router.post("/estudos-de-caso", soeGuard("manage"), async (req: any, res) => {
  try {
    const body = estudoCasoSchema.parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.insert(soeEstudosDeCasoTable).values({
        escolaId:       req.escolaId,
        estudanteId:    body.estudanteId,
        dataReuniao:    body.dataReuniao,
        participantes:  body.participantes,
        deliberacoes:   body.deliberacoes,
        proximosPassos: body.proximosPassos,
        status:         body.status,
        criadoPorId:    req.usuarioId,
      }).returning()
    );
    res.status(201).json(row);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: "Erro ao criar estudo de caso." });
  }
});

router.put("/estudos-de-caso/:id", soeGuard("manage"), async (req: any, res) => {
  try {
    const body = estudoCasoSchema.partial().parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(soeEstudosDeCasoTable)
        .set({ ...body, atualizadoEm: new Date() })
        .where(and(eq(soeEstudosDeCasoTable.id, req.params.id), eq(soeEstudosDeCasoTable.escolaId, req.escolaId)))
        .returning()
    );
    if (!row) return res.status(404).json({ error: "Estudo de caso não encontrado." });
    res.json(row);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: "Erro ao atualizar estudo de caso." });
  }
});

// ── PORTAL SELF ───────────────────────────────────────────────────────────────

router.get("/portal/meus-atendimentos", soeGuard("self"), async (req: any, res) => {
  try {
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select({
        id: soeAtendimentosTable.id,
        dataAtendimento: soeAtendimentosTable.dataAtendimento,
        tipo: soeAtendimentosTable.tipo,
        motivo: soeAtendimentosTable.motivo,
        status: soeAtendimentosTable.status,
      })
      .from(soeAtendimentosTable)
      .where(and(
        eq(soeAtendimentosTable.estudanteId, req.usuarioId),
        eq(soeAtendimentosTable.escolaId, req.escolaId),
        isNull(soeAtendimentosTable.deletadoEm),
      ))
      .orderBy(desc(soeAtendimentosTable.dataAtendimento))
    );
    res.json({ atendimentos: rows });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar seus atendimentos." });
  }
});

router.get("/portal/minhas-acoes", soeGuard("self"), async (req: any, res) => {
  try {
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select({
        id: soeAcoesTable.id,
        titulo: soeAcoesTable.titulo,
        descricao: soeAcoesTable.descricao,
        prazo: soeAcoesTable.prazo,
        status: soeAcoesTable.status,
      })
      .from(soeAcoesTable)
      .where(and(
        eq(soeAcoesTable.estudanteId, req.usuarioId),
        eq(soeAcoesTable.escolaId, req.escolaId),
        eq(soeAcoesTable.tipo, "individual"),
      ))
      .orderBy(soeAcoesTable.prazo)
    );
    res.json({ acoes: rows });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar suas ações." });
  }
});

// ── AUDITORIA ─────────────────────────────────────────────────────────────────

router.get("/auditoria", soeGuard("manage"), async (req: any, res) => {
  try {
    const rows = await db.select().from(soeAuditoriaTable)
      .where(eq(soeAuditoriaTable.escolaId, req.escolaId))
      .orderBy(desc(soeAuditoriaTable.criadoEm))
      .limit(200);
    res.json({ registros: rows });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar auditoria." });
  }
});

export default router;
