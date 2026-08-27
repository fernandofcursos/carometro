import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreditCard, X, ShieldOff, Search } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────

type CarteiraAdmin = {
  id: string; usuarioId: string; nomeEstudante: string | null;
  matriculaId: string | null; tipo: string; ano: number; semestre: number;
  status: string; canceladoEm: string | null; criadoEm: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

async function postJson(url: string, body?: object) {
  const r = await fetch(url, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

function formatarData(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.substring(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ativa")     return <Badge className="bg-green-100 text-green-800 border-green-200">Ativa</Badge>;
  if (status === "cancelada") return <Badge variant="destructive">Cancelada</Badge>;
  if (status === "revogada")  return <Badge className="bg-gray-200 text-gray-700">Revogada</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function TipoBadge({ tipo }: { tipo: string }) {
  if (tipo === "carteira")        return <Badge variant="outline" className="text-blue-700">Carteira</Badge>;
  if (tipo === "cartao-semestral") return <Badge variant="outline" className="text-purple-700">Cartão Semestral</Badge>;
  return <Badge variant="outline">{tipo}</Badge>;
}

// ── Diálogo de confirmação ────────────────────────────────────────────────────

type Acao = { id: string; acao: "cancelar" | "revogar"; nome: string | null; tipo: string };

function DialogConfirmacao({
  alvo, onConfirm, onClose, loading,
}: { alvo: Acao | null; onConfirm: () => void; onClose: () => void; loading: boolean }) {
  return (
    <AlertDialog open={!!alvo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {alvo?.acao === "cancelar" ? "Cancelar documento" : "Revogar documento"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {alvo?.acao === "cancelar"
              ? `Cancelar a ${alvo?.tipo === "carteira" ? "carteira de estudante" : "cartão semestral"} de ${alvo?.nome ?? "estudante"}?
                 O documento ficará inválido e não poderá ser reativado. Uma nova carteira pode ser emitida na próxima enturmação.`
              : `Revogar a ${alvo?.tipo === "carteira" ? "carteira de estudante" : "cartão semestral"} de ${alvo?.nome ?? "estudante"}?
                 A revogação é definitiva e indica uso indevido ou fraude. O QR code será invalidado imediatamente.`
            }
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Não</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? "Processando..." : alvo?.acao === "cancelar" ? "Cancelar documento" : "Revogar documento"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function CarteirasPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("ativa");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [alvo, setAlvo] = useState<Acao | null>(null);

  const anoAtual = new Date().getFullYear();

  const { data: carteiras = [], isLoading } = useQuery<CarteiraAdmin[]>({
    queryKey: ["carteiras-admin", filtroStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filtroStatus !== "todos") params.set("status", filtroStatus);
      return fetchJson(`${BASE}/api/carteiras?${params}`);
    },
  });

  const acaoMut = useMutation({
    mutationFn: ({ id, acao }: { id: string; acao: string }) =>
      postJson(`${BASE}/api/carteiras/${id}/${acao}`),
    onSuccess: () => {
      toast({ title: `Documento ${alvo?.acao === "cancelar" ? "cancelado" : "revogado"} com sucesso.` });
      qc.invalidateQueries({ queryKey: ["carteiras-admin"] });
      setAlvo(null);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const carteirasExibidas = carteiras.filter((c) => {
    const matchBusca = !busca || (c.nomeEstudante ?? "").toLowerCase().includes(busca.toLowerCase());
    const matchTipo  = filtroTipo === "todos" || c.tipo === filtroTipo;
    return matchBusca && matchTipo;
  });

  return (
    <div className="p-6 flex flex-col gap-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <CreditCard className="w-5 h-5" />
        <h1 className="text-xl font-bold">Gestão de Carteiras e Cartões</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Carteiras de estudante e cartões de liberação semestral. Cancele ou revogue documentos inválidos,
        extraviados ou quando houver suspeita de uso indevido. A emissão é automática ao enturmar o estudante.
      </p>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            <SelectItem value="ativa">Ativas</SelectItem>
            <SelectItem value="cancelada">Canceladas</SelectItem>
            <SelectItem value="revogada">Revogadas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="carteira">Carteira de estudante</SelectItem>
            <SelectItem value="cartao-semestral">Cartão semestral</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : carteirasExibidas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum documento encontrado.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {carteirasExibidas.map((c) => (
            <Card key={c.id} className={c.status !== "ativa" ? "opacity-70" : ""}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{c.nomeEstudante ?? "—"}</span>
                    <TipoBadge tipo={c.tipo} />
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {c.semestre}º semestre / {c.ano}
                    {c.canceladoEm && ` — ${c.status === "revogada" ? "Revogado" : "Cancelado"} em ${formatarData(c.canceladoEm)}`}
                    {` — Emitido em ${formatarData(c.criadoEm)}`}
                  </p>
                </div>

                {c.status === "ativa" && (
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-amber-700 border-amber-300 hover:bg-amber-50"
                      onClick={() => setAlvo({ id: c.id, acao: "cancelar", nome: c.nomeEstudante, tipo: c.tipo })}
                    >
                      <X className="w-3.5 h-3.5" /> Cancelar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-red-700 border-red-300 hover:bg-red-50"
                      onClick={() => setAlvo({ id: c.id, acao: "revogar", nome: c.nomeEstudante, tipo: c.tipo })}
                    >
                      <ShieldOff className="w-3.5 h-3.5" /> Revogar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DialogConfirmacao
        alvo={alvo}
        onConfirm={() => alvo && acaoMut.mutate({ id: alvo.id, acao: alvo.acao })}
        onClose={() => setAlvo(null)}
        loading={acaoMut.isPending}
      />
    </div>
  );
}
