import { Router } from "express";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  db, aeeEstudantesTable, aeePlanosTable, aeePlanoAssinaturasTable,
  aeePlanoAdaptacoesTable, aeeMetasTable, aeeEvolucoesTable,
  aeeSessoesTable, aeeLaudosTable, aeeLiberacoesTable, aeeAuditoriaTable,
  usuariosTable,
  eq, and, isNull, sql, count, desc,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { buscarRoles } from "../lib/permissions.js";
import { withTenant } from "../middleware/tenant.js";
import { cifrarLaudo, decifrarLaudo, gerarChaveRef } from "../lib/aee-crypto.js";
import { registrarAuditoriaAee } from "../lib/aee-audit.js";

const router = Router();
router.use(requireAuth);

// ── Helpers ──────────────────────────────────────────────────────────────────

type AeeNivel = "manage" | "view" | "self";

const ROLES_MANAGE = ["professor_aee", "psicologo", "psicopedagogo"];
const ROLES_VIEW   = [...ROLES_MANAGE, "coordenacao", "supervisao", "direcao"];

function temAcessoAee(roles: string[], nivel: AeeNivel): boolean {
  if (nivel === "manage") return roles.some(r => ROLES_MANAGE.includes(r));
  if (nivel === "view")   return roles.some(r => ROLES_VIEW.includes(r));
  return true; // "self" verificado por usuarioId na query
}

function aeeGuard(nivel: AeeNivel) {
  return async (req: any, res: any, next: any) => {
    const roles = await buscarRoles(req.usuarioId!);
    await registrarAuditoriaAee({ req, acao: "ACCESS_ATTEMPT" });
    if (!temAcessoAee(roles, nivel)) {
      await registrarAuditoriaAee({ req, acao: "ACCESS_DENIED" });
      return res.status(403).json({ error: "Acesso negado." });
    }
    req.aeeRoles = roles;
    next();
  };
}

async function gerarNumeroPai(tx: any, escolaId: string): Promise<string> {
  const ano = new Date().getFullYear();
  const prefix = `PAI-${ano}-`;
  const [row] = await tx
    .select({ n: count() })
    .from(aeePlanosTable)
    .where(sql`numero LIKE ${prefix + "%"} AND escola_id = ${escolaId}::uuid`);
  const seq = ((row?.n as number) ?? 0) + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

function gerarTokenHash(planoId: string, usuarioId: string, papel: string, senha: string): string {
  return createHash("sha256")
    .update(`${planoId}:${usuarioId}:${papel}:${Date.now()}:${senha}`)
    .digest("hex");
}

// ── Estudantes AEE ───────────────────────────────────────────────────────────

const estudanteAeeSchema = z.object({
  usuarioId:      z.string().uuid(),
  necessidades:   z.string().optional(),
  cid10:          z.string().max(10).optional(),
  profissionalId: z.string().uuid().optional(),
});

router.get("/estudantes", aeeGuard("view"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const rows = await withTenant(escolaId, async (tx) =>
    tx.select({
      id:             aeeEstudantesTable.id,
      usuarioId:      aeeEstudantesTable.usuarioId,
      necessidades:   aeeEstudantesTable.necessidades,
      ativo:          aeeEstudantesTable.ativo,
      profissionalId: aeeEstudantesTable.profissionalId,
      nomeEstudante:  usuariosTable.nome,
    })
    .from(aeeEstudantesTable)
    .leftJoin(usuariosTable, eq(usuariosTable.id, aeeEstudantesTable.usuarioId))
    .where(and(eq(aeeEstudantesTable.escolaId, escolaId), isNull(aeeEstudantesTable.deletadoEm)))
    .orderBy(usuariosTable.nome)
  );
  res.json({ estudantes: rows });
});

router.get("/estudantes/:id", aeeGuard("view"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const roles: string[] = req.aeeRoles;
  const isManage = temAcessoAee(roles, "manage");

  const [est] = await withTenant(escolaId, async (tx) =>
    tx.select()
    .from(aeeEstudantesTable)
    .where(and(
      eq(aeeEstudantesTable.id, req.params.id),
      eq(aeeEstudantesTable.escolaId, escolaId),
      isNull(aeeEstudantesTable.deletadoEm),
    ))
  );
  if (!est) return res.status(404).json({ error: "Estudante AEE não encontrado." });

  await registrarAuditoriaAee({ req, acao: "READ_PERFIL", estudanteId: est.id, escolaId });

  // cid10 só para manage
  const resultado: any = { ...est };
  if (!isManage) delete resultado.cid10;

  res.json(resultado);
});

router.post("/estudantes", aeeGuard("manage"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const body = estudanteAeeSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const [novo] = await withTenant(escolaId, async (tx) =>
    tx.insert(aeeEstudantesTable).values({ ...body.data, escolaId }).returning()
  );
  await registrarAuditoriaAee({ req, acao: "CREATE_ESTUDANTE", estudanteId: novo.id, escolaId });
  res.status(201).json(novo);
});

router.put("/estudantes/:id", aeeGuard("manage"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const body = estudanteAeeSchema.partial().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const [atualizado] = await withTenant(escolaId, async (tx) =>
    tx.update(aeeEstudantesTable)
    .set({ ...body.data, atualizadoEm: new Date() })
    .where(and(eq(aeeEstudantesTable.id, req.params.id), eq(aeeEstudantesTable.escolaId, escolaId)))
    .returning()
  );
  if (!atualizado) return res.status(404).json({ error: "Estudante AEE não encontrado." });
  res.json(atualizado);
});

router.delete("/estudantes/:id", aeeGuard("manage"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const [removido] = await withTenant(escolaId, async (tx) =>
    tx.update(aeeEstudantesTable)
    .set({ deletadoEm: new Date(), ativo: false })
    .where(and(eq(aeeEstudantesTable.id, req.params.id), eq(aeeEstudantesTable.escolaId, escolaId)))
    .returning()
  );
  if (!removido) return res.status(404).json({ error: "Estudante AEE não encontrado." });
  res.json({ ok: true });
});

// ── Planos (PAI) ─────────────────────────────────────────────────────────────

const planoSchema = z.object({
  estudanteAeeId:  z.string().uuid(),
  periodoInicio:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodoFim:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  objetivosGerais: z.string().optional(),
});

router.get("/planos", aeeGuard("view"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const { estudanteAeeId } = req.query;
  const condicoes: any[] = [eq(aeePlanosTable.escolaId, escolaId), isNull(aeePlanosTable.deletadoEm)];
  if (estudanteAeeId) condicoes.push(eq(aeePlanosTable.estudanteAeeId, String(estudanteAeeId)));

  const rows = await withTenant(escolaId, async (tx) =>
    tx.select().from(aeePlanosTable).where(and(...condicoes)).orderBy(desc(aeePlanosTable.criadoEm))
  );
  await registrarAuditoriaAee({ req, acao: "READ_PLANOS", escolaId });
  res.json({ planos: rows });
});

router.post("/planos", aeeGuard("manage"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const body = planoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const [novo] = await withTenant(escolaId, async (tx) => {
    const numero = await gerarNumeroPai(tx, escolaId);
    return tx.insert(aeePlanosTable).values({
      ...body.data, escolaId, numero, criadoPorId: req.usuarioId,
    }).returning();
  });
  res.status(201).json(novo);
});

router.put("/planos/:id", aeeGuard("manage"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  // Só permite editar rascunho
  const [plano] = await withTenant(escolaId, async (tx) =>
    tx.select().from(aeePlanosTable)
    .where(and(eq(aeePlanosTable.id, req.params.id), eq(aeePlanosTable.escolaId, escolaId)))
  );
  if (!plano) return res.status(404).json({ error: "Plano não encontrado." });
  if (plano.status !== "rascunho") return res.status(422).json({ error: "Só é possível editar planos em rascunho." });

  const body = planoSchema.partial().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const [atualizado] = await withTenant(escolaId, async (tx) =>
    tx.update(aeePlanosTable)
    .set({ ...body.data, atualizadoEm: new Date() })
    .where(eq(aeePlanosTable.id, req.params.id))
    .returning()
  );
  res.json(atualizado);
});

// ── Assinatura Digital do PAI ────────────────────────────────────────────────

const assinarSchema = z.object({
  senha: z.string().min(1),
  papel: z.enum(["professor_aee", "responsavel", "estudante"]),
});

router.post("/planos/:id/assinar", async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const body = assinarSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const [plano] = await withTenant(escolaId, async (tx) =>
    tx.select().from(aeePlanosTable)
    .where(and(eq(aeePlanosTable.id, req.params.id), eq(aeePlanosTable.escolaId, escolaId)))
  );
  if (!plano) return res.status(404).json({ error: "Plano não encontrado." });
  if (plano.status === "vigente" || plano.status === "encerrado") {
    return res.status(422).json({ error: "Plano já finalizado." });
  }

  // Verifica senha do usuário
  const [usuario] = await db.select({ senhaHash: usuariosTable.senhaHash })
    .from(usuariosTable).where(eq(usuariosTable.id, req.usuarioId!));
  if (!usuario?.senhaHash) return res.status(401).json({ error: "Usuário inválido." });

  const senhaOk = await bcrypt.compare(body.data.senha, usuario.senhaHash);
  if (!senhaOk) return res.status(401).json({ error: "Senha incorreta." });

  const tokenHash = gerarTokenHash(plano.id, req.usuarioId!, body.data.papel, body.data.senha);

  await withTenant(escolaId, async (tx) =>
    tx.insert(aeePlanoAssinaturasTable).values({
      planoId:   plano.id,
      usuarioId: req.usuarioId!,
      papel:     body.data.papel,
      metodo:    "senha",
      tokenHash,
      ipOrigem:  req.ip,
    }).onConflictDoNothing()
  );

  // Verifica se todas as assinaturas obrigatórias foram coletadas
  const assinaturas = await withTenant(escolaId, async (tx) =>
    tx.select({ papel: aeePlanoAssinaturasTable.papel })
    .from(aeePlanoAssinaturasTable)
    .where(eq(aeePlanoAssinaturasTable.planoId, plano.id))
  );
  const papeis = assinaturas.map((a: { papel: string | null }) => a.papel);
  const todasAssinadas = papeis.includes("professor_aee") && papeis.includes("responsavel");

  if (todasAssinadas) {
    await withTenant(escolaId, async (tx) =>
      tx.update(aeePlanosTable)
      .set({ status: "vigente", atualizadoEm: new Date() })
      .where(eq(aeePlanosTable.id, plano.id))
    );
  } else if (plano.status === "rascunho") {
    await withTenant(escolaId, async (tx) =>
      tx.update(aeePlanosTable)
      .set({ status: "aguardando_assinatura", atualizadoEm: new Date() })
      .where(eq(aeePlanosTable.id, plano.id))
    );
  }

  await registrarAuditoriaAee({ req, acao: "ASSINAR_PAI", recursoId: plano.id, escolaId });
  res.json({ ok: true, vigente: todasAssinadas });
});

// ── Adaptações ───────────────────────────────────────────────────────────────

const adaptacaoSchema = z.object({
  descricao: z.string().min(1),
  area: z.enum(["avaliacao", "metodologia", "recurso", "espaco", "tempo"]),
});

router.get("/planos/:id/adaptacoes", async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const rows = await withTenant(escolaId, async (tx) =>
    tx.select().from(aeePlanoAdaptacoesTable)
    .where(eq(aeePlanoAdaptacoesTable.planoId, req.params.id))
    .orderBy(aeePlanoAdaptacoesTable.criadoEm)
  );
  await registrarAuditoriaAee({ req, acao: "READ_ADAPTACOES", escolaId: req.escolaId });
  res.json({ adaptacoes: rows });
});

router.post("/planos/:id/adaptacoes", aeeGuard("manage"), async (req: any, res) => {
  const body = adaptacaoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const [nova] = await withTenant(req.escolaId, async (tx) =>
    tx.insert(aeePlanoAdaptacoesTable).values({ ...body.data, planoId: req.params.id }).returning()
  );
  res.status(201).json(nova);
});

router.delete("/planos/:id/adaptacoes/:adaptId", aeeGuard("manage"), async (req: any, res) => {
  await withTenant(req.escolaId, async (tx) =>
    tx.delete(aeePlanoAdaptacoesTable)
    .where(and(
      eq(aeePlanoAdaptacoesTable.id, req.params.adaptId),
      eq(aeePlanoAdaptacoesTable.planoId, req.params.id),
    ))
  );
  res.json({ ok: true });
});

// ── Metas ────────────────────────────────────────────────────────────────────

const metaSchema = z.object({
  planoId:   z.string().uuid(),
  descricao: z.string().min(1),
  indicador: z.string().optional(),
  prazo:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.get("/metas", aeeGuard("view"), async (req: any, res) => {
  const { planoId } = req.query;
  const condicoes: any[] = [];
  if (planoId) condicoes.push(eq(aeeMetasTable.planoId, String(planoId)));

  // metas always belong to a plano — if no planoId provided, return empty rather than full-tenant scan
  const rows = condicoes.length > 0
    ? await withTenant(req.escolaId, async (tx) =>
        tx.select().from(aeeMetasTable).where(and(...condicoes))
      )
    : [];
  await registrarAuditoriaAee({ req, acao: "READ_METAS", escolaId: req.escolaId });
  res.json({ metas: rows });
});

router.post("/metas", aeeGuard("manage"), async (req: any, res) => {
  const body = metaSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const [nova] = await withTenant(req.escolaId, async (tx) =>
    tx.insert(aeeMetasTable).values(body.data).returning()
  );
  res.status(201).json(nova);
});

router.put("/metas/:id", aeeGuard("manage"), async (req: any, res) => {
  // aeeMetasTable has no escola_id — isolated via withTenant + RLS on parent aee_planos
  const body = metaSchema.partial().merge(z.object({ status: z.string().optional() })).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const [atualizada] = await withTenant(req.escolaId, async (tx) =>
    tx.update(aeeMetasTable)
    .set({ ...body.data, atualizadoEm: new Date() })
    .where(eq(aeeMetasTable.id, req.params.id))
    .returning()
  );
  if (!atualizada) return res.status(404).json({ error: "Meta não encontrada." });
  res.json(atualizada);
});

const evolucaoSchema = z.object({
  periodoRef:  z.string().regex(/^\d{4}-\d{2}$/),
  observacao:  z.string().min(1),
  percentual:  z.number().int().min(0).max(100).optional(),
});

router.post("/metas/:id/evolucao", aeeGuard("manage"), async (req: any, res) => {
  const body = evolucaoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const [nova] = await withTenant(req.escolaId, async (tx) =>
    tx.insert(aeeEvolucoesTable).values({
      ...body.data, metaId: req.params.id, profissionalId: req.usuarioId,
    }).returning()
  );
  res.status(201).json(nova);
});

router.get("/metas/:id/evolucao", aeeGuard("view"), async (req: any, res) => {
  const rows = await withTenant(req.escolaId, async (tx) =>
    tx.select().from(aeeEvolucoesTable)
    .where(eq(aeeEvolucoesTable.metaId, req.params.id))
    .orderBy(aeeEvolucoesTable.registradoEm)
  );
  res.json({ evolucoes: rows });
});

// ── Sessões ──────────────────────────────────────────────────────────────────

const sessaoSchema = z.object({
  estudanteAeeId: z.string().uuid(),
  dataSessao:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duracaoMin:     z.number().int().positive().optional(),
  local:          z.string().max(100).optional(),
  observacoes:    z.string().optional(),
});

router.get("/sessoes", aeeGuard("view"), async (req: any, res) => {
  const { estudanteAeeId } = req.query;
  const condicoes: any[] = [
    eq(aeeSessoesTable.escolaId, req.escolaId),
    isNull(aeeSessoesTable.deletadoEm),
  ];
  if (estudanteAeeId) condicoes.push(eq(aeeSessoesTable.estudanteAeeId, String(estudanteAeeId)));

  const rows = await withTenant(req.escolaId, async (tx) =>
    tx.select().from(aeeSessoesTable)
    .where(and(...condicoes))
    .orderBy(desc(aeeSessoesTable.dataSessao))
  );
  res.json({ sessoes: rows });
});

router.post("/sessoes", aeeGuard("manage"), async (req: any, res) => {
  const body = sessaoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const [nova] = await withTenant(req.escolaId, async (tx) =>
    tx.insert(aeeSessoesTable).values({
      ...body.data, escolaId: req.escolaId, profissionalId: req.usuarioId,
    }).returning()
  );
  res.status(201).json(nova);
});

router.put("/sessoes/:id", aeeGuard("manage"), async (req: any, res) => {
  const body = sessaoSchema.partial().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const [atualizada] = await withTenant(req.escolaId, async (tx) =>
    tx.update(aeeSessoesTable).set(body.data)
    .where(and(eq(aeeSessoesTable.id, req.params.id), eq(aeeSessoesTable.escolaId, req.escolaId)))
    .returning()
  );
  if (!atualizada) return res.status(404).json({ error: "Sessão não encontrada." });
  res.json(atualizada);
});

router.delete("/sessoes/:id", aeeGuard("manage"), async (req: any, res) => {
  const [removida] = await withTenant(req.escolaId, async (tx) =>
    tx.update(aeeSessoesTable).set({ deletadoEm: new Date() })
    .where(and(eq(aeeSessoesTable.id, req.params.id), eq(aeeSessoesTable.escolaId, req.escolaId)))
    .returning()
  );
  if (!removida) return res.status(404).json({ error: "Sessão não encontrada." });
  res.json({ ok: true });
});

// ── Laudos (acesso restrito + auditoria obrigatória) ─────────────────────────

const laudoSchema = z.object({
  estudanteAeeId:  z.string().uuid(),
  tipo:            z.enum(["psicologico", "psicopedagogico", "fonoaudiologico", "medico", "outro"]),
  titulo:          z.string().min(1).max(200),
  conteudo:        z.string().min(1),
  profissionalExt: z.string().max(200).optional(),
  dataLaudo:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.get("/laudos", aeeGuard("manage"), async (req: any, res) => {
  const { estudanteAeeId } = req.query;
  const condicoes: any[] = [
    eq(aeeLaudosTable.escolaId, req.escolaId),
    isNull(aeeLaudosTable.deletadoEm),
  ];
  if (estudanteAeeId) condicoes.push(eq(aeeLaudosTable.estudanteAeeId, String(estudanteAeeId)));

  // NUNCA retorna conteudo_enc na listagem
  const rows = await withTenant(req.escolaId, async (tx) =>
    tx.select({
      id:              aeeLaudosTable.id,
      tipo:            aeeLaudosTable.tipo,
      titulo:          aeeLaudosTable.titulo,
      dataLaudo:       aeeLaudosTable.dataLaudo,
      profissionalExt: aeeLaudosTable.profissionalExt,
      criadoEm:        aeeLaudosTable.criadoEm,
    })
    .from(aeeLaudosTable).where(and(...condicoes))
    .orderBy(desc(aeeLaudosTable.criadoEm))
  );
  res.json({ laudos: rows });
});

router.get("/laudos/:id", aeeGuard("manage"), async (req: any, res) => {
  const [laudo] = await withTenant(req.escolaId, async (tx) =>
    tx.select().from(aeeLaudosTable)
    .where(and(
      eq(aeeLaudosTable.id, req.params.id),
      eq(aeeLaudosTable.escolaId, req.escolaId),
      isNull(aeeLaudosTable.deletadoEm),
    ))
  );
  if (!laudo) return res.status(404).json({ error: "Laudo não encontrado." });

  // Auditoria obrigatória ANTES de descriptografar
  await registrarAuditoriaAee({
    req, acao: "READ_LAUDO",
    estudanteId: laudo.estudanteAeeId,
    recursoId:   laudo.id,
    escolaId:    req.escolaId,
  });

  const conteudo = decifrarLaudo(laudo.conteudoEnc, req.escolaId);
  const { conteudoEnc: _enc, ...laudoSemEnc } = laudo;
  res.json({ ...laudoSemEnc, conteudo });
});

router.post("/laudos", aeeGuard("manage"), async (req: any, res) => {
  const body = laudoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const { conteudo, ...resto } = body.data;
  const conteudoEnc = cifrarLaudo(conteudo, req.escolaId);
  const chaveRef    = gerarChaveRef(req.escolaId);

  const [novo] = await withTenant(req.escolaId, async (tx) =>
    tx.insert(aeeLaudosTable).values({
      ...resto, conteudoEnc, chaveRef,
      escolaId: req.escolaId, criadoPorId: req.usuarioId,
    }).returning({ id: aeeLaudosTable.id, tipo: aeeLaudosTable.tipo, titulo: aeeLaudosTable.titulo })
  );

  await registrarAuditoriaAee({
    req, acao: "CREATE_LAUDO",
    estudanteId: body.data.estudanteAeeId,
    recursoId:   novo.id,
    escolaId:    req.escolaId,
  });
  res.status(201).json(novo);
});

router.delete("/laudos/:id", aeeGuard("manage"), async (req: any, res) => {
  const [removido] = await withTenant(req.escolaId, async (tx) =>
    tx.update(aeeLaudosTable).set({ deletadoEm: new Date() })
    .where(and(eq(aeeLaudosTable.id, req.params.id), eq(aeeLaudosTable.escolaId, req.escolaId)))
    .returning({ id: aeeLaudosTable.id, estudanteAeeId: aeeLaudosTable.estudanteAeeId })
  );
  if (!removido) return res.status(404).json({ error: "Laudo não encontrado." });
  await registrarAuditoriaAee({
    req, acao: "DELETE_LAUDO",
    estudanteId: removido.estudanteAeeId,
    recursoId:   removido.id,
    escolaId:    req.escolaId,
  });
  res.json({ ok: true });
});

// ── Liberações ───────────────────────────────────────────────────────────────

const liberacaoSchema = z.object({
  estudanteAeeId: z.string().uuid(),
  professorId:    z.string().uuid(),
  verAdaptacoes:  z.boolean().default(true),
  verMetas:       z.boolean().default(false),
  verResumoIa:    z.boolean().default(false),
});

router.get("/liberacoes/:estudanteAeeId", aeeGuard("manage"), async (req: any, res) => {
  const rows = await withTenant(req.escolaId, async (tx) =>
    tx.select().from(aeeLiberacoesTable)
    .where(and(
      eq(aeeLiberacoesTable.estudanteAeeId, req.params.estudanteAeeId),
      eq(aeeLiberacoesTable.escolaId, req.escolaId),
      isNull(aeeLiberacoesTable.revogadoEm),
    ))
  );
  res.json({ liberacoes: rows });
});

router.put("/liberacoes", aeeGuard("manage"), async (req: any, res) => {
  const body = liberacaoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  await withTenant(req.escolaId, async (tx) => {
    await tx.update(aeeLiberacoesTable)
    .set({ revogadoEm: new Date() })
    .where(and(
      eq(aeeLiberacoesTable.estudanteAeeId, body.data.estudanteAeeId),
      eq(aeeLiberacoesTable.professorId, body.data.professorId),
      eq(aeeLiberacoesTable.escolaId, req.escolaId),
      isNull(aeeLiberacoesTable.revogadoEm),
    ));
    await tx.insert(aeeLiberacoesTable).values({
      ...body.data, escolaId: req.escolaId, concedidoPorId: req.usuarioId,
    });
  });
  res.json({ ok: true });
});

router.delete("/liberacoes/:id", aeeGuard("manage"), async (req: any, res) => {
  const [revogada] = await withTenant(req.escolaId, async (tx) =>
    tx.update(aeeLiberacoesTable)
    .set({ revogadoEm: new Date() })
    .where(and(eq(aeeLiberacoesTable.id, req.params.id), eq(aeeLiberacoesTable.escolaId, req.escolaId)))
    .returning({ id: aeeLiberacoesTable.id })
  );
  if (!revogada) return res.status(404).json({ error: "Liberação não encontrada." });
  res.json({ ok: true });
});

// ── Auditoria (somente leitura) ──────────────────────────────────────────────

router.get("/auditoria", aeeGuard("manage"), async (req: any, res) => {
  const { estudanteId, limit = "50" } = req.query;
  const condicoes: any[] = [eq(aeeAuditoriaTable.escolaId, req.escolaId)];
  if (estudanteId) condicoes.push(eq(aeeAuditoriaTable.estudanteId, String(estudanteId)));

  const rows = await db.select().from(aeeAuditoriaTable)
    .where(and(...condicoes))
    .orderBy(desc(aeeAuditoriaTable.criadoEm))
    .limit(Math.min(Number(limit), 200));
  res.json({ logs: rows });
});

// ── Portal do Estudante / Responsável ────────────────────────────────────────

router.get("/portal/meu-plano", async (req: any, res) => {
  const usuarioId: string = req.usuarioId!;
  const escolaId: string  = req.escolaId;

  const [est] = await withTenant(escolaId, async (tx) =>
    tx.select({ id: aeeEstudantesTable.id })
    .from(aeeEstudantesTable)
    .where(and(
      eq(aeeEstudantesTable.usuarioId, usuarioId),
      eq(aeeEstudantesTable.escolaId, escolaId),
      eq(aeeEstudantesTable.ativo, true),
      isNull(aeeEstudantesTable.deletadoEm),
    ))
  );
  if (!est) return res.json({ aee: false });

  const [plano] = await withTenant(escolaId, async (tx) =>
    tx.select().from(aeePlanosTable)
    .where(and(
      eq(aeePlanosTable.estudanteAeeId, est.id),
      eq(aeePlanosTable.status, "vigente"),
    ))
    .orderBy(desc(aeePlanosTable.criadoEm))
    .limit(1)
  );
  if (!plano) return res.json({ aee: true, planoVigente: null });

  const adaptacoes = await withTenant(escolaId, async (tx) =>
    tx.select().from(aeePlanoAdaptacoesTable).where(eq(aeePlanoAdaptacoesTable.planoId, plano.id))
  );
  const metas = await withTenant(escolaId, async (tx) =>
    tx.select().from(aeeMetasTable).where(eq(aeeMetasTable.planoId, plano.id))
  );

  await registrarAuditoriaAee({ req, acao: "PORTAL_READ_PAI", estudanteId: est.id, escolaId });
  res.json({ aee: true, planoVigente: { ...plano, adaptacoes, metas } });
});

// ── Portal do Professor (somente liberações) ─────────────────────────────────

router.get("/portal-professor/:estudanteAeeId", async (req: any, res) => {
  const escolaId: string    = req.escolaId;
  const professorId: string = req.usuarioId!;

  const [lib] = await withTenant(escolaId, async (tx) =>
    tx.select().from(aeeLiberacoesTable)
    .where(and(
      eq(aeeLiberacoesTable.estudanteAeeId, req.params.estudanteAeeId),
      eq(aeeLiberacoesTable.professorId, professorId),
      eq(aeeLiberacoesTable.escolaId, escolaId),
      isNull(aeeLiberacoesTable.revogadoEm),
    ))
  );
  if (!lib) return res.json({ liberado: false });

  await registrarAuditoriaAee({
    req, acao: "PROFESSOR_READ_LIBERACAO",
    estudanteId: req.params.estudanteAeeId, escolaId,
  });

  const resultado: any = { liberado: true };
  if (lib.verAdaptacoes) {
    const [plano] = await withTenant(escolaId, async (tx) =>
      tx.select({ id: aeePlanosTable.id }).from(aeePlanosTable)
      .where(and(
        eq(aeePlanosTable.estudanteAeeId, req.params.estudanteAeeId),
        eq(aeePlanosTable.status, "vigente"),
      )).limit(1)
    );
    if (plano) {
      resultado.adaptacoes = await withTenant(escolaId, async (tx) =>
        tx.select().from(aeePlanoAdaptacoesTable).where(eq(aeePlanoAdaptacoesTable.planoId, plano.id))
      );
    }
  }
  if (lib.verMetas) {
    const [plano] = await withTenant(escolaId, async (tx) =>
      tx.select({ id: aeePlanosTable.id }).from(aeePlanosTable)
      .where(and(
        eq(aeePlanosTable.estudanteAeeId, req.params.estudanteAeeId),
        eq(aeePlanosTable.status, "vigente"),
      )).limit(1)
    );
    if (plano) {
      resultado.metas = await withTenant(escolaId, async (tx) =>
        tx.select().from(aeeMetasTable).where(eq(aeeMetasTable.planoId, plano.id))
      );
    }
  }

  res.json(resultado);
});

export default router;
