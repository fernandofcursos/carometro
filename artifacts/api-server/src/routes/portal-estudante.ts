import { Router, Request, Response } from "express";
import {
  db,
  usuariosTable,
  matriculasTable,
  turmasTable,
  cursosTable,
  turnosTable,
  ocorrenciasTable,
  tiposOcorrenciasTable,
  disciplinasTable,
  disciplinaOfertasTable,
  usuarioDisciplinasTable,
  carteirasTable,
  cartoesSaidaTable,
  estudantesTable,
  eq,
  and,
  isNull,
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
        estudanteFotoId: estudantesTable.fotoId,
      })
      .from(usuariosTable)
      .leftJoin(estudantesTable, and(eq(estudantesTable.usuarioId, usuariosTable.id), isNull(estudantesTable.deletadoEm)))
      .where(and(eq(usuariosTable.id, usuarioId), isNull(usuariosTable.deletadoEm)));

    if (!usuario) return res.status(404).json({ error: "Usuário não encontrado." });

    // Matrículas ativas — JOIN com o turno específico da matrícula (matriculas.turno_id)
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
        turnoId:       turnosTable.id,
        turnoNome:     turnosTable.nome,
      })
      .from(matriculasTable)
      .innerJoin(turmasTable, eq(matriculasTable.turmaId, turmasTable.id))
      .innerJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
      .leftJoin(turnosTable, eq(matriculasTable.turnoId, turnosTable.id))
      .where(and(eq(matriculasTable.usuarioId, usuarioId), eq(matriculasTable.ativo, true), isNull(matriculasTable.deletadoEm)));

    const matriculas = matRows.map((m) => ({
      ...m,
      turnoNome: m.turnoNome ?? null,
    }));

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
        fotoUrl:        usuario.fotoId
          ? `/api/fotos/${usuario.fotoId}`
          : (usuario.estudanteFotoId ? `/api/fotos/${usuario.estudanteFotoId}` : null),
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

// ── GET /api/portal/carteiras — carteiras ativas do estudante logado ─────────
router.get("/carteiras", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;

    const rows = await db
      .select({
        id:        carteirasTable.id,
        tipo:      carteirasTable.tipo,
        ano:       carteirasTable.ano,
        semestre:  carteirasTable.semestre,
        status:    carteirasTable.status,
        token:     carteirasTable.token,
        criadoEm:  carteirasTable.criadoEm,
      })
      .from(carteirasTable)
      .where(eq(carteirasTable.usuarioId, usuarioId))
      .orderBy(carteirasTable.ano, carteirasTable.semestre);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar carteiras" });
  }
});

// ── GET /api/portal/cartoes-saida — cartões de liberação diários do estudante ──
// Retorna cartões aprovados; cliente filtra os válidos no momento (janela ±5 min)
router.get("/cartoes-saida", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;

    const [estudante] = await db
      .select({ id: estudantesTable.id })
      .from(estudantesTable)
      .where(eq(estudantesTable.usuarioId, usuarioId));

    if (!estudante) return res.json([]);

    const rows = await db
      .select({
        id:                  cartoesSaidaTable.id,
        dataSaida:           cartoesSaidaTable.dataSaida,
        horarioSaida:        cartoesSaidaTable.horarioSaida,
        motivo:              cartoesSaidaTable.motivo,
        status:              cartoesSaidaTable.status,
        aprovadoEm:          cartoesSaidaTable.aprovadoEm,
        observacaoAprovador: cartoesSaidaTable.observacaoAprovador,
        token:               cartoesSaidaTable.token,
        criadoEm:            cartoesSaidaTable.criadoEm,
      })
      .from(cartoesSaidaTable)
      .where(and(eq(cartoesSaidaTable.estudanteId, estudante.id), eq(cartoesSaidaTable.status, "aprovado")))
      .orderBy(cartoesSaidaTable.dataSaida);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar cartões de saída" });
  }
});

export default router;
