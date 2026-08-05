import { useState } from "react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { KeyRound, Eye, EyeOff } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function ShowToggle({ val, setVal }: { val: boolean; setVal: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => setVal(!val)}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      tabIndex={-1}
    >
      {val ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );
}

export function ChangePasswordDialog() {
  const { user, refetch } = useAuth();
  const { toast } = useToast();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [senhaConf, setSenhaConf] = useState("");
  const [showAtual, setShowAtual] = useState(false);
  const [showNova, setShowNova] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [loading, setLoading] = useState(false);

  const open = !!user?.primeiroAcesso;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senhaNova !== senhaConf) {
      toast({ title: "As senhas não coincidem", variant: "destructive" });
      return;
    }
    if (senhaNova.length < 6) {
      toast({ title: "A nova senha precisa ter ao menos 6 caracteres", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ senhaAtual, senhaNova }),
      });
      if (res.ok) {
        toast({ title: "Senha alterada com sucesso!" });
        await refetch();
        setSenhaAtual(""); setSenhaNova(""); setSenhaConf("");
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: body.error ?? "Erro ao alterar senha", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <div className="p-3 rounded-full bg-amber-100 text-amber-700"><KeyRound className="w-6 h-6" /></div>
          </div>
          <DialogTitle className="text-center">Defina sua nova senha</DialogTitle>
          <DialogDescription className="text-center">
            Este é seu primeiro acesso. Por segurança, você precisa alterar a senha antes de continuar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Senha atual (gerada no cadastro)</Label>
            <div className="relative">
              <Input
                type={showAtual ? "text" : "password"}
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                placeholder="Senha enviada pelo administrador"
                required
                className="pr-10"
              />
              <ShowToggle val={showAtual} setVal={setShowAtual} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Nova senha (mín. 6 caracteres)</Label>
            <div className="relative">
              <Input
                type={showNova ? "text" : "password"}
                value={senhaNova}
                onChange={(e) => setSenhaNova(e.target.value)}
                placeholder="Crie sua nova senha"
                required
                minLength={6}
                className="pr-10"
              />
              <ShowToggle val={showNova} setVal={setShowNova} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Confirmar nova senha</Label>
            <div className="relative">
              <Input
                type={showConf ? "text" : "password"}
                value={senhaConf}
                onChange={(e) => setSenhaConf(e.target.value)}
                placeholder="Repita a nova senha"
                required
                className="pr-10"
              />
              <ShowToggle val={showConf} setVal={setShowConf} />
            </div>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={loading || !senhaAtual || !senhaNova || !senhaConf}
          >
            {loading ? "Salvando..." : "Alterar senha e continuar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
