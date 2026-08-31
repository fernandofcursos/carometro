import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarDays, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ──────────────────────────────────────────────────────────────────────

type Turma = { id: string; sigla: string; cursoNome: string };
type DisciplinaOferta = { id: string; disciplinaNome: string; turnoNome: string };
type Slot = {
  id: string;
  diaSemana: number;
  horaInicio: string;
  horaFim: string;
  sala: string | null;
  disciplinaOfertaId: string | null;
  disciplinaNome: string | null;
  cursoNome: string | null;
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

const COR_DIA: Record<number, string> = {
  1: "bg-blue-50 border-blue-200",
  2: "bg-violet-50 border-violet-200",
  3: "bg-emerald-50 border-emerald-200",
  4: "bg-amber-50 border-amber-200",
  5: "bg-rose-50 border-rose-200",
};
const HEADER_DIA: Record<number, string> = {
  1: "bg-blue-500",
  2: "bg-violet-500",
  3: "bg-emerald-500",
  4: "bg-amber-500",
  5: "bg-rose-500",
};

// ── SlotModal ──────────────────────────────────────────────────────────────────

type SlotModalProps = {
  open: boolean;
  onClose: () => void;
  turmaId: string;
  ano: number;
  semestre: 1 | 2;
  slot?: Slot | null;
  diaSemanaInicial?: number;
};

function SlotModal({ open, onClose, turmaId, ano, semestre, slot, diaSemanaInicial }: SlotModalProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: ofertas = [] } = useQuery<DisciplinaOferta[]>({
    queryKey: ["horarios-ofertas", turmaId],
    queryFn: () => fetchJson(`${BASE}/api/horarios/disciplinas-oferta?turmaId=${turmaId}`),
    enabled: open && !!turmaId,
  });

  const [diaSemana, setDiaSemana] = useState(String(slot?.diaSemana ?? diaSemanaInicial ?? 1));
  const [horaInicio, setHoraInicio] = useState(slot?.horaInicio?.slice(0, 5) ?? "07:00");
  const [horaFim, setHoraFim] = useState(slot?.horaFim?.slice(0, 5) ?? "08:00");
  const [sala, setSala] = useState(slot?.sala ?? "");
  const [disciplinaOfertaId, setDisciplinaOfertaId] = useState(slot?.disciplinaOfertaId ?? "");

  const isEdit = !!slot;

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
        ? sendJson("PUT", `${BASE}/api/horarios/${slot.id}`, body)
        : sendJson("POST", `${BASE}/api/horarios`, body);
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Slot atualizado" : "Slot criado" });
      qc.invalidateQueries({ queryKey: ["horarios"] });
      onClose();
    },
    onError: (err) => toast({ title: "Erro ao salvar slot", description: apiMsg(err, "Verifique os dados."), variant: "destructive" }),
  });

  // Reset ao abrir
  function handleOpen(v: boolean) {
    if (!v) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar slot" : "Adicionar slot"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Dia da semana</Label>
              <Select value={diaSemana} onValueChange={setDiaSemana}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((d) => (
                    <SelectItem key={d} value={String(d)}>{DIAS[d]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sala</Label>
              <Input value={sala} onChange={(e) => setSala(e.target.value)} placeholder="Ex: Sala 12" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Hora início</Label>
              <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Hora fim</Label>
              <Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
            </div>
          </div>

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
                    {o.disciplinaNome} <span className="text-muted-foreground text-xs">({o.turnoNome})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

// ── SlotCard ───────────────────────────────────────────────────────────────────

function SlotCard({ slot, onEdit, onDelete }: { slot: Slot; onEdit: () => void; onDelete: () => void }) {
  return (
    <div
      className={cn(
        "group relative rounded-lg border p-2 text-xs cursor-pointer transition-shadow hover:shadow-sm",
        COR_DIA[slot.diaSemana] ?? "bg-gray-50 border-gray-200",
      )}
      onClick={onEdit}
    >
      <div className="font-semibold text-gray-800 truncate">
        {slot.disciplinaNome ?? <span className="italic text-gray-400">Sem disciplina</span>}
      </div>
      <div className="text-gray-500 mt-0.5">
        {slot.horaInicio?.slice(0, 5)} – {slot.horaFim?.slice(0, 5)}
      </div>
      {slot.sala && <div className="text-gray-400 mt-0.5 truncate">{slot.sala}</div>}

      <button
        className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center w-5 h-5 rounded bg-red-100 text-red-600 hover:bg-red-200"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="Remover slot"
      >
        <Trash2 className="w-3 h-3" />
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
  const [ano, setAno] = useState(anoAtual);
  const [semestre, setSemestre] = useState<1 | 2>(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [slotEdit, setSlotEdit] = useState<Slot | null>(null);
  const [diaSemanaModal, setDiaSemanaModal] = useState<number>(1);
  const [deleteSlot, setDeleteSlot] = useState<Slot | null>(null);

  // Turmas
  const { data: turmas = [], isLoading: loadingTurmas } = useQuery<Turma[]>({
    queryKey: ["turmas-list"],
    queryFn: () => fetchJson<Turma[]>(`${BASE}/api/turmas`),
  });

  // Horários
  const { data: horariosData, isLoading: loadingHorarios } = useQuery<{ slots: Slot[] }>({
    queryKey: ["horarios", turmaId, ano, semestre],
    queryFn: () => fetchJson(`${BASE}/api/horarios?turmaId=${turmaId}&ano=${ano}&semestre=${semestre}`),
    enabled: !!turmaId,
  });

  const slots = horariosData?.slots ?? [];

  // Agrupar por dia
  const porDia: Record<number, Slot[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const s of slots) porDia[s.diaSemana]?.push(s);

  const deleteMut = useMutation({
    mutationFn: (id: string) => sendJson("DELETE", `${BASE}/api/horarios/${id}`),
    onSuccess: () => {
      toast({ title: "Slot removido" });
      qc.invalidateQueries({ queryKey: ["horarios"] });
      setDeleteSlot(null);
    },
    onError: (err) => toast({ title: "Erro ao remover slot", description: apiMsg(err, "Tente novamente."), variant: "destructive" }),
  });

  function openCreate(dia: number) {
    setSlotEdit(null);
    setDiaSemanaModal(dia);
    setModalOpen(true);
  }

  function openEdit(slot: Slot) {
    setSlotEdit(slot);
    setDiaSemanaModal(slot.diaSemana);
    setModalOpen(true);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <CalendarDays className="w-7 h-7 text-sky-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quadro de Horários</h1>
          <p className="text-sm text-muted-foreground">Grade semanal de aulas por turma</p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Turma</Label>
              <Select value={turmaId} onValueChange={setTurmaId} disabled={loadingTurmas}>
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
              <Label>Ano</Label>
              <Input
                type="number"
                min={2020}
                max={2100}
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
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
            <CalendarDays className="w-10 h-10 opacity-30" />
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
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Grade semanal</span>
              <span className="text-xs font-normal text-muted-foreground">
                {slots.length} slot{slots.length !== 1 ? "s" : ""} cadastrado{slots.length !== 1 ? "s" : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-3">
              {[1, 2, 3, 4, 5].map((dia) => (
                <div key={dia} className="space-y-2">
                  {/* Cabeçalho do dia */}
                  <div className={cn("rounded-lg px-3 py-2 text-center text-white text-sm font-semibold", HEADER_DIA[dia])}>
                    <span className="hidden sm:inline">{DIAS[dia]}</span>
                    <span className="sm:hidden">{DIAS_ABREV[dia]}</span>
                  </div>

                  {/* Slots do dia */}
                  {porDia[dia].map((slot) => (
                    <SlotCard
                      key={slot.id}
                      slot={slot}
                      onEdit={() => openEdit(slot)}
                      onDelete={() => setDeleteSlot(slot)}
                    />
                  ))}

                  {/* Botão adicionar */}
                  <button
                    onClick={() => openCreate(dia)}
                    className="w-full border border-dashed border-gray-300 rounded-lg py-2 text-xs text-gray-400 hover:border-sky-400 hover:text-sky-500 transition-colors flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Adicionar
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal criar/editar */}
      {modalOpen && turmaId && (
        <SlotModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          turmaId={turmaId}
          ano={ano}
          semestre={semestre}
          slot={slotEdit}
          diaSemanaInicial={diaSemanaModal}
        />
      )}

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deleteSlot} onOpenChange={(v) => !v && setDeleteSlot(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover slot?</AlertDialogTitle>
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
