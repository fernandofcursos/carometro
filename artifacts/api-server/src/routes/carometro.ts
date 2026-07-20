import { Router, Request, Response } from "express";
import { db, estudantesTable, turmasTable, cursosTable, turnosTable, eq, isNull, and } from "@workspace/db";
import { descriptografarFoto, verificarIntegridade } from "../lib/crypto.js";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";

const router = Router();
router.use(requireAuth);

// GET /api/carometro — grid de fotos com filtros
// Filtros: ?turmaId=uuid&cursoId=uuid&busca=texto&comFoto=true
// Retorna lista com foto em base64 para exibição no grid
router.get("/", requirePermissao("carometro:view"), async (req: Request, res: Response) => {
  try {
    const { turmaId, cursoId, busca, comFoto } = req.query;

    const condicoes = [isNull(estudantesTable.deletadoEm)];
    if (turmaId) condicoes.push(eq(estudantesTable.turmaId, turmaId as string));
    if (cursoId) condicoes.push(eq(turmasTable.cursoId, cursoId as string));

    const rows = await db
      .select({
        id:          estudantesTable.id,
        nome:        estudantesTable.nome,
        registro:    estudantesTable.registro,
        turmaId:     estudantesTable.turmaId,
        turmaSigla:  turmasTable.sigla,
        cursoNome:   cursosTable.nome,
        turnoNome:   turnosTable.nome,
        // foto — descriptografada no loop abaixo
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
      .orderBy(estudantesTable.nome);

    // Filtros em memória para busca e comFoto
    const filtrados = rows.filter((r) => {
      if (busca && !r.nome.toLowerCase().includes((busca as string).toLowerCase()) && !r.registro.includes(busca as string)) return false;
      if (comFoto === "true" && !r.fotoStorageKey) return false;
      return true;
    });

    // Descriptografar fotos e converter para base64 data URL
    const estudantes = filtrados.map((r) => {
      let fotoDataUrl: string | null = null;

      if (r.fotoDados && r.fotoIv) {
        try {
          const dadosBrutos = descriptografarFoto(r.fotoDados, r.fotoIv);
          if (!r.fotoHashIntegridade || verificarIntegridade(dadosBrutos, r.fotoHashIntegridade)) {
            fotoDataUrl = `data:${r.fotoMimeType ?? "image/jpeg"};base64,${dadosBrutos.toString("base64")}`;
          }
        } catch {
          // foto corrompida — retornar sem foto em vez de falhar
        }
      }

      return {
        id:         r.id,
        nome:       r.nome,
        registro:   r.registro,
        turmaId:    r.turmaId,
        turmaSigla: r.turmaSigla,
        cursoNome:  r.cursoNome,
        turnoNome:  r.turnoNome,
        foto:       fotoDataUrl,
      };
    });

    res.json({ estudantes, total: estudantes.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar carômetro" });
  }
});

export default router;
