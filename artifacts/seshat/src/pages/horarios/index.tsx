import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarDays, Plus, Trash2, Loader2, Upload, BookOpen, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ──────────────────────────────────────────────────────────────────────

type Turma = { id: string; sigla: string; cursoNome: string };
type TurnoInfo = { id: string; nome: string };
type TurmaInfo = { id: string; sigla: string; cursoNome: string; turnos: TurnoInfo[] };
type DisciplinaOferta = { id: string; disciplinaNome: string; turnoId: string; turnoNome: string };
type Slot = {
  id: string; diaSemana: number;
  horaInicio: string; horaFim: string;
  sala: string | null;
  disciplinaOfertaId: string | null;
  disciplinaNome: string | null;
  turnoNome: string | null;
};

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

function apiMsg(err: unknown, fallback: string): string {
  return (err as any)?.message ?? fallback;
}

const DIAS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta"] as const;
const DIAS_ABREV = ["", "Seg", "Ter", "Qua", "Qui", "Sex"] as const;

const HEADER_DIA: Record<number, string> = {
  1: "bg-blue-600", 2: "bg-violet-600", 3: "bg-emerald-600",
  4: "bg-amber-600", 5: "bg-rose-600",
};
const TEXT_DIA: Record<number, string> = {
  1: "text-blue-700 bg-blue-50 border-blue-200",
  2: "text-violet-700 bg-violet-50 border-violet-200",
  3: "text-emerald-700 bg-emerald-50 border-emerald-200",
  4: "text-amber-700 bg-amber-50 border-amber-200",
  5: "text-rose-700 bg-rose-50 border-rose-200",
};

// Slots de horário por tipo de turno (derivado do nome)
type SlotHorario = { inicio: string; fim: string; label: string };

function getSlotsDoTurno(turnoNome: string): SlotHorario[] {
  const n = turnoNome.toLowerCase();
  if (n.includes("mat")) return [
    { inicio: "08:00", fim: "09:00", label: "08:00 – 09:00" },
    { inicio: "09:00", fim: "10:00", label: "09:00 – 10:00" },
    { inicio: "10:00", fim: "11:00", label: "10:00 – 11:00" },
    { inicio: "11:00", fim: "12:00", label: "11:00 – 12:00" },
  ];
  if (n.includes("ves") || n.includes("tar")) return [
    { inicio: "13:00", fim: "14:00", label: "13:00 – 14:00" },
    { inicio: "14:00", fim: "15:00", label: "14:00 – 15:00" },
    { inicio: "15:00", fim: "16:00", label: "15:00 – 16:00" },
    { inicio: "16:00", fim: "17:00", label: "16:00 – 17:00" },
  ];
  if (n.includes("not") || n.includes("notur")) return [
    { inicio: "18:30", fim: "19:20", label: "18:30 – 19:20" },
    { inicio: "19:20", fim: "20:10", label: "19:20 – 20:10" },
    { inicio: "20:20", fim: "21:10", label: "20:20 – 21:10" },
    { inicio: "21:10", fim: "22:00", label: "21:10 – 22:00" },
  ];
  return [];
}

// Combina slots do template do turno com slots existentes (pode haver horários fora do padrão)
function buildLinhasHorario(template: SlotHorario[], slots: Slot[]): SlotHorario[] {
  const linhas = [...template];
  for (const s of slots) {
    const hi = s.horaInicio.slice(0, 5);
    const hf = s.horaFim.slice(0, 5);
    if (!linhas.some((l) => l.inicio === hi)) {
      linhas.push({ inicio: hi, fim: hf, label: `${hi} – ${hf}` });
    }
  }
  linhas.sort((a, b) => a.inicio.localeCompare(b.inicio));
  return linhas;
}

// ── SlotModal ──────────────────────────────────────────────────────────────────

type SlotModalProps = {
  open: boolean; onClose: () => void;
  turmaId: string; turnoId: string; ano: number; semestre: 1 | 2;
  slot?: Slot | null;
  diaSemanaInicial?: number;
  horaInicioInicial?: string;
  horaFimInicial?: string;
  slotsTemplate: SlotHorario[];
};

function SlotModal({
  open, onClose, turmaId, turnoId, ano, semestre,
  slot, diaSemanaInicial, horaInicioInicial, horaFimInicial, slotsTemplate,
}: SlotModalProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!slot;

  const [diaSemana, setDiaSemana] = useState(String(slot?.diaSemana ?? diaSemanaInicial ?? 1));
  const [horaInicio, setHoraInicio] = useState(slot?.horaInicio?.slice(0, 5) ?? horaInicioInicial ?? "");
  const [horaFim, setHoraFim] = useState(slot?.horaFim?.slice(0, 5) ?? horaFimInicial ?? "");
  const [sala, setSala] = useState(slot?.sala ?? "");
  const [disciplinaOfertaId, setDisciplinaOfertaId] = useState(slot?.disciplinaOfertaId ?? "");
  const [modoManual, setModoManual] = useState(
    isEdit && slotsTemplate.length > 0
      ? !slotsTemplate.some((s) => s.inicio === slot?.horaInicio?.slice(0, 5))
      : slotsTemplate.length === 0,
  );

  // Reset ao reabrir com slot diferente
  useEffect(() => {
    if (open) {
      setDiaSemana(String(slot?.diaSemana ?? diaSemanaInicial ?? 1));
      setHoraInicio(slot?.horaInicio?.slice(0, 5) ?? horaInicioInicial ?? "");
      setHoraFim(slot?.horaFim?.slice(0, 5) ?? horaFimInicial ?? "");
      setSala(slot?.sala ?? "");
      setDisciplinaOfertaId(slot?.disciplinaOfertaId ?? "");
      setModoManual(
        isEdit && slotsTemplate.length > 0
          ? !slotsTemplate.some((s) => s.inicio === slot?.horaInicio?.slice(0, 5))
          : slotsTemplate.length === 0,
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slot?.id]);

  const { data: ofertas = [] } = useQuery<DisciplinaOferta[]>({
    queryKey: ["horarios-ofertas", turmaId, turnoId],
    queryFn: () => fetchJson(`${BASE}/api/horarios/disciplinas-oferta?turmaId=${turmaId}${turnoId ? `&turnoId=${turnoId}` : ""}`),
    enabled: open && !!turmaId,
  });

  function selecionarSlotTemplate(s: SlotHorario) {
    setHoraInicio(s.inicio);
    setHoraFim(s.fim);
    setModoManual(false);
  }

  const mut = useMutation({
    mutationFn: () => {
      const body = {
        turmaId, ano, semestre,
        diaSemana: Number(diaSemana),
        horaInicio, horaFim,
        sala: sala || null,
        disciplinaOfertaId: disciplinaOfertaId || null,
      };
      return isEdit
        ? sendJson("PUT", `${BASE}/api/horarios/${slot!.id}`, body)
        : sendJson("POST", `${BASE}/api/horarios`, body);
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Horário atualizado" : "Horário adicionado" });
      qc.invalidateQueries({ queryKey: ["horarios"] });
      onClose();
    },
    onError: (err) => toast({ title: "Erro ao salvar", description: apiMsg(err, "Verifique os dados."), variant: "destructive" }),
  });

  const slotAtual = slotsTemplate.find((s) => s.inicio === horaInicio && s.fim === horaFim);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-sky-600" />
            {isEdit ? "Editar horário" : "Adicionar horário"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Dia da semana */}
          <div className="space-y-1.5">
            <Label>Dia da semana</Label>
            <div className="flex gap-1.5 flex-wrap">
              {[1, 2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  onClick={() => setDiaSemana(String(d))}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-semibold border transition-all",
                    diaSemana === String(d)
                      ? "bg-sky-600 text-white border-sky-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-sky-300",
                  )}
                >
                  {DIAS_ABREV[d]}
                </button>
              ))}
            </div>
          </div>

          {/* Horário */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Horário</Label>
              {slotsTemplate.length > 0 && (
                <button
                  className="text-xs text-sky-600 hover:underline"
                  onClick={() => setModoManual((v) => !v)}
                >
                  {modoManual ? "← Usar horários do turno" : "Personalizar"}
                </button>
              )}
            </div>

            {!modoManual && slotsTemplate.length > 0 ? (
              <div className="grid grid-cols-2 gap-1.5">
                {slotsTemplate.map((s) => (
                  <button
                    key={s.inicio}
                    onClick={() => selecionarSlotTemplate(s)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-xs font-medium text-left transition-all",
                      slotAtual?.inicio === s.inicio
                        ? "bg-sky-600 text-white border-sky-600"
                        : "bg-white text-gray-700 border-gray-200 hover:border-sky-300 hover:bg-sky-50",
                    )}
                  >
                    <Clock className="w-3 h-3 inline mr-1.5 opacity-60" />
                    {s.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Início</Label>
                  <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Fim</Label>
                  <Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* Disciplina */}
          <div className="space-y-1.5">
            <Label>Disciplina</Label>
            <Select value={disciplinaOfertaId} onValueChange={setDisciplinaOfertaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a disciplina..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Nenhuma —</SelectItem>
                {ofertas.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.disciplinaNome}
                    {ofertas.some((x) => x.disciplinaNome === o.disciplinaNome && x.turnoNome !== o.turnoNome) && (
                      <span className="text-muted-foreground text-xs ml-1">({o.turnoNome})</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sala */}
          <div className="space-y-1.5">
            <Label>Sala / Laboratório</Label>
            <Input
              value={sala}
              onChange={(e) => setSala(e.target.value)}
              placeholder="Ex: LAB 01, Sala 12"
              maxLength={50}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !horaInicio || !horaFim}
          >
            {mut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── ImportacaoModal (Urania JSON) ──────────────────────────────────────────────

const EXEMPLO_JSON = `{
  "turmaId": "uuid-da-turma",
  "ano": 2026,
  "semestre": 2,
  "horarios": [
    { "diaSemana": 1, "horaInicio": "08:00", "horaFim": "09:00", "disciplina": "Lógica de Programação", "sala": "LAB 01" },
    { "diaSemana": 1, "horaInicio": "09:00", "horaFim": "10:00", "disciplina": "Lógica de Programação", "sala": "LAB 01" },
    { "diaSemana": 2, "horaInicio": "08:00", "horaFim": "09:00", "disciplina": "Banco de Dados", "sala": "LAB 01" }
  ]
}`;

type ImportResult = {
  total: number; criados: number; atualizados: number;
  semDisciplina: number; naoCorrespondidos: string[];
};

function ImportacaoModal({
  open, onClose, turmaId, ano, semestre,
}: { open: boolean; onClose: () => void; turmaId: string; ano: number; semestre: 1 | 2 }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [jsonStr, setJsonStr] = useState("");
  const [resultado, setResultado] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState("");

  function handleClose() {
    setJsonStr("");
    setResultado(null);
    setParseError("");
    onClose();
  }

  const mut = useMutation({
    mutationFn: async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        throw new Error("JSON inválido. Verifique a formatação.");
      }
      // Injeta turmaId/ano/semestre dos filtros ativos se não estiver no JSON
      const body = { turmaId, ano, semestre, ...(parsed as object) };
      return sendJson("POST", `${BASE}/api/horarios/importar-urania`, body);
    },
    onSuccess: (data: ImportResult) => {
      setResultado(data);
      qc.invalidateQueries({ queryKey: ["horarios"] });
      toast({ title: `Importação concluída — ${data.criados} criados, ${data.atualizados} atualizados` });
    },
    onError: (err) => setParseError(apiMsg(err, "Erro na importação.")),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-sky-600" />
            Importar horários do Urania
          </DialogTitle>
        </DialogHeader>

        {!resultado ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cole o JSON exportado do Urania (ou de outro sistema compatível).
              Os campos <code>turmaId</code>, <code>ano</code> e <code>semestre</code> são opcionais no JSON —
              serão preenchidos com os valores dos filtros ativos.
            </p>

            <div className="space-y-1.5">
              <Label>JSON do Urania</Label>
              <Textarea
                value={jsonStr}
                onChange={(e) => { setJsonStr(e.target.value); setParseError(""); }}
                placeholder={EXEMPLO_JSON}
                className="font-mono text-xs min-h-[200px] resize-y"
              />
              {parseError && <p className="text-xs text-destructive">{parseError}</p>}
            </div>

            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">Formato esperado</summary>
              <pre className="mt-2 p-3 bg-muted rounded text-[11px] overflow-x-auto">{EXEMPLO_JSON}</pre>
            </details>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Total processados", value: resultado.total, icon: CalendarDays, color: "text-sky-600" },
                { label: "Criados", value: resultado.criados, icon: CheckCircle2, color: "text-emerald-600" },
                { label: "Atualizados", value: resultado.atualizados, icon: CheckCircle2, color: "text-blue-600" },
                { label: "Sem disciplina", value: resultado.semDisciplina, icon: AlertTriangle, color: "text-amber-600" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="flex items-center gap-3 rounded-lg border p-3">
                  <Icon className={cn("w-5 h-5", color)} />
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-bold">{value}</p>
                  </div>
                </div>
              ))}
            </div>

            {resultado.naoCorrespondidos.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-800 mb-1.5">
                  Disciplinas não encontradas no sistema ({resultado.naoCorrespondidos.length}):
                </p>
                <div className="flex flex-wrap gap-1">
                  {resultado.naoCorrespondidos.map((d) => (
                    <Badge key={d} variant="outline" className="text-xs border-amber-300 text-amber-700">{d}</Badge>
                  ))}
                </div>
                <p className="text-xs text-amber-700 mt-2">
                  Os slots foram criados sem disciplina. Clique em cada um para atribuir a disciplina correta.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {resultado ? "Fechar" : "Cancelar"}
          </Button>
          {!resultado && (
            <Button onClick={() => mut.mutate()} disabled={mut.isPending || !jsonStr.trim()}>
              {mut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Importar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Célula da grade ────────────────────────────────────────────────────────────

function CelulaSlot({
  slot, dia, onEdit, onDelete, onCreate,
}: {
  slot?: Slot; dia: number;
  onEdit: (s: Slot) => void;
  onDelete: (s: Slot) => void;
  onCreate: () => void;
}) {
  if (!slot) {
    return (
      <button
        onClick={onCreate}
        className="group h-full min-h-[52px] w-full flex items-center justify-center rounded border border-dashed border-gray-200 hover:border-sky-400 hover:bg-sky-50 transition-colors"
      >
        <Plus className="w-3.5 h-3.5 text-gray-300 group-hover:text-sky-500" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "group relative rounded border p-2 text-xs cursor-pointer transition-shadow hover:shadow-sm min-h-[52px]",
        TEXT_DIA[dia] ?? "text-gray-700 bg-gray-50 border-gray-200",
      )}
      onClick={() => onEdit(slot)}
    >
      <div className="font-semibold leading-tight truncate pr-5">
        {slot.disciplinaNome ?? <span className="italic opacity-60">Sem disciplina</span>}
      </div>
      {slot.sala && <div className="opacity-60 mt-0.5 truncate">{slot.sala}</div>}

      <button
        className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center w-4 h-4 rounded bg-red-100 text-red-500 hover:bg-red-200"
        onClick={(e) => { e.stopPropagation(); onDelete(slot); }}
        title="Remover"
      >
        <Trash2 className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function HorariosPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const anoAtual = new Date().getFullYear();
  const [turmaId, setTurmaId] = useState("");
  const [turnoSelecionado, setTurnoSelecionado] = useState<TurnoInfo | null>(null);
  const [ano, setAno] = useState(anoAtual);
  const [semestre, setSemestre] = useState<1 | 2>(2);

  // Modal estados
  const [modalOpen, setModalOpen] = useState(false);
  const [slotEdit, setSlotEdit] = useState<Slot | null>(null);
  const [diaSemanaModal, setDiaSemanaModal] = useState(1);
  const [horaInicioModal, setHoraInicioModal] = useState("");
  const [horaFimModal, setHoraFimModal] = useState("");
  const [deleteSlot, setDeleteSlot] = useState<Slot | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Turmas
  const { data: turmas = [], isLoading: loadingTurmas } = useQuery<Turma[]>({
    queryKey: ["turmas-list"],
    queryFn: () => fetchJson<Turma[]>(`${BASE}/api/turmas`),
  });

  // Info da turma selecionada (turnos)
  const { data: turmaInfo } = useQuery<TurmaInfo>({
    queryKey: ["horarios-turma-info", turmaId],
    queryFn: () => fetchJson(`${BASE}/api/horarios/turma-info?turmaId=${turmaId}`),
    enabled: !!turmaId,
  });

  // Quando muda a turma, seleciona o primeiro turno automaticamente
  useEffect(() => {
    if (turmaInfo?.turnos?.length) {
      setTurnoSelecionado(turmaInfo.turnos[0]);
    } else {
      setTurnoSelecionado(null);
    }
  }, [turmaInfo]);

  // Horários
  const { data: horariosData, isLoading: loadingHorarios } = useQuery<{ slots: Slot[] }>({
    queryKey: ["horarios", turmaId, ano, semestre],
    queryFn: () => fetchJson(`${BASE}/api/horarios?turmaId=${turmaId}&ano=${ano}&semestre=${semestre}`),
    enabled: !!turmaId,
  });

  const slots = horariosData?.slots ?? [];

  // Slots de horário do turno selecionado
  const slotsTemplate = turnoSelecionado ? getSlotsDoTurno(turnoSelecionado.nome) : [];
  const linhasHorario = buildLinhasHorario(slotsTemplate, slots);

  // Mapa: "diaSemana-horaInicio" → Slot
  const slotMap = new Map<string, Slot>();
  for (const s of slots) {
    slotMap.set(`${s.diaSemana}-${s.horaInicio.slice(0, 5)}`, s);
  }

  const deleteMut = useMutation({
    mutationFn: (id: string) => sendJson("DELETE", `${BASE}/api/horarios/${id}`),
    onSuccess: () => {
      toast({ title: "Horário removido" });
      qc.invalidateQueries({ queryKey: ["horarios"] });
      setDeleteSlot(null);
    },
    onError: (err) => toast({ title: "Erro ao remover", description: apiMsg(err, "Tente novamente."), variant: "destructive" }),
  });

  function openCreate(dia: number, inicio: string, fim: string) {
    setSlotEdit(null);
    setDiaSemanaModal(dia);
    setHoraInicioModal(inicio);
    setHoraFimModal(fim);
    setModalOpen(true);
  }

  function openEdit(slot: Slot) {
    setSlotEdit(slot);
    setDiaSemanaModal(slot.diaSemana);
    setHoraInicioModal(slot.horaInicio.slice(0, 5));
    setHoraFimModal(slot.horaFim.slice(0, 5));
    setModalOpen(true);
  }

  const turmaSelecionada = turmas.find((t) => t.id === turmaId);

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <CalendarDays className="w-7 h-7 text-sky-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Quadro de Horários</h1>
            <p className="text-sm text-muted-foreground">Grade semanal de aulas por turma</p>
          </div>
        </div>
        {turmaId && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4" /> Importar do Urania
          </Button>
        )}
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Turma</Label>
              <Select value={turmaId} onValueChange={(v) => { setTurmaId(v); }} disabled={loadingTurmas}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingTurmas ? "Carregando..." : "Selecione a turma"} />
                </SelectTrigger>
                <SelectContent>
                  {turmas.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.sigla} <span className="text-muted-foreground text-xs">({t.cursoNome})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Turno</Label>
              <Select
                value={turnoSelecionado?.id ?? ""}
                onValueChange={(v) => {
                  const t = turmaInfo?.turnos.find((x) => x.id === v);
                  if (t) setTurnoSelecionado(t);
                }}
                disabled={!turmaInfo?.turnos?.length}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!turmaId ? "Selecione a turma" : turmaInfo?.turnos?.length ? "Selecione o turno" : "Nenhum turno"} />
                </SelectTrigger>
                <SelectContent>
                  {(turmaInfo?.turnos ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Input
                type="number" min={2020} max={2100}
                value={ano} onChange={(e) => setAno(Number(e.target.value))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Semestre</Label>
              <Select value={String(semestre)} onValueChange={(v) => setSemestre(Number(v) as 1 | 2)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1º Semestre</SelectItem>
                  <SelectItem value="2">2º Semestre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grade */}
      {!turmaId ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <CalendarDays className="w-10 h-10 opacity-20" />
            <p>Selecione uma turma para visualizar o quadro de horários.</p>
          </CardContent>
        </Card>
      ) : loadingHorarios ? (
        <Card>
          <CardContent className="py-16 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
              <span>
                {turmaSelecionada?.sigla}{turnoSelecionado ? ` — ${turnoSelecionado.nome}` : ""}{" "}
                · {ano} · {semestre}º semestre
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {slots.length} slot{slots.length !== 1 ? "s" : ""} cadastrado{slots.length !== 1 ? "s" : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {linhasHorario.length === 0 && slots.length === 0 ? (
              <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground">
                <Clock className="w-8 h-8 opacity-20" />
                <p className="text-sm">
                  {turnoSelecionado
                    ? `Nenhum horário cadastrado. Clique em uma célula para adicionar.`
                    : "Selecione o turno para visualizar os slots de horário."}
                </p>
              </div>
            ) : (
              <table className="w-full border-collapse min-w-[640px]">
                <thead>
                  <tr>
                    <th className="w-28 text-left py-2 pr-3 text-xs text-muted-foreground font-medium">Horário</th>
                    {[1, 2, 3, 4, 5].map((dia) => (
                      <th key={dia} className={cn("py-2 px-1 text-center text-white text-xs font-semibold rounded-t", HEADER_DIA[dia])}>
                        <span className="hidden sm:inline">{DIAS[dia]}</span>
                        <span className="sm:hidden">{DIAS_ABREV[dia]}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhasHorario.map((linha, i) => (
                    <tr key={linha.inicio} className={i % 2 === 0 ? "bg-gray-50/50" : ""}>
                      <td className="py-1 pr-3 align-middle">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                          <Clock className="w-3 h-3 opacity-50" />
                          {linha.label}
                        </div>
                      </td>
                      {[1, 2, 3, 4, 5].map((dia) => {
                        const slot = slotMap.get(`${dia}-${linha.inicio}`);
                        return (
                          <td key={dia} className="py-1 px-1 align-top">
                            <CelulaSlot
                              slot={slot}
                              dia={dia}
                              onEdit={openEdit}
                              onDelete={setDeleteSlot}
                              onCreate={() => openCreate(dia, linha.inicio, linha.fim)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modal criar/editar */}
      {modalOpen && turmaId && (
        <SlotModal
          key={slotEdit?.id ?? "novo"}
          open={modalOpen}
          onClose={() => { setModalOpen(false); setSlotEdit(null); }}
          turmaId={turmaId}
          turnoId={turnoSelecionado?.id ?? ""}
          ano={ano}
          semestre={semestre}
          slot={slotEdit}
          diaSemanaInicial={diaSemanaModal}
          horaInicioInicial={horaInicioModal}
          horaFimInicial={horaFimModal}
          slotsTemplate={slotsTemplate}
        />
      )}

      {/* Modal importação Urania */}
      {importOpen && turmaId && (
        <ImportacaoModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          turmaId={turmaId}
          ano={ano}
          semestre={semestre}
        />
      )}

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deleteSlot} onOpenChange={(v) => !v && setDeleteSlot(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover horário?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteSlot && (
                <>
                  <strong>{DIAS[deleteSlot.diaSemana]}</strong>{" "}
                  {deleteSlot.horaInicio?.slice(0, 5)} – {deleteSlot.horaFim?.slice(0, 5)}
                  {deleteSlot.disciplinaNome ? ` — ${deleteSlot.disciplinaNome}` : ""}
                </>
              )}
              <br />Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteSlot && deleteMut.mutate(deleteSlot.id)}
            >
              {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
