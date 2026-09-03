import { Router } from "express";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  db,
  requerimentosTable, requerimentoTiposTable, requerimentoAssuntosTable,
  requerimentoAssinaturasTable, estudantesTable, usuariosTable,
  responsaveisEstudantesTable, turmasTable, cursosTable, turnosTable,
  turmaTurnosTable, matriculasTable, usuariosRolesTable, rolesTable,
  cartoesSaidaTable, carteirasTable,
  eq, and, or, inArray, isNull, sql, count, desc, alias,
} from "@workspace/db";
import { gerarTokenCarteira } from "./carteiras.js";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao, buscarRoles } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

// ── Utilidades ────────────────────────────────────────────────────────────────

function contarPalavras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

function gerarTokenHash(requerimentoId: string, usuarioId: string, senha: string): string {
  const payload = `${requerimentoId}:${usuarioId}:${Date.now()}:${senha}`;
  return createHash("sha256").update(payload).digest("hex");
}

async function gerarNumero(): Promise<string> {
  const ano = new Date().getFullYear();
  const prefix = `REQ-${ano}-`;
  const [row] = await db
    .select({ n: count() })
    .from(requerimentosTable)
    .where(sql`numero LIKE ${prefix + "%"}`);
  const seq = ((row?.n as number) ?? 0) + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

// Busca matrículas ativas de um conjunto de usuárioIds, retornando lista por usuário.
// Retorna Map<usuarioId, Matricula[]> onde cada matricula tem id, cursoNome, turmaSigla, turnoNome.
interface MatriculaInfo { id: string; cursoNome: string | null; turmaSigla: string | null; turnoNome: string | null }
async function buscarMatriculasAtivas(usuarioIds: string[]) {
  if (!usuarioIds.length) return new Map<string, MatriculaInfo[]>();
  const rows = await db
    .select({
      id:         matriculasTable.id,
      usuarioId:  matriculasTable.usuarioId,
      cursoNome:  cursosTable.nome,
      turmaSigla: turmasTable.sigla,
      turnoNome:  turnosTable.nome,
    })
    .from(matriculasTable)
    .leftJoin(turmasTable, eq(turmasTable.id, matriculasTable.turmaId))
    .leftJoin(cursosTable, eq(cursosTable.id, turmasTable.cursoId))
    .leftJoin(turnosTable, eq(turnosTable.id, matriculasTable.turnoId))
    .where(and(
      inArray(matriculasTable.usuarioId, usuarioIds),
      eq(matriculasTable.ativo, true),
      isNull(matriculasTable.deletadoEm),
    ));

  const map = new Map<string, MatriculaInfo[]>();
  for (const r of rows) {
    const list = map.get(r.usuarioId) ?? [];
    list.push({ id: r.id, cursoNome: r.cursoNome ?? null, turmaSigla: r.turmaSigla ?? null, turnoNome: r.turnoNome ?? null });
    map.set(r.usuarioId, list);
  }
  return map;
}

async function buscarEstudanteCompleto(estudanteId: string) {
  const [est] = await db
    .select({
      id:             estudantesTable.id,
      nome:           estudantesTable.nome,
      registro:       estudantesTable.registro,
      dataNascimento: estudantesTable.dataNascimento,
      usuarioId:      estudantesTable.usuarioId,
      turmaId:        estudantesTable.turmaId,
    })
    .from(estudantesTable)
    .where(eq(estudantesTable.id, estudanteId))
    .limit(1);
  if (!est) return null;

  const mat = await buscarMatriculasAtivas([est.usuarioId]);
  const matriculas = mat.get(est.usuarioId) ?? [];
  return { ...est, matriculas };
}

function calcularIdade(dataNasc: string | null): number {
  if (!dataNasc) return 99; // sem data → assume maior de idade
  const nasc  = new Date(dataNasc);
  const hoje  = new Date();
  let idade   = hoje.getFullYear() - nasc.getFullYear();
  const m     = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

// ── GET /api/requerimentos/tipos ──────────────────────────────────────────────
// Retorna tipos com assuntos ativos. Disponível para qualquer usuário logado.
router.get("/tipos", async (_req, res) => {
  const tipos = await db
    .select()
    .from(requerimentoTiposTable)
    .where(eq(requerimentoTiposTable.ativo, true))
    .orderBy(requerimentoTiposTable.ordem);

  const assuntos = await db
    .select()
    .from(requerimentoAssuntosTable)
    .where(eq(requerimentoAssuntosTable.ativo, true))
    .orderBy(requerimentoAssuntosTable.ordem);

  res.json(
    tipos.map((t) => ({
      ...t,
      assuntos: assuntos.filter((a) => a.tipoId === t.id),
    }))
  );
});

// ── GET /api/requerimentos/elegibilidade ──────────────────────────────────────
// Verifica se o usuário pode usar o formulário e lista estudantes disponíveis.
router.get("/elegibilidade", async (req, res) => {
  const usuarioId = req.usuarioId!;
  const roles = await buscarRoles(usuarioId);

  const isEstudante     = roles.includes("estudante");
  const isPaiResponsavel = roles.includes("pai_responsavel");

  if (!isEstudante && !isPaiResponsavel) {
    return res.status(403).json({ elegivel: false, motivo: "Perfil sem acesso ao formulário." });
  }

  if (isEstudante) {
    const [est] = await db
      .select({
        id:             estudantesTable.id,
        nome:           estudantesTable.nome,
        dataNascimento: estudantesTable.dataNascimento,
        usuarioId:      estudantesTable.usuarioId,
        turmaSigla:     turmasTable.sigla,
        cursoNome:      cursosTable.nome,
      })
      .from(estudantesTable)
      .leftJoin(turmasTable, eq(turmasTable.id, estudantesTable.turmaId))
      .leftJoin(cursosTable, eq(cursosTable.id, turmasTable.cursoId))
      .where(and(eq(estudantesTable.usuarioId, usuarioId), isNull(estudantesTable.deletadoEm)))
      .limit(1);

    if (!est) {
      return res.status(403).json({ elegivel: false, motivo: "Estudante não encontrado no sistema." });
    }
    if (calcularIdade(est.dataNascimento) < 18) {
      return res.status(403).json({
        elegivel: false,
        motivo:   "Formulário disponível somente para estudantes maiores de 18 anos.",
      });
    }
    const mat = await buscarMatriculasAtivas([est.usuarioId!]);
    const matriculas = mat.get(est.usuarioId!) ?? [];
    return res.json({
      elegivel: true, tipoRequerente: "estudante",
      estudantes: [{ id: est.id, nome: est.nome, dataNascimento: est.dataNascimento, usuarioId: est.usuarioId, matriculas }],
    });
  }

  // pai_responsavel — um objeto por estudantes.id
  const estRows = await db
    .select({
      id:             estudantesTable.id,
      nome:           estudantesTable.nome,
      dataNascimento: estudantesTable.dataNascimento,
      usuarioId:      estudantesTable.usuarioId,
    })
    .from(responsaveisEstudantesTable)
    .innerJoin(estudantesTable, and(
      eq(estudantesTable.id, responsaveisEstudantesTable.estudanteId),
      isNull(estudantesTable.deletadoEm),
    ))
    .where(eq(responsaveisEstudantesTable.usuarioId, usuarioId))
    .orderBy(estudantesTable.nome);

  if (!estRows.length) {
    return res.status(403).json({ elegivel: false, motivo: "Nenhum estudante vinculado." });
  }

  // Busca matrículas ativas para estudantes com conta no sistema
  const comConta = estRows.filter(e => e.usuarioId != null).map(e => e.usuarioId!);
  const mat = comConta.length ? await buscarMatriculasAtivas(comConta) : new Map<string, MatriculaInfo[]>();

  const vinculados = estRows.map(e => ({
    id:             e.id,
    nome:           e.nome,
    dataNascimento: e.dataNascimento,
    usuarioId:      e.usuarioId,
    matriculas:     e.usuarioId ? (mat.get(e.usuarioId) ?? []) : [],
  }));

  return res.json({ elegivel: true, tipoRequerente: "pai_responsavel", estudantes: vinculados });
});

// ── GET /api/requerimentos ────────────────────────────────────────────────────
// Estudante/Pai: lista os próprios requerimentos.
// Secretaria/Supervisor: lista todos (com filtro de status).
router.get("/", requireAuth, async (req, res) => {
  const usuarioId = req.usuarioId!;
  const roles = await buscarRoles(usuarioId);
  const { status } = req.query;

  const isAnalisador = roles.some((r) => ["secretaria", "supervisao_pedagogica"].includes(r));

  const rows = await db
    .select({
      id:              requerimentosTable.id,
      numero:          requerimentosTable.numero,
      status:          requerimentosTable.status,
      tipoRequerente:  requerimentosTable.tipoRequerente,
      exposicaoMotivos:  requerimentosTable.exposicaoMotivos,
      dataSolicitacao:   requerimentosTable.dataSolicitacao,
      horaSolicitacao:   requerimentosTable.horaSolicitacao,
      parecer:           requerimentosTable.parecer,
      analisadoEm:       requerimentosTable.analisadoEm,
      criadoEm:          requerimentosTable.criadoEm,
      estudanteNome:     estudantesTable.nome,
      estudanteId:       estudantesTable.id,
      assuntoNome:       requerimentoAssuntosTable.nome,
      requerenteNome:    usuariosTable.nome,
    })
    .from(requerimentosTable)
    .innerJoin(estudantesTable,             eq(estudantesTable.id, requerimentosTable.estudanteId))
    .innerJoin(requerimentoAssuntosTable,   eq(requerimentoAssuntosTable.id, requerimentosTable.assuntoId))
    .innerJoin(usuariosTable,               eq(usuariosTable.id, requerimentosTable.requerenteId))
    .where(
      isAnalisador
        ? (status ? eq(requerimentosTable.status, String(status)) : undefined)
        : or(
            eq(requerimentosTable.requerenteId, usuarioId),
            sql`EXISTS (
              SELECT 1 FROM responsaveis_estudantes re
              WHERE re.usuario_id = ${usuarioId}
                AND re.estudante_id = ${requerimentosTable.estudanteId}
            )`,
          )
    )
    .orderBy(desc(requerimentosTable.criadoEm));

  // Enriquecer com assinaturas
  const ids = rows.map((r) => r.id);
  const assinaturaRows = ids.length
    ? await db
        .select({
          requerimentoId: requerimentoAssinaturasTable.requerimentoId,
          papel:          requerimentoAssinaturasTable.papel,
          metodo:         requerimentoAssinaturasTable.metodo,
          assinadoEm:     requerimentoAssinaturasTable.assinadoEm,
          usuarioId:      requerimentoAssinaturasTable.usuarioId,
          nome:           usuariosTable.nome,
        })
        .from(requerimentoAssinaturasTable)
        .innerJoin(usuariosTable, eq(usuariosTable.id, requerimentoAssinaturasTable.usuarioId))
        .where(inArray(requerimentoAssinaturasTable.requerimentoId, ids))
    : [];

  // Resolver roleNome para analisadores (mesmo padrão do GET /:id)
  const analisadorIds = [...new Set(
    assinaturaRows.filter((a) => a.papel === "analisador").map((a) => a.usuarioId)
  )];
  const roleMapLista = new Map<string, string>();
  if (analisadorIds.length) {
    const roleRows = await db
      .select({ usuarioId: usuariosRolesTable.usuarioId, roleNome: rolesTable.nome })
      .from(usuariosRolesTable)
      .innerJoin(rolesTable, eq(rolesTable.id, usuariosRolesTable.roleId))
      .where(and(
        inArray(usuariosRolesTable.usuarioId, analisadorIds),
        inArray(rolesTable.nome, ["secretaria", "supervisao_pedagogica"]),
      ));
    for (const r of roleRows) roleMapLista.set(r.usuarioId, r.roleNome);
  }

  const assinaturasEnriquecidas = assinaturaRows.map((a) => ({
    ...a,
    roleNome: a.papel === "analisador" ? (roleMapLista.get(a.usuarioId) ?? null) : null,
  }));

  res.json(
    rows.map((r) => ({
      ...r,
      assinaturas: assinaturasEnriquecidas.filter((a) => a.requerimentoId === r.id),
    }))
  );
});

// ── POST /api/requerimentos ───────────────────────────────────────────────────
const criarSchema = z.object({
  estudanteId:       z.string().uuid(),
  assuntoId:         z.string().uuid(),
  matriculaId:       z.string().uuid().optional().nullable(), // enturmação escolhida
  exposicaoMotivos:  z.string().max(10000).optional().nullable(),
  dataSolicitacao:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  horaSolicitacao:   z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
});

router.post("/", requireAuth, async (req, res) => {
  const usuarioId = req.usuarioId!;
  const roles = await buscarRoles(usuarioId);

  const parsed = criarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const { estudanteId, assuntoId, matriculaId, exposicaoMotivos, dataSolicitacao, horaSolicitacao } = parsed.data;

  // Validação: contagem de palavras
  if (exposicaoMotivos && contarPalavras(exposicaoMotivos) > 1000) {
    return res.status(422).json({ error: "O campo 'Exposição de Motivos' deve ter no máximo 1000 palavras." });
  }

  const isEstudante      = roles.includes("estudante");
  const isPaiResponsavel = roles.includes("pai_responsavel");

  if (!isEstudante && !isPaiResponsavel) {
    return res.status(403).json({ error: "Perfil sem acesso ao formulário de requerimento." });
  }

  // Verificar elegibilidade e propriedade do estudante
  if (isEstudante) {
    const [est] = await db
      .select({ id: estudantesTable.id, dataNascimento: estudantesTable.dataNascimento })
      .from(estudantesTable)
      .where(and(eq(estudantesTable.usuarioId, usuarioId), eq(estudantesTable.id, estudanteId)))
      .limit(1);

    if (!est) return res.status(403).json({ error: "Estudante não encontrado ou não pertence ao usuário." });
    if (calcularIdade(est.dataNascimento) < 18) {
      return res.status(403).json({ error: "Formulário disponível somente para estudantes maiores de 18 anos." });
    }
  } else {
    const [vinculo] = await db
      .select({ id: responsaveisEstudantesTable.id })
      .from(responsaveisEstudantesTable)
      .where(and(
        eq(responsaveisEstudantesTable.usuarioId, usuarioId),
        eq(responsaveisEstudantesTable.estudanteId, estudanteId),
      ))
      .limit(1);
    if (!vinculo) return res.status(403).json({ error: "Estudante não vinculado ao responsável." });
  }

  // Verificar se assunto existe e está ativo
  const [assunto] = await db
    .select({
      id: requerimentoAssuntosTable.id,
      slug: requerimentoAssuntosTable.slug,
      requerMotivos: requerimentoAssuntosTable.requerMotivos,
      requerDataHora: requerimentoAssuntosTable.requerDataHora,
    })
    .from(requerimentoAssuntosTable)
    .where(and(eq(requerimentoAssuntosTable.id, assuntoId), eq(requerimentoAssuntosTable.ativo, true)))
    .limit(1);
  if (!assunto) return res.status(400).json({ error: "Assunto inválido." });

  if (assunto.requerMotivos && !exposicaoMotivos?.trim()) {
    return res.status(422).json({ error: "Este assunto requer a exposição de motivos." });
  }

  // Data/hora: obrigatória para assuntos que exigem
  // saida-semestral: apenas horário obrigatório (sem data — válido todo dia do semestre)
  // saida-eventual: data obrigatória + horário obrigatório
  if (assunto.requerDataHora) {
    if (assunto.slug === "saida-semestral") {
      if (!horaSolicitacao) {
        return res.status(422).json({ error: "O horário de saída é obrigatório para este requerimento." });
      }
    } else {
      if (!dataSolicitacao) {
        return res.status(422).json({ error: "Este assunto requer a data da solicitação." });
      }
      if (dataSolicitacao && !horaSolicitacao) {
        return res.status(422).json({ error: "Ao informar a data, o horário é obrigatório." });
      }
    }
  }

  const numero = await gerarNumero();
  const tipoRequerente = isEstudante ? "estudante" : "pai_responsavel";

  const [criado] = await db
    .insert(requerimentosTable)
    .values({
      numero, estudanteId, requerenteId: usuarioId,
      tipoRequerente, assuntoId,
      matriculaId:       matriculaId || null,
      exposicaoMotivos:  exposicaoMotivos?.trim() || null,
      dataSolicitacao:   dataSolicitacao  || null,
      horaSolicitacao:   horaSolicitacao  || null,
      status: "pendente",
    })
    .returning();

  await registrarAuditoria({
    usuarioId, acao: "create", recurso: "requerimentos", recursoId: criado.id,
    detalhes: { numero, assuntoId, estudanteId },
    ipReq: req,
  });

  res.status(201).json(criado);
});

// ── GET /api/requerimentos/:id ────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req, res) => {
  const usuarioId = req.usuarioId!;
  const roles = await buscarRoles(usuarioId);

  // Alias para turmas/cursos/turnos da matricula escolhida (evita conflito de nomes)
  const turmasMat  = alias(turmasTable,  "turmas_mat");
  const cursosMat  = alias(cursosTable,  "cursos_mat");
  const turnosMat  = alias(turnosTable,  "turnos_mat");

  const [row] = await db
    .select({
      id:               requerimentosTable.id,
      numero:           requerimentosTable.numero,
      status:           requerimentosTable.status,
      tipoRequerente:   requerimentosTable.tipoRequerente,
      exposicaoMotivos: requerimentosTable.exposicaoMotivos,
      dataSolicitacao:  requerimentosTable.dataSolicitacao,
      horaSolicitacao:  requerimentosTable.horaSolicitacao,
      parecer:          requerimentosTable.parecer,
      analisadoEm:      requerimentosTable.analisadoEm,
      criadoEm:         requerimentosTable.criadoEm,
      matriculaId:      requerimentosTable.matriculaId,
      estudanteId:      estudantesTable.id,
      estudanteNome:    estudantesTable.nome,
      estudanteRegistro: estudantesTable.registro,
      dataNascimento:   estudantesTable.dataNascimento,
      requerenteId:     usuariosTable.id,
      requerenteNome:   usuariosTable.nome,
      assuntoId:        requerimentoAssuntosTable.id,
      assuntoNome:      requerimentoAssuntosTable.nome,
      assuntoSlug:      requerimentoAssuntosTable.slug,
      tipoNome:         requerimentoTiposTable.nome,
      // Curso/Turno: da matricula escolhida (matriculaId) quando disponível
      cursoNome:        cursosMat.nome,
      turmaSigla:       turmasMat.sigla,
      turnoNome:        turnosMat.nome,
    })
    .from(requerimentosTable)
    .innerJoin(estudantesTable,           eq(estudantesTable.id, requerimentosTable.estudanteId))
    .innerJoin(usuariosTable,             eq(usuariosTable.id, requerimentosTable.requerenteId))
    .innerJoin(requerimentoAssuntosTable, eq(requerimentoAssuntosTable.id, requerimentosTable.assuntoId))
    .innerJoin(requerimentoTiposTable,    eq(requerimentoTiposTable.id, requerimentoAssuntosTable.tipoId))
    .leftJoin(matriculasTable,            eq(matriculasTable.id, requerimentosTable.matriculaId))
    .leftJoin(turmasMat,                  eq(turmasMat.id, matriculasTable.turmaId))
    .leftJoin(cursosMat,                  eq(cursosMat.id, turmasMat.cursoId))
    .leftJoin(turnosMat,                  eq(turnosMat.id, matriculasTable.turnoId))
    .where(eq(requerimentosTable.id, req.params.id))
    .limit(1);

  if (!row) return res.status(404).json({ error: "Requerimento não encontrado." });

  const isAnalisador = roles.some((r) => ["secretaria", "supervisao_pedagogica"].includes(r));
  const isProprietario = row.requerenteId === usuarioId;
  const isResponsavel  = !isProprietario && !isAnalisador
    ? !!(await db.select({ id: responsaveisEstudantesTable.id })
        .from(responsaveisEstudantesTable)
        .where(and(
          eq(responsaveisEstudantesTable.usuarioId, usuarioId),
          eq(responsaveisEstudantesTable.estudanteId, row.estudanteId),
        ))
        .limit(1))[0]
    : true;

  if (!isAnalisador && !isProprietario && !isResponsavel) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const assinaturaRows = await db
    .select({
      id:         requerimentoAssinaturasTable.id,
      papel:      requerimentoAssinaturasTable.papel,
      metodo:     requerimentoAssinaturasTable.metodo,
      assinadoEm: requerimentoAssinaturasTable.assinadoEm,
      usuarioId:  requerimentoAssinaturasTable.usuarioId,
      nome:       usuariosTable.nome,
    })
    .from(requerimentoAssinaturasTable)
    .innerJoin(usuariosTable, eq(usuariosTable.id, requerimentoAssinaturasTable.usuarioId))
    .where(eq(requerimentoAssinaturasTable.requerimentoId, req.params.id));

  // Para analisadores, busca qual role relevante (secretaria | supervisao_pedagogica) eles têm
  const analisadorIds = [...new Set(
    assinaturaRows.filter((a) => a.papel === "analisador").map((a) => a.usuarioId)
  )];
  const roleMap = new Map<string, string>();
  if (analisadorIds.length) {
    const roleRows = await db
      .select({ usuarioId: usuariosRolesTable.usuarioId, roleNome: rolesTable.nome })
      .from(usuariosRolesTable)
      .innerJoin(rolesTable, eq(rolesTable.id, usuariosRolesTable.roleId))
      .where(and(
        inArray(usuariosRolesTable.usuarioId, analisadorIds),
        inArray(rolesTable.nome, ["secretaria", "supervisao_pedagogica"]),
      ));
    for (const r of roleRows) roleMap.set(r.usuarioId, r.roleNome);
  }

  const assinaturas = assinaturaRows.map((a) => ({
    ...a,
    roleNome: a.papel === "analisador" ? (roleMap.get(a.usuarioId) ?? null) : null,
  }));

  res.json({ ...row, assinaturas });
});

// ── POST /api/requerimentos/:id/assinar ───────────────────────────────────────
const assinarSchema = z.object({
  metodo: z.enum(["senha", "gov_br", "certificado_digital"]),
  senha:  z.string().optional(),
  token:  z.string().optional(),
});

router.post("/:id/assinar", requireAuth, async (req, res) => {
  const usuarioId = req.usuarioId!;
  const roles = await buscarRoles(usuarioId);

  const parsed = assinarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const { metodo, senha } = parsed.data;

  const [req_] = await db
    .select({ id: requerimentosTable.id, status: requerimentosTable.status,
              requerenteId: requerimentosTable.requerenteId,
              estudanteId: requerimentosTable.estudanteId })
    .from(requerimentosTable)
    .where(eq(requerimentosTable.id, req.params.id))
    .limit(1);
  if (!req_) return res.status(404).json({ error: "Requerimento não encontrado." });

  // Verificar propriedade
  const isProprietario = req_.requerenteId === usuarioId;
  const isResponsavel = !isProprietario
    ? !!(await db.select({ id: responsaveisEstudantesTable.id })
        .from(responsaveisEstudantesTable)
        .where(and(
          eq(responsaveisEstudantesTable.usuarioId, usuarioId),
          eq(responsaveisEstudantesTable.estudanteId, req_.estudanteId),
        ))
        .limit(1))[0]
    : true;

  if (!isProprietario && !isResponsavel) {
    return res.status(403).json({ error: "Você não tem acesso a este requerimento." });
  }

  // Verificar senha se metodo=senha
  if (metodo === "senha") {
    if (!senha) return res.status(400).json({ error: "Senha é obrigatória para assinar." });
    const [usuario] = await db
      .select({ senhaHash: usuariosTable.senhaHash })
      .from(usuariosTable).where(eq(usuariosTable.id, usuarioId)).limit(1);
    if (!usuario?.senhaHash) return res.status(400).json({ error: "Usuário sem senha cadastrada." });
    const ok = await bcrypt.compare(senha, usuario.senhaHash);
    if (!ok) return res.status(401).json({ error: "Senha incorreta." });
  }

  const tokenHash = gerarTokenHash(req_.id, usuarioId, senha ?? "token");

  await db
    .insert(requerimentoAssinaturasTable)
    .values({
      requerimentoId: req_.id,
      usuarioId,
      papel: "requerente",
      metodo,
      tokenHash,
      ipOrigem: req.ip ?? null,
    })
    .onConflictDoNothing();

  res.json({ ok: true, tokenHash });
});

// ── PUT /api/requerimentos/:id/analisar ───────────────────────────────────────
const analisarSchema = z.object({
  status:  z.enum(["em_analise", "deferido", "indeferido"]),
  parecer: z.string().max(10000).optional().nullable(),
});

router.put("/:id/analisar", requireAuth, async (req, res) => {
  const usuarioId = req.usuarioId!;
  const roles = await buscarRoles(usuarioId);
  const podeAnalisar = roles.some((r) => ["secretaria", "supervisao_pedagogica"].includes(r));
  if (!podeAnalisar) return res.status(403).json({ error: "Permissão negada." });

  const parsed = analisarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const { status, parecer } = parsed.data;

  if (status === "indeferido" && !parecer?.trim()) {
    return res.status(422).json({ error: "Indeferimento requer a motivação." });
  }
  if (parecer && contarPalavras(parecer) > 1000) {
    return res.status(422).json({ error: "O parecer deve ter no máximo 1000 palavras." });
  }

  const [existente] = await db
    .select({
      id:               requerimentosTable.id,
      estudanteId:      requerimentosTable.estudanteId,
      requerenteId:     requerimentosTable.requerenteId,
      matriculaId:      requerimentosTable.matriculaId,
      dataSolicitacao:  requerimentosTable.dataSolicitacao,
      horaSolicitacao:  requerimentosTable.horaSolicitacao,
      exposicaoMotivos: requerimentosTable.exposicaoMotivos,
      assuntoId:        requerimentosTable.assuntoId,
      assuntoSlug:      requerimentoAssuntosTable.slug,
    })
    .from(requerimentosTable)
    .innerJoin(requerimentoAssuntosTable, eq(requerimentoAssuntosTable.id, requerimentosTable.assuntoId))
    .where(eq(requerimentosTable.id, req.params.id))
    .limit(1);
  if (!existente) return res.status(404).json({ error: "Requerimento não encontrado." });

  const [atualizado] = await db
    .update(requerimentosTable)
    .set({
      status,
      parecer: status === "indeferido" ? (parecer?.trim() || null) : null,
      analisadoPorId: usuarioId,
      analisadoEm:    new Date(),
      atualizadoEm:   new Date(),
    })
    .where(eq(requerimentosTable.id, req.params.id))
    .returning();

  // ── Efeitos do Deferimento ─────────────────────────────────────────────────
  if (status === "deferido") {
    try {
      await processarDeferimento(existente, usuarioId);
    } catch (errDef) {
      // Log mas não falha a análise — cartão pode ser emitido manualmente
      console.error("[deferimento] Erro ao gerar cartão:", errDef);
    }
  }

  await registrarAuditoria({
    usuarioId, acao: "update", recurso: "requerimentos", recursoId: req.params.id,
    detalhes: { status, parecer: parecer ?? null },
    ipReq: req,
  });

  res.json(atualizado);
});

// ── Processamento de Deferimento — geração de cartões ─────────────────────────
async function processarDeferimento(req_: {
  id: string; estudanteId: string; requerenteId: string; matriculaId: string | null;
  dataSolicitacao: string | null; horaSolicitacao: string | null;
  exposicaoMotivos: string | null; assuntoSlug: string | null;
}, analisadoPorId: string): Promise<void> {
  const slug = req_.assuntoSlug;
  if (!slug || !["saida-semestral", "saida-eventual"].includes(slug)) return;

  // Buscar usuarioId do estudante
  const [est] = await db
    .select({ usuarioId: estudantesTable.usuarioId })
    .from(estudantesTable)
    .where(eq(estudantesTable.id, req_.estudanteId))
    .limit(1);
  if (!est?.usuarioId) return; // estudante sem conta — não é possível gerar cartão

  if (slug === "saida-semestral") {
    // Prefere a matriculaId armazenada no requerimento; fallback: qualquer matrícula ativa
    const matWhere = req_.matriculaId
      ? eq(matriculasTable.id, req_.matriculaId)
      : and(eq(matriculasTable.usuarioId, est.usuarioId), eq(matriculasTable.ativo, true));
    const [mat] = await db
      .select({ id: matriculasTable.id, ano: matriculasTable.ano, semestre: matriculasTable.semestre })
      .from(matriculasTable)
      .where(matWhere)
      .limit(1);
    if (!mat) return;

    const tipo = "cartao-semestral" as const;
    const jaExiste = await db
      .select({ id: carteirasTable.id })
      .from(carteirasTable)
      .where(and(
        eq(carteirasTable.usuarioId, est.usuarioId),
        eq(carteirasTable.tipo, tipo),
        eq(carteirasTable.ano, mat.ano),
        eq(carteirasTable.semestre, mat.semestre),
        eq(carteirasTable.status, "ativa"),
      ))
      .limit(1);
    if (jaExiste.length) return; // idempotente

    const token = gerarTokenCarteira(est.usuarioId, tipo, mat.ano, mat.semestre);
    await db.insert(carteirasTable).values({
      usuarioId: est.usuarioId,
      matriculaId: mat.id,
      tipo, ano: mat.ano, semestre: mat.semestre,
      horarioSaida: req_.horaSolicitacao ?? null,
      status: "ativa", token,
    });

  } else if (slug === "saida-eventual") {
    // Exige data e horário informados no requerimento
    if (!req_.dataSolicitacao || !req_.horaSolicitacao) return;

    const token = gerarTokenCarteira(est.usuarioId, "cartao-saida-eventual",
      new Date().getFullYear(), new Date().getMonth() < 6 ? 1 : 2);

    await db.insert(cartoesSaidaTable).values({
      estudanteId:         req_.estudanteId,
      responsavelId:       req_.requerenteId,
      dataSaida:           req_.dataSolicitacao,
      horarioSaida:        req_.horaSolicitacao,
      motivo:              req_.exposicaoMotivos?.slice(0, 300) ?? null,
      status:              "aprovado",
      aprovadoPorId:       analisadoPorId,
      aprovadoEm:          new Date(),
      token,
    });
  }
}

// ── POST /api/requerimentos/:id/assinar-analise ───────────────────────────────
router.post("/:id/assinar-analise", requireAuth, async (req, res) => {
  const usuarioId = req.usuarioId!;
  const roles = await buscarRoles(usuarioId);
  const podeAnalisar = roles.some((r) => ["secretaria", "supervisao_pedagogica"].includes(r));
  if (!podeAnalisar) return res.status(403).json({ error: "Permissão negada." });

  const parsed = assinarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const { metodo, senha } = parsed.data;

  const [req_] = await db
    .select({ id: requerimentosTable.id, status: requerimentosTable.status })
    .from(requerimentosTable)
    .where(eq(requerimentosTable.id, req.params.id))
    .limit(1);
  if (!req_) return res.status(404).json({ error: "Requerimento não encontrado." });

  if (!["deferido", "indeferido"].includes(req_.status)) {
    return res.status(422).json({ error: "Analise o requerimento (deferir ou indeferir) antes de assinar." });
  }

  if (metodo === "senha") {
    if (!senha) return res.status(400).json({ error: "Senha é obrigatória para assinar." });
    const [usuario] = await db
      .select({ senhaHash: usuariosTable.senhaHash })
      .from(usuariosTable).where(eq(usuariosTable.id, usuarioId)).limit(1);
    if (!usuario?.senhaHash) return res.status(400).json({ error: "Usuário sem senha cadastrada." });
    const ok = await bcrypt.compare(senha, usuario.senhaHash);
    if (!ok) return res.status(401).json({ error: "Senha incorreta." });
  }

  const tokenHash = gerarTokenHash(req_.id, usuarioId, senha ?? "token");

  await db
    .insert(requerimentoAssinaturasTable)
    .values({
      requerimentoId: req_.id,
      usuarioId,
      papel: "analisador",
      metodo,
      tokenHash,
      ipOrigem: req.ip ?? null,
    })
    .onConflictDoNothing();

  res.json({ ok: true, tokenHash });
});

// ── ADMIN: GET /api/requerimentos/admin/tipos ─────────────────────────────────
router.get("/admin/tipos", requirePermissao("roles:manage"), async (_req, res) => {
  const tipos = await db.select().from(requerimentoTiposTable).orderBy(requerimentoTiposTable.ordem);
  const assuntos = await db.select().from(requerimentoAssuntosTable).orderBy(requerimentoAssuntosTable.ordem);
  res.json(tipos.map(t => ({ ...t, assuntos: assuntos.filter(a => a.tipoId === t.id) })));
});

router.post("/admin/tipos", requirePermissao("roles:manage"), async (req, res) => {
  const { nome, ordem } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome obrigatório." });
  const [novo] = await db.insert(requerimentoTiposTable).values({ nome, ordem: ordem ?? 99, ativo: true }).returning();
  res.status(201).json(novo);
});

router.put("/admin/tipos/:id", requirePermissao("roles:manage"), async (req, res) => {
  const { nome, ordem, ativo } = req.body;
  const [atualizado] = await db.update(requerimentoTiposTable)
    .set({ nome, ordem, ativo })
    .where(eq(requerimentoTiposTable.id, req.params.id))
    .returning();
  if (!atualizado) return res.status(404).json({ error: "Tipo não encontrado." });
  res.json(atualizado);
});

router.post("/admin/assuntos", requirePermissao("roles:manage"), async (req, res) => {
  const { tipoId, nome, descricao, requerMotivos, ordem } = req.body;
  if (!tipoId || !nome) return res.status(400).json({ error: "tipoId e nome obrigatórios." });
  const [novo] = await db.insert(requerimentoAssuntosTable)
    .values({ tipoId, nome, descricao: descricao ?? null, requerMotivos: !!requerMotivos, ordem: ordem ?? 99, ativo: true })
    .returning();
  res.status(201).json(novo);
});

router.put("/admin/assuntos/:id", requirePermissao("roles:manage"), async (req, res) => {
  const { nome, descricao, requerMotivos, ordem, ativo } = req.body;
  const [atualizado] = await db.update(requerimentoAssuntosTable)
    .set({ nome, descricao, requerMotivos, ordem, ativo })
    .where(eq(requerimentoAssuntosTable.id, req.params.id))
    .returning();
  if (!atualizado) return res.status(404).json({ error: "Assunto não encontrado." });
  res.json(atualizado);
});

router.delete("/admin/assuntos/:id", requirePermissao("roles:manage"), async (req, res) => {
  await db.delete(requerimentoAssuntosTable).where(eq(requerimentoAssuntosTable.id, req.params.id));
  res.json({ ok: true });
});

export default router;
