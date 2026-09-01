import { Router, Request, Response } from "express";
import { createHmac, createHash } from "crypto";
import {
  db,
  usuariosTable,
  estudantesTable,
  turmasTable,
  cursosTable,
  turnosTable,
  turmaTurnosTable,
  ocorrenciasTable,
  tiposOcorrenciasTable,
  carteirasTable,
  responsaveisEstudantesTable,
  cartoesSaidaTable,
  atestadosMedicosTable,
  matriculasTable,
  disciplinaOfertasTable,
  disciplinasTable,
  eq, and, isNull, inArray,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { getChaveEncriptacao } from "../lib/crypto.js";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const router = Router();
router.use(requireAuth);

const HMAC_KEY = process.env.SESSION_SECRET ?? "carometro-secret";

// ── helpers ───────────────────────────────────────────────────────────────────

function gerarTokenCartaoSaida(cartaoId: string, estudanteId: string, dataSaida: string): string {
  const payload = JSON.stringify({ cartaoId, estudanteId, dataSaida, ts: Date.now() });
  const encoded = Buffer.from(payload).toString("base64url");
  const sig     = createHmac("sha256", HMAC_KEY).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

function criptografarArquivo(dadosBase64: string): {
  dadosCriptografados: Buffer; iv: string; hash: string; mimeType: string; tamanhoBytes: number;
} {
  const match = dadosBase64.match(/^data:(.+);base64,(.+)$/);
  const mimeType  = match ? match[1] : "application/pdf";
  const rawBase64 = match ? match[2] : dadosBase64;
  const dadosBrutos = Buffer.from(rawBase64, "base64");
  const ivBuf  = randomBytes(16);
  const chave  = getChaveEncriptacao();
  const cipher = createCipheriv("aes-256-cbc", chave, ivBuf);
  const dadosCriptografados = Buffer.concat([cipher.update(dadosBrutos), cipher.final()]);
  const hash = createHash("sha256").update(dadosBrutos).digest("hex");
  return {
    dadosCriptografados,
    iv:           ivBuf.toString("base64"),
    hash,
    mimeType,
    tamanhoBytes: dadosBrutos.length,
  };
}

function descriptografarArquivo(dados: Buffer, ivBase64: string): Buffer {
  const iv    = Buffer.from(ivBase64, "base64");
  const chave = getChaveEncriptacao();
  const decipher = createDecipheriv("aes-256-cbc", chave, iv);
  return Buffer.concat([decipher.update(dados), decipher.final()]);
}

async function getEstudantesDoResponsavel(usuarioId: string) {
  return db
    .select({ estudanteId: responsaveisEstudantesTable.estudanteId })
    .from(responsaveisEstudantesTable)
    .where(eq(responsaveisEstudantesTable.usuarioId, usuarioId));
}

// ── GET /api/portal-responsavel/me — dados do responsável e filhos vinculados ─
router.get("/me", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;

    const [usuario] = await db
      .select({ id: usuariosTable.id, nome: usuariosTable.nome, fotoId: usuariosTable.fotoId })
      .from(usuariosTable)
      .where(and(eq(usuariosTable.id, usuarioId), isNull(usuariosTable.deletadoEm)));

    if (!usuario) return res.status(404).json({ error: "Usuário não encontrado." });

    const vinculos = await getEstudantesDoResponsavel(usuarioId);
    if (!vinculos.length) {
      return res.json({
        usuario: { ...usuario, fotoUrl: usuario.fotoId ? `/api/fotos/${usuario.fotoId}` : null },
        estudantes: [],
      });
    }

    const estIds = vinculos.map((v) => v.estudanteId);

    const estudantes = await db
      .select({
        id:             estudantesTable.id,
        nome:           estudantesTable.nome,
        registro:       estudantesTable.registro,
        fotoId:         estudantesTable.fotoId,
        turmaId:        estudantesTable.turmaId,
        turmaSigla:     turmasTable.sigla,
        turmaDescricao: turmasTable.descricao,
        cursoNome:      cursosTable.nome,
        moduloMenor:    cursosTable.moduloMenor,
      })
      .from(estudantesTable)
      .innerJoin(turmasTable, eq(estudantesTable.turmaId, turmasTable.id))
      .innerJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
      .where(inArray(estudantesTable.id, estIds));

    // Turnos para cada turma
    const turmaIds = [...new Set(estudantes.map((e) => e.turmaId))];
    const turnoRows = turmaIds.length > 0
      ? await db
          .select({ turmaId: turmaTurnosTable.turmaId, id: turnosTable.id, nome: turnosTable.nome })
          .from(turmaTurnosTable)
          .innerJoin(turnosTable, eq(turmaTurnosTable.turnoId, turnosTable.id))
          .where(inArray(turmaTurnosTable.turmaId, turmaIds))
      : [];

    const turnosByTurma = new Map<string, { id: string; nome: string }[]>();
    for (const tr of turnoRows) {
      const arr = turnosByTurma.get(tr.turmaId) ?? [];
      arr.push({ id: tr.id, nome: tr.nome });
      turnosByTurma.set(tr.turmaId, arr);
    }

    const resultado = estudantes.map((e) => ({
      ...e,
      fotoUrl: e.fotoId ? `/api/fotos/${e.fotoId}` : null,
      turnos:  turnosByTurma.get(e.turmaId) ?? [],
    }));

    res.json({
      usuario: { ...usuario, fotoUrl: usuario.fotoId ? `/api/fotos/${usuario.fotoId}` : null },
      estudantes: resultado,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar dados" });
  }
});

// ── GET /api/portal-responsavel/ocorrencias/:estudanteId ─────────────────────
router.get("/ocorrencias/:estudanteId", async (req: Request, res: Response) => {
  try {
    const usuarioId   = req.usuarioId!;
    const estudanteId = req.params.estudanteId;

    // Verificar vínculo
    const [vinculo] = await db
      .select({ id: responsaveisEstudantesTable.id })
      .from(responsaveisEstudantesTable)
      .where(and(
        eq(responsaveisEstudantesTable.usuarioId, usuarioId),
        eq(responsaveisEstudantesTable.estudanteId, estudanteId),
      ));
    if (!vinculo) return res.status(403).json({ error: "Acesso negado a este estudante." });

    const rows = await db
      .select({
        id:                      ocorrenciasTable.id,
        tipoOcorrenciaDescricao: tiposOcorrenciasTable.descricao,
        dataOcorrencia:          ocorrenciasTable.dataOcorrencia,
        observacao:              ocorrenciasTable.observacao,
        cienteEm:                ocorrenciasTable.cienteEm,
        cientePorId:             ocorrenciasTable.cientePorId,
      })
      .from(ocorrenciasTable)
      .innerJoin(tiposOcorrenciasTable, eq(ocorrenciasTable.tipoOcorrenciaId, tiposOcorrenciasTable.id))
      .where(and(eq(ocorrenciasTable.estudanteId, estudanteId), isNull(ocorrenciasTable.deletadoEm)))
      .orderBy(ocorrenciasTable.dataOcorrencia);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar ocorrências" });
  }
});

// ── POST /api/portal-responsavel/ocorrencias/:id/ciencia ─────────────────────
// Responsável SEMPRE pode dar ciência (independente de idade)
router.post("/ocorrencias/:id/ciencia", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;

    const [ocr] = await db
      .select({ id: ocorrenciasTable.id, estudanteId: ocorrenciasTable.estudanteId, cienteEm: ocorrenciasTable.cienteEm })
      .from(ocorrenciasTable)
      .where(eq(ocorrenciasTable.id, req.params.id));

    if (!ocr) return res.status(404).json({ error: "Ocorrência não encontrada." });

    // Verificar que o responsável está vinculado ao estudante
    const [vinculo] = await db
      .select({ id: responsaveisEstudantesTable.id })
      .from(responsaveisEstudantesTable)
      .where(and(
        eq(responsaveisEstudantesTable.usuarioId, usuarioId),
        eq(responsaveisEstudantesTable.estudanteId, ocr.estudanteId),
      ));
    if (!vinculo) return res.status(403).json({ error: "Acesso negado." });

    if (ocr.cienteEm) return res.status(409).json({ error: "Ciência já registrada." });

    await db
      .update(ocorrenciasTable)
      .set({ cienteEm: new Date(), cientePorId: usuarioId })
      .where(eq(ocorrenciasTable.id, ocr.id));

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao registrar ciência" });
  }
});

// ── GET /api/portal-responsavel/carteiras/:estudanteId ───────────────────────
router.get("/carteiras/:estudanteId", async (req: Request, res: Response) => {
  try {
    const usuarioId   = req.usuarioId!;
    const estudanteId = req.params.estudanteId;

    const [vinculo] = await db
      .select({ id: responsaveisEstudantesTable.id })
      .from(responsaveisEstudantesTable)
      .where(and(
        eq(responsaveisEstudantesTable.usuarioId, usuarioId),
        eq(responsaveisEstudantesTable.estudanteId, estudanteId),
      ));
    if (!vinculo) return res.status(403).json({ error: "Acesso negado." });

    // Buscar usuarioId do estudante
    const [est] = await db
      .select({ usuarioId: estudantesTable.usuarioId })
      .from(estudantesTable)
      .where(eq(estudantesTable.id, estudanteId));

    if (!est?.usuarioId) return res.json([]);

    const rows = await db
      .select({ id: carteirasTable.id, tipo: carteirasTable.tipo, ano: carteirasTable.ano, semestre: carteirasTable.semestre, status: carteirasTable.status, token: carteirasTable.token })
      .from(carteirasTable)
      .where(eq(carteirasTable.usuarioId, est.usuarioId))
      .orderBy(carteirasTable.ano, carteirasTable.semestre);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar carteiras" });
  }
});

// ── POST /api/portal-responsavel/cartao-saida — solicitar cartão de saída ────
router.post("/cartao-saida", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;
    const { estudanteId, dataSaida, horarioSaida, motivo } = req.body as {
      estudanteId: string; dataSaida: string; horarioSaida?: string; motivo?: string;
    };

    if (!estudanteId || !dataSaida) {
      return res.status(400).json({ error: "estudanteId e dataSaida são obrigatórios." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataSaida)) {
      return res.status(400).json({ error: "dataSaida deve estar no formato YYYY-MM-DD." });
    }

    const [vinculo] = await db
      .select({ id: responsaveisEstudantesTable.id })
      .from(responsaveisEstudantesTable)
      .where(and(
        eq(responsaveisEstudantesTable.usuarioId, usuarioId),
        eq(responsaveisEstudantesTable.estudanteId, estudanteId),
      ));
    if (!vinculo) return res.status(403).json({ error: "Acesso negado a este estudante." });

    const [cartao] = await db
      .insert(cartoesSaidaTable)
      .values({ estudanteId, responsavelId: usuarioId, dataSaida, horarioSaida: horarioSaida ?? null, motivo: motivo ?? null })
      .returning();

    res.status(201).json(cartao);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao solicitar cartão de saída" });
  }
});

// ── GET /api/portal-responsavel/cartoes-saida/:estudanteId ───────────────────
router.get("/cartoes-saida/:estudanteId", async (req: Request, res: Response) => {
  try {
    const usuarioId   = req.usuarioId!;
    const estudanteId = req.params.estudanteId;

    const [vinculo] = await db
      .select({ id: responsaveisEstudantesTable.id })
      .from(responsaveisEstudantesTable)
      .where(and(
        eq(responsaveisEstudantesTable.usuarioId, usuarioId),
        eq(responsaveisEstudantesTable.estudanteId, estudanteId),
      ));
    if (!vinculo) return res.status(403).json({ error: "Acesso negado." });

    const rows = await db
      .select({
        id: cartoesSaidaTable.id, dataSaida: cartoesSaidaTable.dataSaida,
        horarioSaida: cartoesSaidaTable.horarioSaida, motivo: cartoesSaidaTable.motivo,
        status: cartoesSaidaTable.status, aprovadoEm: cartoesSaidaTable.aprovadoEm,
        observacaoAprovador: cartoesSaidaTable.observacaoAprovador, token: cartoesSaidaTable.token,
        criadoEm: cartoesSaidaTable.criadoEm,
      })
      .from(cartoesSaidaTable)
      .where(and(eq(cartoesSaidaTable.estudanteId, estudanteId), eq(cartoesSaidaTable.responsavelId, usuarioId)))
      .orderBy(cartoesSaidaTable.dataSaida);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar cartões de saída" });
  }
});

// ── POST /api/portal-responsavel/atestado — enviar atestado médico ────────────
router.post("/atestado", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;
    const { estudanteId, dataInicio, dataFim, nomeArquivo, arquivoBase64 } = req.body as {
      estudanteId: string; dataInicio: string; dataFim?: string;
      nomeArquivo: string; arquivoBase64: string;
    };

    if (!estudanteId || !dataInicio || !nomeArquivo || !arquivoBase64) {
      return res.status(400).json({ error: "estudanteId, dataInicio, nomeArquivo e arquivoBase64 são obrigatórios." });
    }

    const [vinculo] = await db
      .select({ id: responsaveisEstudantesTable.id })
      .from(responsaveisEstudantesTable)
      .where(and(
        eq(responsaveisEstudantesTable.usuarioId, usuarioId),
        eq(responsaveisEstudantesTable.estudanteId, estudanteId),
      ));
    if (!vinculo) return res.status(403).json({ error: "Acesso negado." });

    // Criptografar antes de armazenar (dado sensível — LGPD art. 11)
    const { dadosCriptografados, iv, hash, mimeType, tamanhoBytes } = criptografarArquivo(arquivoBase64);

    const [atestado] = await db
      .insert(atestadosMedicosTable)
      .values({
        estudanteId, responsavelId: usuarioId,
        dataInicio, dataFim: dataFim ?? null,
        nomeArquivo, mimeType, tamanhoBytes,
        iv, hashIntegridade: hash,
        dados: dadosCriptografados,
      })
      .returning({ id: atestadosMedicosTable.id, criadoEm: atestadosMedicosTable.criadoEm });

    res.status(201).json({ ok: true, id: atestado.id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao enviar atestado" });
  }
});

// ── GET /api/portal-responsavel/atestados/:estudanteId ───────────────────────
router.get("/atestados/:estudanteId", async (req: Request, res: Response) => {
  try {
    const usuarioId   = req.usuarioId!;
    const estudanteId = req.params.estudanteId;

    const [vinculo] = await db
      .select({ id: responsaveisEstudantesTable.id })
      .from(responsaveisEstudantesTable)
      .where(and(
        eq(responsaveisEstudantesTable.usuarioId, usuarioId),
        eq(responsaveisEstudantesTable.estudanteId, estudanteId),
      ));
    if (!vinculo) return res.status(403).json({ error: "Acesso negado." });

    const rows = await db
      .select({
        id: atestadosMedicosTable.id, dataInicio: atestadosMedicosTable.dataInicio,
        dataFim: atestadosMedicosTable.dataFim, nomeArquivo: atestadosMedicosTable.nomeArquivo,
        mimeType: atestadosMedicosTable.mimeType, tamanhoBytes: atestadosMedicosTable.tamanhoBytes,
        criadoEm: atestadosMedicosTable.criadoEm,
      })
      .from(atestadosMedicosTable)
      .where(and(
        eq(atestadosMedicosTable.estudanteId, estudanteId),
        eq(atestadosMedicosTable.responsavelId, usuarioId),
      ))
      .orderBy(atestadosMedicosTable.dataInicio);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar atestados" });
  }
});

// ── GET /api/portal-responsavel/atestados/:estudanteId/:id/download ───────────
router.get("/atestados/:estudanteId/:id/download", async (req: Request, res: Response) => {
  try {
    const usuarioId   = req.usuarioId!;
    const estudanteId = req.params.estudanteId;

    const [vinculo] = await db
      .select({ id: responsaveisEstudantesTable.id })
      .from(responsaveisEstudantesTable)
      .where(and(
        eq(responsaveisEstudantesTable.usuarioId, usuarioId),
        eq(responsaveisEstudantesTable.estudanteId, estudanteId),
      ));
    if (!vinculo) return res.status(403).json({ error: "Acesso negado." });

    const [atestado] = await db
      .select()
      .from(atestadosMedicosTable)
      .where(and(eq(atestadosMedicosTable.id, req.params.id), eq(atestadosMedicosTable.estudanteId, estudanteId)));

    if (!atestado) return res.status(404).json({ error: "Atestado não encontrado." });

    const dadosBrutos = descriptografarArquivo(atestado.dados as Buffer, atestado.iv);
    res.set("Content-Type", atestado.mimeType);
    res.set("Content-Disposition", `attachment; filename="${encodeURIComponent(atestado.nomeArquivo)}"`);
    res.send(dadosBrutos);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao baixar atestado" });
  }
});

// ── GET /api/portal-responsavel/dashboard ─────────────────────────────────────
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;
    const DIA_NOME = ["", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];

    const hoje = new Date();
    const hojeStr = hoje.toISOString().substring(0, 10);
    const diaJS = hoje.getDay();
    const diaSemana = diaJS === 0 ? 7 : diaJS;
    const anoAtual = hoje.getFullYear();
    const semestreAtual: 1 | 2 = hoje.getMonth() < 6 ? 1 : 2;

    // Estudantes vinculados
    const vinculados = await db
      .select({
        id:             estudantesTable.id,
        nome:           estudantesTable.nome,
        fotoId:         estudantesTable.fotoId,
        fotoStorageKey: estudantesTable.fotoStorageKey,
        usuarioId:      estudantesTable.usuarioId,
        turmaId:        estudantesTable.turmaId,
        turmaSigla:     turmasTable.sigla,
        cursoNome:      cursosTable.nome,
      })
      .from(responsaveisEstudantesTable)
      .innerJoin(estudantesTable, eq(estudantesTable.id, responsaveisEstudantesTable.estudanteId))
      .innerJoin(turmasTable, eq(turmasTable.id, estudantesTable.turmaId))
      .innerJoin(cursosTable, eq(cursosTable.id, turmasTable.cursoId))
      .where(and(
        eq(responsaveisEstudantesTable.usuarioId, usuarioId),
        isNull(estudantesTable.deletadoEm),
      ));

    if (vinculados.length === 0) {
      return res.json({ hoje: hojeStr, diaSemana, estudantes: [], cardapioDisponivel: false, cardapio: [] });
    }

    const estudanteIds = vinculados.map((e) => e.id);
    const estudanteUsuarioIds = vinculados.map((e) => e.usuarioId).filter(Boolean) as string[];

    // Ocorrências em lote para todos os estudantes
    const ocrsRaw = await db
      .select({
        estudanteId: ocorrenciasTable.estudanteId,
        id:          ocorrenciasTable.id,
        tipoId:      ocorrenciasTable.tipoOcorrenciaId,
        tipoDesc:    tiposOcorrenciasTable.descricao,
        cienteEm:    ocorrenciasTable.cienteEm,
      })
      .from(ocorrenciasTable)
      .innerJoin(tiposOcorrenciasTable, eq(ocorrenciasTable.tipoOcorrenciaId, tiposOcorrenciasTable.id))
      .where(and(inArray(ocorrenciasTable.estudanteId, estudanteIds), isNull(ocorrenciasTable.deletadoEm)));

    // Agrupar ocorrências por estudanteId
    const ocMap = new Map<string, Map<string, { tipoDescricao: string; total: number; semCiencia: number; ids: string[] }>>();
    for (const o of ocrsRaw) {
      if (!ocMap.has(o.estudanteId)) ocMap.set(o.estudanteId, new Map());
      const m = ocMap.get(o.estudanteId)!;
      if (!m.has(o.tipoId)) m.set(o.tipoId, { tipoDescricao: o.tipoDesc ?? "", total: 0, semCiencia: 0, ids: [] });
      const g = m.get(o.tipoId)!;
      g.total++;
      if (!o.cienteEm) { g.semCiencia++; g.ids.push(o.id); }
    }

    // Agenda em lote para todos os estudantes
    let agendaDisponivel = false;
    const agendaMap = new Map<string, Map<number, { horaInicio: string; horaFim: string; disciplinaNome: string; sala: string | null }[]>>();
    try {
      const { horariosAulasTable } = await import("@workspace/db/schema") as any;
      if (horariosAulasTable && estudanteUsuarioIds.length > 0) {
        const aulas = await db
          .select({
            usuarioId:      matriculasTable.usuarioId,
            dia:            horariosAulasTable.diaSemana,
            horaInicio:     horariosAulasTable.horaInicio,
            horaFim:        horariosAulasTable.horaFim,
            disciplinaNome: disciplinasTable.nome,
            sala:           horariosAulasTable.sala,
          })
          .from(matriculasTable)
          .innerJoin(
            horariosAulasTable,
            and(
              eq(horariosAulasTable.turmaId, matriculasTable.turmaId),
              eq(horariosAulasTable.ano, anoAtual),
              eq(horariosAulasTable.semestre, semestreAtual),
            ),
          )
          .leftJoin(disciplinaOfertasTable, eq(disciplinaOfertasTable.id, horariosAulasTable.disciplinaOfertaId))
          .leftJoin(disciplinasTable, eq(disciplinasTable.id, disciplinaOfertasTable.disciplinaId))
          .where(and(
            inArray(matriculasTable.usuarioId, estudanteUsuarioIds),
            eq(matriculasTable.ativo, true),
            isNull(matriculasTable.deletadoEm),
          ));

        agendaDisponivel = true;
        for (const a of aulas) {
          if (!a.usuarioId) continue;
          if (!agendaMap.has(a.usuarioId)) agendaMap.set(a.usuarioId, new Map());
          const byDia = agendaMap.get(a.usuarioId)!;
          if (!byDia.has(a.dia)) byDia.set(a.dia, []);
          byDia.get(a.dia)!.push({
            horaInicio:     String(a.horaInicio).slice(0, 5),
            horaFim:        String(a.horaFim).slice(0, 5),
            disciplinaNome: a.disciplinaNome ?? "—",
            sala:           a.sala,
          });
        }
      }
    } catch { /* horarios_aulas ainda não existe */ }

    // Cardápio da semana (único — compartilhado por todos)
    let cardapioDisponivel = false;
    let cardapio: { dia: number; diaNome: string; data: string; itens: { refeicao: string; descricao: string }[] }[] = [];
    try {
      const { cardapiosTable } = await import("@workspace/db/schema") as any;
      if (cardapiosTable) {
        const { gte, lte } = await import("@workspace/db") as any;
        const seg = new Date(hoje);
        seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
        const sex = new Date(seg); sex.setDate(seg.getDate() + 4);
        const rows = await db
          .select({ data: cardapiosTable.data, refeicao: cardapiosTable.refeicao, descricao: cardapiosTable.descricao })
          .from(cardapiosTable)
          .where(and(
            gte(cardapiosTable.data, seg.toISOString().substring(0, 10)),
            lte(cardapiosTable.data, sex.toISOString().substring(0, 10)),
            eq(cardapiosTable.publicado, true),
          ));
        cardapioDisponivel = true;
        const byDia = new Map<number, { data: string; itens: { refeicao: string; descricao: string }[] }>();
        for (const c of rows) {
          const d = new Date(c.data + "T12:00:00"); const dia = d.getDay() === 0 ? 7 : d.getDay();
          if (!byDia.has(dia)) byDia.set(dia, { data: c.data, itens: [] });
          byDia.get(dia)!.itens.push({ refeicao: c.refeicao, descricao: c.descricao });
        }
        cardapio = [1, 2, 3, 4, 5]
          .filter((d) => byDia.has(d))
          .map((d) => ({ dia: d, diaNome: DIA_NOME[d], ...byDia.get(d)! }));
      }
    } catch { /* cardapios ainda não existe */ }

    // Montar resposta por estudante
    const estudantes = vinculados.map((e) => {
      const ocTipos = ocMap.get(e.id) ?? new Map();
      const resumo = Array.from(ocTipos.entries()).map(([tipoId, v]) => ({ tipoId, ...v }));
      const byDia = agendaMap.get(e.usuarioId ?? "") ?? new Map();
      const agenda = [1, 2, 3, 4, 5].map((d) => ({
        dia: d, diaNome: DIA_NOME[d],
        aulas: (byDia.get(d) ?? []).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio)),
      }));
      return {
        id:       e.id,
        nome:     e.nome,
        fotoUrl:  e.fotoId ? `/api/fotos/${e.fotoId}` : (e.fotoStorageKey ? `/api/estudantes/${e.id}/foto` : null),
        turmaSigla:  e.turmaSigla ?? "",
        cursoNome:   e.cursoNome ?? "",
        agendaDisponivel,
        agenda,
        ocorrencias: { resumo, totalGeral: resumo.reduce((s, r) => s + r.total, 0) },
      };
    });

    res.json({ hoje: hojeStr, diaSemana, estudantes, cardapioDisponivel, cardapio });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar dashboard" });
  }
});

// ── Rotas de gestão (coordenador) — vínculo responsável↔estudante ─────────────
// Registradas separadamente em index.ts via /api/responsaveis-estudantes

export { gerarTokenCartaoSaida };
export default router;
