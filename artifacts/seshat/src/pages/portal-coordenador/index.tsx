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
  LayoutDashboard, AlertTriangle, Bell, User, Plus, Pencil, Trash2, CheckCircle2,
  Users, BookOpen, ClipboardList,
} from "lucide-react";
import { AvisosWidget } from "@/components/avisos-widget";
import { CardapioWidget } from "@/components/cardapio-widget";
import { cn } from "@/lib/utils";

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

type CoorMe = {
  id: string; nome: string | null; fotoUrl: string | null;
  cursos: { cursoId: string; cursoNome: string }[];
};

type DashStats = { totalEstudantes: number; totalTurmas: number; ocorrenciasSemana: number };

type OcorrRecente = {
  id: string; estudanteNome: string | null;
  tipoDescricao: string; dataOcorrencia: string;
  cienteEm: string | null; cursoNome: string;
};

type AvisoDash = {
  id: string; titulo: string; tipo: string;
  publicoAlvo: string; turmaSigla: string | null; criadoEm: string;
};

type Dashboard = {
  cursos: { cursoId: string; cursoNome: string }[];
  stats: DashStats;
  ocorrenciasRecentes: OcorrRecente[];
  avisos: AvisoDash[];
};

type Ocorrencia = {
  id: string; estudanteId: string; estudanteNome: string | null;
  tipoDescricao: string; dataOcorrencia: string; observacao: string | null;
  cienteEm: string | null; cientePorId: string | null;
  criadoEm: string; cursoNome: string; turmaSigla: string | null;
};

type Aviso = {
  id: string; titulo: string; conteudo: string; tipo: string;
  publicoAlvo: string; turmaId: string | null; turmaSigla: string | null;
  publicado: boolean; criadoEm: string;
};

// ── Dashboard Tab ──────────────────────────────────────────────────────────────

function DashboardTab({ dash, onCiente }: { dash: Dashboard; onCiente: (id: string) => void }) {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Users className="h-5 w-5 mx-auto text-blue-600 mb-1" />
            <p className="text-2xl font-bold">{dash.stats.totalEstudantes}</p>
            <p className="text-xs text-muted-foreground">Estudantes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <BookOpen className="h-5 w-5 mx-auto text-indigo-600 mb-1" />
            <p className="text-2xl font-bold">{dash.stats.totalTurmas}</p>
            <p className="text-xs text-muted-foreground">Turmas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto text-amber-500 mb-1" />
            <p className="text-2xl font-bold">{dash.stats.ocorrenciasSemana}</p>
            <p className="text-xs text-muted-foreground">Ocorr. (7d)</p>
          </CardContent>
        </Card>
      </div>

      {/* Ocorrências recentes */}
      {dash.ocorrenciasRecentes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Ocorrências Recentes
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
                    <Badge variant="secondary" className="text-xs">{o.cursoNome}</Badge>
                    {o.cienteEm
                      ? <Badge className="text-xs bg-green-600">Ciente</Badge>
                      : <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Pendente</Badge>
                    }
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(o.dataOcorrencia + "T12:00:00").toLocaleDateString("pt-BR")}
                  </p>
                </div>
                {!o.cienteEm && (
                  <Button size="sm" variant="outline" className="shrink-0 gap-1 text-xs h-7"
                    onClick={() => onCiente(o.id)}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Ciente
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Avisos recentes */}
      {dash.avisos.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-blue-500" /> Meus Avisos Recentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dash.avisos.slice(0, 5).map((a) => (
              <div key={a.id} className="flex gap-3 items-start rounded-lg border p-3">
                <Bell className={cn("h-4 w-4 mt-0.5 shrink-0", a.tipo === "aviso" ? "text-amber-500" : "text-blue-500")} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{a.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.tipo === "aviso" ? "Aviso" : "Informe"} · {a.publicoAlvo === "estudantes" ? "Estudantes" : a.publicoAlvo === "responsaveis" ? "Responsáveis" : "Todos"}
                    {a.turmaSigla ? ` · ${a.turmaSigla}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <AvisosWidget perfil="coordenador" limite={5} />
      <CardapioWidget className="mt-4" />

      {dash.ocorrenciasRecentes.length === 0 && dash.avisos.length === 0 && (
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

// ── Ocorrências Tab ────────────────────────────────────────────────────────────

function OcorrenciasTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filtroCurso, setFiltroCurso] = useState<string>("todos");

  const { data: ocorrencias = [], isLoading } = useQuery<Ocorrencia[]>({
    queryKey: ["coor-ocorrencias"],
    queryFn: async () => {
      const r = await api("/api/portal-coordenador/ocorrencias");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const cienteMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiJson(`/api/portal-coordenador/ocorrencias/${id}/ciente`, { method: "POST" });
      if (!r.ok) { const d = await r.json(); throw { data: d }; }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Ciente registrado." });
      qc.invalidateQueries({ queryKey: ["coor-ocorrencias"] });
      qc.invalidateQueries({ queryKey: ["coor-dashboard"] });
    },
    onError: (err) => toast({ variant: "destructive", title: apiMsg(err, "Erro ao registrar ciente.") }),
  });

  const cursos = [...new Set(ocorrencias.map((o) => o.cursoNome))].sort();
  const lista = filtroCurso === "todos" ? ocorrencias : ocorrencias.filter((o) => o.cursoNome === filtroCurso);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Ocorrências dos estudantes nos meus cursos
        </h2>
        {cursos.length > 1 && (
          <Select value={filtroCurso} onValueChange={setFiltroCurso}>
            <SelectTrigger className="w-auto min-w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os cursos</SelectItem>
              {cursos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : lista.length === 0 ? (
        <Card><CardContent className="py-8 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma ocorrência encontrada.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {lista.map((o) => (
            <Card key={o.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-3 px-4">
                <div className="flex gap-3 items-start">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1.5 items-center mb-0.5">
                      <span className="font-medium text-sm">{o.estudanteNome}</span>
                      <Badge variant="outline" className="text-xs">{o.tipoDescricao}</Badge>
                      <Badge variant="secondary" className="text-xs">{o.cursoNome}</Badge>
                      {o.turmaSigla && <Badge variant="secondary" className="text-xs font-mono">{o.turmaSigla}</Badge>}
                      {o.cienteEm
                        ? <Badge className="text-xs bg-green-600">Ciente</Badge>
                        : <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Pendente</Badge>
                      }
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(o.dataOcorrencia + "T12:00:00").toLocaleDateString("pt-BR")}
                      {o.observacao && ` — ${o.observacao}`}
                    </p>
                  </div>
                  {!o.cienteEm && (
                    <Button size="sm" variant="outline" className="shrink-0 gap-1 text-xs h-7"
                      onClick={() => cienteMut.mutate(o.id)}
                      disabled={cienteMut.isPending}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Marcar Ciente
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
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
    publicoAlvo: "estudantes", turmaId: "", publicado: false,
  });

  const { data: avisos = [], isLoading } = useQuery<Aviso[]>({
    queryKey: ["coor-avisos"],
    queryFn: async () => {
      const r = await api("/api/portal-coordenador/avisos");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = { ...form, turmaId: form.turmaId || null };
      const method = editTarget ? "PUT" : "POST";
      const url = editTarget
        ? `/api/portal-coordenador/avisos/${editTarget.id}`
        : "/api/portal-coordenador/avisos";
      const r = await apiJson(url, { method, body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json(); throw { data: d }; }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: editTarget ? "Aviso atualizado." : "Aviso criado." });
      qc.invalidateQueries({ queryKey: ["coor-avisos"] });
      qc.invalidateQueries({ queryKey: ["coor-dashboard"] });
      setOpen(false); setEditTarget(null);
    },
    onError: (err) => toast({ variant: "destructive", title: apiMsg(err, "Erro ao salvar.") }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await api(`/api/portal-coordenador/avisos/${id}`, { method: "DELETE" });
      if (!r.ok) { const d = await r.json(); throw { data: d }; }
    },
    onSuccess: () => {
      toast({ title: "Aviso excluído." });
      qc.invalidateQueries({ queryKey: ["coor-avisos"] });
      setDeleteId(null);
    },
    onError: (err) => toast({ variant: "destructive", title: apiMsg(err, "Erro ao excluir.") }),
  });

  function openNew() {
    setEditTarget(null);
    setForm({ titulo: "", conteudo: "", tipo: "aviso", publicoAlvo: "estudantes", turmaId: "", publicado: false });
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
        <Button size="sm" onClick={openNew} className="gap-1.5">
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
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
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

// ── Perfil Tab ─────────────────────────────────────────────────────────────────

function PerfilTab({ me }: { me: CoorMe }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-center">
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white text-xl font-bold shrink-0">
              {me.nome?.charAt(0).toUpperCase() ?? "C"}
            </div>
            <div>
              <p className="font-semibold text-lg">{me.nome ?? "Coordenador"}</p>
              <p className="text-sm text-muted-foreground">Coordenador de Curso</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cursos que coordeno</CardTitle>
        </CardHeader>
        <CardContent>
          {me.cursos.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Nenhum curso vinculado.</p>
          ) : (
            <div className="space-y-2">
              {me.cursos.map((c) => (
                <div key={c.cursoId} className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2">
                  <BookOpen className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-sm font-medium">{c.cursoNome}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PortalCoordenadorPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: me } = useQuery<CoorMe>({
    queryKey: ["coor-me"],
    queryFn: async () => {
      const r = await api("/api/portal-coordenador/me");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const { data: dash, isLoading: dashLoading } = useQuery<Dashboard>({
    queryKey: ["coor-dashboard"],
    queryFn: async () => {
      const r = await api("/api/portal-coordenador/dashboard");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const cienteMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiJson(`/api/portal-coordenador/ocorrencias/${id}/ciente`, { method: "POST" });
      if (!r.ok) { const d = await r.json(); throw { data: d }; }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Ciente registrado." });
      qc.invalidateQueries({ queryKey: ["coor-dashboard"] });
      qc.invalidateQueries({ queryKey: ["coor-ocorrencias"] });
    },
    onError: (err: unknown) => {
      const msg = err && typeof err === "object" && "data" in err
        ? ((err as { data?: { error?: string } }).data?.error ?? "Erro ao registrar ciente.")
        : "Erro ao registrar ciente.";
      toast({ variant: "destructive", title: msg });
    },
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 p-5 text-white">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold">
            {me?.nome?.charAt(0).toUpperCase() ?? "C"}
          </div>
          <div>
            <p className="font-bold text-lg leading-tight">{me?.nome ?? "Coordenador"}</p>
            <p className="text-blue-100 text-sm">Portal do Coordenador</p>
          </div>
        </div>
        {me && me.cursos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {me.cursos.map((c) => (
              <span key={c.cursoId} className="text-xs bg-white/20 rounded-full px-2.5 py-0.5">{c.cursoNome}</span>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="dashboard">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="dashboard" className="gap-1.5 text-xs sm:text-sm">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="ocorrencias" className="gap-1.5 text-xs sm:text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Ocorrências</span>
          </TabsTrigger>
          <TabsTrigger value="avisos" className="gap-1.5 text-xs sm:text-sm">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Avisos</span>
          </TabsTrigger>
          <TabsTrigger value="perfil" className="gap-1.5 text-xs sm:text-sm">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Perfil</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          {dashLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : dash ? (
            <DashboardTab dash={dash} onCiente={(id) => cienteMut.mutate(id)} />
          ) : null}
        </TabsContent>

        <TabsContent value="ocorrencias" className="mt-4">
          <OcorrenciasTab />
        </TabsContent>

        <TabsContent value="avisos" className="mt-4">
          <AvisosTab />
        </TabsContent>

        <TabsContent value="perfil" className="mt-4">
          {me ? <PerfilTab me={me} /> : <p className="text-sm text-muted-foreground">Carregando...</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
