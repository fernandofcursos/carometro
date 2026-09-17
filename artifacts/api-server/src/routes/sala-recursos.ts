import { Router } from "express";
import { z } from "zod";
import {
  db,
  srEstudantesEneeTable, srAtendimentosTable, srPlanosAeeTable,
  srEsvTable, srEstudosCasoTable, srEncaminhamentosTable,
  encaminhamentosEventosTable,
  eq, and, isNull, desc,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { buscarRoles } from "../lib/permissions.js";
import { withTenant } from "../middleware/tenant.js";

const router = Router();
router.use(requireAuth);

type SrNivel = "manage" | "view" | "professor" | "self";
function srGuard(nivel: SrNivel) {
  return async (req: any, res: any, next: any) => {
    const roles = await buscarRoles(req.usuarioId);
    const tem = (p: string) => roles.includes(p);
    const hierarquia: Record<SrNivel, string[]> = {
      manage:    ["sala_recursos:manage"],
      view:      ["sala_recursos:manage", "sala_recursos:view"],
      professor: ["sala_recursos:manage", "sala_recursos:view", "sala_recursos:professor"],
      self:      ["sala_recursos:manage", "sala_recursos:view", "sala_recursos:professor", "sala_recursos:self"],
    };
    if (hierarquia[nivel].some(tem)) return next();
    return res.status(403).json({ error: "Sem permissão para esta operação." });
  };
}

// ── ESTUDANTES ENEE ───────────────────────────────────────────────────────────

const eneeSchema = z.object({
  usuarioId:        z.string().uuid(),
  laudo:            z.enum(["DI", "DF", "DOWN", "TEA", "AH_SD"]),
  dataLaudo:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  instituicaoLaudo: z.string().max(200).optional(),
  observacoes:      z.string().optional(),
});

router.get("/estudantes-enee", srGuard("view"), async (req: any, res) => {
  try {
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select().from(srEstudantesEneeTable)
        .where(and(
          eq(srEstudantesEneeTable.escolaId, req.escolaId),
          isNull(srEstudantesEneeTable.deletadoEm),
        ))
        .orderBy(srEstudantesEneeTable.criadoEm)
    );
    res.json({ estudantes: rows });
  } catch {
    res.status(500).json({ error: "Erro ao listar ENEEs." });
  }
});

router.post("/estudantes-enee", srGuard("manage"), async (req: any, res) => {
  try {
    const body = eneeSchema.parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.insert(srEstudantesEneeTable).values({
        escolaId: req.escolaId,
        ...body,
      }).returning()
    );
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao registrar ENEE." });
  }
});

router.put("/estudantes-enee/:id", srGuard("manage"), async (req: any, res) => {
  try {
    const body = eneeSchema.partial().parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(srEstudantesEneeTable)
        .set({ ...body, atualizadoEm: new Date() })
        .where(and(
          eq(srEstudantesEneeTable.id, req.params.id),
          eq(srEstudantesEneeTable.escolaId, req.escolaId),
        ))
        .returning()
    );
    if (!row) return res.status(404).json({ error: "ENEE não encontrado." });
    res.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao atualizar ENEE." });
  }
});

// ── ATENDIMENTOS ──────────────────────────────────────────────────────────────

const atendimentoSchema = z.object({
  estudanteId:     z.string().uuid(),
  dataAtendimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duracaoMin:      z.number().int().positive().optional(),
  tipo:            z.enum(["individual", "orientacao_professor", "orientacao_familia", "esv", "estudo_caso"]),
  narrativa:       z.string().optional(),
});

router.get("/atendimentos", srGuard("view"), async (req: any, res) => {
  try {
    const { estudanteId, tipo } = req.query;
    const conditions: any[] = [
      eq(srAtendimentosTable.escolaId, req.escolaId),
      isNull(srAtendimentosTable.deletadoEm),
    ];
    if (estudanteId) conditions.push(eq(srAtendimentosTable.estudanteId, String(estudanteId)));
    if (tipo) conditions.push(eq(srAtendimentosTable.tipo, String(tipo)));
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select().from(srAtendimentosTable)
        .where(and(...conditions))
        .orderBy(desc(srAtendimentosTable.dataAtendimento))
    );
    res.json({ atendimentos: rows });
  } catch {
    res.status(500).json({ error: "Erro ao listar atendimentos." });
  }
});

router.post("/atendimentos", srGuard("manage"), async (req: any, res) => {
  try {
    const body = atendimentoSchema.parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.insert(srAtendimentosTable).values({
        escolaId: req.escolaId,
        registradoPorId: req.usuarioId,
        ...body,
      }).returning()
    );
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao registrar atendimento." });
  }
});

router.put("/atendimentos/:id", srGuard("manage"), async (req: any, res) => {
  try {
    const body = atendimentoSchema.partial().parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(srAtendimentosTable)
        .set({ ...body, atualizadoEm: new Date() })
        .where(and(
          eq(srAtendimentosTable.id, req.params.id),
          eq(srAtendimentosTable.escolaId, req.escolaId),
        ))
        .returning()
    );
    if (!row) return res.status(404).json({ error: "Atendimento não encontrado." });
    res.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao atualizar atendimento." });
  }
});

router.delete("/atendimentos/:id", srGuard("manage"), async (req: any, res) => {
  try {
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(srAtendimentosTable)
        .set({ deletadoEm: new Date() })
        .where(and(
          eq(srAtendimentosTable.id, req.params.id),
          eq(srAtendimentosTable.escolaId, req.escolaId),
        ))
        .returning()
    );
    if (!row) return res.status(404).json({ error: "Atendimento não encontrado." });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao remover atendimento." });
  }
});

// ── PLANOS AEE ────────────────────────────────────────────────────────────────

const planoSchema = z.object({
  estudanteId:  z.string().uuid(),
  objetivos:    z.string().min(1),
  estrategias:  z.string().min(1),
  avaliacao:    z.string().min(1),
  prazo:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observacoes:  z.string().optional(),
  status:       z.enum(["rascunho", "ativo", "encerrado"]).optional(),
  ano:          z.number().int(),
  semestre:     z.union([z.literal(1), z.literal(2)]),
});

router.get("/planos-aee", srGuard("view"), async (req: any, res) => {
  try {
    const { estudanteId } = req.query;
    const conditions: any[] = [eq(srPlanosAeeTable.escolaId, req.escolaId)];
    if (estudanteId) conditions.push(eq(srPlanosAeeTable.estudanteId, String(estudanteId)));
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select().from(srPlanosAeeTable)
        .where(and(...conditions))
        .orderBy(desc(srPlanosAeeTable.criadoEm))
    );
    res.json({ planos: rows });
  } catch {
    res.status(500).json({ error: "Erro ao listar planos." });
  }
});

router.get("/planos-aee/:id", srGuard("professor"), async (req: any, res) => {
  try {
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.select().from(srPlanosAeeTable)
        .where(and(
          eq(srPlanosAeeTable.id, req.params.id),
          eq(srPlanosAeeTable.escolaId, req.escolaId),
        ))
    );
    if (!row) return res.status(404).json({ error: "Plano não encontrado." });
    const roles = await buscarRoles(req.usuarioId);
    if (roles.includes("sala_recursos:professor") &&
        !roles.includes("sala_recursos:manage") &&
        !roles.includes("sala_recursos:view")) {
      const { objetivos, estrategias, avaliacao, prazo, status } = row;
      return res.json({ id: row.id, estudanteId: row.estudanteId, objetivos, estrategias, avaliacao, prazo, status });
    }
    res.json(row);
  } catch {
    res.status(500).json({ error: "Erro ao buscar plano." });
  }
});

router.post("/planos-aee", srGuard("manage"), async (req: any, res) => {
  try {
    const body = planoSchema.parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.insert(srPlanosAeeTable).values({
        escolaId: req.escolaId,
        elaboradoPorId: req.usuarioId,
        ...body,
      }).returning()
    );
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao criar plano." });
  }
});

router.put("/planos-aee/:id", srGuard("manage"), async (req: any, res) => {
  try {
    const body = planoSchema.partial().parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(srPlanosAeeTable)
        .set({ ...body, atualizadoEm: new Date() })
        .where(and(
          eq(srPlanosAeeTable.id, req.params.id),
          eq(srPlanosAeeTable.escolaId, req.escolaId),
        ))
        .returning()
    );
    if (!row) return res.status(404).json({ error: "Plano não encontrado." });
    res.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao atualizar plano." });
  }
});

// ── ESV ───────────────────────────────────────────────────────────────────────

const esvSchema = z.object({
  estudanteId:   z.string().uuid(),
  nome:          z.string().min(1).max(200),
  contato:       z.string().max(200).optional(),
  periodoInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodoFim:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  observacoes:   z.string().optional(),
  ativo:         z.boolean().optional(),
});

router.get("/esv", srGuard("view"), async (req: any, res) => {
  try {
    const { estudanteId } = req.query;
    const conditions: any[] = [eq(srEsvTable.escolaId, req.escolaId)];
    if (estudanteId) conditions.push(eq(srEsvTable.estudanteId, String(estudanteId)));
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select().from(srEsvTable).where(and(...conditions))
    );
    res.json({ esv: rows });
  } catch {
    res.status(500).json({ error: "Erro ao listar ESVs." });
  }
});

router.post("/esv", srGuard("manage"), async (req: any, res) => {
  try {
    const body = esvSchema.parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.insert(srEsvTable).values({ escolaId: req.escolaId, ...body }).returning()
    );
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao vincular ESV." });
  }
});

router.put("/esv/:id", srGuard("manage"), async (req: any, res) => {
  try {
    const body = esvSchema.partial().parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(srEsvTable)
        .set({ ...body, atualizadoEm: new Date() })
        .where(and(eq(srEsvTable.id, req.params.id), eq(srEsvTable.escolaId, req.escolaId)))
        .returning()
    );
    if (!row) return res.status(404).json({ error: "ESV não encontrado." });
    res.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao atualizar ESV." });
  }
});

// ── ESTUDOS DE CASO ───────────────────────────────────────────────────────────

const estudoCasoSchema = z.object({
  estudanteId:                z.string().uuid(),
  dataRealizacao:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  participantes:              z.string().optional(),
  sintese:                    z.string().min(1),
  encaminhamentosResultantes: z.string().optional(),
  status:                     z.enum(["aberto", "encerrado"]).optional(),
});

router.get("/estudos-caso", srGuard("view"), async (req: any, res) => {
  try {
    const { estudanteId } = req.query;
    const conditions: any[] = [eq(srEstudosCasoTable.escolaId, req.escolaId)];
    if (estudanteId) conditions.push(eq(srEstudosCasoTable.estudanteId, String(estudanteId)));
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select().from(srEstudosCasoTable)
        .where(and(...conditions))
        .orderBy(desc(srEstudosCasoTable.dataRealizacao))
    );
    res.json({ estudosCaso: rows });
  } catch {
    res.status(500).json({ error: "Erro ao listar estudos de caso." });
  }
});

router.post("/estudos-caso", srGuard("manage"), async (req: any, res) => {
  try {
    const body = estudoCasoSchema.parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.insert(srEstudosCasoTable).values({ escolaId: req.escolaId, ...body }).returning()
    );
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao criar estudo de caso." });
  }
});

router.put("/estudos-caso/:id", srGuard("manage"), async (req: any, res) => {
  try {
    const body = estudoCasoSchema.partial().parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(srEstudosCasoTable)
        .set({ ...body, atualizadoEm: new Date() })
        .where(and(eq(srEstudosCasoTable.id, req.params.id), eq(srEstudosCasoTable.escolaId, req.escolaId)))
        .returning()
    );
    if (!row) return res.status(404).json({ error: "Estudo de caso não encontrado." });
    res.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao atualizar estudo de caso." });
  }
});

// ── ENCAMINHAMENTOS INTERNOS ──────────────────────────────────────────────────

const encSchema = z.object({
  estudanteId:    z.string().uuid(),
  descricao:      z.string().min(1),
  destinatarioId: z.string().uuid().optional(),
  prazo:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status:         z.enum(["pendente", "em_andamento", "concluido"]).optional(),
  resposta:       z.string().optional(),
});

router.get("/encaminhamentos", srGuard("view"), async (req: any, res) => {
  try {
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select().from(srEncaminhamentosTable)
        .where(eq(srEncaminhamentosTable.escolaId, req.escolaId))
        .orderBy(desc(srEncaminhamentosTable.criadoEm))
    );
    res.json({ encaminhamentos: rows });
  } catch {
    res.status(500).json({ error: "Erro ao listar encaminhamentos." });
  }
});

router.post("/encaminhamentos", srGuard("manage"), async (req: any, res) => {
  try {
    const body = encSchema.parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.insert(srEncaminhamentosTable).values({
        escolaId: req.escolaId,
        criadoPorId: req.usuarioId,
        ...body,
      }).returning()
    );
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao criar encaminhamento." });
  }
});

router.put("/encaminhamentos/:id", srGuard("manage"), async (req: any, res) => {
  try {
    const body = encSchema.partial().parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.update(srEncaminhamentosTable)
        .set({ ...body, atualizadoEm: new Date() })
        .where(and(eq(srEncaminhamentosTable.id, req.params.id), eq(srEncaminhamentosTable.escolaId, req.escolaId)))
        .returning()
    );
    if (!row) return res.status(404).json({ error: "Encaminhamento não encontrado." });
    res.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao atualizar encaminhamento." });
  }
});

// ── ENCAMINHAMENTO INTER-MÓDULO ───────────────────────────────────────────────

const interModuloSchema = z.object({
  destinoModulo:  z.enum(["soe", "aee"]),
  estudanteId:    z.string().uuid(),
  referenciaId:   z.string().uuid().optional(),
  referenciaTipo: z.string().max(50).optional(),
  mensagem:       z.string().min(1),
});

router.post("/encaminhamentos/inter-modulo", srGuard("manage"), async (req: any, res) => {
  try {
    const body = interModuloSchema.parse(req.body);
    const [row] = await withTenant(req.escolaId, async (tx) =>
      await tx.insert(encaminhamentosEventosTable).values({
        escolaId:      req.escolaId,
        origemModulo:  "sala_recursos",
        destinoModulo: body.destinoModulo,
        estudanteId:   body.estudanteId,
        referenciaId:  body.referenciaId,
        referenciaTipo: body.referenciaTipo,
        mensagem:      body.mensagem,
        criadoPorId:   req.usuarioId,
      }).returning()
    );
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: "Erro ao criar encaminhamento inter-módulo." });
  }
});

// ── PORTAL FAMÍLIA ────────────────────────────────────────────────────────────

router.get("/portal/plano", srGuard("self"), async (req: any, res) => {
  try {
    const [enee] = await withTenant(req.escolaId, async (tx) =>
      await tx.select({ id: srEstudantesEneeTable.id })
        .from(srEstudantesEneeTable)
        .where(and(
          eq(srEstudantesEneeTable.usuarioId, req.usuarioId),
          eq(srEstudantesEneeTable.escolaId, req.escolaId),
          isNull(srEstudantesEneeTable.deletadoEm),
        ))
    );
    if (!enee) return res.json({ plano: null });
    const [plano] = await withTenant(req.escolaId, async (tx) =>
      await tx.select({
        id:          srPlanosAeeTable.id,
        objetivos:   srPlanosAeeTable.objetivos,
        estrategias: srPlanosAeeTable.estrategias,
        avaliacao:   srPlanosAeeTable.avaliacao,
        prazo:       srPlanosAeeTable.prazo,
        status:      srPlanosAeeTable.status,
        ano:         srPlanosAeeTable.ano,
        semestre:    srPlanosAeeTable.semestre,
      })
      .from(srPlanosAeeTable)
      .where(and(
        eq(srPlanosAeeTable.estudanteId, enee.id),
        eq(srPlanosAeeTable.escolaId, req.escolaId),
        eq(srPlanosAeeTable.status, "ativo"),
      ))
      .orderBy(desc(srPlanosAeeTable.criadoEm))
    );
    res.json({ plano: plano ?? null });
  } catch {
    res.status(500).json({ error: "Erro ao buscar plano." });
  }
});

// ── PORTAL PROFESSOR ──────────────────────────────────────────────────────────

router.get("/portal/professor/adequacoes", srGuard("professor"), async (req: any, res) => {
  try {
    const rows = await withTenant(req.escolaId, async (tx) =>
      await tx.select({
        id:           srPlanosAeeTable.id,
        estudanteId:  srPlanosAeeTable.estudanteId,
        objetivos:    srPlanosAeeTable.objetivos,
        estrategias:  srPlanosAeeTable.estrategias,
        avaliacao:    srPlanosAeeTable.avaliacao,
        prazo:        srPlanosAeeTable.prazo,
        status:       srPlanosAeeTable.status,
      })
      .from(srPlanosAeeTable)
      .where(and(
        eq(srPlanosAeeTable.escolaId, req.escolaId),
        eq(srPlanosAeeTable.status, "ativo"),
      ))
    );
    res.json({ adequacoes: rows });
  } catch {
    res.status(500).json({ error: "Erro ao buscar adequações." });
  }
});

export default router;
