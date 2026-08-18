import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Mail, CheckCircle2, AlertTriangle, Send, RefreshCw } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface MailerStatus {
  modo: "smtp" | "ethereal" | "local" | "não iniciado";
  smtpHost: string | null;
  smtpUser: string | null;
  etherealUser: string | null;
  from: string;
}

interface TesteResult {
  ok: boolean;
  mensagem: string;
  modo: string;
  dica: string | null;
}

export default function MailerDiagnosticoPage() {
  const { toast } = useToast();
  const [para, setPara] = useState("");

  const { data: status, isLoading, refetch } = useQuery<MailerStatus>({
    queryKey: ["mailer-status"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/mailer/status`, { credentials: "include" });
      if (!res.ok) throw new Error("Sem acesso");
      return res.json();
    },
  });

  const testeMutation = useMutation({
    mutationFn: async (destino: string): Promise<TesteResult> => {
      let res: Response;
      try {
        res = await fetch(`${BASE}/api/mailer/teste`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ para: destino }),
        });
      } catch {
        throw new Error("Sem resposta da API. O servidor SMTP pode estar travando a requisição — verifique os logs do servidor.");
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Erro ao enviar");
      return body;
    },
    onSuccess: (data) => {
      toast({ title: data.mensagem });
      if (data.dica) {
        toast({ title: "Modo Ethereal", description: data.dica, duration: 15000 });
      }
      refetch();
    },
    onError: (err: Error) => {
      toast({ title: "Falha no envio", description: err.message, variant: "destructive", duration: 12000 });
    },
  });

  const modoCor = status?.modo === "smtp"
    ? "bg-green-100 text-green-800 border-green-300"
    : status?.modo === "ethereal"
    ? "bg-amber-100 text-amber-800 border-amber-300"
    : status?.modo === "local"
    ? "bg-blue-100 text-blue-800 border-blue-300"
    : "bg-gray-100 text-gray-600 border-gray-300";

  return (
    <div className="container mx-auto py-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Mail className="w-6 h-6 text-blue-500" />
          Diagnóstico de E-mail
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verifique a configuração do servidor de e-mail e teste o envio.
        </p>
      </div>

      {/* Status */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Status do Servidor</h2>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {isLoading ? (
          <div className="h-8 w-40 bg-muted animate-pulse rounded" />
        ) : status ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground w-32">Modo:</span>
              <Badge variant="outline" className={`capitalize ${modoCor}`}>
                {status.modo === "smtp" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                {(status.modo === "ethereal" || status.modo === "local") && <AlertTriangle className="w-3 h-3 mr-1" />}
                {status.modo === "local" ? "captura local" : status.modo}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground w-32">Remetente:</span>
              <code className="text-xs bg-muted px-2 py-0.5 rounded">{status.from}</code>
            </div>
            {status.smtpHost && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-32">Servidor SMTP:</span>
                <code className="text-xs bg-muted px-2 py-0.5 rounded">{status.smtpHost}</code>
              </div>
            )}
            {status.smtpUser && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-32">Usuário SMTP:</span>
                <code className="text-xs bg-muted px-2 py-0.5 rounded">{status.smtpUser}</code>
              </div>
            )}
            {status.modo === "ethereal" && (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 space-y-1">
                <p className="font-medium">Modo de teste ativo (Ethereal)</p>
                <p>E-mails são capturados mas <strong>não entregues</strong>. Visualize em:</p>
                <a
                  href="https://ethereal.email/messages"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-mono text-xs"
                >
                  https://ethereal.email/messages
                </a>
                {status.etherealUser && (
                  <p className="text-xs mt-1">Login: <code>{status.etherealUser}</code></p>
                )}
                <p className="text-xs text-amber-600 mt-1">
                  Configure SMTP_HOST, SMTP_USER e SMTP_PASS para envio real.
                </p>
              </div>
            )}
            {status.modo === "local" && (
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800 space-y-1">
                <p className="font-medium">Modo captura local</p>
                <p>Sem acesso ao Ethereal. E-mails são processados e exibidos <strong>apenas nos logs do servidor</strong>.</p>
                <p className="text-xs text-blue-600 mt-1">
                  Configure SMTP_HOST, SMTP_USER e SMTP_PASS para envio real.
                </p>
              </div>
            )}
            {status.modo === "smtp" && (
              <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                <CheckCircle2 className="w-4 h-4 inline mr-1" />
                Servidor SMTP configurado. E-mails serão entregues normalmente.
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sem acesso ou erro ao carregar.</p>
        )}
      </div>

      {/* Envio de teste */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="font-medium">Enviar E-mail de Teste</h2>
        <div className="flex gap-3">
          <div className="flex-1">
            <Label htmlFor="para" className="sr-only">Destinatário</Label>
            <Input
              id="para"
              type="email"
              placeholder="destinatario@exemplo.com"
              value={para}
              onChange={(e) => setPara(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && para && testeMutation.mutate(para)}
            />
          </div>
          <Button
            onClick={() => testeMutation.mutate(para)}
            disabled={!para || testeMutation.isPending}
            className="gap-2"
          >
            <Send className="w-4 h-4" />
            {testeMutation.isPending ? "Enviando…" : "Enviar teste"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Envia um e-mail simples para confirmar que o servidor está funcionando.
          Em modo Ethereal, o link de preview aparece nos logs do servidor e em um toast.
        </p>
      </div>

      {/* Funcionalidades que enviam e-mail */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <h2 className="font-medium">E-mails por Funcionalidade</h2>
        <div className="space-y-2 text-sm">
          {[
            { func: "Recuperação de senha", quando: "Usuário solicita nova senha", rota: "POST /api/auth/recuperar-senha" },
            { func: "Boas-vindas", quando: "Novo usuário criado via Enturmação", rota: "POST /api/matriculas" },
            { func: "Ocorrência — menor de idade", quando: "Ocorrência registrada para estudante < 18 anos", rota: "POST /api/ocorrencias (automático)" },
            { func: "Notificação de responsáveis", quando: "Botão 'Notificar responsáveis' no carômetro", rota: "POST /api/ocorrencias/:id/notificar-pais" },
          ].map((item) => (
            <div key={item.func} className="flex gap-3 p-2 rounded bg-muted/40 border border-border/40">
              <Mail className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-xs">{item.func}</p>
                <p className="text-xs text-muted-foreground">{item.quando}</p>
                <code className="text-[10px] text-muted-foreground">{item.rota}</code>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
