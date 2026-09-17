import { Router } from "express";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  db, eeaaEstudantesTable, eeaaPlanosTable, eeaaPlanoAssinaturasTable,
  eeaaPlanoAdaptacoesTable, eeaaMetasTable, eeaaEvolucoesTable,
  eeaaSessoesTable, eeaaLaudosTable, eeaaLiberacoesTable, eeaaAuditoriaTable,
  usuariosTable,
  eq, and, isNull, sql, count, desc,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { buscarRoles } from "../lib/permissions.js";
import { withTenant } from "../middleware/tenant.js";
import { cifrarLaudo, decifrarLaudo, gerarChaveRef } from "../lib/eeaa-crypto.js";
import { registrarAuditoriaEeaa } from "../lib/eeaa-audit.js";

const router = Router();
router.use(requireAuth);

// ── Helpers ──────────────────────────────────────────────────────────────────

type EeaaNivel = "manage" | "view" | "self";

const ROLES_MANAGE = ["professor_aee", "psicologo", "psicopedagogo"];
const ROLES_VIEW   = [...ROLES_MANAGE, "coordenacao", "supervisao", "direcao"];

function temAcessoEeaa(roles: string[], nivel: EeaaNivel): boolean {
  if (nivel === "manage") return roles.some(r => ROLES_MANAGE.includes(r));
  if (nivel === "view")   return roles.some(r => ROLES_VIEW.includes(r));
  return true; // "self" verificado por usuarioId na query
}

function eeaaGuard(nivel: EeaaNivel) {
  return async (req: any, res: any, next: any) => {
    const roles = await buscarRoles(req.usuarioId!);
    await registrarAuditoriaEeaa({ req, acao: "ACCESS_ATTEMPT" });
    if (!temAcessoEeaa(roles, nivel)) {
      await registrarAuditoriaEeaa({ req, acao: "ACCESS_DENIED" });
      return res.status(403).json({ error: "Acesso negado." });
    }
    req.eeaaRoles = roles;
    next();
  };
}

async function gerarNumeroPai(tx: any, escolaId: string): Promise<string> {
  const ano = new Date().getFullYear();
  const prefix = `PAI-${ano}-`;
  const [row] = await tx
    .select({ n: count() })
    .from(eeaaPlanosTable)
    .where(sql`numero LIKE ${prefix + "%"} AND escola_id = ${escolaId}::uuid`);
  const seq = ((row?.n as number) ?? 0) + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

function gerarTokenHash(planoId: string, usuarioId: string, papel: string, senha: string): string {
  return createHash("sha256")
    .update(`${planoId}:${usuarioId}:${papel}:${Date.now()}:${senha}`)
    .digest("hex");
}

// ── Estudantes EEAA ───────────────────────────────────────────────────────────

const estudanteEeaaSchema = z.object({
  usuarioId:      z.string().uuid(),
  necessidades:   z.string().optional(),
  cid10:          z.string().max(10).optional(),
  profissionalId: z.string().uuid().optional(),
});

router.get("/estudantes", eeaaGuard("view"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const rows = await withTenant(escolaId, async (tx) =>
    tx.select({
      id:             eeaaEstudantesTable.id,
      usuarioId:      eeaaEstudantesTable.usuarioId,
      necessidades:   eeaaEstudantesTable.necessidades,
      ativo:          eeaaEstudantesTable.ativo,
      profissionalId: eeaaEstudantesTable.profissionalId,
      nomeEstudante:  usuariosTable.nome,
    })
    .from(eeaaEstudantesTable)
    .leftJoin(usuariosTable, eq(usuariosTable.id, eeaaEstudantesTable.usuarioId))
    .where(and(eq(eeaaEstudantesTable.escolaId, escolaId), isNull(eeaaEstudantesTable.deletadoEm)))
    .orderBy(usuariosTable.nome)
  );
  res.json({ estudantes: rows });
});

router.get("/estudantes/:id", eeaaGuard("view"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const roles: string[] = req.eeaaRoles;
  const isManage = temAcessoEeaa(roles, "manage");

  const [est] = await withTenant(escolaId, async (tx) =>
    tx.select()
    .from(eeaaEstudantesTable)
    .where(and(
      eq(eeaaEstudantesTable.id, req.params.id),
      eq(eeaaEstudantesTable.escolaId, escolaId),
      isNull(eeaaEstudantesTable.deletadoEm),
    ))
  );
  if (!est) return res.status(404).json({ error: "Estudante EEAA não encontrado." });

  await registrarAuditoriaEeaa({ req, acao: "READ_PERFIL", estudanteId: est.id, escolaId });

  // cid10 só para manage
  const resultado: any = { ...est };
  if (!isManage) delete resultado.cid10;

  res.json(resultado);
});

router.post("/estudantes", eeaaGuard("manage"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const body = estudanteEeaaSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const [novo] = await withTenant(escolaId, async (tx) =>
    tx.insert(eeaaEstudantesTable).values({ ...body.data, escolaId }).returning()
  );
  await registrarAuditoriaEeaa({ req, acao: "CREATE_ESTUDANTE", estudanteId: novo.id, escolaId });
  res.status(201).json(novo);
});

router.put("/estudantes/:id", eeaaGuard("manage"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const body = estudanteEeaaSchema.partial().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const [atualizado] = await withTenant(escolaId, async (tx) =>
    tx.update(eeaaEstudantesTable)
    .set({ ...body.data, atualizadoEm: new Date() })
    .where(and(eq(eeaaEstudantesTable.id, req.params.id), eq(eeaaEstudantesTable.escolaId, escolaId)))
    .returning()
  );
  if (!atualizado) return res.status(404).json({ error: "Estudante EEAA não encontrado." });
  res.json(atualizado);
});

router.delete("/estudantes/:id", eeaaGuard("manage"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const [removido] = await withTenant(escolaId, async (tx) =>
    tx.update(eeaaEstudantesTable)
    .set({ deletadoEm: new Date(), ativo: false })
    .where(and(eq(eeaaEstudantesTable.id, req.params.id), eq(eeaaEstudantesTable.escolaId, escolaId)))
    .returning()
  );
  if (!removido) return res.status(404).json({ error: "Estudante EEAA não encontrado." });
  res.json({ ok: true });
});

// ── Planos (PAI) ─────────────────────────────────────────────────────────────

const planoSchema = z.object({
  estudanteAeeId:  z.string().uuid(),
  periodoInicio:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodoFim:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  objetivosGerais: z.string().optional(),
});

router.get("/planos", eeaaGuard("view"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const { estudanteEeaaId } = req.query;
  const condicoes: any[] = [eq(eeaaPlanosTable.escolaId, escolaId), isNull(eeaaPlanosTable.deletadoEm)];
  if (estudanteEeaaId) condicoes.push(eq(eeaaPlanosTable.estudanteAeeId, String(estudanteEeaaId)));

  const rows = await withTenant(escolaId, async (tx) =>
    tx.select().from(eeaaPlanosTable).where(and(...condicoes)).orderBy(desc(eeaaPlanosTable.criadoEm))
  );
  await registrarAuditoriaEeaa({ req, acao: "READ_PLANOS", escolaId });
  res.json({ planos: rows });
});

router.post("/planos", eeaaGuard("manage"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const body = planoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const [novo] = await withTenant(escolaId, async (tx) => {
    const numero = await gerarNumeroPai(tx, escolaId);
    return tx.insert(eeaaPlanosTable).values({
      ...body.data, escolaId, numero, criadoPorId: req.usuarioId,
    }).returning();
  });
  res.status(201).json(novo);
});

router.put("/planos/:id", eeaaGuard("manage"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  // Só permite editar rascunho
  const [plano] = await withTenant(escolaId, async (tx) =>
    tx.select().from(eeaaPlanosTable)
    .where(and(eq(eeaaPlanosTable.id, req.params.id), eq(eeaaPlanosTable.escolaId, escolaId)))
  );
  if (!plano) return res.status(404).json({ error: "Plano não encontrado." });
  if (plano.status !== "rascunho") return res.status(422).json({ error: "Só é possível editar planos em rascunho." });

  const body = planoSchema.partial().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const [atualizado] = await withTenant(escolaId, async (tx) =>
    tx.update(eeaaPlanosTable)
    .set({ ...body.data, atualizadoEm: new Date() })
    .where(eq(eeaaPlanosTable.id, req.params.id))
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
    tx.select().from(eeaaPlanosTable)
    .where(and(eq(eeaaPlanosTable.id, req.params.id), eq(eeaaPlanosTable.escolaId, escolaId)))
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
    tx.insert(eeaaPlanoAssinaturasTable).values({
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
    tx.select({ papel: eeaaPlanoAssinaturasTable.papel })
    .from(eeaaPlanoAssinaturasTable)
    .where(eq(eeaaPlanoAssinaturasTable.planoId, plano.id))
  );
  const papeis = assinaturas.map((a: { papel: string | null }) => a.papel);
  const todasAssinadas = papeis.includes("professor_aee") && papeis.includes("responsavel");

  if (todasAssinadas) {
    await withTenant(escolaId, async (tx) =>
      tx.update(eeaaPlanosTable)
      .set({ status: "vigente", atualizadoEm: new Date() })
      .where(eq(eeaaPlanosTable.id, plano.id))
    );
  } else if (plano.status === "rascunho") {
    await withTenant(escolaId, async (tx) =>
      tx.update(eeaaPlanosTable)
      .set({ status: "aguardando_assinatura", atualizadoEm: new Date() })
      .where(eq(eeaaPlanosTable.id, plano.id))
    );
  }

  await registrarAuditoriaEeaa({ req, acao: "ASSINAR_PAI", recursoId: plano.id, escolaId });
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
    tx.select().from(eeaaPlanoAdaptacoesTable)
    .where(eq(eeaaPlanoAdaptacoesTable.planoId, req.params.id))
    .orderBy(eeaaPlanoAdaptacoesTable.criadoEm)
  );
  await registrarAuditoriaEeaa({ req, acao: "READ_ADAPTACOES", escolaId: req.escolaId });
  res.json({ adaptacoes: rows });
});

router.post("/planos/:id/adaptacoes", eeaaGuard("manage"), async (req: any, res) => {
  const body = adaptacaoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const [nova] = await withTenant(req.escolaId, async (tx) =>
    tx.insert(eeaaPlanoAdaptacoesTable).values({ ...body.data, planoId: req.params.id }).returning()
  );
  res.status(201).json(nova);
});

router.delete("/planos/:id/adaptacoes/:adaptId", eeaaGuard("manage"), async (req: any, res) => {
  await withTenant(req.escolaId, async (tx) =>
    tx.delete(eeaaPlanoAdaptacoesTable)
    .where(and(
      eq(eeaaPlanoAdaptacoesTable.id, req.params.adaptId),
      eq(eeaaPlanoAdaptacoesTable.planoId, req.params.id),
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

router.get("/metas", eeaaGuard("view"), async (req: any, res) => {
  const { planoId } = req.query;
  const condicoes: any[] = [];
  if (planoId) condicoes.push(eq(eeaaMetasTable.planoId, String(planoId)));

  // metas always belong to a plano — if no planoId provided, return empty rather than full-tenant scan
  const rows = condicoes.length > 0
    ? await withTenant(req.escolaId, async (tx) =>
        tx.select().from(eeaaMetasTable).where(and(...condicoes))
      )
    : [];
  await registrarAuditoriaEeaa({ req, acao: "READ_METAS", escolaId: req.escolaId });
  res.json({ metas: rows });
});

router.post("/metas", eeaaGuard("manage"), async (req: any, res) => {
  const body = metaSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const [nova] = await withTenant(req.escolaId, async (tx) =>
    tx.insert(eeaaMetasTable).values(body.data).returning()
  );
  res.status(201).json(nova);
});

router.put("/metas/:id", eeaaGuard("manage"), async (req: any, res) => {
  // eeaaMetasTable has no escola_id — isolated via withTenant + RLS on parent eeaa_planos
  const body = metaSchema.partial().merge(z.object({ status: z.string().optional() })).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const [atualizada] = await withTenant(req.escolaId, async (tx) =>
    tx.update(eeaaMetasTable)
    .set({ ...body.data, atualizadoEm: new Date() })
    .where(eq(eeaaMetasTable.id, req.params.id))
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

router.post("/metas/:id/evolucao", eeaaGuard("manage"), async (req: any, res) => {
  const body = evolucaoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const [nova] = await withTenant(req.escolaId, async (tx) =>
    tx.insert(eeaaEvolucoesTable).values({
      ...body.data, metaId: req.params.id, profissionalId: req.usuarioId,
    }).returning()
  );
  res.status(201).json(nova);
});

router.get("/metas/:id/evolucao", eeaaGuard("view"), async (req: any, res) => {
  const rows = await withTenant(req.escolaId, async (tx) =>
    tx.select().from(eeaaEvolucoesTable)
    .where(eq(eeaaEvolucoesTable.metaId, req.params.id))
    .orderBy(eeaaEvolucoesTable.registradoEm)
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

router.get("/sessoes", eeaaGuard("view"), async (req: any, res) => {
  const { estudanteEeaaId } = req.query;
  const condicoes: any[] = [
    eq(eeaaSessoesTable.escolaId, req.escolaId),
    isNull(eeaaSessoesTable.deletadoEm),
  ];
  if (estudanteEeaaId) condicoes.push(eq(eeaaSessoesTable.estudanteAeeId, String(estudanteEeaaId)));

  const rows = await withTenant(req.escolaId, async (tx) =>
    tx.select().from(eeaaSessoesTable)
    .where(and(...condicoes))
    .orderBy(desc(eeaaSessoesTable.dataSessao))
  );
  res.json({ sessoes: rows });
});

router.post("/sessoes", eeaaGuard("manage"), async (req: any, res) => {
  const body = sessaoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const [nova] = await withTenant(req.escolaId, async (tx) =>
    tx.insert(eeaaSessoesTable).values({
      ...body.data, escolaId: req.escolaId, profissionalId: req.usuarioId,
    }).returning()
  );
  res.status(201).json(nova);
});

router.put("/sessoes/:id", eeaaGuard("manage"), async (req: any, res) => {
  const body = sessaoSchema.partial().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const [atualizada] = await withTenant(req.escolaId, async (tx) =>
    tx.update(eeaaSessoesTable).set(body.data)
    .where(and(eq(eeaaSessoesTable.id, req.params.id), eq(eeaaSessoesTable.escolaId, req.escolaId)))
    .returning()
  );
  if (!atualizada) return res.status(404).json({ error: "Sessão não encontrada." });
  res.json(atualizada);
});

router.delete("/sessoes/:id", eeaaGuard("manage"), async (req: any, res) => {
  const [removida] = await withTenant(req.escolaId, async (tx) =>
    tx.update(eeaaSessoesTable).set({ deletadoEm: new Date() })
    .where(and(eq(eeaaSessoesTable.id, req.params.id), eq(eeaaSessoesTable.escolaId, req.escolaId)))
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

router.get("/laudos", eeaaGuard("manage"), async (req: any, res) => {
  const { estudanteEeaaId } = req.query;
  const condicoes: any[] = [
    eq(eeaaLaudosTable.escolaId, req.escolaId),
    isNull(eeaaLaudosTable.deletadoEm),
  ];
  if (estudanteEeaaId) condicoes.push(eq(eeaaLaudosTable.estudanteAeeId, String(estudanteEeaaId)));

  // NUNCA retorna conteudo_enc na listagem
  const rows = await withTenant(req.escolaId, async (tx) =>
    tx.select({
      id:              eeaaLaudosTable.id,
      tipo:            eeaaLaudosTable.tipo,
      titulo:          eeaaLaudosTable.titulo,
      dataLaudo:       eeaaLaudosTable.dataLaudo,
      profissionalExt: eeaaLaudosTable.profissionalExt,
      criadoEm:        eeaaLaudosTable.criadoEm,
    })
    .from(eeaaLaudosTable).where(and(...condicoes))
    .orderBy(desc(eeaaLaudosTable.criadoEm))
  );
  res.json({ laudos: rows });
});

router.get("/laudos/:id", eeaaGuard("manage"), async (req: any, res) => {
  const [laudo] = await withTenant(req.escolaId, async (tx) =>
    tx.select().from(eeaaLaudosTable)
    .where(and(
      eq(eeaaLaudosTable.id, req.params.id),
      eq(eeaaLaudosTable.escolaId, req.escolaId),
      isNull(eeaaLaudosTable.deletadoEm),
    ))
  );
  if (!laudo) return res.status(404).json({ error: "Laudo não encontrado." });

  // Auditoria obrigatória ANTES de descriptografar
  await registrarAuditoriaEeaa({
    req, acao: "READ_LAUDO",
    estudanteId: laudo.estudanteAeeId,
    recursoId:   laudo.id,
    escolaId:    req.escolaId,
  });

  const conteudo = decifrarLaudo(laudo.conteudoEnc, req.escolaId);
  const { conteudoEnc: _enc, ...laudoSemEnc } = laudo;
  res.json({ ...laudoSemEnc, conteudo });
});

router.post("/laudos", eeaaGuard("manage"), async (req: any, res) => {
  const body = laudoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const { conteudo, ...resto } = body.data;
  const conteudoEnc = cifrarLaudo(conteudo, req.escolaId);
  const chaveRef    = gerarChaveRef(req.escolaId);

  const [novo] = await withTenant(req.escolaId, async (tx) =>
    tx.insert(eeaaLaudosTable).values({
      ...resto, conteudoEnc, chaveRef,
      escolaId: req.escolaId, criadoPorId: req.usuarioId,
    }).returning({ id: eeaaLaudosTable.id, tipo: eeaaLaudosTable.tipo, titulo: eeaaLaudosTable.titulo })
  );

  await registrarAuditoriaEeaa({
    req, acao: "CREATE_LAUDO",
    estudanteId: body.data.estudanteAeeId,
    recursoId:   novo.id,
    escolaId:    req.escolaId,
  });
  res.status(201).json(novo);
});

router.delete("/laudos/:id", eeaaGuard("manage"), async (req: any, res) => {
  const [removido] = await withTenant(req.escolaId, async (tx) =>
    tx.update(eeaaLaudosTable).set({ deletadoEm: new Date() })
    .where(and(eq(eeaaLaudosTable.id, req.params.id), eq(eeaaLaudosTable.escolaId, req.escolaId)))
    .returning({ id: eeaaLaudosTable.id, estudanteAeeId: eeaaLaudosTable.estudanteAeeId })
  );
  if (!removido) return res.status(404).json({ error: "Laudo não encontrado." });
  await registrarAuditoriaEeaa({
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

router.get("/liberacoes/:estudanteEeaaId", eeaaGuard("manage"), async (req: any, res) => {
  const rows = await withTenant(req.escolaId, async (tx) =>
    tx.select().from(eeaaLiberacoesTable)
    .where(and(
      eq(eeaaLiberacoesTable.estudanteAeeId, req.params.estudanteEeaaId),
      eq(eeaaLiberacoesTable.escolaId, req.escolaId),
      isNull(eeaaLiberacoesTable.revogadoEm),
    ))
  );
  res.json({ liberacoes: rows });
});

router.put("/liberacoes", eeaaGuard("manage"), async (req: any, res) => {
  const body = liberacaoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  await withTenant(req.escolaId, async (tx) => {
    await tx.update(eeaaLiberacoesTable)
    .set({ revogadoEm: new Date() })
    .where(and(
      eq(eeaaLiberacoesTable.estudanteAeeId, body.data.estudanteAeeId),
      eq(eeaaLiberacoesTable.professorId, body.data.professorId),
      eq(eeaaLiberacoesTable.escolaId, req.escolaId),
      isNull(eeaaLiberacoesTable.revogadoEm),
    ));
    await tx.insert(eeaaLiberacoesTable).values({
      ...body.data, escolaId: req.escolaId, concedidoPorId: req.usuarioId,
    });
  });
  res.json({ ok: true });
});

router.delete("/liberacoes/:id", eeaaGuard("manage"), async (req: any, res) => {
  const [revogada] = await withTenant(req.escolaId, async (tx) =>
    tx.update(eeaaLiberacoesTable)
    .set({ revogadoEm: new Date() })
    .where(and(eq(eeaaLiberacoesTable.id, req.params.id), eq(eeaaLiberacoesTable.escolaId, req.escolaId)))
    .returning({ id: eeaaLiberacoesTable.id })
  );
  if (!revogada) return res.status(404).json({ error: "Liberação não encontrada." });
  res.json({ ok: true });
});

// ── Auditoria (somente leitura) ──────────────────────────────────────────────

router.get("/auditoria", eeaaGuard("manage"), async (req: any, res) => {
  const { estudanteId, limit = "50" } = req.query;
  const condicoes: any[] = [eq(eeaaAuditoriaTable.escolaId, req.escolaId)];
  if (estudanteId) condicoes.push(eq(eeaaAuditoriaTable.estudanteId, String(estudanteId)));

  const rows = await db.select().from(eeaaAuditoriaTable)
    .where(and(...condicoes))
    .orderBy(desc(eeaaAuditoriaTable.criadoEm))
    .limit(Math.min(Number(limit), 200));
  res.json({ logs: rows });
});

// ── Portal do Estudante / Responsável ────────────────────────────────────────

router.get("/portal/meu-plano", async (req: any, res) => {
  const usuarioId: string = req.usuarioId!;
  const escolaId: string  = req.escolaId;

  const [est] = await withTenant(escolaId, async (tx) =>
    tx.select({ id: eeaaEstudantesTable.id })
    .from(eeaaEstudantesTable)
    .where(and(
      eq(eeaaEstudantesTable.usuarioId, usuarioId),
      eq(eeaaEstudantesTable.escolaId, escolaId),
      eq(eeaaEstudantesTable.ativo, true),
      isNull(eeaaEstudantesTable.deletadoEm),
    ))
  );
  if (!est) return res.json({ eeaa: false });

  const [plano] = await withTenant(escolaId, async (tx) =>
    tx.select().from(eeaaPlanosTable)
    .where(and(
      eq(eeaaPlanosTable.estudanteAeeId, est.id),
      eq(eeaaPlanosTable.status, "vigente"),
    ))
    .orderBy(desc(eeaaPlanosTable.criadoEm))
    .limit(1)
  );
  if (!plano) return res.json({ eeaa: true, planoVigente: null });

  const adaptacoes = await withTenant(escolaId, async (tx) =>
    tx.select().from(eeaaPlanoAdaptacoesTable).where(eq(eeaaPlanoAdaptacoesTable.planoId, plano.id))
  );
  const metas = await withTenant(escolaId, async (tx) =>
    tx.select().from(eeaaMetasTable).where(eq(eeaaMetasTable.planoId, plano.id))
  );

  await registrarAuditoriaEeaa({ req, acao: "PORTAL_READ_PAI", estudanteId: est.id, escolaId });
  res.json({ eeaa: true, planoVigente: { ...plano, adaptacoes, metas } });
});

// ── Portal do Professor (somente liberações) ─────────────────────────────────

router.get("/portal-professor/:estudanteEeaaId", async (req: any, res) => {
  const escolaId: string    = req.escolaId;
  const professorId: string = req.usuarioId!;

  const [lib] = await withTenant(escolaId, async (tx) =>
    tx.select().from(eeaaLiberacoesTable)
    .where(and(
      eq(eeaaLiberacoesTable.estudanteAeeId, req.params.estudanteEeaaId),
      eq(eeaaLiberacoesTable.professorId, professorId),
      eq(eeaaLiberacoesTable.escolaId, escolaId),
      isNull(eeaaLiberacoesTable.revogadoEm),
    ))
  );
  if (!lib) return res.json({ liberado: false });

  await registrarAuditoriaEeaa({
    req, acao: "PROFESSOR_READ_LIBERACAO",
    estudanteId: req.params.estudanteEeaaId, escolaId,
  });

  const resultado: any = { liberado: true };
  if (lib.verAdaptacoes) {
    const [plano] = await withTenant(escolaId, async (tx) =>
      tx.select({ id: eeaaPlanosTable.id }).from(eeaaPlanosTable)
      .where(and(
        eq(eeaaPlanosTable.estudanteAeeId, req.params.estudanteEeaaId),
        eq(eeaaPlanosTable.status, "vigente"),
      )).limit(1)
    );
    if (plano) {
      resultado.adaptacoes = await withTenant(escolaId, async (tx) =>
        tx.select().from(eeaaPlanoAdaptacoesTable).where(eq(eeaaPlanoAdaptacoesTable.planoId, plano.id))
      );
    }
  }
  if (lib.verMetas) {
    const [plano] = await withTenant(escolaId, async (tx) =>
      tx.select({ id: eeaaPlanosTable.id }).from(eeaaPlanosTable)
      .where(and(
        eq(eeaaPlanosTable.estudanteAeeId, req.params.estudanteEeaaId),
        eq(eeaaPlanosTable.status, "vigente"),
      )).limit(1)
    );
    if (plano) {
      resultado.metas = await withTenant(escolaId, async (tx) =>
        tx.select().from(eeaaMetasTable).where(eq(eeaaMetasTable.planoId, plano.id))
      );
    }
  }

  res.json(resultado);
});

export default router;
