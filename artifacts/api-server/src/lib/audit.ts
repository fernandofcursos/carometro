// Auditoria — logs de operações no sistema
// ISO 27001 A.8.15 — logging de eventos de segurança
// LGPD Art. 37 — registro de operações de tratamento de dados

// Fase 3: Armazenamento em memória de logs (será banco na Fase 9)
// Em produção, isso vai para auditoriaLogsTable no PostgreSQL
const AUDIT_LOGS: any[] = [];
const MAX_LOGS_MEMORY = 1000; // Manter últimos 1000 logs em memória

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

// Fase 3: Registrar operação em logs de auditoria
// LGPD Art. 37 — obrigatório registrar operações de tratamento
// ISO 27001 A.8.15 — logging de eventos de segurança
export async function registrarAuditoria(params: RegistrarAuditoriaParams): Promise<void> {
  try {
    // Criar registro de log com timestamp e ambiente
    const log = {
      // Auto-incrementado no banco (usar UUID em produção sem banco)
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...params,
      // Timestamp da operação
      criadoEm: new Date(),
      // Ambiente (development, production, test)
      ambiente: process.env.NODE_ENV ?? "development",
      // Versão da aplicação (para auditar quebras de comportamento)
      versaoApp: process.env.npm_package_version ?? "0.0.0",
    };

    // TODO: Inserir no banco de dados (Fase 9)
    // await db.insert(auditoriaLogsTable).values(log);

    // Fase 3: Armazenar em memória temporariamente
    // Manter últimos MAX_LOGS_MEMORY logs (rotação de logs)
    AUDIT_LOGS.push(log);
    if (AUDIT_LOGS.length > MAX_LOGS_MEMORY) {
      // Remover logs mais antigos
      AUDIT_LOGS.shift();
    }

    // Log estruturado em modo desenvolvimento para debug
    if (process.env.NODE_ENV === "development") {
      console.log("[AUDIT]", {
        operacao: params.operacao,
        tabela: params.tabela,
        usuario: params.usuarioId ?? "anonymous",
        endpoint: params.endpoint,
        status: params.statusHttp,
        ip: params.ipOrigem,
      });
    }
  } catch (err) {
    // Não lançar erro — auditoria falhou não deve derrubar a aplicação
    // Mas registrar em stderr para alertar
    console.error("[AUDIT ERROR]", err instanceof Error ? err.message : err);
  }
}

// Fase 3: Obter logs em memória (para testes/debug)
export function obterLogsEmMemoria(): any[] {
  return [...AUDIT_LOGS];
}

// Fase 3: Limpar logs em memória (para testes)
export function limparLogsEmMemoria(): void {
  AUDIT_LOGS.length = 0;
}
