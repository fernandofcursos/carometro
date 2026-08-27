import { useState, useMemo, useEffect, useRef } from "react";
import { useListTurmas, useListCursos } from "@workspace/api-client-react";
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
import { GraduationCap, Plus, Trash2, UserCheck, ChevronDown, ChevronRight, UserPlus, Copy, Check, BookOpen, Pencil, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────

type Turno = { id: string; nome: string };

type Matricula = {
  id: string; usuarioId: string; turmaId: string; turmaSigla: string;
  cursoId: string; cursoNome: string; registro: string;
  ano: number; semestre: number; ativo: boolean; criadoEm: string;
  turnos: Turno[];
};

type DisciplinaAtual = {
  disciplinaOfertaId: string; disciplinaNome: string; cursoNome: string; turnoNome: string;
};

type Estudante = {
  id: string; nome: string | null; criadoEm: string;
  matriculas: Matricula[]; disciplinas: DisciplinaAtual[];
};

type Oferta = {
  id: string; disciplinaId: string; disciplinaNome: string;
  cursoId: string; cursoNome: string; moduloMenor: boolean;
  turnoId: string; turnoNome: string;
};

type TurmaComTurnos = {
  id: string; sigla: string; descricao: string; cursoId: string; cursoNome?: string;
  modulo?: string | null; turnos: Turno[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return (err.data as { error?: string } | null)?.error ?? fallback;
  if (err instanceof Error) return (err as { data?: { error?: string } }).data?.error ?? err.message;
  return fallback;
}

const anoAtual = new Date().getFullYear();
const anosOptions = Array.from({ length: 6 }, (_, i) => anoAtual - 1 + i);

const ROMANOS: Record<string, number> = { I:1, II:2, III:3, IV:4, V:5, VI:6, VII:7, VIII:8, IX:9, X:10 };
function moduloNumerico(m: string | null | undefined): number {
  if (!m) return 0;
  return ROMANOS[m.toUpperCase().trim()] ?? parseInt(m ?? "", 10) || 0;
}

// ── Dialog: novo usuário criado ───────────────────────────────────────────────

function NovoUsuarioDialog({ nome, senhaGerada, onClose }: { nome: string | null; senhaGerada: string; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = () => {
    navigator.clipboard.writeText(senhaGerada)
      .then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); })
      .catch(() => {});
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Usuário criado com sucesso</DialogTitle>
          <DialogDescription>Anote a senha provisória de <strong>{nome ?? "o estudante"}</strong> — não será exibida novamente.</DialogDescription>
        </DialogHeader>
        <div className="my-2 flex items-center gap-2 rounded-md border bg-muted px-4 py-3">
          <code className="flex-1 text-sm font-mono tracking-widest">{senhaGerada}</code>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copiar}>
            {copiado ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Um e-mail de boas-vindas com instruções de acesso também foi enviado.</p>
        <DialogFooter><Button onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Seletor de disciplinas integrado ao formulário ────────────────────────────

function DisciplinasSeletor({
  ofertas,
  moduloMenor,
  moduloInferiorSecundario,
  selecionados,
  onChange,
}: {
  ofertas: Oferta[];
  moduloMenor: boolean;
  moduloInferiorSecundario?: boolean;
  selecionados: string[];
  onChange: (ids: string[]) => void;
}) {
  const modoMenor = moduloMenor || moduloInferiorSecundario;
  const selSet = useMemo(() => new Set(selecionados), [selecionados]);
  const total = ofertas.length;
  const selCount = selecionados.filter((id) => ofertas.some((o) => o.id === id)).length;

  if (total === 0) return <p className="text-xs text-muted-foreground italic">Nenhuma disciplina disponível para este turno.</p>;

  if (modoMenor) {
    // Módulo menor ou inferior secundário: checkboxes, máx 3
    const atingiuLimite = selCount >= 3;
    const label = moduloInferiorSecundario
      ? "Disciplinas (módulo inferior — máx. 3)"
      : "Disciplinas (módulo menor)";
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full",
            atingiuLimite ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"
          )}>{selCount}/3</span>
        </div>
        <div className="space-y-1.5 pl-1">
          {ofertas.map((o) => {
            const checked = selSet.has(o.id);
            const disabled = !checked && atingiuLimite;
            return (
              <label key={o.id} className={cn("flex items-center gap-2 cursor-pointer select-none", disabled && "opacity-40 cursor-not-allowed")}>
                <Checkbox checked={checked} disabled={disabled}
                  onCheckedChange={() => {
                    const next = new Set(selSet);
                    if (next.has(o.id)) next.delete(o.id); else next.add(o.id);
                    onChange([...next].filter((id) => ofertas.some((x) => x.id === id)));
                  }} className="shrink-0" />
                <span className="text-sm">{o.disciplinaNome}</span>
              </label>
            );
          })}
        </div>
        {atingiuLimite && <p className="text-xs text-amber-700">Limite de 3 disciplinas atingido para este módulo inferior.</p>}
      </div>
    );
  }

  // Módulo maior: Todas ou Uma disciplina
  const isTodas = selCount === total && total > 0;
  const isUma = selCount === 1;
  const modo: "todas" | "uma" | "nenhuma" = isTodas ? "todas" : isUma ? "uma" : "nenhuma";

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">Disciplinas (módulo maior)</span>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={modo === "todas" ? "default" : "outline"} className="h-7 text-xs"
          onClick={() => onChange(ofertas.map((o) => o.id))}>
          Todas ({total})
        </Button>
        <Button type="button" size="sm" variant={modo === "uma" ? "default" : "outline"} className="h-7 text-xs"
          onClick={() => { if (modo !== "uma") onChange([]); }}>
          Selecionar uma
        </Button>
      </div>
      {(modo === "uma" || (modo === "nenhuma" && selCount === 0)) && (
        <div className="space-y-1.5 pl-1 pt-1">
          {ofertas.map((o) => {
            const checked = selSet.has(o.id);
            return (
              <label key={o.id} className="flex items-center gap-2 cursor-pointer select-none">
                <input type="radio" name="discModuloMaior" checked={checked}
                  onChange={() => onChange([o.id])}
                  className="h-3.5 w-3.5 accent-primary shrink-0" />
                <span className="text-sm">{o.disciplinaNome}</span>
              </label>
            );
          })}
        </div>
      )}
      {modo === "nenhuma" && selCount === 0 && (
        <p className="text-xs text-amber-700">Selecione "Todas" ou escolha uma disciplina.</p>
      )}
    </div>
  );
}

// ── Formulário de enturmação (cascata Curso → Turma → Turno → Disciplinas) ───

function EnturmarForm({
  estudante,
  editingMatricula,
  turmas,
  cursos,
  ofertas,
  onSuccess,
  onCancel,
}: {
  estudante?: Estudante;
  editingMatricula?: Matricula;
  turmas: TurmaComTurnos[];
  cursos: { id: string; sigla: string; nome: string }[];
  ofertas: Oferta[];
  onSuccess: (result: { usuarioCriado?: boolean; senhaGerada?: string; nome?: string | null }) => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!editingMatricula;

  // Identificação (apenas quando novo estudante via e-mail)
  const [email, setEmail]   = useState("");
  const [nome, setNome]     = useState("");

  // Cascata
  const [cursoId, setCursoId]   = useState(editingMatricula?.cursoId ?? "");
  const [turmaId, setTurmaId]   = useState(editingMatricula?.turmaId ?? "");
  const [turnoId, setTurnoId]   = useState(editingMatricula?.turnos[0]?.id ?? "");

  // Dados da matrícula
  const [registro, setRegistro] = useState(editingMatricula?.registro ?? "");
  const [ano, setAno]           = useState(String(editingMatricula?.ano ?? anoAtual));
  const [semestre, setSemestre] = useState(String(editingMatricula?.semestre ?? 1));

  // Disciplinas
  const [discIds, setDiscIds] = useState<string[]>([]);
  const prevTurnoRef = useRef("");

  // Cascade: turmas filtradas pelo curso selecionado
  const turmasFiltradas = useMemo(
    () => (cursoId ? turmas.filter((t) => t.cursoId === cursoId) : turmas),
    [turmas, cursoId]
  );

  const turmaAtual = useMemo(() => turmas.find((t) => t.id === turmaId) ?? null, [turmas, turmaId]);
  const turnosDisponiveis = turmaAtual?.turnos ?? [];
  const effectiveTurnoId = turnosDisponiveis.length === 1 ? turnosDisponiveis[0].id : turnoId;

  // Disciplinas disponíveis para a combinação curso+turno selecionada
  const ofertasFiltradas = useMemo(
    () => ofertas.filter((o) => o.cursoId === turmaAtual?.cursoId && o.turnoId === effectiveTurnoId),
    [ofertas, turmaAtual, effectiveTurnoId]
  );
  const moduloMenor = ofertasFiltradas.some((o) => o.moduloMenor);

  // Detectar se esta é uma enturmação secundária em módulo INFERIOR ao existente
  // Nesse caso, aplicar limite de 3 disciplinas mesmo que o curso seja "módulo maior"
  const moduloInferiorSecundario = useMemo(() => {
    if (!turmaAtual?.modulo || !estudante?.matriculas?.length || isEditing) return false;
    const moduloNovo = moduloNumerico(turmaAtual.modulo);
    if (moduloNovo === 0) return false;
    return estudante.matriculas.some((m) => {
      const turmaExist = turmas.find((t) => t.id === m.turmaId);
      const modExist = moduloNumerico(turmaExist?.modulo);
      return modExist > moduloNovo;
    });
  }, [turmaAtual, estudante, turmas, isEditing]);

  // Quando o turno muda, reinicializa disciplinas
  useEffect(() => {
    if (prevTurnoRef.current === effectiveTurnoId) return;
    prevTurnoRef.current = effectiveTurnoId;
    if (!effectiveTurnoId || ofertasFiltradas.length === 0) { setDiscIds([]); return; }

    if (isEditing && estudante) {
      // Pré-popular com disciplinas existentes do estudante para esse turno
      const ids = estudante.disciplinas
        .filter((d) => d.turnoNome === ofertasFiltradas[0]?.turnoNome)
        .map((d) => d.disciplinaOfertaId)
        .filter((id) => ofertasFiltradas.some((o) => o.id === id));
      setDiscIds(ids.length > 0 ? ids : (moduloMenor ? [] : ofertasFiltradas.map((o) => o.id)));
    } else {
      // Padrão: todas para módulo maior, nenhuma para módulo menor
      setDiscIds(moduloMenor ? [] : ofertasFiltradas.map((o) => o.id));
    }
  }, [effectiveTurnoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Quando turmaId muda, reinicia turnoId e cursoId derivado
  const handleTurmaChange = (id: string) => {
    setTurmaId(id);
    setTurnoId("");
  };

  const handleCursoChange = (id: string) => {
    setCursoId(id);
    setTurmaId("");
    setTurnoId("");
    setDiscIds([]);
  };

  // Salvar disciplinas
  const salvarDisciplinas = async (usuarioId: string) => {
    if (ofertasFiltradas.length === 0) return;
    const res = await fetch(`${BASE}/api/usuario-disciplinas/${usuarioId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ disciplinaOfertaIds: discIds }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw Object.assign(new Error(body.error ?? "Erro ao salvar disciplinas"), { data: body });
    }
  };

  const salvar = useMutation({
    mutationFn: async () => {
      if (isEditing && editingMatricula) {
        // PATCH matrícula + salvar disciplinas
        const patchRes = await fetch(`${BASE}/api/matriculas/${editingMatricula.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ turmaId, registro: registro.trim(), ano: Number(ano), semestre: Number(semestre) }),
        });
        const patchBody = await patchRes.json().catch(() => ({}));
        if (!patchRes.ok) throw Object.assign(new Error(patchBody.error ?? "Erro"), { data: patchBody });
        await salvarDisciplinas(editingMatricula.usuarioId);
        return { usuarioCriado: false };
      }

      // POST nova matrícula
      const payload: Record<string, unknown> = {
        turmaId, registro: registro.trim(), ano: Number(ano), semestre: Number(semestre),
      };
      if (estudante) {
        payload.usuarioId = estudante.id;
      } else {
        payload.email = email.trim().toLowerCase();
        if (nome.trim()) payload.nome = nome.trim();
      }
      const res = await fetch(`${BASE}/api/matriculas`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body.error ?? "Erro"), { data: body, status: res.status });

      const result = body as { matricula?: { usuarioId?: string }; usuarioCriado?: boolean; senhaGerada?: string };
      const uId = result.matricula?.usuarioId ?? estudante?.id;
      if (uId) await salvarDisciplinas(uId).catch(() => {});
      return result;
    },
    onSuccess: (result) => {
      toast({ title: isEditing ? "Enturmação atualizada" : "Estudante enturmado com sucesso" });
      onSuccess({ ...result, nome: estudante?.nome ?? (nome.trim() || null) });
    },
    onError: (err) => toast({
      title: isEditing ? "Erro ao atualizar enturmação" : "Erro ao enturmar",
      description: apiMsg(err, "Verifique os dados e tente novamente."),
      variant: "destructive",
    }),
  });

  const modoEmail = !estudante && !isEditing;
  const emailValido = !modoEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const discValida = ofertasFiltradas.length === 0 || discIds.length > 0;
  const valid = turmaId && effectiveTurnoId && registro.trim() && /^\d+$/.test(registro.trim()) && emailValido && discValida;

  return (
    <div className="space-y-4 p-4 rounded-lg border bg-muted/20">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {isEditing ? "Alterar enturmação" : "Nova enturmação"}
      </p>

      {modoEmail && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">E-mail do estudante <span className="text-destructive">*</span></Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="estudante@email.com" className="h-8 text-xs bg-background" required />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nome (opcional)</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo" className="h-8 text-xs bg-background" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Curso */}
        <div className="space-y-1">
          <Label className="text-xs">Curso <span className="text-destructive">*</span></Label>
          <Select value={cursoId} onValueChange={handleCursoChange}>
            <SelectTrigger className="h-8 text-xs bg-background"><SelectValue placeholder="Selecione o curso…" /></SelectTrigger>
            <SelectContent>
              {cursos.map((c) => <SelectItem key={c.id} value={c.id} className="text-xs">{c.sigla} — {c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Turma (filtrada por curso) */}
        <div className="space-y-1">
          <Label className="text-xs">Turma <span className="text-destructive">*</span></Label>
          <Select value={turmaId} onValueChange={handleTurmaChange} disabled={!cursoId}>
            <SelectTrigger className="h-8 text-xs bg-background"><SelectValue placeholder="Selecione a turma…" /></SelectTrigger>
            <SelectContent>
              {turmasFiltradas.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-xs">
                  {t.sigla}{t.modulo ? ` (Mód. ${t.modulo})` : ""} — {t.descricao}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Turno (quando turma tem múltiplos turnos) */}
        {turmaId && turnosDisponiveis.length > 1 && (
          <div className="space-y-1">
            <Label className="text-xs">Turno <span className="text-destructive">*</span></Label>
            <Select value={turnoId} onValueChange={setTurnoId}>
              <SelectTrigger className="h-8 text-xs bg-background"><SelectValue placeholder="Selecione o turno…" /></SelectTrigger>
              <SelectContent>
                {turnosDisponiveis.map((t) => <SelectItem key={t.id} value={t.id} className="text-xs">{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {turmaId && turnosDisponiveis.length === 1 && (
          <div className="space-y-1">
            <Label className="text-xs">Turno</Label>
            <div className="h-8 flex items-center px-3 rounded-md border bg-background/60 text-xs text-muted-foreground">
              {turnosDisponiveis[0].nome}
            </div>
          </div>
        )}

        {/* Registro, Ano, Semestre */}
        <div className="space-y-1">
          <Label className="text-xs">Registro do estudante <span className="text-destructive">*</span></Label>
          <Input value={registro} onChange={(e) => setRegistro(e.target.value.replace(/\D/g, ""))}
            placeholder="Somente dígitos" className="h-8 text-xs bg-background" maxLength={20} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ano</Label>
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>{anosOptions.map((a) => <SelectItem key={a} value={String(a)} className="text-xs">{a}</SelectItem>)}</SelectContent>
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

      {/* Disciplinas */}
      {effectiveTurnoId && turmaId && (
        <DisciplinasSeletor
          ofertas={ofertasFiltradas}
          moduloMenor={moduloMenor}
          moduloInferiorSecundario={moduloInferiorSecundario}
          selecionados={discIds}
          onChange={setDiscIds}
        />
      )}

      <div className="flex gap-2 pt-2">
        <Button type="button" size="sm" className="h-8 text-xs" disabled={!valid || salvar.isPending}
          onClick={() => salvar.mutate()}>
          {salvar.isPending ? "Salvando…" : isEditing ? <><Check className="w-3 h-3 mr-1" />Salvar alterações</> : <><Plus className="w-3 h-3 mr-1" />Enturmar</>}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

// ── Card de estudante ─────────────────────────────────────────────────────────

function EstudanteCard({
  estudante,
  turmas,
  cursos,
  ofertas,
  onRefresh,
}: {
  estudante: Estudante;
  turmas: TurmaComTurnos[];
  cursos: { id: string; sigla: string; nome: string }[];
  ofertas: Oferta[];
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingMatricula, setEditingMatricula] = useState<Matricula | undefined>();
  const [novoUsuario, setNovoUsuario] = useState<{ senhaGerada: string; nome: string | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; sigla: string } | null>(null);
  const { toast } = useToast();

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/api/matriculas/${id}`, { method: "DELETE", credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body.error ?? "Erro"), { data: body });
    },
    onSuccess: () => { toast({ title: "Enturmação removida" }); setDeleteTarget(null); onRefresh(); },
    onError: (err) => toast({ title: "Erro ao remover", description: apiMsg(err, "Tente novamente."), variant: "destructive" }),
  });

  const ativas = estudante.matriculas.filter((m) => m.ativo);
  const registros = [...new Set(ativas.map((m) => m.registro))];

  const handleFormSuccess = (result: { usuarioCriado?: boolean; senhaGerada?: string; nome?: string | null }) => {
    if (result.usuarioCriado && result.senhaGerada) {
      setNovoUsuario({ senhaGerada: result.senhaGerada, nome: result.nome ?? null });
    } else {
      setShowForm(false);
      setEditingMatricula(undefined);
      onRefresh();
    }
  };

  const handleEdit = (m: Matricula) => {
    setEditingMatricula(m);
    setShowForm(true);
  };

  return (
    <>
      {novoUsuario && (
        <NovoUsuarioDialog nome={novoUsuario.nome} senhaGerada={novoUsuario.senhaGerada}
          onClose={() => { setNovoUsuario(null); onRefresh(); }} />
      )}

      {/* Confirmação de exclusão — Sim / Não / Cancelar */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Remover enturmação?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{estudante.nome}</strong> será desvinculado da turma <strong>{deleteTarget?.sigla}</strong>.
              Esta ação pode ser desfeita pelo administrador.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row justify-end gap-2 sm:gap-2">
            <Button variant="outline" size="sm"
              onClick={() => { setDeleteTarget(null); setExpanded(false); }}>
              Cancelar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              Não
            </Button>
            <Button variant="destructive" size="sm" disabled={excluir.isPending}
              onClick={() => deleteTarget && excluir.mutate(deleteTarget.id)}>
              {excluir.isPending ? "Removendo…" : "Sim, remover"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
        {/* Header — clicável para expandir */}
        <button type="button" className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
          onClick={() => setExpanded((v) => !v)}>
          <div className={cn("p-2 rounded-md shrink-0", ativas.length > 0 ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground")}>
            <UserCheck className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{estudante.nome ?? "Sem nome"}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {registros.length > 0 && (
                <span className="text-xs text-muted-foreground font-mono">Reg.: {registros.join(", ")}</span>
              )}
              {ativas.length === 0 && <span className="text-xs text-muted-foreground italic">Sem enturmação ativa</span>}
            </div>
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
          <div className="border-t px-4 pb-4 space-y-4 pt-4">
            {/* Dados do aluno */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
              <div><span className="text-xs text-muted-foreground">Nome</span><p className="font-medium truncate">{estudante.nome ?? "—"}</p></div>
              {registros.length > 0 && (
                <div><span className="text-xs text-muted-foreground">Registro(s)</span><p className="font-mono">{registros.join(", ")}</p></div>
              )}
              <div><span className="text-xs text-muted-foreground">Cadastrado em</span><p>{new Date(estudante.criadoEm).toLocaleDateString("pt-BR")}</p></div>
            </div>

            {/* Tabela de enturmações */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Enturmações ativas</p>
              {ativas.length === 0 ? (
                <div className="text-center py-6 border border-dashed rounded-lg">
                  <GraduationCap className="w-8 h-8 text-muted-foreground opacity-30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhuma enturmação ativa.</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Curso</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Turno</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Turma</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Registro</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Semestre</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground w-16">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {ativas.map((m) => (
                        <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2.5 font-medium">{m.cursoNome}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {m.turnos.map((t) => t.nome).join(", ") || "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex px-2 py-0.5 rounded bg-secondary font-mono font-semibold">{m.turmaSigla}</span>
                          </td>
                          <td className="px-3 py-2.5 font-mono">{m.registro}</td>
                          <td className="px-3 py-2.5">{m.ano} / {m.semestre}º sem.</td>
                          <td className="px-3 py-2.5">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary"
                                onClick={() => handleEdit(m)} title="Alterar">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeleteTarget({ id: m.id, sigla: m.turmaSigla })} title="Excluir">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Formulário de adição / edição */}
            {showForm ? (
              <EnturmarForm
                estudante={estudante}
                editingMatricula={editingMatricula}
                turmas={turmas}
                cursos={cursos}
                ofertas={ofertas}
                onSuccess={handleFormSuccess}
                onCancel={() => { setShowForm(false); setEditingMatricula(undefined); }}
              />
            ) : (
              <Button variant="outline" size="sm" className="h-8 text-xs"
                onClick={() => { setEditingMatricula(undefined); setShowForm(true); }}>
                <Plus className="w-3 h-3 mr-1.5" />Nova enturmação
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Painel: enturmar novo estudante ───────────────────────────────────────────

function AdicionarEstudantePanel({
  turmas, cursos, ofertas, onSuccess,
}: { turmas: TurmaComTurnos[]; cursos: { id: string; sigla: string; nome: string }[]; ofertas: Oferta[]; onSuccess: () => void }) {
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
        <NovoUsuarioDialog nome={novoUsuario.nome} senhaGerada={novoUsuario.senhaGerada}
          onClose={() => { setNovoUsuario(null); onSuccess(); }} />
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />Enturmar novo estudante
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Informe o e-mail do estudante. Se já existir uma conta vinculada, o estudante será enturmado automaticamente.
            Caso contrário, uma conta será criada e uma senha provisória gerada.
          </p>
          <EnturmarForm
            turmas={turmas} cursos={cursos} ofertas={ofertas}
            onSuccess={(result) => {
              if (result.usuarioCriado && result.senhaGerada) {
                setNovoUsuario({ senhaGerada: result.senhaGerada, nome: result.nome ?? null });
              } else {
                setAberto(false);
                onSuccess();
              }
            }}
            onCancel={() => setAberto(false)}
          />
        </CardContent>
      </Card>
    </>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function EnturmacaoPage() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");

  const { data: estudantes, isLoading, isError } = useQuery<Estudante[]>({
    queryKey: ["matriculas"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/matriculas`, { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao carregar estudantes");
      return res.json();
    },
  });

  const { data: rawTurmas = [] } = useListTurmas();
  const { data: rawCursos = [] } = useListCursos();

  const turmas = rawTurmas as unknown as TurmaComTurnos[];
  const cursos = rawCursos as { id: string; sigla: string; nome: string }[];

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
        <p className="text-muted-foreground mt-2 text-sm">
          Vincule estudantes a turmas. Um estudante pode estar em uma turma do módulo atual e, opcionalmente,
          em uma turma de módulo inferior (máx. 3 disciplinas, turno diferente do módulo principal).
          Módulo maior: uma ou todas as disciplinas.
        </p>
      </div>

      <AdicionarEstudantePanel turmas={turmas} cursos={cursos} ofertas={ofertas} onSuccess={refresh} />

      <Input value={busca} onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar estudante por nome…" className="max-w-sm bg-background" />

      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}</div>
        ) : isError ? (
          <div className="text-center py-12 border border-dashed rounded-lg bg-card">
            <GraduationCap className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Não foi possível carregar os estudantes.</p>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-lg bg-card">
            <GraduationCap className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">
              {busca ? "Nenhum estudante encontrado para esta busca." : "Nenhum estudante cadastrado."}
            </p>
            {!busca && <p className="text-xs text-muted-foreground mt-1">Use o botão acima para enturmar o primeiro estudante.</p>}
          </div>
        ) : (
          filtrados.map((e) => (
            <EstudanteCard key={e.id} estudante={e} turmas={turmas} cursos={cursos} ofertas={ofertas} onRefresh={refresh} />
          ))
        )}
      </div>
    </div>
  );
}
