import { Shield, Lock, CheckCircle, Activity } from "lucide-react";

export function SecurityBar() {
  return (
    <div className="border-t border-sidebar-border p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase text-sidebar-primary">
        <Shield className="w-3 h-3" />
        <span>Segurança ativa</span>
      </div>
      <div className="space-y-1.5">
        <SecurityRow icon={<CheckCircle className="w-3 h-3 text-emerald-500" />} label="LGPD Ativo" status="OK" />
        <SecurityRow icon={<CheckCircle className="w-3 h-3 text-emerald-500" />} label="ISO 27001" status="OK" />
        <SecurityRow icon={<Lock className="w-3 h-3 text-blue-400" />} label="Criptografia" status="AES-256" />
        <SecurityRow icon={<Activity className="w-3 h-3 text-emerald-400" />} label="Sessão" status="Ativa" />
      </div>
    </div>
  );
}

function SecurityRow({
  icon,
  label,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  status: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0">{icon}</span>
      <span className="text-[11px] text-sidebar-foreground/70 flex-1 truncate">{label}</span>
      <span className="text-[10px] font-medium text-emerald-400 tabular-nums">{status}</span>
    </div>
  );
}
