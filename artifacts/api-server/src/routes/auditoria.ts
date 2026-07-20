import { Router, Request, Response } from "express";
// Fase 9: importar db, tabela e operadores para queries reais
import { db, auditoriaLogsTable, eq, desc } from "@workspace/db"; // Fase 9: eram TODO comments
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js"; // Fase 9: auditar o acesso aos próprios logs

// Fase 3: Rota de auditoria — logs de operações no sistema
// ISO 27001 A.8.15 — registro de eventos de segurança
const router = Router();

// Todos os endpoints exigem autenticação
router.use(requireAuth);

// Fase 9: GET /api/auditoria — listar logs de auditoria (banco real)
// Fase 3: retornava lista vazia com "banco ainda não conectado"
// Requer permissão auditoria:view (apenas administradores)
router.get("/", requirePermissao("auditoria:view"), async (req: Request, res: Response) => {
  try {
    // Extrair parâmetro de limite (máximo 200 logs por requisição)
    const limite = Math.min(Number(req.query.limite ?? 50), 200);

    // Fase 9: buscar logs do banco ordenados por data (mais recentes primeiro)
    // Fase 3: era res.json({ message: "banco ainda não conectado", logs: [] })
    const logs = await db
      .select({
        id:         auditoriaLogsTable.id,
        tabela:     auditoriaLogsTable.tabela,
        operacao:   auditoriaLogsTable.operacao,
        registroId: auditoriaLogsTable.registroId,
        usuarioId:  auditoriaLogsTable.usuarioId,
        endpoint:   auditoriaLogsTable.endpoint,
        metodoHttp: auditoriaLogsTable.metodoHttp,
        statusHttp: auditoriaLogsTable.statusHttp,
        ipOrigem:   auditoriaLogsTable.ipOrigem,
        duracaoMs:  auditoriaLogsTable.duracaoMs,
        criadoEm:   auditoriaLogsTable.criadoEm,
      })
      .from(auditoriaLogsTable)
      .orderBy(desc(auditoriaLogsTable.criadoEm)) // Fase 9: mais recentes primeiro
      .limit(limite);

    // Fase 9: registrar o próprio acesso aos logs (ISO 27001 A.8.15 — quem auditou os auditores)
    // Fase 3: era TODO comment
    await registrarAuditoria({
      tabela:     "auditoria_logs",
      operacao:   "SELECT",
      usuarioId:  req.usuarioId,
      ipOrigem:   req.ip,
      endpoint:   "GET /api/auditoria",
      metodoHttp: "GET",
      statusHttp: 200,
      duracaoMs:  req.startTime ? Date.now() - req.startTime : undefined, // Fase 9: duração via startTime
    });

    res.json(logs);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Erro ao listar auditoria",
    });
  }
});

// Fase 9: GET /api/auditoria/:id — buscar log específico por UUID
// Fase 3: retornava { message: "banco ainda não conectado", log: null }
router.get("/:id", requirePermissao("auditoria:view"), async (req: Request, res: Response) => {
  try {
    // Fase 9: buscar log específico por ID
    // Fase 3: era TODO comment
    const [log] = await db
      .select()
      .from(auditoriaLogsTable)
      .where(eq(auditoriaLogsTable.id, String(req.params.id)));

    if (!log) {
      return res.status(404).json({ error: "Log não encontrado" }); // Fase 9: era retorno mock
    }

    res.json(log); // Fase 9: era res.json({ message: "banco ainda não conectado", log: null })
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Erro ao buscar log",
    });
  }
});

export default router;
