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
  responsaveisEstudantesTable,
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

// ── GET /api/portal/me — dados próprios do estudante logado ───────────────────
router.get("/me", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;

    const [usuario] = await db
      .select({
        id:              usuariosTable.id,
        nome:            usuariosTable.nome,
        codigoAcesso:    usuariosTable.codigoAcesso,
        dataNascimento:  usuariosTable.dataNascimento,
        fotoId:          usuariosTable.fotoId,
        estudanteId:     estudantesTable.id,
        estudanteFotoId: estudantesTable.fotoId,
        estudanteFotoStorageKey: estudantesTable.fotoStorageKey,
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
          : usuario.estudanteFotoId
            ? `/api/fotos/${usuario.estudanteFotoId}`
            : (usuario.estudanteId && usuario.estudanteFotoStorageKey)
              ? `/api/estudantes/${usuario.estudanteId}/foto`
              : null,
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

// ── GET /api/portal/dashboard — dados consolidados para o dashboard do estudante ─
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const usuarioId = req.usuarioId!;

    // Hoje no servidor (evita divergência de fuso no cliente)
    const hoje = new Date();
    const hojeStr = hoje.toISOString().substring(0, 10);
    const diaJS = hoje.getDay(); // 0=dom … 6=sab
    const diaSemana = diaJS === 0 ? 7 : diaJS; // 1=seg…7=dom (sem aula = 6 ou 7)

    // Resolve estudantes do perfil logado:
    // - estudante próprio → usa seu próprio registro
    // - pai_responsavel → usa os filhos/dependentes vinculados
    const [estudanteProprio] = await db
      .select({ id: estudantesTable.id, usuarioId: estudantesTable.usuarioId })
      .from(estudantesTable)
      .where(and(eq(estudantesTable.usuarioId, usuarioId), isNull(estudantesTable.deletadoEm)));

    let estudantes: { id: string; usuarioId: string | null }[];
    if (estudanteProprio) {
      estudantes = [estudanteProprio];
    } else {
      estudantes = await db
        .select({ id: estudantesTable.id, usuarioId: estudantesTable.usuarioId })
        .from(responsaveisEstudantesTable)
        .innerJoin(estudantesTable, eq(estudantesTable.id, responsaveisEstudantesTable.estudanteId))
        .where(and(eq(responsaveisEstudantesTable.usuarioId, usuarioId), isNull(estudantesTable.deletadoEm)));
    }

    const estudanteIds = estudantes.map((e) => e.id);
    const estudanteUsuarioIds = estudantes.map((e) => e.usuarioId).filter(Boolean) as string[];

    // Ocorrências — agrupadas por tipo (todos os estudantes vinculados)
    const ocrsRaw = estudanteIds.length > 0
      ? await db
          .select({
            id:           ocorrenciasTable.id,
            tipoId:       ocorrenciasTable.tipoOcorrenciaId,
            tipoDesc:     tiposOcorrenciasTable.descricao,
            cienteEm:     ocorrenciasTable.cienteEm,
          })
          .from(ocorrenciasTable)
          .innerJoin(tiposOcorrenciasTable, eq(ocorrenciasTable.tipoOcorrenciaId, tiposOcorrenciasTable.id))
          .where(and(inArray(ocorrenciasTable.estudanteId, estudanteIds), isNull(ocorrenciasTable.deletadoEm)))
      : [];

    const ocMap = new Map<string, { tipoDescricao: string; total: number; semCiencia: number; ids: string[] }>();
    for (const o of ocrsRaw) {
      if (!ocMap.has(o.tipoId)) ocMap.set(o.tipoId, { tipoDescricao: o.tipoDesc ?? "", total: 0, semCiencia: 0, ids: [] });
      const g = ocMap.get(o.tipoId)!;
      g.total++;
      if (!o.cienteEm) { g.semCiencia++; g.ids.push(o.id); }
    }
    const resumo = Array.from(ocMap.entries()).map(([tipoId, v]) => ({ tipoId, ...v }));

    // Agenda — tabela horarios_aulas (pode não existir ainda)
    const DIA_NOME = ["", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];
    let agenda: { dia: number; diaNome: string; aulas: { horaInicio: string; horaFim: string; disciplinaNome: string; sala: string | null }[] }[] = [];
    let agendaDisponivel = false;
    try {
      const { horariosAulasTable } = await import("@workspace/db/schema") as any;
      if (horariosAulasTable && estudanteUsuarioIds.length > 0) {
        const anoAtual = hoje.getFullYear();
        const semestreAtual: 1 | 2 = hoje.getMonth() < 6 ? 1 : 2;
        const aulas = await db
          .select({
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
          .where(and(inArray(matriculasTable.usuarioId, estudanteUsuarioIds), eq(matriculasTable.ativo, true), isNull(matriculasTable.deletadoEm)));

        agendaDisponivel = true;
        const byDia = new Map<number, typeof aulas>();
        for (const a of aulas) {
          if (!byDia.has(a.dia)) byDia.set(a.dia, []);
          byDia.get(a.dia)!.push(a);
        }
        agenda = [1, 2, 3, 4, 5].map((d) => ({
          dia: d, diaNome: DIA_NOME[d],
          aulas: (byDia.get(d) ?? []).sort((a, b) => String(a.horaInicio).localeCompare(String(b.horaInicio))),
        }));
      }
    } catch { /* tabela ainda não existe — retorna vazio */ }

    // Cardápio — tabela cardapios (pode não existir ainda)
    let cardapio: { dia: number; diaNome: string; data: string; itens: { refeicao: string; descricao: string }[] }[] = [];
    let cardapioDisponivel = false;
    try {
      const { cardapiosTable } = await import("@workspace/db/schema") as any;
      if (cardapiosTable) {
        const { gte, lte } = await import("@workspace/db") as any;
        const seg = new Date(hoje);
        seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
        const sex = new Date(seg); sex.setDate(seg.getDate() + 4);
        const semanaInicio = seg.toISOString().substring(0, 10);
        const semanaFim    = sex.toISOString().substring(0, 10);

        const rows = await db
          .select({ data: cardapiosTable.data, refeicao: cardapiosTable.refeicao, descricao: cardapiosTable.descricao })
          .from(cardapiosTable)
          .where(and(gte(cardapiosTable.data, semanaInicio), lte(cardapiosTable.data, semanaFim), eq(cardapiosTable.publicado, true)));

        cardapioDisponivel = true;
        const byDia = new Map<number, { data: string; itens: { refeicao: string; descricao: string }[] }>();
        for (const c of rows) {
          const d = new Date(c.data + "T12:00:00"); const dia = d.getDay() === 0 ? 7 : d.getDay();
          if (!byDia.has(dia)) byDia.set(dia, { data: c.data, itens: [] });
          byDia.get(dia)!.itens.push({ refeicao: c.refeicao, descricao: c.descricao });
        }
        cardapio = [1, 2, 3, 4, 5].filter(d => byDia.has(d))
          .map(d => ({ dia: d, diaNome: DIA_NOME[d], ...byDia.get(d)! }));
      }
    } catch { /* tabela ainda não existe — retorna vazio */ }

    res.json({
      hoje: hojeStr,
      diaSemana,
      ocorrencias: { resumo, totalGeral: ocrsRaw.length },
      agendaDisponivel,
      agenda: agendaDisponivel ? agenda : [],
      cardapioDisponivel,
      cardapio: cardapioDisponivel ? cardapio : [],
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar dashboard" });
  }
});

export default router;
