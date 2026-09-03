// Fase 9: página de auditoria conectada à API real
// Fase 3: dados eram hardcoded ("Admin atualizou dados há 2 minutos")
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, Calendar, User, FileText, AlertCircle, Loader2 } from "lucide-react"; // Fase 9: adicionado AlertCircle, Loader2

// Fase 9: tipo alinhado com AuditoriaLog do banco (lib/db/src/schema/auditoria-logs.ts)
// Fase 3: não havia tipo — dados eram string literals fixos
type AuditoriaLogItem = {
  id: string;
  tabela: string;
  operacao: "INSERT" | "UPDATE" | "DELETE" | "SELECT" | "SELECT_SENSITIVE";
  registroId: string | null;
  usuarioId:  string | null;
  endpoint:   string | null;
  metodoHttp: string | null;
  statusHttp: number | null;
  ipOrigem:   string | null;
  duracaoMs:  number | null;
  criadoEm:   string;
};

// Fase 9: hook de query para buscar logs do banco via API
// Fase 3: não existia — dados eram literais no JSX
function useAuditoriaLogs(limite = 50) {
  return useQuery<{ logs: AuditoriaLogItem[]; limite: number; total: number }>({
    queryKey: ["auditoria", limite],
    queryFn: async () => {
      const res = await fetch(`/api/auditoria?limite=${limite}`, {
        credentials: "include", // necessário para cookie JWT
      });
      if (!res.ok) throw new Error(`Erro ${res.status} ao carregar logs`);
      return res.json();
    },
    staleTime: 30_000,   // Fase 9: revalidar a cada 30s (logs mudam com frequência)
    refetchInterval: 60_000, // Fase 9: atualizar automaticamente a cada 1 minuto
  });
}

// Fase 9: mapa de ícones por tipo de operação
// Fase 3: ícones eram fixos por posição na lista hardcoded
function iconeOperacao(operacao: AuditoriaLogItem["operacao"]) {
  switch (operacao) {
    case "INSERT":           return <FileText className="w-4 h-4 text-green-600" />;
    case "UPDATE":           return <User      className="w-4 h-4 text-blue-600"  />;
    case "DELETE":           return <AlertCircle className="w-4 h-4 text-red-600" />;
    case "SELECT_SENSITIVE": return <Calendar  className="w-4 h-4 text-orange-600" />;
    default:                 return <ClipboardList className="w-4 h-4 text-muted-foreground" />;
  }
}

// Fase 9: formatar timestamp relativo (ex: "há 2 minutos")
// Fase 3: tempo era string literal hardcoded ("Há 2 minutos")
function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seg  = Math.floor(diff / 1000);
  if (seg < 60)   return `Há ${seg} segundo${seg !== 1 ? "s" : ""}`;
  const min = Math.floor(seg / 60);
  if (min < 60)   return `Há ${min} minuto${min !== 1 ? "s" : ""}`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24)   return `Há ${hrs} hora${hrs !== 1 ? "s" : ""}`;
  const dias = Math.floor(hrs / 24);
  return `Há ${dias} dia${dias !== 1 ? "s" : ""}`;
}

// Fase 9: descrever a ação de forma legível
// Fase 3: descrição era string literal ("Atualizou dados de estudante")
function descricaoAcao(log: AuditoriaLogItem): string {
  const op = log.operacao.charAt(0) + log.operacao.slice(1).toLowerCase();
  const tabela = log.tabela.replace(/_/g, " ");
  if (log.endpoint) return log.endpoint;
  return `${op} em ${tabela}`;
}

export default function AuditoriaPage() {
  // Fase 9: buscar logs reais da API
  // Fase 3: não havia query — dados eram literais no return
  const { data, isLoading, isError, error } = useAuditoriaLogs(50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Log de Auditoria</h1>
        <p className="text-muted-foreground mt-2">Registro de ações e mudanças no sistema.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Últimas Ações
            {/* Fase 9: exibir total de registros retornados */}
            {data && (
              <span className="ml-auto text-sm font-normal text-muted-foreground">
                {data.total} registro{data.total !== 1 ? "s" : ""}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Fase 9: estado de carregamento */}
          {/* Fase 3: não havia — dados apareciam imediatamente (hardcoded) */}
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Carregando logs...</span>
            </div>
          )}

          {/* Fase 9: estado de erro */}
          {isError && (
            <div className="flex items-center gap-2 py-4 text-destructive text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>{error instanceof Error ? error.message : "Erro ao carregar logs"}</span>
            </div>
          )}

          {/* Fase 9: lista real de logs do banco */}
          {/* Fase 3: era lista hardcoded com 3 itens fixos */}
          {data && data.logs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum log de auditoria registrado ainda.
            </p>
          )}

          {data && data.logs.length > 0 && (
            <div className="space-y-4">
              {data.logs.map((log) => (
                <AuditRow
                  key={log.id}
                  icon={iconeOperacao(log.operacao)}          // Fase 9: ícone dinâmico por operação
                  user={log.usuarioId ?? "Sistema"}           // Fase 9: ID real do usuário
                  action={descricaoAcao(log)}                 // Fase 9: descrição gerada a partir do log
                  time={tempoRelativo(log.criadoEm)}          // Fase 9: tempo relativo calculado
                  status={log.statusHttp}                     // Fase 9: status HTTP do log
                  ip={log.ipOrigem}                           // Fase 9: IP de origem
                />
              ))}
            </div>
          )}

          {/* Fase 3: lista hardcoded removida — mantida como comentário
          <AuditRow icon={<User />}     user="Admin"       action="Atualizou dados de estudante"          time="Há 2 minutos"  />
          <AuditRow icon={<FileText />} user="Coordenador" action="Exportou relatório de ocorrências"     time="Há 15 minutos" />
          <AuditRow icon={<Calendar />} user="Sistema"     action="Sincronização automática concluída"    time="Há 1 hora"     />
          */}
        </CardContent>
      </Card>
    </div>
  );
}

// Fase 9: AuditRow estendido com status e ip (antes tinha só icon/user/action/time)
function AuditRow({
  icon,
  user,
  action,
  time,
  status,  // Fase 9: status HTTP da operação
  ip,      // Fase 9: IP de origem para rastreabilidade LGPD
}: {
  icon:    React.ReactNode;
  user:    string;
  action:  string;
  time:    string;
  status?: number | null;
  ip?:     string | null;
}) {
  return (
    <div className="flex items-start gap-3 text-sm border-b border-border/50 pb-3 last:border-0 last:pb-0">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{user}</p>
        <p className="text-muted-foreground truncate">{action}</p>
        {/* Fase 9: exibir IP quando disponível (LGPD Art. 37 — rastreabilidade) */}
        {ip && (
          <p className="text-xs text-muted-foreground/70 mt-0.5">IP: {ip}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-xs text-muted-foreground">{time}</span>
        {/* Fase 9: badge de status HTTP */}
        {status != null && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
            status < 300 ? "bg-green-100 text-green-700"
            : status < 400 ? "bg-blue-100 text-blue-700"
            : "bg-red-100 text-red-700"
          }`}>
            {status}
          </span>
        )}
      </div>
    </div>
  );
}
