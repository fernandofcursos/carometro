import { useState, useEffect } from "react";
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
  GraduationCap, Building, BookOpen, AlertTriangle, CalendarDays,
  Bell, User, Plus, Pencil, Trash2, Crown,
} from "lucide-react";

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

type Me = { id: string; nome: string | null; fotoUrl: string | null };

type Stats = {
  totalEstudantes: number;
  totalTurmas: number;
  totalProfessores: number;
  ocorrenciasHoje: number;
  ocorrenciasSemana: number;
};

type OcorrenciaRecente = {
  id: string;
  estudanteNome: string;
  tipoDescricao: string;
  disciplinaNome: string | null;
  dataOcorrencia: string;
  cienteEm: string | null;
  registradoPorNome: string | null;
};

type AvisoDash = {
  id: string; titulo: string; tipo: string;
  publicoAlvo: string; turmaSigla: string | null; criadoEm: string;
};

type Dashboard = { stats: Stats; ocorrenciasRecentes: OcorrenciaRecente[]; avisos: AvisoDash[] };

type Ocorrencia = {
  id: string;
  estudanteNome: string;
  tipoDescricao: string;
  disciplinaNome: string | null;
  dataOcorrencia: string;
  observacao: string | null;
  cienteEm: string | null;
  registradoPorNome: string | null;
  criadoEm: string;
};

type Aviso = {
  id: string; titulo: string; conteudo: string; tipo: string;
  publicoAlvo: string; turmaId: string | null; turmaSigla: string | null;
  publicado: boolean; criadoEm: string;
};

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number; color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="p-2 rounded-full" style={{ background: `${color}20` }}>
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
          <span className="text-2xl font-bold">{value}</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── DashboardTab ──────────────────────────────────────────────────────────────

function DashboardTab() {
  const { data, isLoading } = useQuery<Dashboard>({
    queryKey: ["gestora-dashboard"],
    queryFn: () => api("/api/portal-gestora/dashboard").then((r) => r.json()),
  });

  if (isLoading) return <p className="text-muted-foreground text-sm">Carregando...</p>;
  if (!data) return null;

  const { stats, ocorrenciasRecentes, avisos } = data;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard icon={GraduationCap} label="Estudantes" value={stats.totalEstudantes} color="#6366f1" />
        <StatCard icon={Building} label="Turmas" value={stats.totalTurmas} color="#0ea5e9" />
        <StatCard icon={BookOpen} label="Professores" value={stats.totalProfessores} color="#16a34a" />
        <StatCard icon={AlertTriangle} label="Ocorrências hoje" value={stats.ocorrenciasHoje} color="#f59e0b" />
        <StatCard icon={CalendarDays} label="Ocorrências na semana" value={stats.ocorrenciasSemana} color="#ef4444" />
      </div>

      {/* Ocorrências recentes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Ocorrências Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ocorrenciasRecentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma ocorrência.</p>
          ) : (
            <div className="divide-y">
              {ocorrenciasRecentes.map((o) => (
                <div key={o.id} className="py-2 flex flex-col sm:flex-row sm:items-center gap-1">
                  <div className="flex-1">
                    <span className="font-medium text-sm">{o.estudanteNome}</span>
                    <span className="text-muted-foreground text-xs ml-2">— {o.tipoDescricao}</span>
                    {o.disciplinaNome && <span className="text-muted-foreground text-xs ml-1">({o.disciplinaNome})</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{o.dataOcorrencia}</span>
                    {o.cienteEm ? (
                      <Badge variant="secondary" className="text-xs">Ciente</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Pendente</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Avisos recentes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4 text-purple-500" />
            Avisos Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {avisos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum aviso.</p>
          ) : (
            <div className="divide-y">
              {avisos.map((a) => (
                <div key={a.id} className="py-2 flex items-center gap-2">
                  <div className="flex-1 text-sm">{a.titulo}</div>
                  <Badge variant="outline" className="text-xs">{a.tipo}</Badge>
                  {a.turmaSigla && <Badge variant="secondary" className="text-xs">{a.turmaSigla}</Badge>}
                  <span className="text-xs text-muted-foreground">{new Date(a.criadoEm).toLocaleDateString("pt-BR")}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── OcorrenciasTab ────────────────────────────────────────────────────────────

function OcorrenciasTab() {
  const [offset, setOffset] = useState(0);
  const [busca, setBusca] = useState("");
  const [all, setAll] = useState<Ocorrencia[]>([]);

  const { data, isLoading } = useQuery<Ocorrencia[]>({
    queryKey: ["gestora-ocorrencias", offset],
    queryFn: () => api(`/api/portal-gestora/ocorrencias?offset=${offset}`).then((r) => r.json()),
  });

  useEffect(() => {
    if (data) {
      setAll((prev) => offset === 0 ? data : [...prev, ...data]);
    }
  }, [data, offset]);

  const filtered = busca
    ? all.filter((o) => o.estudanteNome.toLowerCase().includes(busca.toLowerCase()))
    : all;

  return (
    <div className="space-y-4">
      <Input
        placeholder="Buscar por estudante..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="max-w-sm"
      />
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 && !isLoading ? (
            <p className="text-sm text-muted-foreground p-4">Nenhuma ocorrência encontrada.</p>
          ) : (
            <div className="divide-y">
              {filtered.map((o) => (
                <div key={o.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1">
                    <span className="font-medium text-sm">{o.estudanteNome}</span>
                    <span className="text-muted-foreground text-xs ml-2">— {o.tipoDescricao}</span>
                    {o.disciplinaNome && <span className="text-xs text-muted-foreground ml-1">({o.disciplinaNome})</span>}
                    {o.registradoPorNome && <span className="text-xs text-muted-foreground ml-2">por {o.registradoPorNome}</span>}
                    {o.observacao && <p className="text-xs text-muted-foreground mt-0.5">{o.observacao}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">{o.dataOcorrencia}</span>
                    {o.cienteEm ? (
                      <Badge variant="secondary" className="text-xs">Ciente</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Pendente</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {data && data.length === 50 && (
        <Button variant="outline" onClick={() => setOffset((p) => p + 50)} disabled={isLoading}>
          {isLoading ? "Carregando..." : "Carregar mais"}
        </Button>
      )}
    </div>
  );
}

// ── AvisosTab ─────────────────────────────────────────────────────────────────

function AvisosTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editAviso, setEditAviso] = useState<Aviso | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ titulo: "", conteudo: "", tipo: "aviso", publicoAlvo: "todos", turmaId: "", publicado: false });

  const { data: avisos = [], isLoading } = useQuery<Aviso[]>({
    queryKey: ["gestora-avisos"],
    queryFn: () => api("/api/portal-gestora/avisos").then((r) => r.json()),
  });

  const mutCreate = useMutation({
    mutationFn: (body: typeof form) =>
      apiJson("/api/portal-gestora/avisos", { method: "POST", body: JSON.stringify({ ...body, turmaId: body.turmaId || null }) }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Object.assign(new Error(), { data: d });
        return d;
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gestora-avisos"] }); setShowForm(false); toast({ title: "Aviso criado." }); },
    onError: (err) => toast({ variant: "destructive", title: apiMsg(err, "Erro ao criar aviso.") }),
  });

  const mutEdit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof form }) =>
      apiJson(`/api/portal-gestora/avisos/${id}`, { method: "PUT", body: JSON.stringify({ ...body, turmaId: body.turmaId || null }) }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Object.assign(new Error(), { data: d });
        return d;
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gestora-avisos"] }); setEditAviso(null); toast({ title: "Aviso atualizado." }); },
    onError: (err) => toast({ variant: "destructive", title: apiMsg(err, "Erro ao atualizar aviso.") }),
  });

  const mutDelete = useMutation({
    mutationFn: (id: string) =>
      api(`/api/portal-gestora/avisos/${id}`, { method: "DELETE" }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Object.assign(new Error(), { data: d });
        return d;
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gestora-avisos"] }); setDeleteId(null); toast({ title: "Aviso excluído." }); },
    onError: (err) => toast({ variant: "destructive", title: apiMsg(err, "Erro ao excluir aviso.") }),
  });

  function openCreate() {
    setForm({ titulo: "", conteudo: "", tipo: "aviso", publicoAlvo: "todos", turmaId: "", publicado: false });
    setShowForm(true);
  }

  function openEdit(a: Aviso) {
    setForm({ titulo: a.titulo, conteudo: a.conteudo, tipo: a.tipo, publicoAlvo: a.publicoAlvo, turmaId: a.turmaId ?? "", publicado: a.publicado });
    setEditAviso(a);
  }

  const saving = mutCreate.isPending || mutEdit.isPending;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate} size="sm" className="gap-1">
          <Plus className="w-4 h-4" /> Novo Aviso
        </Button>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : avisos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum aviso criado ainda.</p>
      ) : (
        <div className="space-y-3">
          {avisos.map((a) => (
            <Card key={a.id}>
              <CardContent className="py-3 flex flex-col sm:flex-row sm:items-start gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{a.titulo}</span>
                    <Badge variant="outline" className="text-xs">{a.tipo}</Badge>
                    <Badge variant="secondary" className="text-xs">{a.publicoAlvo}</Badge>
                    {a.turmaSigla && <Badge className="text-xs">{a.turmaSigla}</Badge>}
                    {!a.publicado && <Badge variant="outline" className="text-xs text-muted-foreground">Rascunho</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.conteudo}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(a.criadoEm).toLocaleDateString("pt-BR")}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(a)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleteId(a.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form dialog */}
      <Dialog open={showForm || !!editAviso} onOpenChange={(o) => { if (!o) { setShowForm(false); setEditAviso(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editAviso ? "Editar Aviso" : "Novo Aviso"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} />
            </div>
            <div>
              <Label>Conteúdo</Label>
              <Textarea value={form.conteudo} onChange={(e) => setForm((f) => ({ ...f, conteudo: e.target.value }))} rows={4} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aviso">Aviso</SelectItem>
                    <SelectItem value="informe">Informe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Público-alvo</Label>
                <Select value={form.publicoAlvo} onValueChange={(v) => setForm((f) => ({ ...f, publicoAlvo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="estudantes">Estudantes</SelectItem>
                    <SelectItem value="responsaveis">Responsáveis</SelectItem>
                    <SelectItem value="todos">Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="publicado" checked={form.publicado} onChange={(e) => setForm((f) => ({ ...f, publicado: e.target.checked }))} />
              <Label htmlFor="publicado">Publicado</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditAviso(null); }}>Cancelar</Button>
            <Button disabled={saving} onClick={() => {
              if (editAviso) mutEdit.mutate({ id: editAviso.id, body: form });
              else mutCreate.mutate(form);
            }}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aviso?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && mutDelete.mutate(deleteId)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── PerfilTab ─────────────────────────────────────────────────────────────────

function PerfilTab() {
  const { data, isLoading } = useQuery<Me>({
    queryKey: ["gestora-me"],
    queryFn: () => api("/api/portal-gestora/me").then((r) => r.json()),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!data) return null;

  return (
    <Card className="max-w-sm">
      <CardContent className="pt-6 flex flex-col items-center gap-3">
        <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center overflow-hidden">
          {data.fotoUrl ? (
            <img src={data.fotoUrl} alt={data.nome ?? ""} className="w-full h-full object-cover" />
          ) : (
            <User className="w-10 h-10 text-purple-400" />
          )}
        </div>
        <div className="text-center">
          <p className="font-semibold text-lg">{data.nome ?? "—"}</p>
          <p className="text-sm text-muted-foreground">Equipe Gestora</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PortalGestoraPage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-violet-700 text-white px-6 py-8">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Crown className="w-8 h-8 opacity-90" />
          <div>
            <h1 className="text-2xl font-bold">Portal da Equipe Gestora</h1>
            <p className="text-purple-200 text-sm">Visão completa da escola</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Tabs defaultValue="dashboard">
          <TabsList className="mb-6">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="ocorrencias">Ocorrências</TabsTrigger>
            <TabsTrigger value="avisos">Avisos</TabsTrigger>
            <TabsTrigger value="perfil">Perfil</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard"><DashboardTab /></TabsContent>
          <TabsContent value="ocorrencias"><OcorrenciasTab /></TabsContent>
          <TabsContent value="avisos"><AvisosTab /></TabsContent>
          <TabsContent value="perfil"><PerfilTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
