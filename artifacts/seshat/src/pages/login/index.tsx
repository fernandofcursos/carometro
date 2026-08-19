import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Grid, Eye, EyeOff, AtSign, Mail, KeyRound, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AcessibilidadeWidget } from "@/components/acessibilidade-widget";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Tela = "login" | "solicitar" | "redefinir";

export default function LoginPage() {
  const [tela, setTela] = useState<Tela>("login");

  // Login
  const [identificador, setIdentificador] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [loadingLogin, setLoadingLogin] = useState(false);

  // Solicitar recuperação
  const [emailRecuperacao, setEmailRecuperacao] = useState("");
  const [loadingSolicitar, setLoadingSolicitar] = useState(false);

  // Redefinir senha
  const [token, setToken] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [showNova, setShowNova] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [loadingRedefinir, setLoadingRedefinir] = useState(false);

  const { refetch } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const isEmail = identificador.includes("@");

  // ── Login ──────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingLogin(true);
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
      setLoadingLogin(false);
    }
  };

  // ── Solicitar recuperação ──────────────────────────────────────────────────
  const handleSolicitar = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingSolicitar(true);
    try {
      await fetch(`${BASE}/api/auth/solicitar-recuperacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailRecuperacao.trim().toLowerCase() }),
      });
      // Sempre mostra a mesma mensagem (não revela se e-mail existe)
      toast({ title: "Se o e-mail estiver cadastrado, o token foi enviado." });
      setTela("redefinir");
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setLoadingSolicitar(false);
    }
  };

  // ── Redefinir senha ────────────────────────────────────────────────────────
  const handleRedefinir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (novaSenha !== confirmarSenha) {
      toast({ title: "As senhas não coincidem", variant: "destructive" });
      return;
    }
    if (novaSenha.length < 8) {
      toast({ title: "A nova senha precisa ter mínimo 8 caracteres", variant: "destructive" });
      return;
    }
    setLoadingRedefinir(true);
    try {
      const res = await fetch(`${BASE}/api/auth/redefinir-senha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), novaSenha }),
      });
      if (res.ok) {
        toast({ title: "Senha redefinida com sucesso! Faça login com a nova senha." });
        setToken(""); setNovaSenha(""); setConfirmarSenha("");
        setTela("login");
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: body.error ?? "Token inválido ou expirado", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setLoadingRedefinir(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/40 p-4">
      <AcessibilidadeWidget />
      <Card className="w-full max-w-md shadow-xl border-border/50">

        {/* ── Tela de Login ── */}
        {tela === "login" && (
          <>
            <CardHeader className="text-center pb-2">
              <div className="flex justify-center mb-4">
                <div className="p-3 rounded-xl bg-primary/10 text-primary">
                  <Grid className="w-8 h-8" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold">Seshat</CardTitle>
              <CardDescription>Entre com seu e-mail ou código de acesso</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleLogin} className="space-y-5">
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
                <Button type="submit" className="w-full" disabled={loadingLogin}>
                  {loadingLogin ? "Entrando..." : "Entrar"}
                </Button>
                <button
                  type="button"
                  onClick={() => setTela("solicitar")}
                  className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors text-center"
                >
                  Esqueci minha senha
                </button>
              </form>
            </CardContent>
          </>
        )}

        {/* ── Tela de Solicitar Recuperação ── */}
        {tela === "solicitar" && (
          <>
            <CardHeader className="text-center pb-2">
              <div className="flex justify-center mb-4">
                <div className="p-3 rounded-xl bg-amber-100 text-amber-700">
                  <Mail className="w-8 h-8" />
                </div>
              </div>
              <CardTitle className="text-xl font-bold">Recuperar senha</CardTitle>
              <CardDescription>
                Informe seu e-mail cadastrado. Se existir, você receberá um token para redefinir a senha.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleSolicitar} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="emailRecuperacao">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="emailRecuperacao"
                      type="email"
                      value={emailRecuperacao}
                      onChange={(e) => setEmailRecuperacao(e.target.value)}
                      placeholder="email@escola.edu.br"
                      className="pl-9"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loadingSolicitar}>
                  {loadingSolicitar ? "Enviando..." : "Solicitar token"}
                </Button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTela("login")}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao login
                  </button>
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setTela("redefinir")}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Já tenho o token
                  </button>
                </div>
              </form>
            </CardContent>
          </>
        )}

        {/* ── Tela de Redefinir Senha ── */}
        {tela === "redefinir" && (
          <>
            <CardHeader className="text-center pb-2">
              <div className="flex justify-center mb-4">
                <div className="p-3 rounded-xl bg-primary/10 text-primary">
                  <KeyRound className="w-8 h-8" />
                </div>
              </div>
              <CardTitle className="text-xl font-bold">Redefinir senha</CardTitle>
              <CardDescription>
                Insira o token recebido e defina sua nova senha.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleRedefinir} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="token">Token de recuperação</Label>
                  <Input
                    id="token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Cole o token recebido"
                    className="font-mono text-sm"
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="novaSenha">Nova senha</Label>
                  <div className="relative">
                    <Input
                      id="novaSenha"
                      type={showNova ? "text" : "password"}
                      value={novaSenha}
                      onChange={(e) => setNovaSenha(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className="pr-10"
                      minLength={8}
                      required
                    />
                    <button type="button" onClick={() => setShowNova(!showNova)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showNova ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmarSenha">Confirmar nova senha</Label>
                  <div className="relative">
                    <Input
                      id="confirmarSenha"
                      type={showConfirmar ? "text" : "password"}
                      value={confirmarSenha}
                      onChange={(e) => setConfirmarSenha(e.target.value)}
                      placeholder="Repita a nova senha"
                      className="pr-10"
                      required
                    />
                    <button type="button" onClick={() => setShowConfirmar(!showConfirmar)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showConfirmar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loadingRedefinir}>
                  {loadingRedefinir ? "Redefinindo..." : "Redefinir senha"}
                </Button>
                <button
                  type="button"
                  onClick={() => setTela("solicitar")}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Solicitar novo token
                </button>
              </form>
            </CardContent>
          </>
        )}

      </Card>
    </div>
  );
}
