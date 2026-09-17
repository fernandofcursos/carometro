import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { School } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface EscolaDisponivel {
  id: string;
  nome: string;
  sigla: string;
}

interface EscolaSelectModalProps {
  escolas: EscolaDisponivel[];
  onSelect: () => void;
  onError: (msg: string) => void;
}

export function EscolaSelectModal({ escolas, onSelect, onError }: EscolaSelectModalProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleSelect = async (escolaId: string) => {
    setLoading(escolaId);
    try {
      const res = await fetch(`${BASE}/api/auth/selecionar-escola`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ escolaId }),
      });
      if (res.ok) {
        onSelect();
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        onError(body.error ?? "Erro ao selecionar escola");
      }
    } catch {
      onError("Erro de conexão");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Selecione a escola</DialogTitle>
          <DialogDescription>
            Você tem acesso a mais de uma escola. Escolha com qual deseja trabalhar.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-2">
          {escolas.map((escola) => (
            <Button
              key={escola.id}
              variant="outline"
              className="w-full justify-start gap-3 h-auto py-3 px-4"
              disabled={loading !== null}
              onClick={() => handleSelect(escola.id)}
            >
              <div className="p-1.5 rounded-md bg-primary/10 text-primary shrink-0">
                <School className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="font-medium text-sm">{escola.nome}</div>
                <div className="text-xs text-muted-foreground font-mono">{escola.sigla}</div>
              </div>
              {loading === escola.id && (
                <span className="ml-auto text-xs text-muted-foreground">Entrando...</span>
              )}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
