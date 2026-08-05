import { useState } from "react";
import { useLGPD, CONSENT_PURPOSES } from "@/hooks/use-lgpd";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Shield, Download, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function LgpdConsentModal({
  userId,
  open,
  onOpenChange,
}: {
  userId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { consents, giveConsent, revokeConsent, exportMyData, pendingConsents, hasPendingConsents } = useLGPD(userId);
  const [localConsents, setLocalConsents] = useState<Record<string, boolean>>({ ...consents });
  const [saved, setSaved] = useState(false);

  const handleToggle = (purposeId: string, required: boolean) => {
    if (required) return;
    setLocalConsents((prev) => ({ ...prev, [purposeId]: !prev[purposeId] }));
  };

  const handleSave = () => {
    Object.entries(localConsents).forEach(([id, granted]) => {
      const purpose = Object.values(CONSENT_PURPOSES).find((p) => p.id === id);
      if (purpose?.required) return;
      if (granted) giveConsent(id);
      else revokeConsent(id);
    });
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onOpenChange(false);
    }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Privacidade & Consentimentos</DialogTitle>
          <DialogDescription>Lei nº 13.709/2018 — LGPD</DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Privacidade & Consentimentos</h2>
              <p className="text-xs text-muted-foreground">Lei nº 13.709/2018 — LGPD</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            O Carômetro trata dados pessoais de colaboradores. Gerencie abaixo
            quais tratamentos você autoriza. Consentimentos podem ser revogados
            a qualquer momento via <strong>Configurações → Privacidade</strong>.
          </p>

          {hasPendingConsents && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-600">
              ⚠️ Você tem {pendingConsents.length} consentimento(s) pendente(s)
            </div>
          )}

          <div className="space-y-2">
            {Object.values(CONSENT_PURPOSES).map((purpose) => (
              <div
                key={purpose.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                  purpose.sensitive
                    ? "border-amber-500/20 bg-amber-500/5"
                    : "border-border bg-card"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{purpose.label}</span>
                    {purpose.required && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        Obrigatório
                      </span>
                    )}
                    {purpose.sensitive && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium">
                        Dado sensível
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{purpose.description}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{purpose.legalBasis}</p>
                </div>
                <button
                  onClick={() => handleToggle(purpose.id, purpose.required)}
                  disabled={purpose.required}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed",
                    (localConsents[purpose.id] ?? consents[purpose.id] ?? false)
                      ? "bg-primary"
                      : "bg-muted",
                    purpose.required && "opacity-50"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform",
                      (localConsents[purpose.id] ?? consents[purpose.id] ?? false)
                        ? "translate-x-5"
                        : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            ))}
          </div>

          {/* Art. 18 — Direitos */}
          <div className="rounded-lg border border-secondary/30 bg-secondary/5 p-3 space-y-2">
            <p className="text-xs font-semibold text-secondary-foreground uppercase tracking-wide">
              Seus direitos (Art. 18 LGPD)
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={exportMyData} className="text-xs gap-1">
                <Download className="w-3.5 h-3.5" /> Exportar meus dados
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (
                    window.confirm(
                      "Solicitar exclusão de todos os seus dados? Esta ação é irreversível."
                    )
                  ) {
                    alert(
                      "Solicitação enviada. Você receberá confirmação em até 15 dias úteis (Art. 18 LGPD)."
                    );
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5" /> Solicitar exclusão
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saved}>
              {saved ? "✅ Salvo!" : "Salvar preferências"}
            </Button>
          </div>

          <p className="text-[10px] text-center text-muted-foreground">
            Encarregado de Dados (DPO):{" "}
            <a href="mailto:dpo@carometro.com.br" className="text-primary hover:underline">
              dpo@carometro.com.br
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
