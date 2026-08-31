import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CalendarRange, ChevronLeft, ChevronRight, Download, Loader2, Plus, Trash2, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ──────────────────────────────────────────────────────────────────────

type Evento = {
  id: string;
  categoria: string;
  titulo: string | null;
  descricao: string | null;
  cor: string;
  icone: string;           // resolvido para exibição (nunca null)
  iconeOverride: string | null; // valor bruto do banco — null = usa padrão da categoria
};

type DiaCalendario = {
  data: string;
  diaSemana: number;
  eventos: Evento[];
};

type MesCalendario = {
  mes: number;
  mesNome: string;
  dias: DiaCalendario[];
};

type Semestre = { semestre: 1 | 2; inicio: string; fim: string };

type CalendarioResponse = {
  ano: number;
  semestres: Semestre[];
  meses: MesCalendario[];
};

// ── Categorias ─────────────────────────────────────────────────────────────────

const CATEGORIAS: { value: string; label: string; cor: string; icone: string }[] = [
  { value: "letivo",               label: "Dia letivo",              cor: "#4ade80", icone: "📗" },
  { value: "feriado_nacional",     label: "Feriado nacional",        cor: "#f87171", icone: "🇧🇷" },
  { value: "feriado_distrital",    label: "Feriado distrital",       cor: "#fb923c", icone: "🏛️" },
  { value: "recesso",              label: "Recesso / Férias",        cor: "#fbbf24", icone: "☀️" },
  { value: "evento",               label: "Evento escolar",          cor: "#60a5fa", icone: "📅" },
  { value: "formacao",             label: "Formação de professores", cor: "#a78bfa", icone: "📚" },
  { value: "atividade_pedagogica", label: "Atividade pedagógica",    cor: "#f472b6", icone: "🎓" },
  { value: "nao_letivo",           label: "Dia não letivo",          cor: "#94a3b8", icone: "🚫" },
  { value: "semana_pedagogica",    label: "Semana pedagógica",       cor: "#c084fc", icone: "🗓️" },
];

function getCat(value: string) {
  return CATEGORIAS.find((c) => c.value === value) ?? CATEGORIAS[0];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

async function sendJson(method: string, url: string, body?: object) {
  const r = await fetch(url, {
    method, credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

function apiMsg(err: unknown, fallback: string) {
  return (err as any)?.message ?? fallback;
}

function fmt(data: string) {
  const [y, m, d] = data.split("-");
  return `${d}/${m}/${y}`;
}

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function isFimSemana(ds: number) { return ds === 0 || ds === 6; }

// ── EventoModal ────────────────────────────────────────────────────────────────

type EventoModalProps = {
  open: boolean;
  onClose: () => void;
  datas: string[];
  evento?: Evento | null;
  ano: number;
};

function EventoModal({ open, onClose, datas, evento, ano }: EventoModalProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [categoria, setCategoria] = useState(evento?.categoria ?? "letivo");
  const [titulo, setTitulo] = useState(evento?.titulo ?? "");
  const [descricao, setDescricao] = useState(evento?.descricao ?? "");

  // Emoji personalizado: ativo somente se o evento já tem override no banco
  const [customIcone, setCustomIcone] = useState(!!evento?.iconeOverride);
  const [icone, setIcone] = useState(evento?.iconeOverride ?? "");

  const isEdit = !!evento;

  // Ao trocar categoria: emoji volta para o padrão da nova categoria
  function handleCategoriaChange(val: string) {
    setCategoria(val);
    setCustomIcone(false);
    setIcone("");
  }

  const cat = getCat(categoria);

  const mut = useMutation({
    mutationFn: () => {
      const iconeEnviar = customIcone && icone ? icone : null;
      if (isEdit) {
        return sendJson("PUT", `${BASE}/api/calendario/dias/${evento.id}`, {
          categoria,
          titulo: titulo || null,
          descricao: descricao || null,
          icone: iconeEnviar,
        });
      }
      return sendJson("POST", `${BASE}/api/calendario/dias`, {
        datas,
        categoria,
        titulo: titulo || null,
        descricao: descricao || null,
        icone: iconeEnviar,
      });
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Evento atualizado" : `${datas.length} evento(s) criado(s)` });
      qc.invalidateQueries({ queryKey: ["calendario", ano] });
      onClose();
    },
    onError: (err) => toast({ title: "Erro ao salvar", description: apiMsg(err, "Verifique os dados."), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar evento" : datas.length === 1 ? `Evento em ${fmt(datas[0])}` : `${datas.length} dias selecionados`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!isEdit && datas.length > 1 && (
            <div className="text-xs text-muted-foreground bg-muted rounded p-2">
              {datas.slice(0, 5).map(fmt).join(", ")}{datas.length > 5 ? ` e mais ${datas.length - 5}…` : ""}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={categoria} onValueChange={handleCategoriaChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full inline-block" style={{ background: c.cor }} />
                      {c.icone} {c.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ícone atual da categoria (informativo) */}
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 border px-3 py-2">
            <span className="text-2xl">{cat.icone}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Ícone da categoria</p>
              <p className="text-sm font-medium truncate">{cat.label}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={cat.label}
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição <span className="text-muted-foreground">(opcional)</span></Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
              placeholder="Detalhes do evento..."
            />
          </div>

          {/* Personalizar emoji — somente quando o usuário opta */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="custom-icone"
                checked={customIcone}
                onCheckedChange={(v) => {
                  setCustomIcone(!!v);
                  if (!v) setIcone("");
                }}
              />
              <label htmlFor="custom-icone" className="text-sm cursor-pointer select-none">
                Personalizar ícone emoji
              </label>
            </div>
            {customIcone && (
              <div className="flex items-center gap-2 pl-6">
                <Input
                  value={icone}
                  onChange={(e) => setIcone(e.target.value)}
                  placeholder={cat.icone}
                  maxLength={10}
                  className="w-24 text-center text-lg"
                  autoFocus
                />
                <span className="text-xs text-muted-foreground">emoji personalizado</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── ImportarModal ──────────────────────────────────────────────────────────────

function ImportarModal({ open, onClose, ano }: { open: boolean; onClose: () => void; ano: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: () => sendJson("POST", `${BASE}/api/calendario/importar-seedf`, { ano }),
    onSuccess: (data) => {
      toast({ title: `Calendário SEEDF ${ano} importado`, description: `${data.importados} novos · ${data.atualizados} atualizados` });
      qc.invalidateQueries({ queryKey: ["calendario", ano] });
      onClose();
    },
    onError: (err) => toast({ title: "Erro na importação", description: apiMsg(err, "Tente novamente."), variant: "destructive" }),
  });

  const resumo: Record<string, string> = {
    semana_pedagogica: "2 semanas pedagógicas",
    recesso: "25 dias de recesso",
    feriado_nacional: "9 feriados nacionais",
    feriado_distrital: "2 feriados distritais",
    atividade_pedagogica: "2 atividades pedagógicas",
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Importar Calendário SEEDF {ano}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              {ano !== 2026 ? (
                <p className="text-amber-600 font-medium">Apenas o ano 2026 está disponível para importação SEEDF.</p>
              ) : (
                <>
                  <p>Serão importados (ou atualizados):</p>
                  <ul className="space-y-1 ml-2">
                    {Object.values(resumo).map((r) => (
                      <li key={r} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 inline-block" />
                        {r}
                      </li>
                    ))}
                  </ul>
                  <p className="text-amber-600 flex items-center gap-1">
                    ⚠ Eventos existentes serão atualizados (operação idempotente).
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          {ano === 2026 && (
            <AlertDialogAction onClick={() => mut.mutate()} disabled={mut.isPending}>
              {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Importar"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── CelulaDia ──────────────────────────────────────────────────────────────────

type CelulaDiaProps = {
  dia: DiaCalendario;
  selecionado: boolean;
  semestres: Semestre[];
  onClick: (data: string, shift: boolean, ctrl: boolean) => void;
  onEventoClick: (e: React.MouseEvent, data: string, evento: Evento) => void;
  hoje: string;
};

function CelulaDia({ dia, selecionado, semestres, onClick, onEventoClick, hoje }: CelulaDiaProps) {
  const fds = isFimSemana(dia.diaSemana);
  const isHoje = dia.data === hoje;
  const dataObj = new Date(dia.data + "T12:00:00");

  // Verificar se está dentro de algum semestre
  const emSemestre = semestres.some((s) => dia.data >= s.inicio && dia.data <= s.fim);

  return (
    <div
      className={cn(
        "relative rounded p-0.5 border cursor-pointer select-none transition-colors min-h-[56px]",
        fds ? "bg-slate-50 border-slate-200" : emSemestre ? "bg-white border-gray-200 hover:border-cyan-400" : "bg-gray-50 border-gray-100 opacity-60",
        selecionado && "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-300",
        isHoje && !selecionado && "border-indigo-400 ring-2 ring-indigo-300",
      )}
      onClick={(e) => onClick(dia.data, e.shiftKey, e.ctrlKey || e.metaKey)}
    >
      <div className={cn(
        "text-[11px] font-semibold leading-none mb-0.5 flex items-center justify-between",
        fds ? "text-slate-400" : !emSemestre ? "text-slate-400" : "text-slate-700",
        isHoje && "text-indigo-600",
      )}>
        <span>{dataObj.getDate()}</span>
        {isHoje && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />}
      </div>

      {/* Eventos (max 3 ícones) */}
      <div className="flex flex-wrap gap-px">
        {dia.eventos.slice(0, 3).map((ev) => (
          <Tooltip key={ev.id}>
            <TooltipTrigger asChild>
              <button
                className="text-[10px] leading-none rounded px-0.5 hover:scale-125 transition-transform"
                style={{ background: ev.cor + "33" }}
                onClick={(e) => { e.stopPropagation(); onEventoClick(e, dia.data, ev); }}
              >
                {ev.icone}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[180px]">
              <p className="font-semibold">{ev.titulo ?? getCat(ev.categoria).label}</p>
              {ev.descricao && <p className="text-xs text-muted-foreground">{ev.descricao}</p>}
            </TooltipContent>
          </Tooltip>
        ))}
        {dia.eventos.length > 3 && (
          <span className="text-[9px] text-muted-foreground">+{dia.eventos.length - 3}</span>
        )}
      </div>
    </div>
  );
}

// ── MesGrid ────────────────────────────────────────────────────────────────────

function MesGrid({
  mes, semestres, selecionados, onClick, onEventoClick, hoje,
}: {
  mes: MesCalendario;
  semestres: Semestre[];
  selecionados: Set<string>;
  onClick: (data: string, shift: boolean, ctrl: boolean) => void;
  onEventoClick: (e: React.MouseEvent, data: string, ev: Evento) => void;
  hoje: string;
}) {
  const primeiroDia = mes.dias[0];
  const offset = primeiroDia?.diaSemana ?? 0;

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-bold text-gray-700 text-center">{mes.mesNome}</h3>
      {/* Cabeçalho dias da semana */}
      <div className="grid grid-cols-7 gap-px">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="text-[9px] text-center text-muted-foreground font-medium py-0.5">{d}</div>
        ))}
      </div>
      {/* Grade */}
      <div className="grid grid-cols-7 gap-px">
        {/* Offset */}
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`off-${i}`} />
        ))}
        {mes.dias.map((dia) => (
          <CelulaDia
            key={dia.data}
            dia={dia}
            selecionado={selecionados.has(dia.data)}
            semestres={semestres}
            onClick={onClick}
            onEventoClick={onEventoClick}
            hoje={hoje}
          />
        ))}
      </div>
    </div>
  );
}

// ── Legenda ────────────────────────────────────────────────────────────────────

function Legenda() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {CATEGORIAS.map((c) => (
        <span key={c.value} className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.cor }} />
          {c.icone} {c.label}
        </span>
      ))}
    </div>
  );
}

// ── SemestreBar ────────────────────────────────────────────────────────────────

function SemestreBar({ semestres, ano }: { semestres: Semestre[]; ano: number }) {
  const [edit, setEdit] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const [s1inicio, setS1inicio] = useState(semestres.find((s) => s.semestre === 1)?.inicio ?? `${ano}-02-02`);
  const [s1fim, setS1fim] = useState(semestres.find((s) => s.semestre === 1)?.fim ?? `${ano}-07-11`);
  const [s2inicio, setS2inicio] = useState(semestres.find((s) => s.semestre === 2)?.inicio ?? `${ano}-08-10`);
  const [s2fim, setS2fim] = useState(semestres.find((s) => s.semestre === 2)?.fim ?? `${ano}-12-19`);

  const saveMut = useMutation({
    mutationFn: async () => {
      await sendJson("PUT", `${BASE}/api/calendario/semestres`, { ano, semestre: 1, inicio: s1inicio, fim: s1fim });
      await sendJson("PUT", `${BASE}/api/calendario/semestres`, { ano, semestre: 2, inicio: s2inicio, fim: s2fim });
    },
    onSuccess: () => {
      toast({ title: "Semestres salvos" });
      qc.invalidateQueries({ queryKey: ["calendario", ano] });
      setEdit(false);
    },
    onError: (err) => toast({ title: "Erro ao salvar semestres", description: apiMsg(err, "Verifique as datas."), variant: "destructive" }),
  });

  if (!edit) {
    const s1 = semestres.find((s) => s.semestre === 1);
    const s2 = semestres.find((s) => s.semestre === 2);
    return (
      <div className="flex flex-wrap items-center gap-4 text-sm bg-cyan-50 border border-cyan-200 rounded-lg px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-cyan-700">1º Semestre:</span>
          {s1 ? <span>{fmt(s1.inicio)} — {fmt(s1.fim)}</span> : <span className="text-muted-foreground italic">não configurado</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-cyan-700">2º Semestre:</span>
          {s2 ? <span>{fmt(s2.inicio)} — {fmt(s2.fim)}</span> : <span className="text-muted-foreground italic">não configurado</span>}
        </div>
        <Button size="sm" variant="ghost" className="ml-auto text-cyan-700 h-7" onClick={() => setEdit(true)}>
          Configurar
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-cyan-50 border border-cyan-200 rounded-lg px-4 py-3 space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-cyan-700">1º Semestre</Label>
          <div className="flex items-center gap-2">
            <Input type="date" value={s1inicio} onChange={(e) => setS1inicio(e.target.value)} className="h-8 text-sm" />
            <span className="text-muted-foreground">—</span>
            <Input type="date" value={s1fim} onChange={(e) => setS1fim(e.target.value)} className="h-8 text-sm" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-cyan-700">2º Semestre</Label>
          <div className="flex items-center gap-2">
            <Input type="date" value={s2inicio} onChange={(e) => setS2inicio(e.target.value)} className="h-8 text-sm" />
            <span className="text-muted-foreground">—</span>
            <Input type="date" value={s2fim} onChange={(e) => setS2fim(e.target.value)} className="h-8 text-sm" />
          </div>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={() => setEdit(false)}>Cancelar</Button>
        <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          Salvar semestres
        </Button>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CalendarioPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [ultimoClicado, setUltimoClicado] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [eventoEdit, setEventoEdit] = useState<Evento | null>(null);
  const [importarOpen, setImportarOpen] = useState(false);
  const [deleteEvento, setDeleteEvento] = useState<{ id: string; titulo: string | null } | null>(null);

  const hoje = new Date().toISOString().slice(0, 10);

  const { data, isLoading } = useQuery<CalendarioResponse>({
    queryKey: ["calendario", ano],
    queryFn: () => fetchJson(`${BASE}/api/calendario?ano=${ano}`),
  });

  const semestres = data?.semestres ?? [];
  const meses = data?.meses ?? [];

  // Tabela de datas disponíveis (para range shift+click)
  const todasDatas = meses.flatMap((m) => m.dias.map((d) => d.data));

  const handleDiaClick = useCallback((data: string, shift: boolean, ctrl: boolean) => {
    if (shift && ultimoClicado) {
      // Shift+clique: seleciona range do último clicado até aqui
      const idx1 = todasDatas.indexOf(ultimoClicado);
      const idx2 = todasDatas.indexOf(data);
      const [a, b] = idx1 < idx2 ? [idx1, idx2] : [idx2, idx1];
      const range = todasDatas.slice(a, b + 1);
      setSelecionados((prev) => {
        const next = new Set(prev);
        range.forEach((d) => next.add(d));
        return next;
      });
    } else if (ctrl) {
      // Ctrl+clique: toggle individual
      setSelecionados((prev) => {
        const next = new Set(prev);
        next.has(data) ? next.delete(data) : next.add(data);
        return next;
      });
    } else {
      // Clique simples: seleciona/deseleciona o dia — modal abre via barra flutuante
      setSelecionados((prev) => {
        const next = new Set(prev);
        if (next.has(data) && next.size === 1) {
          next.delete(data); // deseleciona se era o único
        } else {
          next.clear();
          next.add(data);
        }
        return next;
      });
    }
    setUltimoClicado(data);
  }, [todasDatas, ultimoClicado]);

  const handleEventoClick = useCallback((_e: React.MouseEvent, _data: string, ev: Evento) => {
    setEventoEdit(ev);
    setSelecionados(new Set([_data]));
    setModalOpen(true);
  }, []);

  const deleteMut = useMutation({
    mutationFn: (id: string) => sendJson("DELETE", `${BASE}/api/calendario/dias/${id}`),
    onSuccess: () => {
      toast({ title: "Evento removido" });
      qc.invalidateQueries({ queryKey: ["calendario", ano] });
      setDeleteEvento(null);
      setModalOpen(false);
    },
    onError: (err) => toast({ title: "Erro ao remover", description: apiMsg(err, "Tente novamente."), variant: "destructive" }),
  });

  const datasArr = Array.from(selecionados).sort();

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CalendarRange className="w-7 h-7 text-cyan-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Calendário Escolar</h1>
            <p className="text-sm text-muted-foreground">Gestão do calendário pedagógico anual</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setAno((y) => y - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="w-16 text-center font-bold text-lg">{ano}</span>
          <Button variant="outline" size="icon" onClick={() => setAno((y) => y + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportarOpen(true)} className="ml-2 gap-1.5">
            <Download className="w-4 h-4" /> Importar SEEDF
          </Button>
        </div>
      </div>

      {/* Semestres */}
      <SemestreBar semestres={semestres} ano={ano} />

      {/* Legenda */}
      <div className="bg-white border rounded-lg px-4 py-2">
        <Legenda />
      </div>

      {/* Grade anual */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {meses.map((mes) => (
            <div key={mes.mes} className="bg-white border rounded-xl p-3 shadow-sm">
              <MesGrid
                mes={mes}
                semestres={semestres}
                selecionados={selecionados}
                onClick={handleDiaClick}
                onEventoClick={handleEventoClick}
                hoje={hoje}
              />
            </div>
          ))}
        </div>
      )}

      {/* Barra de seleção múltipla */}
      {selecionados.size >= 1 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white px-4 py-2.5 rounded-full shadow-xl">
          <span className="text-sm font-medium">
            {selecionados.size === 1
              ? `${fmt(Array.from(selecionados)[0])} selecionado`
              : `${selecionados.size} dias selecionados`}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:text-white hover:bg-white/20 h-7 gap-1"
            onClick={() => setSelecionados(new Set())}
          >
            <X className="w-3 h-3" /> Limpar
          </Button>
          <Button
            size="sm"
            className="bg-cyan-500 hover:bg-cyan-400 text-white h-7 gap-1"
            onClick={() => { setEventoEdit(null); setModalOpen(true); }}
          >
            <Plus className="w-3 h-3" /> Adicionar evento
          </Button>
        </div>
      )}

      {/* Modal criar/editar evento */}
      {modalOpen && (
        <EventoModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setSelecionados(new Set()); }}
          datas={datasArr}
          evento={eventoEdit}
          ano={ano}
        />
      )}

      {/* Modal importar SEEDF */}
      <ImportarModal open={importarOpen} onClose={() => setImportarOpen(false)} ano={ano} />

      {/* Confirmação deletar */}
      <AlertDialog open={!!deleteEvento} onOpenChange={(v) => !v && setDeleteEvento(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover evento?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteEvento?.titulo ?? "Este evento"} será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteEvento && deleteMut.mutate(deleteEvento.id)}
            >
              {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
