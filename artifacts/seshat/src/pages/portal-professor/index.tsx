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
  BookOpen, AlertTriangle, Bell, User, Plus, Pencil, Trash2,
  Clock, MapPin, CalendarDays, ChevronRight, Utensils,
} from "lucide-react";
import { AvisosWidget } from "@/components/avisos-widget";
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

type ProfMe = {
  id: string; nome: string | null; fotoUrl: string | null;
  disciplinas: {
    ofertaId: string; disciplinaId: string; disciplinaNome: string; disciplinaSigla: string;
    cursoId: string; cursoNome: string; turnoId: string; turnoNome: string;
    turmaId: string | null; turmaSigla: string | null;
  }[];
};

type AulaSlot = {
  horaInicio: string; horaFim: string;
  disciplinaNome: string; disciplinaSigla: string; turmaSigla: string; sala: string | null;
};

type AgendaDia = { dia: number; diaNome: string; aulas: AulaSlot[] };

type HorarioCurso = {
  cursoId: string; cursoNome: string; turnoId: string; turnoNome: string;
  agenda: AgendaDia[];
};

type CardapioItem = { refeicao: string; descricao: string };
type CardapioDia = { dia: number; diaNome: string; data: string; itens: CardapioItem[] };

type AvisoDash = {
  id: string; titulo: string; conteudo: string; tipo: string;
  publicoAlvo: string; turmaSigla: string | null; criadoEm: string;
};

type Dashboard = {
  hoje: string; diaSemana: number;
  horariosDisponiveis: boolean; horariosPorCurso: HorarioCurso[];
  cardapioDisponivel: boolean; cardapio: CardapioDia[];
  avisos: AvisoDash[];
};

type Ocorrencia = {
  id: string; estudanteId: string; estudanteNome: string | null;
  tipoDescricao: string; disciplinaNome: string | null;
  dataOcorrencia: string; observacao: string | null;
  cienteEm: string | null; criadoEm: string;
};

type Aviso = {
  id: string; titulo: string; conteudo: string; tipo: string;
  publicoAlvo: string; turmaId: string | null; turmaSigla: string | null;
  publicado: boolean; criadoEm: string;
};

// ── Quadro de Horários ─────────────────────────────────────────────────────────

const DIAS = ["", "Seg", "Ter", "Qua", "Qui", "Sex"];
const DIAS_FULL = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

function QuadroHorariosCurso({ hc, hoje }: { hc: HorarioCurso; hoje: Date }) {
  const diaSemanaHoje = hoje.getDay(); // 0=dom…6=sab

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="secondary" className="text-xs">{hc.turnoNome}</Badge>
        <span className="font-semibold text-sm">{hc.cursoNome}</span>
      </div>
      {/* Mobile: lista vertical por dia */}
      <div className="block sm:hidden space-y-3">
        {hc.agenda.map((dia) => {
          if (dia.aulas.length === 0) return null;
          return (
            <div key={dia.dia} className={cn(
              "rounded-lg border p-3",
              dia.dia === diaSemanaHoje ? "border-primary/50 bg-primary/5" : "bg-card"
            )}>
              <p className="text-xs font-semibold text-muted-foreground mb-2">{DIAS_FULL[dia.dia]}</p>
              <div className="space-y-1.5">
                {dia.aulas.map((aula, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className="text-muted-foreground whitespace-nowrap">{aula.horaInicio}–{aula.horaFim}</span>
                    <span className="font-mono font-bold text-primary">{aula.disciplinaSigla}</span>
                    <span className="text-muted-foreground">{aula.turmaSigla}</span>
                    {aula.sala && <span className="text-muted-foreground flex items-center gap-0.5"><MapPin className="h-3 w-3" />{aula.sala}</span>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {hc.agenda.every((d) => d.aulas.length === 0) && (
          <p className="text-sm text-muted-foreground italic">Sem aulas cadastradas.</p>
        )}
      </div>
      {/* Desktop: grade */}
      <div className="hidden sm:grid grid-cols-5 gap-2">
        {hc.agenda.map((dia) => (
          <div key={dia.dia} className={cn(
            "rounded-lg border p-2 min-h-[80px]",
            dia.dia === diaSemanaHoje ? "border-primary/50 bg-primary/5" : "bg-muted/20"
          )}>
            <p className={cn(
              "text-xs font-bold mb-1.5",
              dia.dia === diaSemanaHoje ? "text-primary" : "text-muted-foreground"
            )}>{DIAS[dia.dia]}</p>
            {dia.aulas.length === 0 ? (
              <p className="text-xs text-muted-foreground/50">—</p>
            ) : dia.aulas.map((aula, i) => (
              <div key={i} className="mb-1 last:mb-0">
                <p className="font-mono text-xs font-bold text-primary leading-tight">{aula.disciplinaSigla}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{aula.horaInicio}–{aula.horaFim}</p>
                {aula.sala && <p className="text-[10px] text-muted-foreground leading-tight">{aula.sala}</p>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Dashboard Tab ──────────────────────────────────────────────────────────────

function DashboardTab({ dash }: { dash: Dashboard }) {
  const hoje = new Date(dash.hoje + "T12:00:00");

  return (
    <div className="space-y-6">
      {/* Horários */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" /> Quadro de Horários
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!dash.horariosDisponiveis ? (
            <p className="text-sm text-muted-foreground italic">Horários ainda não disponíveis.</p>
          ) : dash.horariosPorCurso.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Nenhum horário cadastrado para suas disciplinas.</p>
          ) : dash.horariosPorCurso.map((hc) => (
            <QuadroHorariosCurso key={`${hc.cursoId}:${hc.turnoId}`} hc={hc} hoje={hoje} />
          ))}
        </CardContent>
      </Card>

      {/* Avisos recentes */}
      {dash.avisos.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-500" /> Meus Avisos Recentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dash.avisos.slice(0, 5).map((a) => (
              <div key={a.id} className="flex gap-3 items-start rounded-lg border p-3">
                <Bell className={cn("h-4 w-4 mt-0.5 shrink-0", a.tipo === "aviso" ? "text-amber-500" : "text-blue-500")} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{a.titulo}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{a.conteudo}</p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {a.tipo === "aviso" ? "Aviso" : "Informe"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <AvisosWidget perfil="professor" limite={5} />

      {/* Cardápio */}
      {dash.cardapioDisponivel && dash.cardapio.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Utensils className="h-4 w-4 text-emerald-600" /> Cardápio da Semana
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {dash.cardapio.map((dia) => (
                <div key={dia.data} className="rounded-lg border p-3 bg-muted/20">
                  <p className="text-xs font-bold text-muted-foreground mb-1.5">{dia.diaNome}</p>
                  {dia.itens.map((item, i) => (
                    <div key={i} className="text-xs mb-1 last:mb-0">
                      <span className="font-medium">{item.refeicao}: </span>
                      <span className="text-muted-foreground">{item.descricao}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Ocorrências Tab ────────────────────────────────────────────────────────────

type OcorrForm = {
  estudanteId: string; tipoOcorrenciaId: string;
  disciplinaId: string; dataOcorrencia: string; observacao: string;
};

function OcorrenciasTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Ocorrencia | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<OcorrForm>({
    estudanteId: "", tipoOcorrenciaId: "", disciplinaId: "",
    dataOcorrencia: new Date().toISOString().slice(0, 10), observacao: "",
  });

  const { data: ocorrencias = [], isLoading } = useQuery<Ocorrencia[]>({
    queryKey: ["prof-ocorrencias"],
    queryFn: async () => {
      const r = await api("/api/portal-professor/ocorrencias");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        ...form,
        disciplinaId: form.disciplinaId || null,
      };
      const method = editTarget ? "PUT" : "POST";
      const url = editTarget
        ? `/api/portal-professor/ocorrencias/${editTarget.id}`
        : "/api/portal-professor/ocorrencias";
      const r = await apiJson(url, { method, body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json(); throw { data: d }; }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: editTarget ? "Ocorrência atualizada." : "Ocorrência registrada." });
      qc.invalidateQueries({ queryKey: ["prof-ocorrencias"] });
      setOpen(false); setEditTarget(null);
    },
    onError: (err) => toast({ variant: "destructive", title: apiMsg(err, "Erro ao salvar.") }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await api(`/api/portal-professor/ocorrencias/${id}`, { method: "DELETE" });
      if (!r.ok) { const d = await r.json(); throw { data: d }; }
    },
    onSuccess: () => {
      toast({ title: "Ocorrência excluída." });
      qc.invalidateQueries({ queryKey: ["prof-ocorrencias"] });
      setDeleteId(null);
    },
    onError: (err) => toast({ variant: "destructive", title: apiMsg(err, "Erro ao excluir.") }),
  });

  function openNew() {
    setEditTarget(null);
    setForm({ estudanteId: "", tipoOcorrenciaId: "", disciplinaId: "",
      dataOcorrencia: new Date().toISOString().slice(0, 10), observacao: "" });
    setOpen(true);
  }

  function openEdit(o: Ocorrencia) {
    setEditTarget(o);
    setForm({
      estudanteId: o.estudanteId, tipoOcorrenciaId: "",
      disciplinaId: "", dataOcorrencia: o.dataOcorrencia, observacao: o.observacao ?? "",
    });
    setOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-semibold text-muted-foreground">Ocorrências que registrei</h2>
        <Button size="sm" onClick={openNew} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nova Ocorrência
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : ocorrencias.length === 0 ? (
        <Card><CardContent className="py-8 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma ocorrência registrada.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {ocorrencias.map((o) => (
            <Card key={o.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-3 px-4">
                <div className="flex gap-3 items-start">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-2 items-center mb-0.5">
                      <span className="font-medium text-sm">{o.estudanteNome}</span>
                      <Badge variant="outline" className="text-xs">{o.tipoDescricao}</Badge>
                      {o.disciplinaNome && <Badge variant="secondary" className="text-xs">{o.disciplinaNome}</Badge>}
                      {o.cienteEm && <Badge className="text-xs bg-green-600">Ciente</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(o.dataOcorrencia + "T12:00:00").toLocaleDateString("pt-BR")}
                      {o.observacao && ` — ${o.observacao}`}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(o)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(o.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Editar Ocorrência" : "Registrar Ocorrência"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Data da Ocorrência</Label>
              <Input type="date" value={form.dataOcorrencia}
                onChange={(e) => setForm({ ...form, dataOcorrencia: e.target.value })} />
            </div>
            <div>
              <Label>ID do Estudante</Label>
              <Input placeholder="UUID do estudante" value={form.estudanteId}
                onChange={(e) => setForm({ ...form, estudanteId: e.target.value })} />
            </div>
            <div>
              <Label>ID do Tipo de Ocorrência</Label>
              <Input placeholder="UUID do tipo" value={form.tipoOcorrenciaId}
                onChange={(e) => setForm({ ...form, tipoOcorrenciaId: e.target.value })} />
            </div>
            <div>
              <Label>Observação <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Textarea rows={3} maxLength={300} value={form.observacao}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
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

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir ocorrência?</AlertDialogTitle>
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
    queryKey: ["prof-avisos"],
    queryFn: async () => {
      const r = await api("/api/portal-professor/avisos");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = { ...form, turmaId: form.turmaId || null };
      const method = editTarget ? "PUT" : "POST";
      const url = editTarget
        ? `/api/portal-professor/avisos/${editTarget.id}`
        : "/api/portal-professor/avisos";
      const r = await apiJson(url, { method, body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json(); throw { data: d }; }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: editTarget ? "Aviso atualizado." : "Aviso criado." });
      qc.invalidateQueries({ queryKey: ["prof-avisos"] });
      setOpen(false); setEditTarget(null);
    },
    onError: (err) => toast({ variant: "destructive", title: apiMsg(err, "Erro ao salvar.") }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await api(`/api/portal-professor/avisos/${id}`, { method: "DELETE" });
      if (!r.ok) { const d = await r.json(); throw { data: d }; }
    },
    onSuccess: () => {
      toast({ title: "Aviso excluído." });
      qc.invalidateQueries({ queryKey: ["prof-avisos"] });
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
                    <div className="flex flex-wrap gap-2 items-center mb-0.5">
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

      {/* Form Dialog */}
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

      {/* Delete confirm */}
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

function PerfilTab({ me }: { me: ProfMe }) {
  // Group disciplines by curso
  const cursos = [...new Map(me.disciplinas.map((d) => [d.cursoId, d.cursoNome])).entries()];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-center">
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
              {me.nome?.charAt(0).toUpperCase() ?? "P"}
            </div>
            <div>
              <p className="font-semibold text-lg">{me.nome ?? "Professor"}</p>
              <p className="text-sm text-muted-foreground">Corpo Docente</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Minhas Disciplinas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {me.disciplinas.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Nenhuma disciplina vinculada.</p>
          ) : cursos.map(([cursoId, cursoNome]) => {
            const discs = me.disciplinas.filter((d) => d.cursoId === cursoId);
            return (
              <div key={cursoId}>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">{cursoNome}</p>
                <div className="space-y-1.5">
                  {discs.map((d) => (
                    <div key={d.ofertaId} className="flex gap-2 items-center rounded-md bg-muted/30 px-3 py-2">
                      <Badge variant="outline" className="font-mono text-xs">{d.disciplinaSigla}</Badge>
                      <span className="text-sm">{d.disciplinaNome}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{d.turnoNome}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PortalProfessorPage() {
  const { data: me } = useQuery<ProfMe>({
    queryKey: ["prof-me"],
    queryFn: async () => {
      const r = await api("/api/portal-professor/me");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const { data: dash, isLoading: dashLoading } = useQuery<Dashboard>({
    queryKey: ["prof-dashboard"],
    queryFn: async () => {
      const r = await api("/api/portal-professor/dashboard");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-green-600 to-emerald-700 p-5 text-white">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold">
            {me?.nome?.charAt(0).toUpperCase() ?? "P"}
          </div>
          <div>
            <p className="font-bold text-lg leading-tight">{me?.nome ?? "Professor"}</p>
            <p className="text-green-100 text-sm">Portal do Professor</p>
          </div>
        </div>
        {me && me.disciplinas.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {[...new Map(me.disciplinas.map((d) => [d.cursoId, d.cursoNome])).entries()].map(([id, nome]) => (
              <span key={id} className="text-xs bg-white/20 rounded-full px-2.5 py-0.5">{nome}</span>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="dashboard">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="dashboard" className="gap-1.5 text-xs sm:text-sm">
            <CalendarDays className="h-4 w-4" />
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
            <DashboardTab dash={dash} />
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
