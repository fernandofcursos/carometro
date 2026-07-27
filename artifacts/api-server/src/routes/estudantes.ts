import { Router, Request, Response } from "express";
import { z } from "zod";
import { db, estudantesTable, estudanteEmailsTable, turmasTable, cursosTable, turnosTable, eq, isNull, and, inArray, ilike, or } from "@workspace/db";
import {
  criptografarFoto,
  descriptografarFoto,
  verificarIntegridade,
} from "../lib/crypto.js";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

const insertEstudanteSchema = z.object({
  nome:      z.string().min(2).max(200),
  registro:  z.string().min(1).max(50),
  turmaId:   z.string().uuid(),
  observacao: z.string().max(300).optional().nullable(),
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
      .leftJoin(turnosTable, eq(turmasTable.turnoId, turnosTable.id))
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
      turmaSigla:     r.turmaSigla ?? "",
      turmaDescricao: r.turmaDescricao ?? "",
      turnoNome:      r.turnoNome ?? "",
      cursoNome:      r.cursoNome ?? "",
      criadoEm:       r.criadoEm.toISOString(),
      // fotoUrl como endpoint relativo — frontend busca a foto via img src
      fotoUrl:  r.fotoStorageKey ? `/api/estudantes/${r.id}/foto` : null,
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
    const [e] = await db
      .select({
        id: estudantesTable.id, nome: estudantesTable.nome, registro: estudantesTable.registro,
        observacao: estudantesTable.observacao, turmaId: estudantesTable.turmaId,
        fotoStorageKey: estudantesTable.fotoStorageKey, criadoEm: estudantesTable.criadoEm,
        turmaSigla: turmasTable.sigla, turmaDescricao: turmasTable.descricao,
        cursoNome: cursosTable.nome, turnoNome: turnosTable.nome,
        deletadoEm: estudantesTable.deletadoEm,
      })
      .from(estudantesTable)
      .leftJoin(turmasTable, eq(estudantesTable.turmaId, turmasTable.id))
      .leftJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
      .leftJoin(turnosTable, eq(turmasTable.turnoId, turnosTable.id))
      .where(eq(estudantesTable.id, String(req.params.id)));

    if (!e || e.deletadoEm) return res.status(404).json({ error: "Estudante não encontrado" });

    const emails = await db.select({ email: estudanteEmailsTable.email, tipo: estudanteEmailsTable.tipo })
      .from(estudanteEmailsTable).where(eq(estudanteEmailsTable.estudanteId, e.id));

    res.json({
      id: e.id, nome: e.nome, registro: e.registro, observacao: e.observacao ?? null,
      turmaId: e.turmaId, turmaSigla: e.turmaSigla ?? "", turmaDescricao: e.turmaDescricao ?? "",
      turnoNome: e.turnoNome ?? "", cursoNome: e.cursoNome ?? "",
      criadoEm: e.criadoEm.toISOString(),
      fotoUrl: e.fotoStorageKey ? `/api/estudantes/${e.id}/foto` : null,
      emails,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar estudante" });
  }
});

// GET /api/estudantes/:id/foto — servir foto descriptografada
router.get("/:id/foto", async (req: Request, res: Response) => {
  try {
    const [e] = await db
      .select({
        fotoDados: estudantesTable.fotoDados, fotoIv: estudantesTable.fotoIv,
        fotoMimeType: estudantesTable.fotoMimeType, fotoHashIntegridade: estudantesTable.fotoHashIntegridade,
      })
      .from(estudantesTable)
      .where(eq(estudantesTable.id, String(req.params.id)));

    if (!e?.fotoDados || !e.fotoIv) return res.status(404).end();

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

    let fotoFields = {};
    if (fotoBase64) {
      if (fotoBase64.length > 5_000_000) return res.status(413).json({ error: "Foto muito grande. Máximo: ~3.7MB" });
      const foto = criptografarFoto(fotoBase64);
      const { randomUUID } = await import("crypto");
      fotoFields = {
        fotoStorageKey: randomUUID(), fotoDados: foto.dadosCriptografados,
        fotoIv: foto.iv, fotoMimeType: foto.mimeType,
        fotoTamanhoBytes: foto.tamanhoBytes, fotoHashIntegridade: foto.hash,
      };
    }

    const [estudante] = await db.insert(estudantesTable).values({ ...data, ...fotoFields }).returning();

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
      fotoUrl: estudante.fotoStorageKey ? `/api/estudantes/${estudante.id}/foto` : null,
      emails: emails ?? [], turmaId: estudante.turmaId });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// POST /api/estudantes/:id/foto — atualizar foto
router.post("/:id/foto", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const { fotoBase64 } = z.object({ fotoBase64: z.string().min(1) }).parse(req.body);
    if (fotoBase64.length > 5_000_000) return res.status(413).json({ error: "Foto muito grande. Máximo: ~3.7MB" });

    const foto = criptografarFoto(fotoBase64);
    const { randomUUID } = await import("crypto");

    const [estudante] = await db
      .update(estudantesTable)
      .set({
        fotoStorageKey: randomUUID(), fotoDados: foto.dadosCriptografados,
        fotoIv: foto.iv, fotoMimeType: foto.mimeType,
        fotoTamanhoBytes: foto.tamanhoBytes, fotoHashIntegridade: foto.hash,
        atualizadoEm: new Date(),
      })
      .where(eq(estudantesTable.id, String(req.params.id)))
      .returning({ id: estudantesTable.id });

    if (!estudante) return res.status(404).json({ error: "Estudante não encontrado" });

    await registrarAuditoria({
      tabela: "estudantes", operacao: "UPDATE", registroId: estudante.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: `POST /api/estudantes/${String(req.params.id)}/foto`, metodoHttp: "POST", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.json({ ok: true, fotoUrl: `/api/estudantes/${estudante.id}/foto` });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// PUT /api/estudantes/:id — atualizar dados
router.put("/:id", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const { emails, ...data } = insertEstudanteSchema.partial().parse(req.body);
    const [estudante] = await db
      .update(estudantesTable)
      .set({ ...data, atualizadoEm: new Date() })
      .where(eq(estudantesTable.id, String(req.params.id)))
      .returning();
    if (!estudante) return res.status(404).json({ error: "Estudante não encontrado" });

    // Substituir e-mails se fornecidos
    if (emails !== undefined) {
      await db.delete(estudanteEmailsTable).where(eq(estudanteEmailsTable.estudanteId, estudante.id));
      if (emails.length > 0) {
        await db.insert(estudanteEmailsTable).values(
          emails.map((e) => ({ estudanteId: estudante.id, email: e.email, tipo: e.tipo }))
        );
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

    res.json({ id: estudante.id, nome: estudante.nome, registro: estudante.registro,
      fotoUrl: estudante.fotoStorageKey ? `/api/estudantes/${estudante.id}/foto` : null,
      emails: emailsSalvos });
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
