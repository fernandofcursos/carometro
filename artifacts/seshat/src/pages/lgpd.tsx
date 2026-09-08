import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Lock, Eye, Download, Trash2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLGPD, CONSENT_PURPOSES } from "@/hooks/use-lgpd";
import { useAuth } from "@/contexts/auth";
import { LgpdConsentModal } from "@/components/lgpd-consent-modal";
import { cn } from "@/lib/utils";

export default function LgpdPage() {
  const { user } = useAuth();
  const { consents, pendingConsents, hasPendingConsents, exportMyData, requestDataDeletion } = useLGPD(user?.id ?? null);
  const [modalOpen, setModalOpen] = useState(false);

  const grantedCount = Object.values(consents).filter(Boolean).length;
  const totalCount = Object.values(CONSENT_PURPOSES).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">LGPD</h1>
        <p className="text-muted-foreground mt-2">Consentimentos e privacidade de dados pessoais conforme Lei nº 13.709/2018.</p>
      </div>

      {hasPendingConsents && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-600 flex items-center gap-2">
          <span className="font-semibold">⚠️ Você tem {pendingConsents.length} consentimento(s) pendente(s)</span>
          <Button size="sm" className="ml-auto h-7 text-xs" onClick={() => setModalOpen(true)}>Resolver</Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Consentimentos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {grantedCount} de {totalCount} finalidades autorizadas.
            </p>
            <div className="space-y-1">
              {Object.values(CONSENT_PURPOSES).map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-xs">
                  {consents[p.id] ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  <span className={cn("flex-1", consents[p.id] ? "text-foreground" : "text-muted-foreground")}>
                    {p.label}
                  </span>
                  {p.required && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Obrigatório</span>
                  )}
                  {p.sensitive && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium">Sensível</span>
                  )}
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" className="w-full" onClick={() => setModalOpen(true)}>
              Revisar consentimentos
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Transparência</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">Veja quais dados são coletados e como são utilizados no sistema.</p>
            <Button size="sm" variant="outline">Ver política de privacidade</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Exportar Dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">Exporte uma cópia dos seus dados pessoais (Art. 18, V).</p>
            <Button size="sm" variant="outline" onClick={() => exportMyData()}>Solicitar exportação</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Trash2 className="w-5 h-5 text-destructive" />
            <CardTitle className="text-lg">Revogar / Excluir</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">Solicite a exclusão de seus dados (Art. 18, VI). Esta ação é irreversível.</p>
            <Button
              size="sm"
              variant="destructive"
              className="text-xs"
              onClick={() => {
                if (window.confirm("Solicitar exclusão de todos os seus dados? Esta ação é irreversível.")) {
                  requestDataDeletion();
                  alert("Solicitação enviada. Você receberá confirmação em até 15 dias úteis (Art. 18 LGPD).");
                }
              }}
            >
              Solicitar exclusão
            </Button>
          </CardContent>
        </Card>
      </div>

      <LgpdConsentModal userId={user?.id ?? null} open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
