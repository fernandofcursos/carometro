import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  LayoutDashboard, FileText, AlertTriangle, Bell, Plus, Pencil, Trash2,
  Users, Building, ClipboardList, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}${path}`, { credentials: "include", ...opts });
const apiJson = (path: string, opts?: RequestInit) =>
  api(path, { headers: { "Content-Type": "application/json" }, ...opts });

function apiMsg(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "data" in err) {
    const d = (err as { data?: { error?: string } }).data;
    if (d?.error) return d.error;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

// ── Types ──────────────────────────────────────────────────────────────────────

type SecMe = {
  id: string; nome: string | null; fotoUrl: string | null;
};

type DashStats = {
  totalEstudantes: number;
  totalTurmas: number;
  requerimentosPendentes: number;
  ocorrenciasRecentes: number;
};

type OcorrDash = {
  id: string; estudanteNome: string | null;
  tipoDescricao: string; dataOcorrencia: string; cienteEm: string | null;
};

type Dashboard = { stats: DashStats; ocorrenciasRecentes: OcorrDash[] };

type Requerimento = {
  id: string; numero: string; status: string;
  criadoEm: string; assuntoNome: string; estudanteNome: string | null;
};

type Ocorrencia = {
  id: string; estudanteId: string; estudanteNome: string | null;
  tipoDescricao: string; dataOcorrencia: string; observacao: string | null;
  cienteEm: string | null; cientePorId: string | null; criadoEm: string;
};

type Aviso = {
  id: string; titulo: string; conteudo: string; tipo: string;
  publicoAlvo: string; turmaId: string | null; turmaSigla: string | null;
  publicado: boolean; criadoEm: string;
};

// ── Dashboard Tab ──────────────────────────────────────────────────────────────

function DashboardTab({ dash }: { dash: Dashboard }) {
  const [, setLocation] = useLocation();
  const s = dash.stats;
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Users className="h-5 w-5 mx-auto mb-1" style={{ color: "#0891b2" }} />
            <p className="text-2xl font-bold">{s.totalEstudantes}</p>
            <p className="text-xs text-muted-foreground">Total de Estudantes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Building className="h-5 w-5 mx-auto mb-1" style={{ color: "#0891b2" }} />
            <p className="text-2xl font-bold">{s.totalTurmas}</p>
            <p className="text-xs text-muted-foreground">Turmas Ativas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <FileText className="h-5 w-5 mx-auto mb-1 text-amber-500" />
            <p className="text-2xl font-bold">{s.requerimentosPendentes}</p>
            <p className="text-xs text-muted-foreground">Req. Pendentes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-rose-500" />
            <p className="text-2xl font-bold">{s.ocorrenciasRecentes}</p>
            <p className="text-xs text-muted-foreground">Ocorr. Recentes</p>
          </CardContent>
        </Card>
      </div>

      {/* Links rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => setLocation("/requerimentos/analise")}>
          <CardContent className="py-4 px-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <p className="font-medium text-sm">Análise de Requerimentos</p>
                <p className="text-xs text-muted-foreground">{s.requerimentosPendentes} pendentes</p>
              </div>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => setLocation("/enturmacao")}>
          <CardContent className="py-4 px-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 shrink-0" style={{ color: "#0891b2" }} />
              <div>
                <p className="font-medium text-sm">Gestão de Estudantes</p>
                <p className="text-xs text-muted-foreground">Enturmar, carteiras</p>
              </div>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      </div>

      {/* Ocorrências recentes resumidas */}
      {dash.ocorrenciasRecentes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" /> Ocorrências Recentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dash.ocorrenciasRecentes.map((o) => (
              <div key={o.id} className="flex gap-3 items-start rounded-lg border p-3">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1.5 items-center mb-0.5">
                    <span className="font-medium text-sm">{o.estudanteNome}</span>
                    <Badge variant="outline" className="text-xs">{o.tipoDescricao}</Badge>
                    {o.cienteEm
                      ? <Badge className="text-xs bg-green-600">Ciente</Badge>
                      : <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Pendente</Badge>
                    }
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(o.dataOcorrencia + "T12:00:00").toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {dash.ocorrenciasRecentes.length === 0 && s.requerimentosPendentes === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma atividade recente.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Requerimentos Tab ──────────────────────────────────────────────────────────

function statusColor(status: string) {
  if (status === "pendente") return "bg-amber-100 text-amber-800 border-amber-200";
  if (status === "em_analise") return "bg-blue-100 text-blue-800 border-blue-200";
  if (status === "deferido") return "bg-green-100 text-green-800 border-green-200";
  if (status === "indeferido") return "bg-red-100 text-red-800 border-red-200";
  return "";
}

function statusLabel(status: string) {
  if (status === "pendente") return "Pendente";
  if (status === "em_analise") return "Em Análise";
  if (status === "deferido") return "Deferido";
  if (status === "indeferido") return "Indeferido";
  return status;
}

function RequerimentosTab() {
  const [, setLocation] = useLocation();

  const { data: requerimentos = [], isLoading } = useQuery<Requerimento[]>({
    queryKey: ["sec-requerimentos"],
    queryFn: async () => {
      const r = await api("/api/portal-secretaria/requerimentos");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Requerimentos pendentes e em análise
        </h2>
        <Button size="sm" variant="outline" className="gap-1.5"
          onClick={() => setLocation("/requerimentos/analise")}>
          <ExternalLink className="h-4 w-4" /> Ir para Análise Completa
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : requerimentos.length === 0 ? (
        <Card><CardContent className="py-8 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum requerimento pendente.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {requerimentos.map((r) => (
            <Card key={r.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-3 px-4">
                <div className="flex gap-3 items-start">
                  <FileText className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1.5 items-center mb-0.5">
                      <span className="font-mono text-xs font-semibold">{r.numero}</span>
                      <Badge variant="outline" className={cn("text-xs border", statusColor(r.status))}>
                        {statusLabel(r.status)}
                      </Badge>
                    </div>
                    <p className="font-medium text-sm truncate">{r.assuntoNome}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.estudanteNome} · {new Date(r.criadoEm).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Ocorrências Tab ────────────────────────────────────────────────────────────

function OcorrenciasTab() {
  const { data: ocorrencias = [], isLoading } = useQuery<Ocorrencia[]>({
    queryKey: ["sec-ocorrencias"],
    queryFn: async () => {
      const r = await api("/api/portal-secretaria/ocorrencias");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground">
        Ocorrências recentes — todos os estudantes
      </h2>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : ocorrencias.length === 0 ? (
        <Card><CardContent className="py-8 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma ocorrência encontrada.</p>
        </CardContent></Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2 pr-3 font-medium">Estudante</th>
                <th className="text-left py-2 pr-3 font-medium">Tipo</th>
                <th className="text-left py-2 pr-3 font-medium">Data</th>
                <th className="text-left py-2 font-medium">Ciência</th>
              </tr>
            </thead>
            <tbody>
              {ocorrencias.map((o) => (
                <tr key={o.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2 pr-3 font-medium">{o.estudanteNome ?? "—"}</td>
                  <td className="py-2 pr-3">
                    <Badge variant="outline" className="text-xs">{o.tipoDescricao}</Badge>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground text-xs">
                    {new Date(o.dataOcorrencia + "T12:00:00").toLocaleDateString("pt-BR")}
                  </td>
                  <td className="py-2">
                    {o.cienteEm
                      ? <Badge className="text-xs bg-green-600">Ciente</Badge>
                      : <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Pendente</Badge>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Avisos Tab ─────────────────────────────────────────────────────────────────

type AvisoForm = {
  titulo: string; conteudo: string;
  tipo: "aviso" | "informe"; publicoAlvo: "estudantes" | "responsaveis" | "todos";
  turmaId: string; publicado: boolean;
};

function AvisosTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Aviso | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<AvisoForm>({
    titulo: "", conteudo: "", tipo: "aviso",
    publicoAlvo: "todos", turmaId: "", publicado: false,
  });

  const { data: avisos = [], isLoading } = useQuery<Aviso[]>({
    queryKey: ["sec-avisos"],
    queryFn: async () => {
      const r = await api("/api/portal-secretaria/avisos");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = { ...form, turmaId: form.turmaId || null };
      const method = editTarget ? "PUT" : "POST";
      const url = editTarget
        ? `/api/portal-secretaria/avisos/${editTarget.id}`
        : "/api/portal-secretaria/avisos";
      const r = await apiJson(url, { method, body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json(); throw { data: d }; }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: editTarget ? "Aviso atualizado." : "Aviso criado." });
      qc.invalidateQueries({ queryKey: ["sec-avisos"] });
      qc.invalidateQueries({ queryKey: ["sec-dashboard"] });
      setOpen(false); setEditTarget(null);
    },
    onError: (err) => toast({ variant: "destructive", title: apiMsg(err, "Erro ao salvar.") }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await api(`/api/portal-secretaria/avisos/${id}`, { method: "DELETE" });
      if (!r.ok) { const d = await r.json(); throw { data: d }; }
    },
    onSuccess: () => {
      toast({ title: "Aviso excluído." });
      qc.invalidateQueries({ queryKey: ["sec-avisos"] });
      setDeleteId(null);
    },
    onError: (err) => toast({ variant: "destructive", title: apiMsg(err, "Erro ao excluir.") }),
  });

  function openNew() {
    setEditTarget(null);
    setForm({ titulo: "", conteudo: "", tipo: "aviso", publicoAlvo: "todos", turmaId: "", publicado: false });
    setOpen(true);
  }

  function openEdit(a: Aviso) {
    setEditTarget(a);
    setForm({
      titulo: a.titulo, conteudo: a.conteudo,
      tipo: a.tipo as "aviso" | "informe",
      publicoAlvo: a.publicoAlvo as "estudantes" | "responsaveis" | "todos",
      turmaId: a.turmaId ?? "", publicado: a.publicado,
    });
    setOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-semibold text-muted-foreground">Avisos e Informes</h2>
        <Button size="sm" onClick={openNew} className="gap-1.5"
          style={{ backgroundColor: "#0891b2" }}>
          <Plus className="h-4 w-4" /> Novo Aviso
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : avisos.length === 0 ? (
        <Card><CardContent className="py-8 text-center">
          <Bell className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum aviso criado ainda.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {avisos.map((a) => (
            <Card key={a.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-3 px-4">
                <div className="flex gap-3 items-start">
                  <Bell className={cn("h-4 w-4 mt-0.5 shrink-0", a.tipo === "aviso" ? "text-amber-500" : "text-blue-500")} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1.5 items-center mb-0.5">
                      <span className="font-medium text-sm">{a.titulo}</span>
                      <Badge variant={a.tipo === "aviso" ? "default" : "secondary"} className="text-xs">
                        {a.tipo === "aviso" ? "Aviso" : "Informe"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {a.publicoAlvo === "estudantes" ? "Estudantes" : a.publicoAlvo === "responsaveis" ? "Responsáveis" : "Todos"}
                      </Badge>
                      {a.turmaSigla && <Badge variant="secondary" className="text-xs font-mono">{a.turmaSigla}</Badge>}
                      {a.publicado
                        ? <Badge className="text-xs bg-green-600">Publicado</Badge>
                        : <Badge variant="outline" className="text-xs text-muted-foreground">Rascunho</Badge>
                      }
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{a.conteudo}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      {new Date(a.criadoEm).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(a.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Editar Aviso" : "Novo Aviso / Informe"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as "aviso" | "informe" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aviso">Aviso</SelectItem>
                    <SelectItem value="informe">Informe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Público-alvo</Label>
                <Select value={form.publicoAlvo} onValueChange={(v) => setForm({ ...form, publicoAlvo: v as "estudantes" | "responsaveis" | "todos" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="estudantes">Estudantes</SelectItem>
                    <SelectItem value="responsaveis">Responsáveis</SelectItem>
                    <SelectItem value="todos">Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Título</Label>
              <Input maxLength={200} value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </div>
            <div>
              <Label>Conteúdo</Label>
              <Textarea rows={4} value={form.conteudo}
                onChange={(e) => setForm({ ...form, conteudo: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="publicado" checked={form.publicado}
                onChange={(e) => setForm({ ...form, publicado: e.target.checked })}
                className="rounded border" />
              <Label htmlFor="publicado" className="cursor-pointer">Publicar imediatamente</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
              style={{ backgroundColor: "#0891b2" }}>
              {saveMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aviso?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground"
              onClick={() => deleteId && deleteMut.mutate(deleteId)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PortalSecretariaPage() {
  const { data: me } = useQuery<SecMe>({
    queryKey: ["sec-me"],
    queryFn: async () => {
      const r = await api("/api/portal-secretaria/me");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const { data: dash, isLoading: dashLoading } = useQuery<Dashboard>({
    queryKey: ["sec-dashboard"],
    queryFn: async () => {
      const r = await api("/api/portal-secretaria/dashboard");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
      {/* Header */}
      <div className="rounded-2xl p-5 text-white" style={{ background: "linear-gradient(to right, #0891b2, #0e7490)" }}>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold">
            {me?.nome?.charAt(0).toUpperCase() ?? "S"}
          </div>
          <div>
            <p className="font-bold text-lg leading-tight">{me?.nome ?? "Secretaria"}</p>
            <p className="text-sm" style={{ color: "#a5f3fc" }}>Portal da Secretaria</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="dashboard">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="dashboard" className="gap-1.5 text-xs sm:text-sm">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="requerimentos" className="gap-1.5 text-xs sm:text-sm">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Requerimentos</span>
          </TabsTrigger>
          <TabsTrigger value="ocorrencias" className="gap-1.5 text-xs sm:text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Ocorrências</span>
          </TabsTrigger>
          <TabsTrigger value="avisos" className="gap-1.5 text-xs sm:text-sm">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Avisos</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          {dashLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : dash ? (
            <DashboardTab dash={dash} />
          ) : null}
        </TabsContent>

        <TabsContent value="requerimentos" className="mt-4">
          <RequerimentosTab />
        </TabsContent>

        <TabsContent value="ocorrencias" className="mt-4">
          <OcorrenciasTab />
        </TabsContent>

        <TabsContent value="avisos" className="mt-4">
          <AvisosTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
