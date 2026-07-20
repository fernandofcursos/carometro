import { Router, Request, Response } from "express";
import { db, estudantesTable, turmasTable, cursosTable, turnosTable, eq, isNull, and } from "@workspace/db";
import { descriptografarFoto, verificarIntegridade } from "../lib/crypto.js";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";

const router = Router();
router.use(requireAuth);

// GET /api/carometro — retorna CarometroGroup[] agrupado por turma
// Filtros: ?turmaId=uuid&cursoId=uuid&turnoId=uuid&busca=texto
router.get("/", requirePermissao("carometro:view"), async (req: Request, res: Response) => {
  try {
    const { turmaId, cursoId, turnoId, busca } = req.query;

    const condicoes = [isNull(estudantesTable.deletadoEm)];
    if (turmaId) condicoes.push(eq(estudantesTable.turmaId, turmaId as string));
    if (cursoId) condicoes.push(eq(turmasTable.cursoId, cursoId as string));
    if (turnoId) condicoes.push(eq(turmasTable.turnoId, turnoId as string));

    const rows = await db
      .select({
        id:            estudantesTable.id,
        nome:          estudantesTable.nome,
        registro:      estudantesTable.registro,
        turmaId:       estudantesTable.turmaId,
        turmaSigla:    turmasTable.sigla,
        turmaDescricao: turmasTable.descricao,
        cursoNome:     cursosTable.nome,
        turnoNome:     turnosTable.nome,
        fotoDados:           estudantesTable.fotoDados,
        fotoIv:              estudantesTable.fotoIv,
        fotoMimeType:        estudantesTable.fotoMimeType,
        fotoHashIntegridade: estudantesTable.fotoHashIntegridade,
        fotoStorageKey:      estudantesTable.fotoStorageKey,
      })
      .from(estudantesTable)
      .leftJoin(turmasTable, eq(estudantesTable.turmaId, turmasTable.id))
      .leftJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
      .leftJoin(turnosTable, eq(turmasTable.turnoId, turnosTable.id))
      .where(and(...condicoes))
      .orderBy(turmasTable.sigla, estudantesTable.nome);

    // Filtro de busca em memória
    const filtrados = busca
      ? rows.filter((r) =>
          r.nome.toLowerCase().includes((busca as string).toLowerCase()) ||
          r.registro.includes(busca as string)
        )
      : rows;

    // Descriptografar fotos e agrupar por turma
    const turmaMap = new Map<string, {
      turmaId: string; turmaSigla: string; turmaDescricao: string;
      turnoNome: string; cursoNome: string;
      estudantes: { id: string; nome: string; registro: string; fotoUrl: string | null }[];
    }>();

    for (const r of filtrados) {
      const tid = r.turmaId;
      if (!turmaMap.has(tid)) {
        turmaMap.set(tid, {
          turmaId:        tid,
          turmaSigla:     r.turmaSigla ?? "",
          turmaDescricao: r.turmaDescricao ?? "",
          turnoNome:      r.turnoNome ?? "",
          cursoNome:      r.cursoNome ?? "",
          estudantes:     [],
        });
      }

      let fotoUrl: string | null = null;
      if (r.fotoDados && r.fotoIv) {
        try {
          const dadosBrutos = descriptografarFoto(r.fotoDados, r.fotoIv);
          if (!r.fotoHashIntegridade || verificarIntegridade(dadosBrutos, r.fotoHashIntegridade)) {
            fotoUrl = `data:${r.fotoMimeType ?? "image/jpeg"};base64,${dadosBrutos.toString("base64")}`;
          }
        } catch {
          // foto corrompida — incluir estudante sem foto
        }
      }

      turmaMap.get(tid)!.estudantes.push({ id: r.id, nome: r.nome, registro: r.registro, fotoUrl });
    }

    // Retorna CarometroGroup[] ordenado pela sigla da turma
    const groups = [...turmaMap.values()].sort((a, b) => a.turmaSigla.localeCompare(b.turmaSigla));
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar carômetro" });
  }
});

export default router;
