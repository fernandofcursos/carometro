import { Router, Request, Response } from "express";
import { z, ZodError } from "zod";
import {
  db,
  avisosTable,
  tiposAvisosInformesTable,
  avisosAnexosTable,
  avisosPublicosAlvoTable,
  eq, and, isNull, desc, or, sql, ne, inArray,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

const router = Router();

// ─── Multer / Uploads ─────────────────────────────────────────────────────────

const UPLOADS_DIR = new URL("../../uploads/avisos/", import.meta.url).pathname;
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "image/jpeg": "jpg",
  "image/png": "png",
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME[file.mimetype]) cb(null, true);
    else cb(new Error("Tipo de arquivo não permitido."));
  },
});

// ─── Schemas ──────────────────────────────────────────────────────────────────

const tipoBodySchema = z.object({
  nome:           z.string().min(1).max(100),
  descricao:      z.string().optional().nullable(),
  categoria:      z.enum(["aviso", "informe"]),
  ehCardapio:     z.boolean().default(false),
  perfisDestino:  z.array(z.string()).default([]),
  ativo:          z.boolean().default(true),
});

const avisoBodySchema = z.object({
  titulo:      z.string().min(1).max(200),
  conteudo:    z.string().min(1),
  tipo:        z.enum(["aviso", "informe"]),
  publicoAlvo: z.array(z.string().min(1)).min(1, "Selecione ao menos um público-alvo.").default(["todos"]),
  turmaId:     z.string().uuid().nullable().optional(),
  tipoId:      z.string().uuid().nullable().optional(),
  publicado:   z.boolean().default(false),
  dataInicio:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  dataFim:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function syncPublicosAlvo(avisoId: string, perfis: string[]) {
  await db.delete(avisosPublicosAlvoTable).where(eq(avisosPublicosAlvoTable.avisoId, avisoId));
  if (perfis.length > 0) {
    await db.insert(avisosPublicosAlvoTable).values(perfis.map((p) => ({ avisoId, perfil: p })));
  }
}

async function getPublicosAlvo(avisoIds: string[]): Promise<Record<string, string[]>> {
  if (avisoIds.length === 0) return {};
  const rows = await db.select().from(avisosPublicosAlvoTable)
    .where(inArray(avisosPublicosAlvoTable.avisoId, avisoIds));
  const map: Record<string, string[]> = {};
  for (const r of rows) {
    if (!map[r.avisoId]) map[r.avisoId] = [];
    map[r.avisoId].push(r.perfil);
  }
  return map;
}

function handleZodError(err: unknown, res: Response) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Dados inválidos.", detalhes: err.errors });
  }
  throw err;
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

// GET /tipos — listar tipos de avisos/informes
router.get("/tipos", requireAuth, async (req: Request, res: Response) => {
  try {
    const tipos = await db
      .select()
      .from(tiposAvisosInformesTable)
      .where(isNull(tiposAvisosInformesTable.deletadoEm))
      .orderBy(tiposAvisosInformesTable.nome);

    return res.json(tipos);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao listar tipos." });
  }
});

// POST /tipos — criar tipo
router.post("/tipos", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const data = tipoBodySchema.parse(req.body);
    const [tipo] = await db
      .insert(tiposAvisosInformesTable)
      .values(data)
      .returning();
    return res.status(201).json(tipo);
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    console.error(err);
    return res.status(500).json({ error: "Erro ao criar tipo." });
  }
});

// PUT /tipos/:id — editar tipo
router.put("/tipos/:id", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const data = tipoBodySchema.partial().parse(req.body);
    const [tipo] = await db
      .update(tiposAvisosInformesTable)
      .set({ ...data, atualizadoEm: new Date() })
      .where(and(eq(tiposAvisosInformesTable.id, String(req.params.id)), isNull(tiposAvisosInformesTable.deletadoEm)))
      .returning();
    if (!tipo) return res.status(404).json({ error: "Tipo não encontrado." });
    return res.json(tipo);
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    console.error(err);
    return res.status(500).json({ error: "Erro ao editar tipo." });
  }
});

// DELETE /tipos/:id — soft-delete tipo
router.delete("/tipos/:id", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const [tipo] = await db
      .update(tiposAvisosInformesTable)
      .set({ deletadoEm: new Date() })
      .where(and(eq(tiposAvisosInformesTable.id, String(req.params.id)), isNull(tiposAvisosInformesTable.deletadoEm)))
      .returning();
    if (!tipo) return res.status(404).json({ error: "Tipo não encontrado." });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao excluir tipo." });
  }
});

// ─── Avisos ───────────────────────────────────────────────────────────────────

// GET /avisos — listar avisos, query ?mes=YYYY-MM&excluirCardapio=true
router.get("/avisos", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const mes = req.query.mes as string | undefined;
    const excluirCardapio = req.query.excluirCardapio === "true";

    const conditions: ReturnType<typeof and>[] = [
      eq(avisosTable.tipo, "aviso"),
      isNull(avisosTable.deletadoEm),
    ];

    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      const [ano, m] = mes.split("-").map(Number);
      conditions.push(
        sql`EXTRACT(year FROM ${avisosTable.dataInicio}) = ${ano} AND EXTRACT(month FROM ${avisosTable.dataInicio}) = ${m}`
      );
    }

    if (excluirCardapio) {
      conditions.push(
        or(isNull(avisosTable.tipoId), sql`${avisosTable.tipoId} NOT IN (SELECT id FROM tipos_avisos_informes WHERE eh_cardapio = true AND deletado_em IS NULL)`)!
      );
    }

    const avisos = await db
      .select({
        id:           avisosTable.id,
        titulo:       avisosTable.titulo,
        conteudo:     avisosTable.conteudo,
        tipo:         avisosTable.tipo,
        publicoAlvo:  avisosTable.publicoAlvo,
        turmaId:      avisosTable.turmaId,
        autorId:      avisosTable.autorId,
        publicado:    avisosTable.publicado,
        dataInicio:   avisosTable.dataInicio,
        dataFim:      avisosTable.dataFim,
        tipoId:       avisosTable.tipoId,
        criadoEm:     avisosTable.criadoEm,
        atualizadoEm: avisosTable.atualizadoEm,
        tipoNome:     tiposAvisosInformesTable.nome,
        tipoEhCardapio: tiposAvisosInformesTable.ehCardapio,
      })
      .from(avisosTable)
      .leftJoin(tiposAvisosInformesTable, eq(avisosTable.tipoId, tiposAvisosInformesTable.id))
      .where(and(...conditions))
      .orderBy(desc(avisosTable.criadoEm));

    const ids = avisos.map((a) => a.id);
    const perfisMap = await getPublicosAlvo(ids);
    const result = avisos.map((a) => ({ ...a, publicosAlvo: perfisMap[a.id] ?? [a.publicoAlvo] }));
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao listar avisos." });
  }
});

// POST /avisos — criar aviso
router.post("/avisos", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const { publicoAlvo: perfis, ...rest } = avisoBodySchema.parse({ ...req.body, tipo: "aviso" });
    const autorId = (req as any).user?.id ?? null;
    const [aviso] = await db.insert(avisosTable).values({ ...rest, publicoAlvo: "todos", autorId }).returning();
    await syncPublicosAlvo(aviso.id, perfis);
    return res.status(201).json({ ...aviso, publicosAlvo: perfis });
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    console.error(err);
    return res.status(500).json({ error: "Erro ao criar aviso." });
  }
});

// PUT /avisos/:id — editar aviso
router.put("/avisos/:id", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const { publicoAlvo: perfis, ...rest } = avisoBodySchema.partial().parse(req.body);
    const [aviso] = await db
      .update(avisosTable)
      .set({ ...rest, atualizadoEm: new Date() })
      .where(and(eq(avisosTable.id, String(req.params.id)), eq(avisosTable.tipo, "aviso"), isNull(avisosTable.deletadoEm)))
      .returning();
    if (!aviso) return res.status(404).json({ error: "Aviso não encontrado." });
    if (perfis) await syncPublicosAlvo(aviso.id, perfis);
    const publicosAlvo = perfis ?? (await getPublicosAlvo([aviso.id]))[aviso.id] ?? [aviso.publicoAlvo];
    return res.json({ ...aviso, publicosAlvo });
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    console.error(err);
    return res.status(500).json({ error: "Erro ao editar aviso." });
  }
});

// DELETE /avisos/:id — soft-delete aviso
router.delete("/avisos/:id", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    // Verificar se é cardápio (exclusão física obrigatória para não deixar registros órfãos)
    const [aviso] = await db
      .select({ id: avisosTable.id, tipoId: avisosTable.tipoId })
      .from(avisosTable)
      .where(and(eq(avisosTable.id, id), eq(avisosTable.tipo, "aviso"), isNull(avisosTable.deletadoEm)))
      .limit(1);

    if (!aviso) return res.status(404).json({ error: "Aviso não encontrado." });

    const isCardapio = aviso.tipoId
      ? (await db
          .select({ ehCardapio: tiposAvisosInformesTable.ehCardapio })
          .from(tiposAvisosInformesTable)
          .where(eq(tiposAvisosInformesTable.id, aviso.tipoId))
          .limit(1))[0]?.ehCardapio ?? false
      : false;

    if (isCardapio) {
      await db.delete(avisosTable).where(eq(avisosTable.id, id));
    } else {
      await db.update(avisosTable).set({ deletadoEm: new Date() }).where(eq(avisosTable.id, id));
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao excluir aviso." });
  }
});

// ─── Informes ─────────────────────────────────────────────────────────────────

// GET /informes — listar informes, query ?mes=YYYY-MM
router.get("/informes", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const mes = req.query.mes as string | undefined;
    let whereClause;

    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      const [ano, m] = mes.split("-").map(Number);
      whereClause = and(
        eq(avisosTable.tipo, "informe"),
        isNull(avisosTable.deletadoEm),
        sql`EXTRACT(year FROM ${avisosTable.dataInicio}) = ${ano} AND EXTRACT(month FROM ${avisosTable.dataInicio}) = ${m}`
      );
    } else {
      whereClause = and(eq(avisosTable.tipo, "informe"), isNull(avisosTable.deletadoEm));
    }

    const informes = await db
      .select()
      .from(avisosTable)
      .where(whereClause)
      .orderBy(desc(avisosTable.criadoEm));

    const ids = informes.map((i) => i.id);
    const perfisMap = await getPublicosAlvo(ids);
    const result = informes.map((i) => ({ ...i, publicosAlvo: perfisMap[i.id] ?? [i.publicoAlvo] }));
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao listar informes." });
  }
});

// POST /informes — criar informe
router.post("/informes", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const { publicoAlvo: perfis, ...rest } = avisoBodySchema.parse({ ...req.body, tipo: "informe" });
    const autorId = (req as any).user?.id ?? null;
    const [informe] = await db.insert(avisosTable).values({ ...rest, publicoAlvo: "todos", autorId }).returning();
    await syncPublicosAlvo(informe.id, perfis);
    return res.status(201).json({ ...informe, publicosAlvo: perfis });
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    console.error(err);
    return res.status(500).json({ error: "Erro ao criar informe." });
  }
});

// PUT /informes/:id — editar informe
router.put("/informes/:id", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const { publicoAlvo: perfis, ...rest } = avisoBodySchema.partial().parse(req.body);
    const [informe] = await db
      .update(avisosTable)
      .set({ ...rest, atualizadoEm: new Date() })
      .where(and(eq(avisosTable.id, String(req.params.id)), eq(avisosTable.tipo, "informe"), isNull(avisosTable.deletadoEm)))
      .returning();
    if (!informe) return res.status(404).json({ error: "Informe não encontrado." });
    if (perfis) await syncPublicosAlvo(informe.id, perfis);
    const publicosAlvo = perfis ?? (await getPublicosAlvo([informe.id]))[informe.id] ?? [informe.publicoAlvo];
    return res.json({ ...informe, publicosAlvo });
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    console.error(err);
    return res.status(500).json({ error: "Erro ao editar informe." });
  }
});

// DELETE /informes/:id — soft-delete informe
router.delete("/informes/:id", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const [informe] = await db
      .update(avisosTable)
      .set({ deletadoEm: new Date() })
      .where(and(eq(avisosTable.id, String(req.params.id)), eq(avisosTable.tipo, "informe"), isNull(avisosTable.deletadoEm)))
      .returning();
    if (!informe) return res.status(404).json({ error: "Informe não encontrado." });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao excluir informe." });
  }
});

// ─── Feed ─────────────────────────────────────────────────────────────────────

// GET /cardapio?de=YYYY-MM-DD&ate=YYYY-MM-DD — cardápio semanal público (apenas autenticado)
// Também aceita ?mes=YYYY-MM como fallback (busca o mês inteiro)
router.get("/cardapio", requireAuth, async (req: Request, res: Response) => {
  try {
    const { de, ate, mes } = req.query as Record<string, string | undefined>;
    const conditions: ReturnType<typeof and>[] = [
      isNull(avisosTable.deletadoEm),
      eq(tiposAvisosInformesTable.ehCardapio, true),
    ];

    if (de && ate && /^\d{4}-\d{2}-\d{2}$/.test(de) && /^\d{4}-\d{2}-\d{2}$/.test(ate)) {
      conditions.push(sql`${avisosTable.dataInicio} BETWEEN ${de}::date AND ${ate}::date`);
    } else if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      const [ano, m] = mes.split("-").map(Number);
      conditions.push(
        sql`EXTRACT(year FROM ${avisosTable.dataInicio}) = ${ano} AND EXTRACT(month FROM ${avisosTable.dataInicio}) = ${m}`
      );
    }

    const rows = await db
      .select({
        id:          avisosTable.id,
        titulo:      avisosTable.titulo,
        conteudo:    avisosTable.conteudo,
        dataInicio:  avisosTable.dataInicio,
        tipoEhCardapio: tiposAvisosInformesTable.ehCardapio,
      })
      .from(avisosTable)
      .innerJoin(tiposAvisosInformesTable, eq(avisosTable.tipoId, tiposAvisosInformesTable.id))
      .where(and(...conditions))
      .orderBy(avisosTable.dataInicio);

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao buscar cardápio." });
  }
});

// GET /feed — feed para dashboards, query ?perfil=ROLE&limite=10
// Filtra por público-alvo via tabela de junção avisos_publicos_alvo:
// retorna avisos cujo perfil seja 'todos' ou corresponda ao perfil solicitado.
router.get("/feed", requireAuth, async (req: Request, res: Response) => {
  try {
    const limite = Math.min(Number(req.query.limite ?? 10), 100);
    const perfil = (req.query.perfil as string | undefined)?.trim() ?? "";
    const hoje = new Date().toISOString().slice(0, 10);

    // Condição de público-alvo: aviso deve ter 'todos' ou o perfil específico na junção
    const perfilCondition = perfil && perfil !== "todos"
      ? sql`EXISTS (
          SELECT 1 FROM avisos_publicos_alvo ap
          WHERE ap.aviso_id = ${avisosTable.id}
            AND ap.perfil IN ('todos', ${perfil})
        )`
      : sql`EXISTS (
          SELECT 1 FROM avisos_publicos_alvo ap
          WHERE ap.aviso_id = ${avisosTable.id}
        )`;

    const rows = await db
      .select({
        id:            avisosTable.id,
        titulo:        avisosTable.titulo,
        conteudo:      avisosTable.conteudo,
        tipo:          avisosTable.tipo,
        publicoAlvo:   avisosTable.publicoAlvo,
        turmaId:       avisosTable.turmaId,
        autorId:       avisosTable.autorId,
        publicado:     avisosTable.publicado,
        dataInicio:    avisosTable.dataInicio,
        dataFim:       avisosTable.dataFim,
        tipoId:        avisosTable.tipoId,
        criadoEm:      avisosTable.criadoEm,
        atualizadoEm:  avisosTable.atualizadoEm,
        tipoNome:      tiposAvisosInformesTable.nome,
        tipoCategoria: tiposAvisosInformesTable.categoria,
        perfisDestino: tiposAvisosInformesTable.perfisDestino,
        ehCardapio:    tiposAvisosInformesTable.ehCardapio,
      })
      .from(avisosTable)
      .leftJoin(tiposAvisosInformesTable, eq(avisosTable.tipoId, tiposAvisosInformesTable.id))
      .where(
        and(
          eq(avisosTable.publicado, true),
          isNull(avisosTable.deletadoEm),
          or(
            isNull(tiposAvisosInformesTable.ehCardapio),
            eq(tiposAvisosInformesTable.ehCardapio, false)
          ),
          or(
            isNull(avisosTable.dataInicio),
            sql`${avisosTable.dataInicio} <= ${hoje}::date`
          ),
          or(
            isNull(avisosTable.dataFim),
            sql`${avisosTable.dataFim} >= ${hoje}::date`
          ),
          perfilCondition
        )
      )
      .orderBy(desc(avisosTable.criadoEm))
      .limit(limite);

    // Enriquecer com anexos (id, nomeOriginal, mimeType)
    const avisoIds = rows.map((r) => r.id);
    let anexosPorAviso: Record<string, { id: string; nomeOriginal: string; mimeType: string }[]> = {};
    if (avisoIds.length > 0) {
      const anexos = await db
        .select({
          avisoId:      avisosAnexosTable.avisoId,
          id:           avisosAnexosTable.id,
          nomeOriginal: avisosAnexosTable.nomeOriginal,
          mimeType:     avisosAnexosTable.mimeType,
        })
        .from(avisosAnexosTable)
        .where(inArray(avisosAnexosTable.avisoId, avisoIds));
      for (const a of anexos) {
        if (!anexosPorAviso[a.avisoId]) anexosPorAviso[a.avisoId] = [];
        anexosPorAviso[a.avisoId].push({ id: a.id, nomeOriginal: a.nomeOriginal, mimeType: a.mimeType });
      }
    }

    return res.json(rows.map((r) => ({ ...r, anexos: anexosPorAviso[r.id] ?? [] })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao buscar feed." });
  }
});

// ─── Anexos ───────────────────────────────────────────────────────────────────

// POST /avisos/:id/anexos — upload de anexo
router.post("/avisos/:id/anexos", requireAuth, requirePermissao("avisos:manage"),
  upload.single("arquivo"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Arquivo não enviado." });
      const ext = ALLOWED_MIME[req.file.mimetype];
      const nomeArquivo = `${randomUUID()}.${ext}`;
      fs.writeFileSync(path.join(UPLOADS_DIR, nomeArquivo), req.file.buffer);
      const [anexo] = await db.insert(avisosAnexosTable).values({
        avisoId: String(req.params.id),
        nomeOriginal: req.file.originalname,
        nomeArquivo,
        mimeType: req.file.mimetype,
        tamanho: req.file.size,
      }).returning();
      return res.status(201).json(anexo);
    } catch (err: any) {
      if (err.message === "Tipo de arquivo não permitido.") return res.status(415).json({ error: err.message });
      if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Arquivo muito grande. Máximo 2 MB." });
      console.error(err);
      return res.status(500).json({ error: "Erro ao salvar anexo." });
    }
  }
);

// GET /avisos/:id/anexos — listar anexos
router.get("/avisos/:id/anexos", requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(avisosAnexosTable)
      .where(eq(avisosAnexosTable.avisoId, String(req.params.id)))
      .orderBy(avisosAnexosTable.criadoEm);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao listar anexos." });
  }
});

// GET /anexos/:id/arquivo — download/visualização (autenticado)
router.get("/anexos/:id/arquivo", requireAuth, async (req: Request, res: Response) => {
  try {
    const [anexo] = await db.select().from(avisosAnexosTable)
      .where(eq(avisosAnexosTable.id, String(req.params.id))).limit(1);
    if (!anexo) return res.status(404).json({ error: "Anexo não encontrado." });
    const filePath = path.join(UPLOADS_DIR, anexo.nomeArquivo);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Arquivo não encontrado no servidor." });
    res.setHeader("Content-Type", anexo.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(anexo.nomeOriginal)}"`);
    res.sendFile(filePath);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao servir arquivo." });
  }
});

// DELETE /anexos/:id — excluir anexo (físico)
router.delete("/anexos/:id", requireAuth, requirePermissao("avisos:manage"), async (req: Request, res: Response) => {
  try {
    const [anexo] = await db.delete(avisosAnexosTable)
      .where(eq(avisosAnexosTable.id, String(req.params.id))).returning();
    if (!anexo) return res.status(404).json({ error: "Anexo não encontrado." });
    const filePath = path.join(UPLOADS_DIR, anexo.nomeArquivo);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao excluir anexo." });
  }
});

export default router;
