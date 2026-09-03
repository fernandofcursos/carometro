import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + url, { credentials: "include", ...init });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw { status: r.status, data: e }; }
  return r.json();
}
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileText, CheckCircle2, XCircle, Clock, Pen, AlertCircle,
  ChevronRight, Loader2, Search, GraduationCap,
} from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Assinatura { papel: string; metodo: string; assinadoEm: string; nome: string | null }
interface Requerimento {
  id: string; numero: string; status: string; assuntoNome: string; tipoNome: string;
  estudanteNome: string; estudanteRegistro?: string; requerenteNome: string | null;
  tipoRequerente: string; criadoEm: string; analisadoEm: string | null;
  exposicaoMotivos: string | null; parecer: string | null;
  cursoNome?: string | null; turnoNome?: string | null;
  assinaturas: Assinatura[];
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pendente:    { label: "Pendente",    color: "text-amber-600 bg-amber-50 border-amber-200" },
  em_analise:  { label: "Em Análise",  color: "text-blue-600 bg-blue-50 border-blue-200"   },
  deferido:    { label: "Deferido",    color: "text-green-700 bg-green-50 border-green-200" },
  indeferido:  { label: "Indeferido",  color: "text-red-600 bg-red-50 border-red-200"       },
};

function contarPalavras(t: string) { return t.trim().split(/\s+/).filter(Boolean).length; }

// ── Modal de Assinatura ───────────────────────────────────────────────────────
function AssinarModal({
  requerimentoId, onClose,
}: { requerimentoId: string; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [metodo, setMetodo] = useState<"senha">("senha");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAssinar() {
    if (!senha) { toast({ title: "Informe a senha.", variant: "destructive" }); return; }
    setLoading(true);
    try {
      await api(`/api/requerimentos/${requerimentoId}/assinar-analise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metodo, senha }),
      });
      toast({ title: "Assinatura registrada." });
      qc.invalidateQueries({ queryKey: ["requerimentos-analise"] });
      onClose();
    } catch (err: any) {
      toast({ title: err?.data?.error ?? "Erro ao assinar.", variant: "destructive" });
    } finally { setLoading(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pen className="h-5 w-5" /> Assinar como Analisador
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Ao assinar, você confirma a decisão registrada neste requerimento.
            </AlertDescription>
          </Alert>
          <div className="space-y-1">
            <Label htmlFor="senha-anal">Senha do sistema</Label>
            <Input id="senha-anal" type="password" placeholder="Sua senha de acesso"
              value={senha} onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAssinar()} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleAssinar} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Pen className="h-4 w-4 mr-2" /> Assinar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal de Análise ──────────────────────────────────────────────────────────
function AnalisarModal({
  req, onClose,
}: { req: Requerimento; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [decisao, setDecisao] = useState<"em_analise" | "deferido" | "indeferido">(
    req.status === "deferido" || req.status === "indeferido" ? req.status as any : "em_analise"
  );
  const [parecer, setParecer] = useState(req.parecer ?? "");
  const [loading, setLoading] = useState(false);
  const [showAssinar, setShowAssinar] = useState(false);

  const palavras = contarPalavras(parecer);
  const dataFormatada = new Date(req.criadoEm).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  });

  async function handleSalvar() {
    if (decisao === "indeferido" && !parecer.trim()) {
      return toast({ title: "Informe a motivação do indeferimento.", variant: "destructive" });
    }
    if (palavras > 1000) {
      return toast({ title: "O parecer deve ter no máximo 1000 palavras.", variant: "destructive" });
    }
    setLoading(true);
    try {
      await api(`/api/requerimentos/${req.id}/analisar`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: decisao, parecer: decisao === "indeferido" ? parecer : null }),
      });
      toast({ title: "Requerimento analisado com sucesso." });
      qc.invalidateQueries({ queryKey: ["requerimentos-analise"] });
      if (decisao === "deferido" || decisao === "indeferido") {
        setShowAssinar(true);
      } else {
        onClose();
      }
    } catch (err: any) {
      toast({ title: err?.data?.error ?? "Erro ao analisar.", variant: "destructive" });
    } finally { setLoading(false); }
  }

  if (showAssinar) {
    return <AssinarModal requerimentoId={req.id} onClose={onClose} />;
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Análise — {req.numero}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2 text-sm">
          {/* Visualização do requerimento — fiel ao formulário físico */}
          <div className="border rounded-lg p-5 bg-muted/20 space-y-4">
            <div className="text-center border-b pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Secretaria Escolar</p>
              <h2 className="text-base font-bold uppercase mt-1">Requerimento Geral</h2>
              <p className="text-xs text-muted-foreground font-mono">{req.numero}</p>
            </div>

            {/* Dados do aluno */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Nome do Aluno</p>
                <p className="font-semibold">{req.estudanteNome}</p>
              </div>
              {req.estudanteRegistro && (
                <div>
                  <p className="text-xs text-muted-foreground">Registro</p>
                  <p className="font-semibold">{req.estudanteRegistro}</p>
                </div>
              )}
              {req.cursoNome && (
                <div>
                  <p className="text-xs text-muted-foreground">Curso Atual</p>
                  <p className="font-semibold">{req.cursoNome}</p>
                </div>
              )}
              {req.turnoNome && (
                <div>
                  <p className="text-xs text-muted-foreground">Turno Atual</p>
                  <p className="font-semibold">{req.turnoNome}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Requerente</p>
                <p className="font-semibold">
                  {req.requerenteNome ?? "—"}
                  <span className="text-xs text-muted-foreground ml-1">
                    ({req.tipoRequerente === "pai_responsavel" ? "Pai/Responsável" : "Estudante"})
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Data do Requerimento</p>
                <p className="font-semibold">{dataFormatada}</p>
              </div>
            </div>

            <Separator />

            {/* Assunto */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Requer a Vossa Senhoria</p>
              <div className="flex items-center gap-2 p-2 bg-background rounded border">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold">{req.assuntoNome}</span>
              </div>
            </div>

            {/* Exposição de motivos */}
            {req.exposicaoMotivos && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Exposição de Motivos</p>
                <p className="text-sm leading-relaxed bg-background border p-3 rounded whitespace-pre-wrap">
                  {req.exposicaoMotivos}
                </p>
              </div>
            )}

            {/* Assinatura do requerente */}
            <div className="border-t pt-3">
              <p className="text-xs text-muted-foreground mb-2">Assinatura do Requerente</p>
              {req.assinaturas.find((a) => a.papel === "requerente") ? (
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs">
                    Assinado em {new Date(req.assinaturas.find((a) => a.papel === "requerente")!.assinadoEm)
                      .toLocaleDateString("pt-BR")}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Aguardando assinatura do requerente
                </p>
              )}
            </div>
          </div>

          {/* Campo de análise — "Esse campo será preenchido pela secretaria" */}
          <div className="space-y-4">
            <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
              Campo de análise — Secretaria
            </h3>

            <div className="space-y-2">
              <Label>Decisão</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "em_analise", label: "Em Análise", icon: Clock,        cls: "text-blue-600 border-blue-300 bg-blue-50" },
                  { value: "deferido",   label: "Deferido",   icon: CheckCircle2, cls: "text-green-700 border-green-300 bg-green-50" },
                  { value: "indeferido", label: "Indeferido", icon: XCircle,      cls: "text-red-600 border-red-300 bg-red-50" },
                ].map(({ value, label, icon: Icon, cls }) => (
                  <button key={value}
                    type="button"
                    onClick={() => setDecisao(value as any)}
                    className={`flex flex-col items-center gap-1.5 p-3 border-2 rounded-lg font-medium text-sm transition-all
                      ${decisao === value ? cls + " border-current" : "border-muted text-muted-foreground hover:border-muted-foreground/40"}`}>
                    <Icon className="h-5 w-5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {decisao === "indeferido" && (
              <div className="space-y-1">
                <Label htmlFor="parecer">
                  Motivação do Indeferimento <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="parecer"
                  placeholder="Descreva o motivo do indeferimento..."
                  value={parecer}
                  onChange={(e) => setParecer(e.target.value)}
                  rows={5}
                  className="resize-none"
                />
                <p className={`text-xs text-right ${palavras > 1000 ? "text-destructive" : "text-muted-foreground"}`}>
                  {palavras} / 1000 palavras
                </p>
              </div>
            )}

            {/* Data da análise */}
            <div className="text-right text-xs text-muted-foreground">
              Santa Maria – DF, {new Date().toLocaleDateString("pt-BR", {
                day: "2-digit", month: "long", year: "numeric",
              })}
            </div>

            {/* Assinaturas lado a lado */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="border rounded p-3 text-center">
                <div className="h-8 border-b-2 border-dashed border-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">Supervisor Pedagógico</p>
              </div>
              <div className="border rounded p-3 text-center">
                <div className="h-8 border-b-2 border-dashed border-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">Chefe de Secretaria</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={loading}
            variant={decisao === "indeferido" ? "destructive" : "default"}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {decisao === "deferido"   && <CheckCircle2 className="h-4 w-4 mr-2" />}
            {decisao === "indeferido" && <XCircle      className="h-4 w-4 mr-2" />}
            {decisao === "em_analise" && <Clock        className="h-4 w-4 mr-2" />}
            Salvar Decisão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Card de requerimento ──────────────────────────────────────────────────────
function RequerimentoCard({
  req, onClick,
}: { req: Requerimento; onClick: () => void }) {
  const s = STATUS_LABEL[req.status];
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-mono text-xs text-muted-foreground">{req.numero}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded border ${s.color}`}>
                {s.label}
              </span>
              {req.assinaturas.find((a) => a.papel === "requerente") ? (
                <span className="text-xs text-green-600 flex items-center gap-0.5">
                  <CheckCircle2 className="h-3 w-3" /> Assinado
                </span>
              ) : (
                <span className="text-xs text-amber-500 flex items-center gap-0.5">
                  <Clock className="h-3 w-3" /> Sem assinatura
                </span>
              )}
            </div>
            <p className="font-semibold text-sm">{req.assuntoNome}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <GraduationCap className="h-3 w-3" /> {req.estudanteNome}
              </span>
              <span>{req.cursoNome ?? "Sem curso"}</span>
              <span>{new Date(req.criadoEm).toLocaleDateString("pt-BR")}</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Página principal de análise ───────────────────────────────────────────────
export default function RequerimentoAnalisePage() {
  const { toast } = useToast();
  const [busca, setBusca] = useState("");
  const [tab, setTab] = useState("pendente");
  const [analisando, setAnalisando] = useState<Requerimento | null>(null);

  const { data: lista = [], isLoading } = useQuery<Requerimento[]>({
    queryKey: ["requerimentos-analise"],
    queryFn: () => fetchJson("/api/requerimentos"),
    refetchInterval: 30_000,
  });

  const filtrado = lista.filter((r) => {
    const matchStatus = tab === "todos" || r.status === tab ||
      (tab === "pendente" && r.status === "em_analise");
    const q = busca.toLowerCase();
    const matchBusca = !q || r.numero.toLowerCase().includes(q) ||
      r.estudanteNome.toLowerCase().includes(q) ||
      r.assuntoNome.toLowerCase().includes(q);
    return matchStatus && matchBusca;
  });

  const counts = {
    pendente:  lista.filter((r) => ["pendente", "em_analise"].includes(r.status)).length,
    deferido:  lista.filter((r) => r.status === "deferido").length,
    indeferido: lista.filter((r) => r.status === "indeferido").length,
    todos:     lista.length,
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 p-4">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" /> Análise de Requerimentos
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie as solicitações recebidas pela Secretaria.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Pendentes",   value: counts.pendente,   cls: "text-amber-600"  },
          { label: "Deferidos",   value: counts.deferido,   cls: "text-green-700"  },
          { label: "Indeferidos", value: counts.indeferido, cls: "text-red-600"    },
          { label: "Total",       value: counts.todos,      cls: "text-foreground" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className={`text-2xl font-bold ${k.cls}`}>{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Buscar por número, estudante ou assunto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="pendente" className="flex-1">
            Pendentes <span className="ml-1.5 text-xs bg-muted px-1.5 rounded">{counts.pendente}</span>
          </TabsTrigger>
          <TabsTrigger value="deferido"   className="flex-1">Deferidos</TabsTrigger>
          <TabsTrigger value="indeferido" className="flex-1">Indeferidos</TabsTrigger>
          <TabsTrigger value="todos"      className="flex-1">Todos</TabsTrigger>
        </TabsList>

        {["pendente", "deferido", "indeferido", "todos"].map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtrado.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum requerimento encontrado.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtrado.map((r) => (
                  <RequerimentoCard key={r.id} req={r} onClick={() => setAnalisando(r)} />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {analisando && (
        <AnalisarModal
          req={analisando}
          onClose={() => setAnalisando(null)}
        />
      )}
    </div>
  );
}
