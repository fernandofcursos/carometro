import { useState, useMemo } from "react";
import { useListTurmas } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, Plus, Trash2, UserCheck, ChevronDown, ChevronRight, UserPlus, Copy, Check, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────

type Matricula = {
  id: string;
  usuarioId: string;
  turmaId: string;
  turmaSigla: string;
  cursoId: string;
  cursoNome: string;
  registro: string;
  ano: number;
  semestre: number;
  ativo: boolean;
  criadoEm: string;
};

type DisciplinaAtual = {
  disciplinaOfertaId: string;
  disciplinaNome: string;
  cursoNome: string;
  turnoNome: string;
};

type Estudante = {
  id: string;
  nome: string | null;
  criadoEm: string;
  matriculas: Matricula[];
  disciplinas: DisciplinaAtual[];
};

type Oferta = {
  id: string;
  disciplinaId: string;
  disciplinaNome: string;
  cursoId: string;
  cursoNome: string;
  moduloMenor: boolean;
  turnoId: string;
  turnoNome: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: string } | null;
    return data?.error ?? fallback;
  }
  if (err instanceof Error) return (err as { data?: { error?: string } }).data?.error ?? err.message;
  return fallback;
}

const anoAtual = new Date().getFullYear();
const anosOptions = Array.from({ length: 6 }, (_, i) => anoAtual - 1 + i);

// ── DisciplinasSelector ───────────────────────────────────────────────────────

function DisciplinasSelector({
  usuarioId,
  ofertas,
  disciplinasAtuais,
  onSaved,
}: {
  usuarioId: string;
  ofertas: Oferta[];
  disciplinasAtuais: string[];
  onSaved: () => void;
}) {
  const { toast } = useToast();

  // Seleção local — inicializa com as disciplinas atuais do usuário,
  // ou com TODAS as ofertas se o usuário ainda não tem nenhuma.
  const [selecionados, setSelecionados] = useState<Set<string>>(() => {
    if (disciplinasAtuais.length > 0) {
      return new Set(disciplinasAtuais);
    }
    return new Set(ofertas.map((o) => o.id));
  });

  // Agrupamento: Curso → Turno → Ofertas
  const grupos = useMemo(() => {
    const byCurso = new Map<string, { cursoId: string; cursoNome: string; moduloMenor: boolean; turnos: Map<string, { turnoId: string; turnoNome: string; ofertas: Oferta[] }> }>();
    for (const o of ofertas) {
      if (!byCurso.has(o.cursoId)) {
        byCurso.set(o.cursoId, { cursoId: o.cursoId, cursoNome: o.cursoNome, moduloMenor: o.moduloMenor, turnos: new Map() });
      }
      const curso = byCurso.get(o.cursoId)!;
      if (!curso.turnos.has(o.turnoId)) {
        curso.turnos.set(o.turnoId, { turnoId: o.turnoId, turnoNome: o.turnoNome, ofertas: [] });
      }
      curso.turnos.get(o.turnoId)!.ofertas.push(o);
    }
    return [...byCurso.values()].map((c) => ({ ...c, turnos: [...c.turnos.values()] }));
  }, [ofertas]);

  // Para módulo menor: quantas disciplinas do curso estão selecionadas
  function contSelecionadosCurso(cursoId: string): number {
    return ofertas.filter((o) => o.cursoId === cursoId && selecionados.has(o.id)).length;
  }

  function toggleOfertaComLimite(o: Oferta) {
    if (!selecionados.has(o.id) && o.moduloMenor && contSelecionadosCurso(o.cursoId) >= 2) return;
    toggleOferta(o.id);
  }

  function toggleOferta(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleTurno(turnoOfertas: Oferta[]) {
    const ids = turnoOfertas.map((o) => o.id);
    const allSelected = ids.every((id) => selecionados.has(id));
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (allSelected) { ids.forEach((id) => next.delete(id)); }
      else { ids.forEach((id) => next.add(id)); }
      return next;
    });
  }

  function turnoState(turnoOfertas: Oferta[]): "all" | "none" | "partial" {
    const ids = turnoOfertas.map((o) => o.id);
    const count = ids.filter((id) => selecionados.has(id)).length;
    if (count === 0) return "none";
    if (count === ids.length) return "all";
    return "partial";
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/usuario-disciplinas/${usuarioId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ disciplinaOfertaIds: [...selecionados] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(body.error ?? "Erro"), { data: body });
      }
    },
    onSuccess: () => { toast({ title: "Disciplinas salvas" }); onSaved(); },
    onError: (err: unknown) => toast({
      title: "Erro ao salvar disciplinas",
      description: apiMsg(err, "Tente novamente."),
      variant: "destructive",
    }),
  });

  if (ofertas.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhuma disciplina disponível.</p>;
  }

  return (
    <div className="space-y-3">
      {grupos.map((curso) => {
        const sel = contSelecionadosCurso(curso.cursoId);
        const atingiuLimite = curso.moduloMenor && sel >= 2;
        return (
          <div key={curso.cursoId} className="border rounded-md overflow-hidden">
            <div className="bg-muted/40 px-3 py-2 text-xs font-semibold flex items-center gap-2">
              {curso.cursoNome}
              {curso.moduloMenor && (
                <span className={cn(
                  "ml-auto text-[0.65rem] px-1.5 py-0.5 rounded font-medium",
                  atingiuLimite
                    ? "bg-amber-100 text-amber-800"
                    : "bg-blue-100 text-blue-700",
                )}>
                  Módulo menor · {sel}/2 disciplinas
                </span>
              )}
            </div>
            {curso.turnos.map((turno) => {
              const state = turnoState(turno.ofertas);
              return (
                <div key={turno.turnoId} className="px-3 pb-2">
                  <div className="flex items-center gap-2 py-2 border-b last:border-0">
                    <Checkbox
                      id={`turno-${turno.turnoId}`}
                      checked={state === "all"}
                      data-state={state === "partial" ? "indeterminate" : undefined}
                      onCheckedChange={() => toggleTurno(turno.ofertas)}
                      className="shrink-0"
                      disabled={curso.moduloMenor}
                    />
                    <label
                      htmlFor={`turno-${turno.turnoId}`}
                      className={cn("text-xs font-medium cursor-pointer select-none", curso.moduloMenor && "opacity-50 cursor-not-allowed")}
                    >
                      {turno.turnoNome} — Todas as disciplinas
                    </label>
                  </div>
                  <div className="pl-6 space-y-1.5 pt-1.5">
                    {turno.ofertas.map((o) => {
                      const bloqueado = atingiuLimite && !selecionados.has(o.id);
                      return (
                        <div key={o.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`oferta-${o.id}`}
                            checked={selecionados.has(o.id)}
                            onCheckedChange={() => toggleOfertaComLimite(o)}
                            disabled={bloqueado}
                            className="shrink-0"
                          />
                          <label
                            htmlFor={`oferta-${o.id}`}
                            className={cn("text-xs cursor-pointer select-none", bloqueado && "opacity-40 cursor-not-allowed")}
                          >
                            {o.disciplinaNome}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      <Button
        size="sm"
        className="h-8 text-xs"
        onClick={() => salvar.mutate()}
        disabled={salvar.isPending}
      >
        <Check className="w-3 h-3 mr-1" />Salvar disciplinas
      </Button>
    </div>
  );
}

// ── Dialog exibido quando um novo usuário é criado ────────────────────────────

function NovoUsuarioDialog({
  nome,
  senhaGerada,
  onClose,
}: { nome: string | null; senhaGerada: string; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);

  function copiar() {
    navigator.clipboard.writeText(senhaGerada).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }).catch(() => {
      // clipboard bloqueado (extensão, foco perdido, contexto inseguro)
    });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Usuário criado com sucesso</DialogTitle>
          <DialogDescription>
            Um novo usuário foi criado para <strong>{nome ?? "o estudante"}</strong>. Anote a senha provisória
            abaixo — ela será necessária para o primeiro acesso e não será exibida novamente.
          </DialogDescription>
        </DialogHeader>
        <div className="my-2 flex items-center gap-2 rounded-md border bg-muted px-4 py-3">
          <code className="flex-1 text-sm font-mono tracking-widest">{senhaGerada}</code>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copiar}>
            {copiado ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Um e-mail de boas-vindas com as instruções de acesso também foi enviado ao estudante.
        </p>
        <DialogFooter>
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Formulário de enturmação ──────────────────────────────────────────────────

function MatriculaForm({
  estudante,
  temMatriculaAtiva,
  onSuccess,
}: {
  estudante?: Estudante;
  temMatriculaAtiva?: boolean;
  onSuccess: (result: { usuarioCriado?: boolean; senhaGerada?: string; nome?: string | null }) => void;
}) {
  const [email, setEmail]     = useState("");
  const [nome, setNome]       = useState("");
  const [turmaId, setTurmaId] = useState("");
  const [registro, setRegistro] = useState("");
  const [ano, setAno]         = useState(String(anoAtual));
  const [semestre, setSemestre] = useState("1");
  const { data: turmas } = useListTurmas();
  const { toast } = useToast();

  const modoEmail = !estudante;

  const criar = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        turmaId,
        registro: registro.trim(),
        ano: Number(ano),
        semestre: Number(semestre),
      };
      if (estudante) {
        payload.usuarioId = estudante.id;
      } else {
        payload.email = email.trim().toLowerCase();
        if (nome.trim()) payload.nome = nome.trim();
      }
      const res = await fetch(`${BASE}/api/matriculas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body.error ?? "Erro"), { data: body, status: res.status });
      return body as { usuarioCriado?: boolean; senhaGerada?: string };
    },
    onSuccess: (result) => {
      setEmail(""); setNome(""); setTurmaId(""); setRegistro(""); setAno(String(anoAtual)); setSemestre("1");
      toast({ title: "Estudante enturmado com sucesso" });
      onSuccess({ ...result, nome: estudante?.nome ?? (nome.trim() || null) });
    },
    onError: (err) => toast({
      title: "Erro ao enturmar",
      description: apiMsg(err, "Verifique os dados e tente novamente."),
      variant: "destructive",
    }),
  });

  const emailValido = !modoEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const valid = turmaId && registro.trim() && /^\d+$/.test(registro.trim()) && emailValido;

  return (
    <form
      className="space-y-3 pt-3 border-t"
      onSubmit={(e) => { e.preventDefault(); if (valid) criar.mutate(); }}
    >
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {temMatriculaAtiva ? "Nova enturmação" : "Enturmar estudante"}
      </p>

      {modoEmail && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">E-mail do estudante <span className="text-destructive">*</span></Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="estudante@email.com"
              className="h-8 text-xs bg-background"
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nome (opcional)</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
              className="h-8 text-xs bg-background"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Turma <span className="text-destructive">*</span></Label>
          <Select value={turmaId} onValueChange={setTurmaId}>
            <SelectTrigger className="h-8 text-xs bg-background">
              <SelectValue placeholder="Selecione a turma…" />
            </SelectTrigger>
            <SelectContent>
              {turmas?.map((t: { id: string; sigla: string; cursoNome?: string }) => (
                <SelectItem key={t.id} value={t.id} className="text-xs">
                  {t.sigla} — {t.cursoNome ?? ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Registro do estudante <span className="text-destructive">*</span></Label>
          <Input
            value={registro}
            onChange={(e) => setRegistro(e.target.value.replace(/\D/g, ""))}
            placeholder="Número (somente dígitos)"
            className="h-8 text-xs bg-background"
            maxLength={20}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ano</Label>
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anosOptions.map((a) => <SelectItem key={a} value={String(a)} className="text-xs">{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Semestre</Label>
          <Select value={semestre} onValueChange={setSemestre}>
            <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1" className="text-xs">1º semestre</SelectItem>
              <SelectItem value="2" className="text-xs">2º semestre</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" size="sm" className="h-8 text-xs" disabled={!valid || criar.isPending}>
        <Plus className="w-3 h-3 mr-1" />Enturmar
      </Button>
    </form>
  );
}

// ── Card de estudante existente (acordeão) ────────────────────────────────────

function EstudanteCard({
  estudante,
  ofertas,
  onRefresh,
}: { estudante: Estudante; ofertas: Oferta[]; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [novoUsuario, setNovoUsuario] = useState<{ senhaGerada: string; nome: string | null } | null>(null);
  const { toast } = useToast();

  const excluir = useMutation({
    mutationFn: async (matriculaId: string) => {
      const res = await fetch(`${BASE}/api/matriculas/${matriculaId}`, { method: "DELETE", credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body.error ?? "Erro"), { data: body });
    },
    onSuccess: () => { toast({ title: "Enturmação removida" }); onRefresh(); },
    onError: (err) => toast({
      title: "Erro ao remover enturmação",
      description: apiMsg(err, "Tente novamente."),
      variant: "destructive",
    }),
  });

  const ativas = estudante.matriculas.filter((m) => m.ativo);
  const cursoAtual = ativas[0]?.cursoNome ?? null;

  return (
    <>
      {novoUsuario && (
        <NovoUsuarioDialog
          nome={novoUsuario.nome}
          senhaGerada={novoUsuario.senhaGerada}
          onClose={() => { setNovoUsuario(null); onRefresh(); }}
        />
      )}

      <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="p-2 bg-emerald-100 text-emerald-700 rounded-md shrink-0">
            <UserCheck className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{estudante.nome ?? "Sem nome"}</p>
            <p className="text-xs text-muted-foreground">
              {ativas.length === 0
                ? "Sem enturmação ativa"
                : `${cursoAtual} · ${ativas.length} turma${ativas.length > 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {ativas.map((m) => (
              <Badge key={m.id} variant="secondary" className="text-xs hidden sm:flex">
                {m.turmaSigla} · {m.ano}/{m.semestre}º
              </Badge>
            ))}
            {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        {expanded && (
          <div className="px-4 pb-4 space-y-4">
            {/* Enturmações ativas */}
            {ativas.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Enturmações ativas</p>
                {ativas.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-md border bg-muted/20">
                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <span><span className="text-muted-foreground">Turma:</span> <strong>{m.turmaSigla}</strong></span>
                      <span><span className="text-muted-foreground">Curso:</span> {m.cursoNome}</span>
                      <span><span className="text-muted-foreground">Período:</span> {m.ano} / {m.semestre}º sem.</span>
                      <span><span className="text-muted-foreground">Registro:</span> {m.registro}</span>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover enturmação?</AlertDialogTitle>
                          <AlertDialogDescription>
                            <strong>{estudante.nome}</strong> será removido da turma <strong>{m.turmaSigla}</strong> ({m.ano}/{m.semestre}º semestre).
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => excluir.mutate(m.id)} className="bg-destructive hover:bg-destructive/90">
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            )}

            {/* Disciplinas */}
            {ofertas.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" />Disciplinas cursadas
                </p>
                <DisciplinasSelector
                  usuarioId={estudante.id}
                  ofertas={ofertas}
                  disciplinasAtuais={estudante.disciplinas.map((d) => d.disciplinaOfertaId)}
                  onSaved={onRefresh}
                />
              </div>
            )}

            <MatriculaForm
              estudante={estudante}
              temMatriculaAtiva={ativas.length > 0}
              onSuccess={(result) => {
                if (result.usuarioCriado && result.senhaGerada) {
                  setNovoUsuario({ senhaGerada: result.senhaGerada, nome: result.nome ?? null });
                } else {
                  onRefresh();
                }
              }}
            />
          </div>
        )}
      </div>
    </>
  );
}

// ── Painel de adicionar novo estudante ────────────────────────────────────────

function AdicionarEstudantePanel({ onSuccess }: { onSuccess: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [novoUsuario, setNovoUsuario] = useState<{ senhaGerada: string; nome: string | null } | null>(null);

  if (!aberto) {
    return (
      <Button variant="outline" onClick={() => setAberto(true)}>
        <UserPlus className="w-4 h-4 mr-2" />Enturmar novo estudante
      </Button>
    );
  }

  return (
    <>
      {novoUsuario && (
        <NovoUsuarioDialog
          nome={novoUsuario.nome}
          senhaGerada={novoUsuario.senhaGerada}
          onClose={() => { setNovoUsuario(null); onSuccess(); }}
        />
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            Enturmar novo estudante
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Informe o e-mail do estudante. Se já existir uma conta vinculada, o estudante será enturmado automaticamente.
            Caso contrário, uma conta será criada e uma senha provisória será gerada.
          </p>
          <MatriculaForm
            onSuccess={(result) => {
              if (result.usuarioCriado && result.senhaGerada) {
                setNovoUsuario({ senhaGerada: result.senhaGerada, nome: result.nome ?? null });
              } else {
                setAberto(false);
                onSuccess();
              }
            }}
          />
          <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" onClick={() => setAberto(false)}>
            Cancelar
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function EnturmacaoPage() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");

  const { data: estudantes, isLoading } = useQuery<Estudante[]>({
    queryKey: ["matriculas"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/matriculas`, { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao carregar estudantes");
      return res.json();
    },
  });

  const { data: ofertas = [] } = useQuery<Oferta[]>({
    queryKey: ["usuario-disciplinas-ofertas"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/usuario-disciplinas/ofertas`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["matriculas"] });

  const filtrados = (estudantes ?? []).filter((e) =>
    !busca || (e.nome ?? "").toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Enturmação — Estudantes</h1>
        <p className="text-muted-foreground mt-2">
          Gerencie a enturmação dos estudantes. Um estudante pode estar enturmado em até 2 turmas do mesmo curso, desde que sejam de turnos diferentes.
          Cursos de módulo menor limitam a seleção a 2 disciplinas.
        </p>
      </div>

      <AdicionarEstudantePanel onSuccess={refresh} />

      <Input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar estudante…"
        className="max-w-sm bg-background"
      />

      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-lg bg-card">
            <GraduationCap className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">
              {busca ? "Nenhum estudante encontrado para esta busca." : "Nenhum estudante cadastrado."}
            </p>
            {!busca && (
              <p className="text-xs text-muted-foreground mt-1">
                Use o botão acima para enturmar o primeiro estudante.
              </p>
            )}
          </div>
        ) : (
          filtrados.map((e) => (
            <EstudanteCard key={e.id} estudante={e} ofertas={ofertas} onRefresh={refresh} />
          ))
        )}
      </div>
    </div>
  );
}
