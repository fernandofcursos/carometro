import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound, CheckCircle, AlertTriangle, Shield } from "lucide-react";

export default function Iso27001Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">ISO 27001 · Controles</h1>
        <p className="text-muted-foreground mt-2">Conformidade com ISO/IEC 27001:2022.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge icon={<CheckCircle className="w-3 h-3" />} text="LGPD · Lei 13.709/2018 · Conforme" color="green" />
        <Badge icon={<CheckCircle className="w-3 h-3" />} text="ISO/IEC 27001:2022 · Certificado" color="blue" />
        <Badge icon={<Shield className="w-3 h-3" />} text="OWASP Top 10 · Protegido" color="purple" />
        <Badge icon={<KeyRound className="w-3 h-3" />} text="AES-256 · Criptografia" color="green" />
        <Badge icon={<CheckCircle className="w-3 h-3" />} text="MFA · Autenticação ativa" color="blue" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Controles de Acesso</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Autenticação multifator (MFA), roles e permissões granulares.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Criptografia</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Dados em trânsito e em repouso protegidos com AES-256.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <CardTitle className="text-lg">Gestão de Incidentes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Procedimentos de resposta a incidentes de segurança.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
            <CardTitle className="text-lg">Auditoria</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Logs de auditoria completos e revisão periódica.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Badge({
  icon,
  text,
  color,
}: {
  icon: React.ReactNode;
  text: string;
  color: "green" | "blue" | "purple";
}) {
  const colorMap = {
    green: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    blue: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    purple: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  };
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${colorMap[color]}`}>
      {icon}
      <span>{text}</span>
    </div>
  );
}
