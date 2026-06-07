import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Grid, Eye, EyeOff, AtSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AcessibilidadeWidget } from "@/components/acessibilidade-widget"; // widget flutuante no login

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function LoginPage() {
  const [identificador, setIdentificador] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const { refetch } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const isEmail = identificador.includes("@");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identificador: identificador.trim(), senha }),
      });
      if (res.ok) {
        await refetch();
        setLocation("/");
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: body.error ?? "Identificador ou senha inválidos", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/40 p-4">
      {/* Widget de acessibilidade disponível no login — fixo no canto inferior esquerdo */}
      <AcessibilidadeWidget />
      <Card className="w-full max-w-md shadow-xl border-border/50">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <Grid className="w-8 h-8" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Carômetro</CardTitle>
          <CardDescription>Entre com seu e-mail ou código de acesso</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="identificador">E-mail ou Código de Acesso</Label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="identificador"
                  value={identificador}
                  onChange={(e) => {
                    const val = e.target.value;
                    setIdentificador(val.includes("@") ? val.toLowerCase() : val.toUpperCase());
                  }}
                  placeholder="email@escola.edu.br ou AB3K9M2P"
                  className={`pl-9 ${!isEmail && identificador ? "font-mono tracking-widest" : ""}`}
                  autoComplete="username"
                  autoCapitalize="none"
                  required
                />
              </div>
              {identificador && (
                <p className="text-xs text-muted-foreground">
                  {isEmail ? "Identificando por e-mail" : "Identificando por código de acesso"}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <div className="relative">
                <Input
                  id="senha"
                  type={showSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Sua senha"
                  className="pr-10"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowSenha(!showSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
