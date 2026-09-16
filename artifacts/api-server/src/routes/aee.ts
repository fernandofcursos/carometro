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

async function gerarNumeroPai(escolaId: string): Promise<string> {
  const ano = new Date().getFullYear();
  const prefix = `PAI-${ano}-`;
  const [row] = await db
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
  res.json({ planos: rows });
});

router.post("/planos", aeeGuard("manage"), async (req: any, res) => {
  const escolaId: string = req.escolaId;
  const body = planoSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const numero = await gerarNumeroPai(escolaId);
  const [novo] = await withTenant(escolaId, async (tx) =>
    tx.insert(aeePlanosTable).values({
      ...body.data, escolaId, numero, criadoPorId: req.usuarioId,
    }).returning()
  );
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

// Suppress unused import warnings for tables reserved for Tasks 4 & 5
void aeeMetasTable;
void aeeEvolucoesTable;
void aeeSessoesTable;
void aeeLaudosTable;
void aeeLiberacoesTable;
void aeeAuditoriaTable;
void cifrarLaudo;
void decifrarLaudo;
void gerarChaveRef;

export default router;
