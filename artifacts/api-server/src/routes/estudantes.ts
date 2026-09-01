import { Router, Request, Response } from "express";
import { z } from "zod";
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { db, estudantesTable, estudanteEmailsTable, usuariosTable, turmasTable, cursosTable, turnosTable, matriculasTable, responsaveisEstudantesTable, eq, isNull, and, inArray, ilike, or, ne } from "@workspace/db";
import { fotosTable } from "@workspace/db/schema";
import {
  criptografarFoto,
  descriptografarFoto,
  verificarIntegridade,
} from "../lib/crypto.js";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";

function decryptEmail(encrypted: string, secret: string): string {
  try {
    const key = createHash("sha256").update(secret).digest();
    const [ivHex, encHex] = encrypted.split(":");
    if (!ivHex || !encHex) return "";
    const decipher = createDecipheriv("aes-256-cbc", key, Buffer.from(ivHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
  } catch { return ""; }
}

function encryptEmail(email: string, secret: string): string {
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(email, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

const router = Router();
router.use(requireAuth);

const insertEstudanteSchema = z.object({
  nome:            z.string().min(2).max(200),
  registro:        z.string().min(1).max(50),
  turmaId:         z.string().uuid(),
  observacao:      z.string().max(300).optional().nullable(),
  dataNascimento:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  emails: z.array(z.object({
    email: z.string().email(),
    tipo: z.enum(["proprio", "responsavel"]),
  })).optional(),
});

// Carrega e-mails de uma lista de estudanteIds de forma eficiente (uma query)
async function carregarEmails(ids: string[]) {
  if (ids.length === 0) return new Map<string, {email:string; tipo:string}[]>();
  const emails = await db
    .select({ estudanteId: estudanteEmailsTable.estudanteId, email: estudanteEmailsTable.email, tipo: estudanteEmailsTable.tipo })
    .from(estudanteEmailsTable)
    .where(inArray(estudanteEmailsTable.estudanteId, ids));
  const map = new Map<string, {email:string; tipo:string}[]>();
  for (const e of emails) {
    if (!map.has(e.estudanteId)) map.set(e.estudanteId, []);
    map.get(e.estudanteId)!.push({ email: e.email, tipo: e.tipo });
  }
  return map;
}

// GET /api/estudantes — retorna Estudante[] conforme contrato OpenAPI
// Filtros: ?turmaId=uuid&busca=texto&search=texto
router.get("/", requirePermissao("estudantes:view"), async (req: Request, res: Response) => {
  try {
    const { turmaId, busca, search } = req.query;
    const termoBusca = (busca || search) as string | undefined;

    const condicoes = [isNull(estudantesTable.deletadoEm)];
    if (turmaId) condicoes.push(eq(estudantesTable.turmaId, turmaId as string));
    if (termoBusca) {
      condicoes.push(
        or(
          ilike(estudantesTable.nome, `%${termoBusca}%`),
          ilike(estudantesTable.registro, `%${termoBusca}%`),
        )!
      );
    }

    const filtrados = await db
      .select({
        id:          estudantesTable.id,
        nome:        estudantesTable.nome,
        registro:    estudantesTable.registro,
        observacao:  estudantesTable.observacao,
        turmaId:     estudantesTable.turmaId,
        usuarioId:   estudantesTable.usuarioId,
        fotoId:      estudantesTable.fotoId,
        fotoStorageKey: estudantesTable.fotoStorageKey,
        criadoEm:    estudantesTable.criadoEm,
        turmaSigla:  turmasTable.sigla,
        turmaDescricao: turmasTable.descricao,
        cursoNome:   cursosTable.nome,
        turnoNome:   turnosTable.nome,
      })
      .from(estudantesTable)
      .leftJoin(turmasTable, eq(estudantesTable.turmaId, turmasTable.id))
      .leftJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
      .leftJoin(matriculasTable, and(
        eq(matriculasTable.usuarioId, estudantesTable.usuarioId),
        eq(matriculasTable.turmaId, estudantesTable.turmaId),
        isNull(matriculasTable.deletadoEm),
      ))
      .leftJoin(turnosTable, eq(turnosTable.id, matriculasTable.turnoId))
      .where(and(...condicoes))
      .orderBy(estudantesTable.nome);

    // Carregar e-mails em batch (uma query)
    const emailsMap = await carregarEmails(filtrados.map((r) => r.id));

    // Montar shape conforme contrato: Estudante[]
    const estudantes = filtrados.map((r) => ({
      id:             r.id,
      nome:           r.nome,
      registro:       r.registro,
      observacao:     r.observacao ?? null,
      turmaId:        r.turmaId,
      usuarioId:      r.usuarioId ?? null,
      turmaSigla:     r.turmaSigla ?? "",
      turmaDescricao: r.turmaDescricao ?? "",
      turnoNome:      r.turnoNome ?? "",
      cursoNome:      r.cursoNome ?? "",
      criadoEm:       r.criadoEm.toISOString(),
      fotoUrl: r.fotoId
        ? `/api/fotos/${r.fotoId}`
        : (r.fotoStorageKey ? `/api/estudantes/${r.id}/foto` : null),
      emails:   emailsMap.get(r.id) ?? [],
    }));

    res.json(estudantes);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar estudantes" });
  }
});

// GET /api/estudantes/:id
router.get("/:id", requirePermissao("estudantes:view"), async (req: Request, res: Response) => {
  try {
    const secret = process.env.ENCRYPTION_KEY ?? process.env.SESSION_SECRET ?? "";
    const [e] = await db
      .select({
        id: estudantesTable.id, nome: estudantesTable.nome, registro: estudantesTable.registro,
        observacao: estudantesTable.observacao, turmaId: estudantesTable.turmaId,
        dataNascimento: estudantesTable.dataNascimento,
        fotoId: estudantesTable.fotoId,
        fotoStorageKey: estudantesTable.fotoStorageKey, criadoEm: estudantesTable.criadoEm,
        turmaSigla: turmasTable.sigla, turmaDescricao: turmasTable.descricao,
        cursoNome: cursosTable.nome, turnoNome: turnosTable.nome,
        deletadoEm: estudantesTable.deletadoEm,
        usuarioId: estudantesTable.usuarioId,
        // Email do usuario vinculado (fonte canônica quando usuarioId existe)
        emailEncrypted: usuariosTable.emailEncrypted,
      })
      .from(estudantesTable)
      .leftJoin(turmasTable, eq(estudantesTable.turmaId, turmasTable.id))
      .leftJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
      .leftJoin(matriculasTable, and(
        eq(matriculasTable.usuarioId, estudantesTable.usuarioId),
        eq(matriculasTable.turmaId, estudantesTable.turmaId),
        isNull(matriculasTable.deletadoEm),
      ))
      .leftJoin(turnosTable, eq(turnosTable.id, matriculasTable.turnoId))
      .leftJoin(usuariosTable, eq(estudantesTable.usuarioId, usuariosTable.id))
      .where(eq(estudantesTable.id, String(req.params.id)));

    if (!e || e.deletadoEm) return res.status(404).json({ error: "Estudante não encontrado" });

    // Emails de contato da tabela estudante_emails
    const emailsDB = await db.select({ email: estudanteEmailsTable.email, tipo: estudanteEmailsTable.tipo })
      .from(estudanteEmailsTable).where(eq(estudanteEmailsTable.estudanteId, e.id));

    // Se o estudante tem usuario vinculado, o email 'proprio' vem de usuarios.email_encrypted
    // (fonte canônica, criptografada, com constraint UNIQUE)
    let emails: { email: string; tipo: string }[];
    if (e.usuarioId && e.emailEncrypted) {
      const emailDecryptado = decryptEmail(e.emailEncrypted, secret);
      emails = [
        { email: emailDecryptado, tipo: "proprio" },
        ...emailsDB.filter((em) => em.tipo === "responsavel"),
      ];
    } else {
      emails = emailsDB;
    }

    // Buscar pais/responsáveis vinculados
    const responsaveisRows = await db
      .select({ id: usuariosTable.id, nome: usuariosTable.nome, codigoAcesso: usuariosTable.codigoAcesso, emailEncrypted: usuariosTable.emailEncrypted })
      .from(responsaveisEstudantesTable)
      .innerJoin(usuariosTable, eq(usuariosTable.id, responsaveisEstudantesTable.usuarioId))
      .where(and(eq(responsaveisEstudantesTable.estudanteId, e.id), isNull(usuariosTable.deletadoEm)));

    const responsaveis = responsaveisRows.map((r) => ({
      id: r.id, nome: r.nome, codigoAcesso: r.codigoAcesso,
      email: decryptEmail(r.emailEncrypted, secret),
    }));

    res.json({
      id: e.id, nome: e.nome, registro: e.registro, observacao: e.observacao ?? null,
      dataNascimento: e.dataNascimento ?? null,
      turmaId: e.turmaId, turmaSigla: e.turmaSigla ?? "", turmaDescricao: e.turmaDescricao ?? "",
      turnoNome: e.turnoNome ?? "", cursoNome: e.cursoNome ?? "",
      criadoEm: e.criadoEm.toISOString(),
      usuarioId: e.usuarioId ?? null,
      fotoUrl: e.fotoId
        ? `/api/fotos/${e.fotoId}`
        : (e.fotoStorageKey ? `/api/estudantes/${e.id}/foto` : null),
      emails,
      responsaveis,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar estudante" });
  }
});

// GET /api/estudantes/:id/foto — servir foto (nova tabela ou fallback inline)
router.get("/:id/foto", async (req: Request, res: Response) => {
  try {
    const [e] = await db
      .select({
        fotoId: estudantesTable.fotoId,
        fotoDados: estudantesTable.fotoDados, fotoIv: estudantesTable.fotoIv,
        fotoMimeType: estudantesTable.fotoMimeType, fotoHashIntegridade: estudantesTable.fotoHashIntegridade,
      })
      .from(estudantesTable)
      .where(eq(estudantesTable.id, String(req.params.id)));

    if (!e) return res.status(404).end();

    // Nova tabela — redireciona para o endpoint canônico com cache longo
    if (e.fotoId) return res.redirect(302, `/api/fotos/${e.fotoId}`);

    // Fallback inline (dados legados ainda não migrados)
    if (!e.fotoDados || !e.fotoIv) return res.status(404).end();

    const dadosBrutos = descriptografarFoto(e.fotoDados, e.fotoIv);

    if (e.fotoHashIntegridade && !verificarIntegridade(dadosBrutos, e.fotoHashIntegridade)) {
      return res.status(500).json({ error: "Erro de integridade da foto" });
    }

    res.set("Cache-Control", "private, max-age=604800");
    res.set("Content-Type", e.fotoMimeType ?? "image/jpeg");
    res.send(dadosBrutos);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao servir foto" });
  }
});

// POST /api/estudantes — criar estudante
router.post("/", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const { fotoBase64, ...body } = req.body;
    const { emails, ...data } = insertEstudanteSchema.parse(body);

    const [estudante] = await db.insert(estudantesTable).values(data).returning();

    if (fotoBase64) {
      if (fotoBase64.length > 5_000_000) return res.status(413).json({ error: "Foto muito grande. Máximo: ~3.7MB" });
      const foto = criptografarFoto(fotoBase64);
      const [fotoRow] = await db.insert(fotosTable).values({
        entidadeTipo: "estudante", entidadeId: estudante.id,
        mimeType: foto.mimeType, tamanhoBytes: foto.tamanhoBytes,
        iv: foto.iv, hashIntegridade: foto.hash, dados: foto.dadosCriptografados,
      }).onConflictDoUpdate({
        target: [fotosTable.entidadeTipo, fotosTable.entidadeId],
        set: { mimeType: foto.mimeType, tamanhoBytes: foto.tamanhoBytes, iv: foto.iv, hashIntegridade: foto.hash, dados: foto.dadosCriptografados, atualizadoEm: new Date() },
      }).returning({ id: fotosTable.id });
      await db.update(estudantesTable).set({ fotoId: fotoRow.id }).where(eq(estudantesTable.id, estudante.id));
      estudante.fotoId = fotoRow.id;
    }

    // Inserir e-mails se fornecidos
    if (emails && emails.length > 0) {
      await db.insert(estudanteEmailsTable).values(
        emails.map((e) => ({ estudanteId: estudante.id, email: e.email, tipo: e.tipo }))
      );
    }

    await registrarAuditoria({
      tabela: "estudantes", operacao: "INSERT", registroId: estudante.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/estudantes", metodoHttp: "POST", statusHttp: 201,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.status(201).json({ id: estudante.id, nome: estudante.nome, registro: estudante.registro,
      fotoUrl: estudante.fotoId
        ? `/api/fotos/${estudante.fotoId}`
        : (estudante.fotoStorageKey ? `/api/estudantes/${estudante.id}/foto` : null),
      emails: emails ?? [], turmaId: estudante.turmaId });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// POST /api/estudantes/:id/foto — atualizar foto
// Quando o estudante tem usuario_id, sincroniza a foto também em fotos(entidade_tipo='usuario')
// e atualiza usuarios.fotoId — garantindo que lista de usuários e carteira mostrem a mesma foto.
router.post("/:id/foto", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const { fotoBase64 } = z.object({ fotoBase64: z.string().min(1) }).parse(req.body);
    if (fotoBase64.length > 5_000_000) return res.status(413).json({ error: "Foto muito grande. Máximo: ~3.7MB" });

    const estudanteId = String(req.params.id);
    const foto = criptografarFoto(fotoBase64);

    // Salvar/atualizar foto na tabela canônica com entidade_tipo='estudante'
    const [fotoRow] = await db.insert(fotosTable).values({
      entidadeTipo: "estudante", entidadeId: estudanteId,
      mimeType: foto.mimeType, tamanhoBytes: foto.tamanhoBytes,
      iv: foto.iv, hashIntegridade: foto.hash, dados: foto.dadosCriptografados,
    }).onConflictDoUpdate({
      target: [fotosTable.entidadeTipo, fotosTable.entidadeId],
      set: { mimeType: foto.mimeType, tamanhoBytes: foto.tamanhoBytes, iv: foto.iv, hashIntegridade: foto.hash, dados: foto.dadosCriptografados, atualizadoEm: new Date() },
    }).returning({ id: fotosTable.id });

    const [estudante] = await db
      .update(estudantesTable)
      .set({ fotoId: fotoRow.id, atualizadoEm: new Date() })
      .where(eq(estudantesTable.id, estudanteId))
      .returning({ id: estudantesTable.id, usuarioId: estudantesTable.usuarioId });

    if (!estudante) return res.status(404).json({ error: "Estudante não encontrado" });

    // Sincronizar foto para o usuário vinculado (portal, lista de usuários, carteira)
    if (estudante.usuarioId) {
      const [fotoUsuarioRow] = await db.insert(fotosTable).values({
        entidadeTipo: "usuario", entidadeId: estudante.usuarioId,
        mimeType: foto.mimeType, tamanhoBytes: foto.tamanhoBytes,
        iv: foto.iv, hashIntegridade: foto.hash, dados: foto.dadosCriptografados,
      }).onConflictDoUpdate({
        target: [fotosTable.entidadeTipo, fotosTable.entidadeId],
        set: { mimeType: foto.mimeType, tamanhoBytes: foto.tamanhoBytes, iv: foto.iv, hashIntegridade: foto.hash, dados: foto.dadosCriptografados, atualizadoEm: new Date() },
      }).returning({ id: fotosTable.id });

      await db.update(usuariosTable)
        .set({ fotoId: fotoUsuarioRow.id, atualizadoEm: new Date() })
        .where(eq(usuariosTable.id, estudante.usuarioId));
    }

    await registrarAuditoria({
      tabela: "estudantes", operacao: "UPDATE", registroId: estudante.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: `POST /api/estudantes/${estudanteId}/foto`, metodoHttp: "POST", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.json({ ok: true, fotoUrl: `/api/fotos/${fotoRow.id}` });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// PUT /api/estudantes/:id — atualizar dados
router.put("/:id", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const secret = process.env.ENCRYPTION_KEY ?? process.env.SESSION_SECRET ?? "";
    const bodySchema = insertEstudanteSchema.partial().extend({
      responsavelIds: z.array(z.string().uuid()).optional(),
    });
    const { emails, responsavelIds, ...data } = bodySchema.parse(req.body);
    const [estudante] = await db
      .update(estudantesTable)
      .set({ ...data, atualizadoEm: new Date() })
      .where(eq(estudantesTable.id, String(req.params.id)))
      .returning({ id: estudantesTable.id, nome: estudantesTable.nome, registro: estudantesTable.registro, usuarioId: estudantesTable.usuarioId, fotoId: estudantesTable.fotoId, fotoStorageKey: estudantesTable.fotoStorageKey });
    if (!estudante) return res.status(404).json({ error: "Estudante não encontrado" });

    if (emails !== undefined) {
      const emailProprio = emails.find((e) => e.tipo === "proprio");
      const emailsResponsavel = emails.filter((e) => e.tipo === "responsavel");

      if (estudante.usuarioId && emailProprio) {
        // Estudante vinculado a usuario: email 'proprio' deve atualizar usuarios (fonte canônica)
        const emailNorm = emailProprio.email.toLowerCase().trim();
        const novoHash  = createHash("sha256").update(emailNorm).digest("hex");
        const [conflito] = await db
          .select({ id: usuariosTable.id })
          .from(usuariosTable)
          .where(and(eq(usuariosTable.emailHash, novoHash), and(eq(usuariosTable.id, estudante.usuarioId))));
        if (!conflito) {
          // Verificar se o hash pertence a outro usuario
          const [outro] = await db.select({ id: usuariosTable.id }).from(usuariosTable)
            .where(eq(usuariosTable.emailHash, novoHash));
          if (outro && outro.id !== estudante.usuarioId)
            return res.status(409).json({ error: "Este e-mail já está cadastrado para outro usuário." });
          await db.update(usuariosTable).set({
            emailEncrypted: encryptEmail(emailNorm, secret),
            emailHash: novoHash,
            atualizadoEm: new Date(),
          }).where(eq(usuariosTable.id, estudante.usuarioId));
        }
        // Manter estudante_emails.tipo='proprio' sincronizado
        await db.delete(estudanteEmailsTable)
          .where(and(eq(estudanteEmailsTable.estudanteId, estudante.id), eq(estudanteEmailsTable.tipo, "proprio")));
        await db.insert(estudanteEmailsTable)
          .values({ estudanteId: estudante.id, email: emailNorm, tipo: "proprio" });
      } else {
        // Sem usuario vinculado: armazenar normalmente em estudante_emails
        await db.delete(estudanteEmailsTable)
          .where(and(eq(estudanteEmailsTable.estudanteId, estudante.id), eq(estudanteEmailsTable.tipo, "proprio")));
        if (emailProprio) {
          await db.insert(estudanteEmailsTable)
            .values({ estudanteId: estudante.id, email: emailProprio.email.toLowerCase().trim(), tipo: "proprio" });
        }
      }
      // Sempre substituir emails de responsável normalmente
      await db.delete(estudanteEmailsTable)
        .where(and(eq(estudanteEmailsTable.estudanteId, estudante.id), eq(estudanteEmailsTable.tipo, "responsavel")));
      if (emailsResponsavel.length > 0) {
        await db.insert(estudanteEmailsTable).values(
          emailsResponsavel.map((e) => ({ estudanteId: estudante.id, email: e.email, tipo: "responsavel" as const }))
        );
      }
    }

    // Sincronizar pais/responsáveis se fornecido
    if (responsavelIds !== undefined) {
      await db.delete(responsaveisEstudantesTable)
        .where(eq(responsaveisEstudantesTable.estudanteId, estudante.id));
      if (responsavelIds.length > 0) {
        await db.insert(responsaveisEstudantesTable).values(
          responsavelIds.map((uid) => ({ usuarioId: uid, estudanteId: estudante.id, criadoPorId: req.usuarioId }))
        ).onConflictDoNothing();
      }
    }

    await registrarAuditoria({
      tabela: "estudantes", operacao: "UPDATE", registroId: estudante.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/estudantes/:id", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    const emailsSalvos = await db.select({ email: estudanteEmailsTable.email, tipo: estudanteEmailsTable.tipo })
      .from(estudanteEmailsTable).where(eq(estudanteEmailsTable.estudanteId, estudante.id));

    const responsaveisSalvos = await db
      .select({ id: usuariosTable.id, nome: usuariosTable.nome, codigoAcesso: usuariosTable.codigoAcesso, emailEncrypted: usuariosTable.emailEncrypted })
      .from(responsaveisEstudantesTable)
      .innerJoin(usuariosTable, eq(usuariosTable.id, responsaveisEstudantesTable.usuarioId))
      .where(and(eq(responsaveisEstudantesTable.estudanteId, estudante.id), isNull(usuariosTable.deletadoEm)));

    res.json({ id: estudante.id, nome: estudante.nome, registro: estudante.registro,
      fotoUrl: estudante.fotoId
        ? `/api/fotos/${estudante.fotoId}`
        : (estudante.fotoStorageKey ? `/api/estudantes/${estudante.id}/foto` : null),
      emails: emailsSalvos,
      responsaveis: responsaveisSalvos.map((r) => ({
        id: r.id, nome: r.nome, codigoAcesso: r.codigoAcesso,
        email: decryptEmail(r.emailEncrypted, secret),
      })),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// DELETE /api/estudantes/:id — soft delete
router.delete("/:id", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const [estudante] = await db
      .update(estudantesTable)
      .set({ deletadoEm: new Date() })
      .where(eq(estudantesTable.id, String(req.params.id)))
      .returning({ id: estudantesTable.id });
    if (!estudante) return res.status(404).json({ error: "Estudante não encontrado" });
    await registrarAuditoria({
      tabela: "estudantes", operacao: "DELETE", registroId: estudante.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "DELETE /api/estudantes/:id", metodoHttp: "DELETE", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao excluir estudante" });
  }
});

export default router;
