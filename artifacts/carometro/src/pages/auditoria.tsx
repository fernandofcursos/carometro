import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, Calendar, User, FileText } from "lucide-react";

export default function AuditoriaPage() {
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
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <AuditRow
              icon={<User className="w-4 h-4" />}
              user="Admin"
              action="Atualizou dados de estudante"
              time="Há 2 minutos"
            />
            <AuditRow
              icon={<FileText className="w-4 h-4" />}
              user="Coordenador"
              action="Exportou relatório de ocorrências"
              time="Há 15 minutos"
            />
            <AuditRow
              icon={<Calendar className="w-4 h-4" />}
              user="Sistema"
              action="Sincronização automática concluída"
              time="Há 1 hora"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AuditRow({
  icon,
  user,
  action,
  time,
}: {
  icon: React.ReactNode;
  user: string;
  action: string;
  time: string;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="flex-1">
        <p className="font-medium text-foreground">{user}</p>
        <p className="text-muted-foreground">{action}</p>
      </div>
      <span className="text-xs text-muted-foreground shrink-0">{time}</span>
    </div>
  );
}
