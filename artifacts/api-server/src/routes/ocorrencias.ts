import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  db, ocorrenciasTable, tiposOcorrenciasTable, estudantesTable,
  disciplinasTable, turnosTable, usuariosTable, estudanteEmailsTable,
  rolesTable, usuariosRolesTable, textosPadraoOcorrenciasTable,
  eq, isNull, and,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";
import { enviarEmailOcorrencia } from "../lib/mailer.js";

const router = Router();
router.use(requireAuth);

// ── Schemas ───────────────────────────────────────────────────────────────────

const criarSchema = z.object({
  estudanteId:      z.string().uuid(),
  tipoOcorrenciaId: z.string().uuid(),
  disciplinaId:     z.string().uuid().optional().nullable(),
  turnoId:          z.string().uuid().optional().nullable(),
  dataOcorrencia:   z.string().date(),
  observacao:       z.string().max(300, "Descrição deve ter no máximo 300 caracteres.").optional().nullable(),
  enviarEmailPais:  z.boolean().optional().default(false),
});

// ── Helpers de domínio ────────────────────────────────────────────────────────

function calcularIdade(dataNascimento: string): number {
  const nasc = new Date(dataNascimento);
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

async function getEstudanteMenorDeIdade(estudanteId: string): Promise<boolean> {
  const [est] = await db
    .select({ dataNascimento: estudantesTable.dataNascimento, usuarioId: estudantesTable.usuarioId })
    .from(estudantesTable)
    .where(eq(estudantesTable.id, estudanteId))
    .limit(1);
  if (!est) return false;

  // Verifica dataNascimento no registro estudante
  if (est.dataNascimento) return calcularIdade(est.dataNascimento) < 18;

  // Fallback: verifica no usuário vinculado
  if (est.usuarioId) {
    const [u] = await db
      .select({ dataNascimento: usuariosTable.dataNascimento })
      .from(usuariosTable)
      .where(eq(usuariosTable.id, est.usuarioId))
      .limit(1);
    if (u?.dataNascimento) return calcularIdade(u.dataNascimento) < 18;
  }
  return false;
}

async function usuarioTemRole(usuarioId: string, roleName: string): Promise<boolean> {
  const [role] = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(eq(rolesTable.nome, roleName))
    .limit(1);
  if (!role) return false;
  const [ur] = await db
    .select({ usuarioId: usuariosRolesTable.usuarioId })
    .from(usuariosRolesTable)
    .where(and(eq(usuariosRolesTable.usuarioId, usuarioId), eq(usuariosRolesTable.roleId, role.id)))
    .limit(1);
  return !!ur;
}

// ── Helper: busca campos completos de uma ocorrência ─────────────────────────

async function fetchOcorrenciaFull(id: string) {
  const [row] = await db
    .select({
      id:                       ocorrenciasTable.id,
      dataOcorrencia:           ocorrenciasTable.dataOcorrencia,
      observacao:               ocorrenciasTable.observacao,
      criadoEm:                 ocorrenciasTable.criadoEm,
      atualizadoEm:             ocorrenciasTable.atualizadoEm,
      estudanteId:              ocorrenciasTable.estudanteId,
      tipoOcorrenciaId:         ocorrenciasTable.tipoOcorrenciaId,
      disciplinaId:             ocorrenciasTable.disciplinaId,
      turnoId:                  ocorrenciasTable.turnoId,
      registradoPorId:          ocorrenciasTable.registradoPorId,
      cienteEm:                 ocorrenciasTable.cienteEm,
      cientePorId:              ocorrenciasTable.cientePorId,
      notificacaoPaisEnviadaEm: ocorrenciasTable.notificacaoPaisEnviadaEm,
      tipoDescricao:            tiposOcorrenciasTable.descricao,
      estudanteNome:            estudantesTable.nome,
      disciplinaNome:           disciplinasTable.nome,
      turnoNome:                turnosTable.nome,
      registradoPorNome:        usuariosTable.nome,
    })
    .from(ocorrenciasTable)
    .leftJoin(tiposOcorrenciasTable, eq(ocorrenciasTable.tipoOcorrenciaId, tiposOcorrenciasTable.id))
    .leftJoin(estudantesTable,       eq(ocorrenciasTable.estudanteId,       estudantesTable.id))
    .leftJoin(disciplinasTable,      eq(ocorrenciasTable.disciplinaId,      disciplinasTable.id))
    .leftJoin(turnosTable,           eq(ocorrenciasTable.turnoId,           turnosTable.id))
    .leftJoin(usuariosTable,         eq(ocorrenciasTable.registradoPorId,   usuariosTable.id))
    .where(eq(ocorrenciasTable.id, id))
    .limit(1);
  return row ?? null;
}

// ── Helper: busca dados comuns para o e-mail de ocorrência ───────────────────

async function buscarDadosEmail(ocorrenciaId: string, estudanteId: string) {
  const [est] = await db
    .select({ nome: estudantesTable.nome })
    .from(estudantesTable)
    .where(eq(estudantesTable.id, estudanteId))
    .limit(1);

  const [ocorr] = await db
    .select({
      tipoDescricao:  tiposOcorrenciasTable.descricao,
      dataOcorrencia: ocorrenciasTable.dataOcorrencia,
      observacao:     ocorrenciasTable.observacao,
    })
    .from(ocorrenciasTable)
    .leftJoin(tiposOcorrenciasTable, eq(ocorrenciasTable.tipoOcorrenciaId, tiposOcorrenciasTable.id))
    .where(eq(ocorrenciasTable.id, ocorrenciaId))
    .limit(1);

  return { est, ocorr };
}

async function buscarTextoPadrao(tipoOcorrenciaId: string): Promise<string | null> {
  const [tp] = await db
    .select({ corpo: textosPadraoOcorrenciasTable.corpo })
    .from(textosPadraoOcorrenciasTable)
    .where(and(
      eq(textosPadraoOcorrenciasTable.tipoOcorrenciaId, tipoOcorrenciaId),
      eq(textosPadraoOcorrenciasTable.ativo, true),
      isNull(textosPadraoOcorrenciasTable.deletadoEm),
    ))
    .limit(1);
  return tp?.corpo ?? null;
}

async function enviarParaEmails(
  emails: string[],
  ocorrenciaId: string,
  estudanteId: string,
  turnoNome: string | null | undefined,
  disciplinaNome: string | null | undefined,
  stamparNotificacaoPais: boolean,
): Promise<number> {
  if (!emails.length) return 0;
  const { est, ocorr } = await buscarDadosEmail(ocorrenciaId, estudanteId);

  // Busca texto padrão do tipo de ocorrência, se existir
  const textoPadrao = ocorr
    ? await buscarTextoPadrao(
        (await db.select({ tipoOcorrenciaId: ocorrenciasTable.tipoOcorrenciaId })
          .from(ocorrenciasTable).where(eq(ocorrenciasTable.id, ocorrenciaId)).limit(1)
        )[0]?.tipoOcorrenciaId ?? ""
      )
    : null;

  let enviados = 0;
  for (const email of emails) {
    try {
      await enviarEmailOcorrencia({
        para:           email,
        estudanteNome:  est?.nome ?? "Estudante",
        tipoOcorrencia: ocorr?.tipoDescricao ?? "Ocorrência",
        dataOcorrencia: ocorr?.dataOcorrencia ?? new Date().toISOString().slice(0, 10),
        turnoNome,
        disciplinaNome,
        observacao:     ocorr?.observacao,
        textoPadrao,
      });
      enviados++;
    } catch (e) {
      console.error("[ocorrencias] falha ao enviar e-mail para", email, e);
    }
  }
  if (enviados > 0 && stamparNotificacaoPais) {
    await db.update(ocorrenciasTable)
      .set({ notificacaoPaisEnviadaEm: new Date(), atualizadoEm: new Date() })
      .where(eq(ocorrenciasTable.id, ocorrenciaId));
  }
  return enviados;
}

// ── Helper: envia e-mail para responsáveis (estudante menor) ─────────────────

async function notificarPais(
  ocorrenciaId: string,
  estudanteId: string,
  turnoNome?: string | null,
  disciplinaNome?: string | null,
): Promise<{ enviados: number; semDestinatarios: boolean }> {
  const rows = await db
    .select({ email: estudanteEmailsTable.email })
    .from(estudanteEmailsTable)
    .where(and(
      eq(estudanteEmailsTable.estudanteId, estudanteId),
      eq(estudanteEmailsTable.tipo, "responsavel"),
    ));

  if (!rows.length) return { enviados: 0, semDestinatarios: true };
  const enviados = await enviarParaEmails(
    rows.map((r) => r.email), ocorrenciaId, estudanteId, turnoNome, disciplinaNome, true,
  );
  return { enviados, semDestinatarios: false };
}

// ── Helper: envia e-mail para o próprio estudante (maior de idade) ────────────

async function notificarEstudante(
  ocorrenciaId: string,
  estudanteId: string,
  turnoNome?: string | null,
  disciplinaNome?: string | null,
): Promise<{ enviados: number; semDestinatarios: boolean }> {
  const rows = await db
    .select({ email: estudanteEmailsTable.email })
    .from(estudanteEmailsTable)
    .where(and(
      eq(estudanteEmailsTable.estudanteId, estudanteId),
      eq(estudanteEmailsTable.tipo, "proprio"),
    ));

  if (!rows.length) return { enviados: 0, semDestinatarios: true };
  const enviados = await enviarParaEmails(
    rows.map((r) => r.email), ocorrenciaId, estudanteId, turnoNome, disciplinaNome, false,
  );
  return { enviados, semDestinatarios: false };
}

// ── GET /api/ocorrencias ──────────────────────────────────────────────────────

router.get("/", requirePermissao("ocorrencias:view"), async (req: Request, res: Response) => {
  try {
    const { estudanteId } = req.query;
    const ocorrencias = await db
      .select({
        id:                       ocorrenciasTable.id,
        dataOcorrencia:           ocorrenciasTable.dataOcorrencia,
        observacao:               ocorrenciasTable.observacao,
        criadoEm:                 ocorrenciasTable.criadoEm,
        estudanteId:              ocorrenciasTable.estudanteId,
        tipoOcorrenciaId:         ocorrenciasTable.tipoOcorrenciaId,
        disciplinaId:             ocorrenciasTable.disciplinaId,
        turnoId:                  ocorrenciasTable.turnoId,
        registradoPorId:          ocorrenciasTable.registradoPorId,
        cienteEm:                 ocorrenciasTable.cienteEm,
        cientePorId:              ocorrenciasTable.cientePorId,
        notificacaoPaisEnviadaEm: ocorrenciasTable.notificacaoPaisEnviadaEm,
        tipoDescricao:            tiposOcorrenciasTable.descricao,
        estudanteNome:            estudantesTable.nome,
        disciplinaNome:           disciplinasTable.nome,
        turnoNome:                turnosTable.nome,
        registradoPorNome:        usuariosTable.nome,
      })
      .from(ocorrenciasTable)
      .leftJoin(tiposOcorrenciasTable, eq(ocorrenciasTable.tipoOcorrenciaId, tiposOcorrenciasTable.id))
      .leftJoin(estudantesTable,       eq(ocorrenciasTable.estudanteId,       estudantesTable.id))
      .leftJoin(disciplinasTable,      eq(ocorrenciasTable.disciplinaId,      disciplinasTable.id))
      .leftJoin(turnosTable,           eq(ocorrenciasTable.turnoId,           turnosTable.id))
      .leftJoin(usuariosTable,         eq(ocorrenciasTable.registradoPorId,   usuariosTable.id))
      .where(estudanteId
        ? and(isNull(ocorrenciasTable.deletadoEm), eq(ocorrenciasTable.estudanteId, estudanteId as string))
        : isNull(ocorrenciasTable.deletadoEm))
      .orderBy(ocorrenciasTable.dataOcorrencia);
    res.json(ocorrencias);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar ocorrências" });
  }
});

// ── GET /api/ocorrencias/estudante/:estudanteId — acesso sem permissão especial
// (usada por pais_responsaveis e estudantes para ver suas próprias ocorrências)

router.get("/estudante/:estudanteId", async (req: Request, res: Response) => {
  try {
    const ocorrencias = await db
      .select({
        id:               ocorrenciasTable.id,
        dataOcorrencia:   ocorrenciasTable.dataOcorrencia,
        observacao:       ocorrenciasTable.observacao,
        criadoEm:         ocorrenciasTable.criadoEm,
        estudanteId:      ocorrenciasTable.estudanteId,
        tipoOcorrenciaId: ocorrenciasTable.tipoOcorrenciaId,
        turnoId:          ocorrenciasTable.turnoId,
        cienteEm:         ocorrenciasTable.cienteEm,
        cientePorId:      ocorrenciasTable.cientePorId,
        tipoDescricao:    tiposOcorrenciasTable.descricao,
        disciplinaNome:   disciplinasTable.nome,
        turnoNome:        turnosTable.nome,
      })
      .from(ocorrenciasTable)
      .leftJoin(tiposOcorrenciasTable, eq(ocorrenciasTable.tipoOcorrenciaId, tiposOcorrenciasTable.id))
      .leftJoin(disciplinasTable,      eq(ocorrenciasTable.disciplinaId,      disciplinasTable.id))
      .leftJoin(turnosTable,           eq(ocorrenciasTable.turnoId,           turnosTable.id))
      .where(and(
        isNull(ocorrenciasTable.deletadoEm),
        eq(ocorrenciasTable.estudanteId, String(req.params.estudanteId)),
      ))
      .orderBy(ocorrenciasTable.dataOcorrencia);
    res.json(ocorrencias);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar ocorrências" });
  }
});

// ── GET /api/ocorrencias/:id ──────────────────────────────────────────────────

router.get("/:id", requirePermissao("ocorrencias:view"), async (req: Request, res: Response) => {
  try {
    const row = await fetchOcorrenciaFull(String(req.params.id));
    if (!row || (row as { deletadoEm?: unknown }).deletadoEm) {
      return res.status(404).json({ error: "Ocorrência não encontrada" });
    }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar ocorrência" });
  }
});

// ── POST /api/ocorrencias ─────────────────────────────────────────────────────

router.post("/", requirePermissao("ocorrencias:create"), async (req: Request, res: Response) => {
  try {
    const { enviarEmailPais, ...data } = criarSchema.parse(req.body);

    // Fetch turno/disciplina names now (before insert) for email notification
    let turnoNome: string | null = null;
    let disciplinaNome: string | null = null;
    if (data.turnoId) {
      const [t] = await db.select({ nome: turnosTable.nome }).from(turnosTable).where(eq(turnosTable.id, data.turnoId)).limit(1);
      turnoNome = t?.nome ?? null;
    }
    if (data.disciplinaId) {
      const [d] = await db.select({ nome: disciplinasTable.nome }).from(disciplinasTable).where(eq(disciplinasTable.id, data.disciplinaId)).limit(1);
      disciplinaNome = d?.nome ?? null;
    }

    const [ocorrencia] = await db.insert(ocorrenciasTable).values({
      ...data,
      registradoPorId: req.usuarioId,
    }).returning();

    // Regra: menor → e-mail para responsáveis; maior → e-mail para o próprio estudante
    const menor = await getEstudanteMenorDeIdade(data.estudanteId);
    if (menor || enviarEmailPais) {
      await notificarPais(ocorrencia.id, data.estudanteId, turnoNome, disciplinaNome);
    } else {
      await notificarEstudante(ocorrencia.id, data.estudanteId, turnoNome, disciplinaNome);
    }

    await registrarAuditoria({
      tabela: "ocorrencias", operacao: "INSERT", registroId: ocorrencia.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/ocorrencias", metodoHttp: "POST", statusHttp: 201,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.status(201).json(await fetchOcorrenciaFull(ocorrencia.id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Dados inválidos";
    res.status(400).json({ error: msg });
  }
});

// ── PUT /api/ocorrencias/:id ──────────────────────────────────────────────────

router.put("/:id", requirePermissao("ocorrencias:create"), async (req: Request, res: Response) => {
  try {
    const data = criarSchema.omit({ enviarEmailPais: true }).partial().parse(req.body);
    const [ocorrencia] = await db
      .update(ocorrenciasTable)
      .set({ ...data, atualizadoEm: new Date() })
      .where(and(eq(ocorrenciasTable.id, String(req.params.id)), isNull(ocorrenciasTable.deletadoEm)))
      .returning();
    if (!ocorrencia) return res.status(404).json({ error: "Ocorrência não encontrada" });
    await registrarAuditoria({
      tabela: "ocorrencias", operacao: "UPDATE", registroId: ocorrencia.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/ocorrencias/:id", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json(await fetchOcorrenciaFull(ocorrencia.id));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// ── DELETE /api/ocorrencias/:id ───────────────────────────────────────────────

router.delete("/:id", requirePermissao("ocorrencias:create"), async (req: Request, res: Response) => {
  try {
    const [ocorrencia] = await db
      .update(ocorrenciasTable)
      .set({ deletadoEm: new Date() })
      .where(and(eq(ocorrenciasTable.id, String(req.params.id)), isNull(ocorrenciasTable.deletadoEm)))
      .returning();
    if (!ocorrencia) return res.status(404).json({ error: "Ocorrência não encontrada" });
    await registrarAuditoria({
      tabela: "ocorrencias", operacao: "DELETE", registroId: ocorrencia.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "DELETE /api/ocorrencias/:id", metodoHttp: "DELETE", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao excluir ocorrência" });
  }
});

// ── POST /api/ocorrencias/:id/ciente — marca ciência (pai/responsável) ────────

router.post("/:id/ciente", async (req: Request, res: Response) => {
  try {
    const [existente] = await db
      .select({ id: ocorrenciasTable.id, cienteEm: ocorrenciasTable.cienteEm, estudanteId: ocorrenciasTable.estudanteId })
      .from(ocorrenciasTable)
      .where(and(eq(ocorrenciasTable.id, String(req.params.id)), isNull(ocorrenciasTable.deletadoEm)))
      .limit(1);

    if (!existente) return res.status(404).json({ error: "Ocorrência não encontrada." });
    if (existente.cienteEm) return res.status(409).json({ error: "Ciência já registrada." });

    // Estudante menor de idade não pode dar ciência — deve ser o pai/responsável
    const isEstudante = await usuarioTemRole(req.usuarioId!, "estudante");
    if (isEstudante) {
      const menor = await getEstudanteMenorDeIdade(existente.estudanteId);
      if (menor) {
        return res.status(403).json({
          error: "Estudante menor de idade não pode registrar ciência. A ciência deve ser feita pelo pai ou responsável.",
        });
      }
    }

    const [updated] = await db
      .update(ocorrenciasTable)
      .set({ cienteEm: new Date(), cientePorId: req.usuarioId, atualizadoEm: new Date() })
      .where(eq(ocorrenciasTable.id, String(req.params.id)))
      .returning();

    await registrarAuditoria({
      tabela: "ocorrencias", operacao: "UPDATE", registroId: updated.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: `POST /api/ocorrencias/${String(req.params.id)}/ciente`, metodoHttp: "POST", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json({ ok: true, cienteEm: updated.cienteEm });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao registrar ciência." });
  }
});

// ── POST /api/ocorrencias/:id/notificar-pais ──────────────────────────────────

router.post("/:id/notificar-pais", requirePermissao("ocorrencias:create"), async (req: Request, res: Response) => {
  try {
    const ocorr = await fetchOcorrenciaFull(String(req.params.id));
    if (!ocorr) return res.status(404).json({ error: "Ocorrência não encontrada." });

    const resultado = await notificarPais(ocorr.id, ocorr.estudanteId, ocorr.turnoNome, ocorr.disciplinaNome);

    if (resultado.semResponsaveis) {
      return res.status(422).json({ error: "Este estudante não possui e-mails de responsável cadastrados." });
    }

    res.json({
      ok: true,
      enviados: resultado.enviados,
      mensagem: `E-mail enviado para ${resultado.enviados} responsável(is).`,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao notificar responsáveis." });
  }
});

export default router;
