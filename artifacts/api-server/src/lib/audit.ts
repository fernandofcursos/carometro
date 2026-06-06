// Auditoria — logs de operações no sistema
// ISO 27001 A.8.15 — logging de eventos de segurança
// LGPD Art. 37 — registro de operações de tratamento de dados

// Fase 9: importar db e tabela de auditoria para gravar no banco
import { db, auditoriaLogsTable } from "@workspace/db";

// Fase 3: Armazenamento em memória de logs (substituído pelo banco na Fase 9)
// const AUDIT_LOGS: any[] = [];                          // Fase 3 → removido na Fase 9
// const MAX_LOGS_MEMORY = 1000;                          // Fase 3 → removido na Fase 9

// Fase 3: Tipo para registrar auditoria — matches schema do banco
export type RegistrarAuditoriaParams = {
  // Tabela afetada (ex: "usuarios", "estudantes", "consentimentos_lgpd")
  tabela: string;
  // Tipo de operação (INSERT, UPDATE, DELETE, SELECT)
  operacao: "INSERT" | "UPDATE" | "DELETE" | "SELECT" | "SELECT_SENSITIVE";
  // ID do registro afetado (null para operações sem registro específico)
  registroId?: string;
  // ID do usuário que fez a operação (null para operações sem autenticação)
  usuarioId?: string | null;
  // Dados antes da modificação (apenas para UPDATE/DELETE)
  dadosAntes?: Record<string, unknown>;
  // Dados depois da modificação (apenas para UPDATE/INSERT)
  dadosDepois?: Record<string, unknown>;
  // IP de origem da requisição (para rastreabilidade)
  ipOrigem?: string;
  // User agent do cliente (navegador, app, etc)
  userAgent?: string;
  // Endpoint HTTP (ex: "POST /api/estudantes")
  endpoint?: string;
  // Método HTTP (GET, POST, PUT, DELETE)
  metodoHttp?: string;
  // Status HTTP da resposta (200, 401, 500, etc)
  statusHttp?: number;
  // Duração da operação em milissegundos (para performance monitoring)
  duracaoMs?: number;
};

// Fase 9: Registrar operação no banco de dados (PostgreSQL via Drizzle)
// Fase 3: era armazenamento em memória — agora grava em auditoria_logs
// LGPD Art. 37 — obrigatório registrar operações de tratamento
// ISO 27001 A.8.15 — logging de eventos de segurança
export async function registrarAuditoria(params: RegistrarAuditoriaParams): Promise<void> {
  try {
    // Fase 9: inserir diretamente na tabela do banco
    await db.insert(auditoriaLogsTable).values({      // Fase 9: era AUDIT_LOGS.push(log)
      tabela:      params.tabela,
      operacao:    params.operacao,
      registroId:  params.registroId   ?? undefined,
      usuarioId:   params.usuarioId    ?? undefined,
      dadosAntes:  params.dadosAntes   ?? undefined,
      dadosDepois: params.dadosDepois  ?? undefined,
      ipOrigem:    params.ipOrigem     ?? undefined,
      userAgent:   params.userAgent    ?? undefined,
      endpoint:    params.endpoint     ?? undefined,
      metodoHttp:  params.metodoHttp   ?? undefined,
      statusHttp:  params.statusHttp   !== undefined ? params.statusHttp as unknown as number : undefined,
      duracaoMs:   params.duracaoMs    ?? undefined,
      ambiente:    process.env.NODE_ENV ?? "development",
      versaoApp:   process.env.npm_package_version ?? "0.0.0",
    });

    // Fase 3: log estruturado em modo desenvolvimento para debug (mantido na Fase 9)
    if (process.env.NODE_ENV === "development") {
      console.log("[AUDIT]", {
        operacao: params.operacao,
        tabela:   params.tabela,
        usuario:  params.usuarioId ?? "anonymous",
        endpoint: params.endpoint,
        status:   params.statusHttp,
        ip:       params.ipOrigem,
      });
    }
  } catch (err) {
    // Não lançar erro — auditoria falhou não deve derrubar a aplicação
    // Mas registrar em stderr para alertar operações
    console.error("[AUDIT ERROR]", err instanceof Error ? err.message : err);
  }
}

// Fase 3: funções de memória — mantidas como comentário para referência
// export function obterLogsEmMemoria(): any[] { return [...AUDIT_LOGS]; }
// export function limparLogsEmMemoria(): void  { AUDIT_LOGS.length = 0;  }
