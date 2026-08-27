import { Router, Request, Response } from "express";
import { createHmac } from "crypto";
import {
  db,
  usuariosTable,
  matriculasTable,
  turmasTable,
  cursosTable,
  turnosTable,
  turmaTurnosTable,
  ocorrenciasTable,
  tiposOcorrenciasTable,
  disciplinasTable,
  disciplinaOfertasTable,
  usuarioDisciplinasTable,
  fotosTable,
  eq,
  and,
  isNull,
  inArray,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

// ── helpers ───────────────────────────────────────────────────────────────────

function calcularIdade(dataNascimento: string | null): number | null {
  if (!dataNascimento) return null;
  const hoje = new Date();
  const nasc  = new Date(dataNascimento);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

function isMaiorDeIdade(dataNascimento: string | null): boolean {
  const idade = calcularIdade(dataNascimento);
  return idade !== null && idade >= 18;
}

const HMAC_KEY = process.env.SESSION_SECRET ?? "carometro-secret";

function gerarTokenCartao(usuarioId: string, tipo: string, validade: string): string {
  const payload = JSON.stringify({ usuarioId, tipo, validade, ts: Date.now() });
  const encoded = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", HMAC_KEY).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

function verificarTokenCartao(token: string): { usuarioId: string; tipo: string; validade: string; ts: number } | null {
  try {
    const [encoded, sig] = token.split(".");
    if (!encoded || !sig) return null;
    const expected = createHmac("sha256", HMAC_KEY).update(encoded).digest("base64url");
    if (expected !== sig) return null;
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// ── GET /api/portal/me — dados próprios do estudante logado ───────────────────
router.get("/me", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;

    const [usuario] = await db
      .select({
        id:             usuariosTable.id,
        nome:           usuariosTable.nome,
        codigoAcesso:   usuariosTable.codigoAcesso,
        dataNascimento: usuariosTable.dataNascimento,
        fotoId:         usuariosTable.fotoId,
      })
      .from(usuariosTable)
      .where(and(eq(usuariosTable.id, usuarioId), isNull(usuariosTable.deletadoEm)));

    if (!usuario) return res.status(404).json({ error: "Usuário não encontrado." });

    // Matrículas ativas
    const matRows = await db
      .select({
        id:            matriculasTable.id,
        turmaId:       matriculasTable.turmaId,
        turmaSigla:    turmasTable.sigla,
        turmaDescricao: turmasTable.descricao,
        cursoId:       cursosTable.id,
        cursoNome:     cursosTable.nome,
        moduloMenor:   cursosTable.moduloMenor,
        registro:      matriculasTable.registro,
        ano:           matriculasTable.ano,
        semestre:      matriculasTable.semestre,
      })
      .from(matriculasTable)
      .innerJoin(turmasTable, eq(matriculasTable.turmaId, turmasTable.id))
      .innerJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
      .where(and(eq(matriculasTable.usuarioId, usuarioId), eq(matriculasTable.ativo, true), isNull(matriculasTable.deletadoEm)));

    // Turnos das turmas
    const turmaIds = [...new Set(matRows.map((m) => m.turmaId))];
    const turnoRows = turmaIds.length > 0
      ? await db
          .select({ turmaId: turmaTurnosTable.turmaId, turnoId: turnosTable.id, turnoNome: turnosTable.nome })
          .from(turmaTurnosTable)
          .innerJoin(turnosTable, eq(turmaTurnosTable.turnoId, turnosTable.id))
          .where(inArray(turmaTurnosTable.turmaId, turmaIds))
      : [];

    const turnosByTurma = new Map<string, { id: string; nome: string }[]>();
    for (const tr of turnoRows) {
      const arr = turnosByTurma.get(tr.turmaId) ?? [];
      arr.push({ id: tr.turnoId, nome: tr.turnoNome });
      turnosByTurma.set(tr.turmaId, arr);
    }

    const matriculas = matRows.map((m) => ({ ...m, turnos: turnosByTurma.get(m.turmaId) ?? [] }));

    // Disciplinas cursadas
    const discRows = await db
      .select({
        disciplinaOfertaId: usuarioDisciplinasTable.disciplinaOfertaId,
        disciplinaNome:     disciplinasTable.nome,
        cursoNome:          cursosTable.nome,
        turnoNome:          turnosTable.nome,
      })
      .from(usuarioDisciplinasTable)
      .innerJoin(disciplinaOfertasTable, eq(usuarioDisciplinasTable.disciplinaOfertaId, disciplinaOfertasTable.id))
      .innerJoin(disciplinasTable, eq(disciplinaOfertasTable.disciplinaId, disciplinasTable.id))
      .innerJoin(cursosTable, eq(disciplinaOfertasTable.cursoId, cursosTable.id))
      .innerJoin(turnosTable, eq(disciplinaOfertasTable.turnoId, turnosTable.id))
      .where(eq(usuarioDisciplinasTable.usuarioId, usuarioId));

    const dnStr = usuario.dataNascimento
      ? (usuario.dataNascimento instanceof Date
          ? usuario.dataNascimento.toISOString().substring(0, 10)
          : String(usuario.dataNascimento))
      : null;

    res.json({
      usuario: {
        id:             usuario.id,
        nome:           usuario.nome,
        codigoAcesso:   usuario.codigoAcesso,
        dataNascimento: dnStr,
        fotoUrl:        usuario.fotoId ? `/api/fotos/${usuario.fotoId}` : null,
        isMaior:        isMaiorDeIdade(dnStr),
      },
      matriculas,
      disciplinas: discRows,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar dados" });
  }
});

// ── GET /api/portal/ocorrencias — ocorrências do estudante logado ─────────────
router.get("/ocorrencias", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;

    // Buscar estudanteId vinculado ao usuário
    const estRows = await db
      .select({ id: matriculasTable.usuarioId })
      .from(matriculasTable)
      .where(eq(matriculasTable.usuarioId, usuarioId))
      .limit(1);

    // Buscar ocorrências via estudante_id = estudante.id onde estudante.usuario_id = eu
    // Precisamos do estudante na tabela estudantes
    const { estudantesTable } = await import("@workspace/db");
    const [est] = await db
      .select({ id: estudantesTable.id })
      .from(estudantesTable)
      .where(eq(estudantesTable.usuarioId, usuarioId));

    if (!est) return res.json([]);

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
      .where(and(eq(ocorrenciasTable.estudanteId, est.id), isNull(ocorrenciasTable.deletadoEm)))
      .orderBy(ocorrenciasTable.dataOcorrencia);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar ocorrências" });
  }
});

// ── POST /api/portal/ocorrencias/:id/ciencia — dar ciência (somente maiores) ─
router.post("/ocorrencias/:id/ciencia", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;

    // Verificar maioridade
    const [usuario] = await db
      .select({ dataNascimento: usuariosTable.dataNascimento })
      .from(usuariosTable)
      .where(eq(usuariosTable.id, usuarioId));

    const dnStr = usuario?.dataNascimento
      ? (usuario.dataNascimento instanceof Date
          ? usuario.dataNascimento.toISOString().substring(0, 10)
          : String(usuario.dataNascimento))
      : null;

    if (!isMaiorDeIdade(dnStr)) {
      return res.status(403).json({ error: "Somente estudantes maiores de 18 anos podem dar ciência em ocorrências." });
    }

    // Verificar que a ocorrência pertence ao estudante logado
    const { estudantesTable } = await import("@workspace/db");
    const [est] = await db
      .select({ id: estudantesTable.id })
      .from(estudantesTable)
      .where(eq(estudantesTable.usuarioId, usuarioId));

    if (!est) return res.status(403).json({ error: "Estudante não encontrado." });

    const [ocr] = await db
      .select({ id: ocorrenciasTable.id, cienteEm: ocorrenciasTable.cienteEm })
      .from(ocorrenciasTable)
      .where(and(eq(ocorrenciasTable.id, req.params.id), eq(ocorrenciasTable.estudanteId, est.id)));

    if (!ocr) return res.status(404).json({ error: "Ocorrência não encontrada." });
    if (ocr.cienteEm) return res.status(409).json({ error: "Ciência já registrada nesta ocorrência." });

    await db
      .update(ocorrenciasTable)
      .set({ cienteEm: new Date(), cientePorId: usuarioId })
      .where(eq(ocorrenciasTable.id, ocr.id));

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao registrar ciência" });
  }
});

// ── GET /api/portal/carteira — token assinado para a carteira de estudante ───
router.get("/carteira", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;

    const [mat] = await db
      .select({ ano: matriculasTable.ano, semestre: matriculasTable.semestre })
      .from(matriculasTable)
      .where(and(eq(matriculasTable.usuarioId, usuarioId), eq(matriculasTable.ativo, true), isNull(matriculasTable.deletadoEm)))
      .orderBy(matriculasTable.ano, matriculasTable.semestre)
      .limit(1);

    const validade = mat ? `${mat.semestre}/${mat.ano}` : "N/A";
    const token = gerarTokenCartao(usuarioId, "carteira", validade);

    res.json({ token, validade });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao gerar carteira" });
  }
});

// ── GET /api/verificar/:token — endpoint público para validação de cartão ────
// Registrado na rota pública (sem requireAuth) — veja index.ts
export function criarRotaVerificacao() {
  const pub = Router();

  pub.get("/:token", async (req: Request, res: Response) => {
    const dados = verificarTokenCartao(req.params.token);
    if (!dados) return res.status(400).json({ error: "Token inválido ou adulterado." });

    try {
      const [usuario] = await db
        .select({ id: usuariosTable.id, nome: usuariosTable.nome, fotoId: usuariosTable.fotoId })
        .from(usuariosTable)
        .where(eq(usuariosTable.id, dados.usuarioId));

      if (!usuario) return res.status(404).json({ error: "Estudante não encontrado." });

      res.json({
        valido:    true,
        tipo:      dados.tipo,
        validade:  dados.validade,
        nome:      usuario.nome,
        fotoUrl:   usuario.fotoId ? `/api/fotos/${usuario.fotoId}` : null,
        emitidoEm: new Date(dados.ts).toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao verificar" });
    }
  });

  return pub;
}

export default router;
