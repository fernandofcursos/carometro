import { Router, Request, Response } from "express";
import { z } from "zod";
import * as XLSX from "xlsx";
import { db, estudantesTable, turmasTable, eq, isNull, and } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

// Colunas esperadas no XLSX (case-insensitive, trim)
const COLUNAS_ESPERADAS = ["nome", "registro", "turma"] as const;

const rowSchema = z.object({
  nome:     z.string().min(2).max(200),
  registro: z.string().min(1).max(50),
  turma:    z.string().min(1),       // sigla da turma
  observacao: z.string().optional(),
});

// POST /api/import — importar estudantes via XLSX (base64 no body)
// Corpo: { arquivo: string } onde arquivo é base64 do .xlsx
// Retorna: { inseridos, atualizados, erros }
router.post("/", requirePermissao("import:execute"), async (req: Request, res: Response) => {
  try {
    const { arquivo } = z.object({ arquivo: z.string().min(1) }).parse(req.body);

    // Decodificar base64 → buffer → parsear XLSX
    const buffer = Buffer.from(
      arquivo.includes(",") ? arquivo.split(",")[1] : arquivo,
      "base64"
    );
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return res.status(400).json({ error: "Planilha vazia ou inválida" });

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (rows.length === 0) return res.status(400).json({ error: "Nenhuma linha encontrada na planilha" });

    // Normalizar chaves (lowercase + trim)
    const normalizar = (row: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), String(v).trim()]));

    // Carregar todas as turmas para lookup por sigla
    const turmas = await db
      .select({ id: turmasTable.id, sigla: turmasTable.sigla })
      .from(turmasTable)
      .where(isNull(turmasTable.deletadoEm));
    const turmaMap = new Map(turmas.map((t) => [t.sigla.toLowerCase(), t.id]));

    const resultado = { inseridos: 0, atualizados: 0, erros: [] as { linha: number; erro: string }[] };

    for (let i = 0; i < rows.length; i++) {
      const linha = i + 2; // linha 1 = cabeçalho
      try {
        const norm = normalizar(rows[i]);
        const parsed = rowSchema.parse(norm);

        const turmaId = turmaMap.get(parsed.turma.toLowerCase());
        if (!turmaId) {
          resultado.erros.push({ linha, erro: `Turma "${parsed.turma}" não encontrada` });
          continue;
        }

        // Verificar se estudante já existe pelo registro
        const [existente] = await db
          .select({ id: estudantesTable.id })
          .from(estudantesTable)
          .where(eq(estudantesTable.registro, parsed.registro));

        if (existente) {
          // Atualizar dados (mantendo foto se houver)
          await db
            .update(estudantesTable)
            .set({ nome: parsed.nome, turmaId, observacao: parsed.observacao ?? null, atualizadoEm: new Date() })
            .where(eq(estudantesTable.id, existente.id));
          resultado.atualizados++;
        } else {
          // Inserir novo estudante
          await db.insert(estudantesTable).values({
            nome: parsed.nome, registro: parsed.registro, turmaId, observacao: parsed.observacao ?? null,
          });
          resultado.inseridos++;
        }
      } catch (err) {
        resultado.erros.push({
          linha,
          erro: err instanceof z.ZodError
            ? err.errors.map((e) => e.message).join("; ")
            : err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    }

    await registrarAuditoria({
      tabela: "estudantes", operacao: "INSERT",
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/import", metodoHttp: "POST", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.json({
      ...resultado,
      total: rows.length,
      mensagem: `${resultado.inseridos} inseridos, ${resultado.atualizados} atualizados, ${resultado.erros.length} erros`,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Erro ao processar planilha" });
  }
});

export default router;
