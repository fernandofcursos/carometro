import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Bell, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Utensils,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}${path}`, { credentials: "include", ...opts });
const apiJson = (path: string, opts?: RequestInit) =>
  api(path, { headers: { "Content-Type": "application/json" }, ...opts });

// ── Types ──────────────────────────────────────────────────────────────────────

type Tipo = {
  id: string; nome: string; descricao: string | null;
  categoria: "aviso" | "informe"; ehCardapio: boolean;
  perfisDestino: string[]; ativo: boolean;
};

type Aviso = {
  id: string; titulo: string; conteudo: string;
  tipo: "aviso" | "informe"; publicoAlvo: string; publicado: boolean;
  dataInicio: string | null; dataFim: string | null;
  tipoId: string | null; tipoNome: string | null; tipoEhCardapio: boolean;
  turmaId: string | null; turmaSigla: string | null;
  autorId: string | null; autorNome: string | null;
  criadoEm: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMes(mes: string) {
  const [y, m] = mes.split("-");
  const nomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return `${nomes[parseInt(m) - 1]} ${y}`;
}

function prevMes(mes: string) {
  const d = new Date(mes + "-01");
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function nextMes(mes: string) {
  const d = new Date(mes + "-01");
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 7);
}

const DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const DIAS_SEMANA_ABREV = ["Seg", "Ter", "Qua", "Qui", "Sex"];

// Retorna a segunda-feira da semana que contém `data`
function segundaFeira(data: Date): Date {
  const d = new Date(data);
  const dow = d.getDay(); // 0=dom
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function semanaLabel(seg: Date): string {
  const sex = new Date(seg); sex.setDate(seg.getDate() + 4);
  const fmt = (d: Date) => `${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")}`;
  return `${fmt(seg)} – ${fmt(sex)}`;
}

// ── AvisoDialog ───────────────────────────────────────────────────────────────

type AvisoDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tipo: "aviso" | "informe";
  editTarget?: Aviso;
  onSuccess: () => void;
  tipos: Tipo[];
  defaultData?: string;   // data pré-preenchida para cardápio
  defaultTipoId?: string; // tipoId pré-selecionado
};

function AvisoDialog({ open, onOpenChange, tipo, editTarget, onSuccess, tipos, defaultData, defaultTipoId }: AvisoDialogProps) {
  const { toast } = useToast();
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [publicoAlvo, setPublicoAlvo] = useState("todos");
  const [turmaId, setTurmaId] = useState("");
  const [tipoId, setTipoId] = useState("");
  const [publicado, setPublicado] = useState(false);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const tipoSelecionado = tipos.find((t) => t.id === tipoId);
  const isCardapio = tipoSelecionado?.ehCardapio ?? false;

  useEffect(() => {
    if (open) {
      if (editTarget) {
        setTitulo(editTarget.titulo);
        setConteudo(editTarget.conteudo);
        setPublicoAlvo(editTarget.publicoAlvo);
        setTurmaId(editTarget.turmaId ?? "");
        setTipoId(editTarget.tipoId ?? "");
        setPublicado(editTarget.publicado);
        setDataInicio(editTarget.dataInicio ?? "");
        setDataFim(editTarget.dataFim ?? "");
      } else {
        setTitulo(""); setConteudo(""); setPublicoAlvo("todos");
        setTurmaId(""); setPublicado(false);
        setTipoId(defaultTipoId ?? "");
        setDataInicio(defaultData ?? ""); setDataFim("");
      }
    }
  }, [open, editTarget, defaultData, defaultTipoId]);

  const handleSave = async () => {
    const body = {
      titulo, conteudo, tipo,
      publicoAlvo,
      turmaId: turmaId || null,
      tipoId: tipoId || null,
      publicado,
      dataInicio: dataInicio || null,
      dataFim: dataFim || null,
    };
    const url = editTarget
      ? `/api/avisos-informes/${tipo === "aviso" ? "avisos" : "informes"}/${editTarget.id}`
      : `/api/avisos-informes/${tipo === "aviso" ? "avisos" : "informes"}`;
    const method = editTarget ? "PUT" : "POST";
    const r = await apiJson(url, { method, body: JSON.stringify(body) });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      toast({ title: "Erro", description: d.error ?? "Falha ao salvar", variant: "destructive" });
      return;
    }
    toast({ title: editTarget ? "Atualizado!" : "Criado!" });
    onSuccess();
    onOpenChange(false);
  };

  const tiposFiltrados = tipos.filter((t) => t.categoria === tipo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editTarget ? "Editar" : "Novo"} {tipo === "aviso" ? "Aviso" : "Informe"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tipo</Label>
            <Select value={tipoId} onValueChange={setTipoId}>
              <SelectTrigger><SelectValue placeholder="Selecionar tipo (opcional)" /></SelectTrigger>
              <SelectContent>
                {tiposFiltrados.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isCardapio && (
            <div>
              <Label>Data (dia do cardápio)</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
          )}

          <div>
            <Label>{isCardapio ? "Refeição" : "Título"}</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={isCardapio ? "ex: Almoço" : "Título"} />
          </div>

          <div>
            <Label>Conteúdo</Label>
            <Textarea value={conteudo} onChange={(e) => setConteudo(e.target.value)} rows={3} />
          </div>

          <div>
            <Label>Público-alvo</Label>
            <Select value={publicoAlvo} onValueChange={setPublicoAlvo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="estudantes">Estudantes</SelectItem>
                <SelectItem value="responsaveis">Responsáveis</SelectItem>
                <SelectItem value="professores">Professores</SelectItem>
                <SelectItem value="coordenadores">Coordenadores</SelectItem>
                <SelectItem value="equipe_gestora">Equipe Gestora</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!isCardapio && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Data início</Label>
                  <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
                </div>
                <div>
                  <Label>Data fim</Label>
                  <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
                </div>
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <Checkbox id="publicado" checked={publicado} onCheckedChange={(v) => setPublicado(!!v)} />
            <Label htmlFor="publicado">Publicado</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Cardápio Grid ─────────────────────────────────────────────────────────────

function CardapioGrid({ todosAvisos, onEdit, onAdd, onDelete }: {
  todosAvisos: Aviso[];   // todos os avisos cardápio do mês
  onEdit: (a: Aviso) => void;
  onAdd: (data: string, tipoIdCardapio: string) => void;
  onDelete: (id: string) => void;
}) {
  const hoje = new Date();
  const [seg, setSeg] = useState<Date>(() => segundaFeira(hoje));

  const diasDatas = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(seg);
    d.setDate(seg.getDate() + i);
    return { iso: isoDate(d), dia: d };
  });

  const avisosNaSemana = (data: string) =>
    todosAvisos.filter((a) => a.dataInicio === data);

  const hojeIso = isoDate(hoje);

  return (
    <Card className="shadow-sm border-orange-200/60 dark:border-orange-900/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Utensils className="w-4 h-4 text-orange-500" /> Cardápio Semanal
          </CardTitle>
          {/* Navegação por semana */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-7 w-7"
              onClick={() => setSeg((s) => { const d = new Date(s); d.setDate(d.getDate() - 7); return d; })}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs font-semibold text-muted-foreground min-w-[120px] text-center">
              {semanaLabel(seg)}
            </span>
            <Button variant="outline" size="icon" className="h-7 w-7"
              onClick={() => setSeg((s) => { const d = new Date(s); d.setDate(d.getDate() + 7); return d; })}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
              onClick={() => setSeg(segundaFeira(hoje))}>
              Hoje
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Desktop: 5 colunas */}
        <div className="hidden sm:grid grid-cols-5 gap-2">
          {diasDatas.map(({ iso, dia }, i) => {
            const itens = avisosNaSemana(iso);
            const isHoje = iso === hojeIso;
            return (
              <div key={iso} className={cn(
                "border rounded-lg p-2 min-h-[110px] flex flex-col",
                isHoje
                  ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20"
                  : "border-border/60 bg-muted/10"
              )}>
                {/* Cabeçalho do dia */}
                <p className={cn(
                  "text-xs font-bold mb-1.5 pb-1 border-b",
                  isHoje ? "text-orange-600 border-orange-200" : "text-muted-foreground border-border/40"
                )}>
                  {DIAS_SEMANA[i]}
                  <span className="ml-1 font-normal">
                    {dia.getDate().toString().padStart(2,"0")}/{(dia.getMonth()+1).toString().padStart(2,"0")}
                  </span>
                </p>
                {/* Itens do cardápio */}
                <div className="flex-1 space-y-1">
                  {itens.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground/50 italic">Vazio</p>
                  ) : itens.map((a) => (
                    <div key={a.id}
                      className="group relative rounded bg-white dark:bg-card border border-border/60 px-2 py-1 hover:border-orange-300 transition-colors">
                      <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 leading-tight truncate">{a.titulo}</p>
                      <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{a.conteudo}</p>
                      {/* Ações — visíveis no hover */}
                      <div className="absolute top-0.5 right-0.5 hidden group-hover:flex gap-0.5">
                        <button onClick={() => onEdit(a)}
                          className="rounded p-0.5 bg-white dark:bg-card border hover:border-orange-400 text-muted-foreground hover:text-orange-600 transition-colors">
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                        <button onClick={() => onDelete(a.id)}
                          className="rounded p-0.5 bg-white dark:bg-card border hover:border-destructive text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Botão adicionar */}
                <button
                  className="mt-1.5 w-full flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-orange-600 transition-colors rounded hover:bg-orange-50 dark:hover:bg-orange-950/20 py-0.5"
                  onClick={() => onAdd(iso, "")}
                >
                  <Plus className="h-3 w-3" /> Adicionar
                </button>
              </div>
            );
          })}
        </div>

        {/* Mobile: lista vertical por dia */}
        <div className="sm:hidden space-y-3">
          {diasDatas.map(({ iso, dia }, i) => {
            const itens = avisosNaSemana(iso);
            const isHoje = iso === hojeIso;
            return (
              <div key={iso} className={cn(
                "border rounded-lg p-3",
                isHoje ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : "border-border/60"
              )}>
                <div className="flex items-center justify-between mb-2">
                  <p className={cn(
                    "text-sm font-bold",
                    isHoje ? "text-orange-600" : "text-muted-foreground"
                  )}>
                    {DIAS_SEMANA_ABREV[i]} {dia.getDate().toString().padStart(2,"0")}/{(dia.getMonth()+1).toString().padStart(2,"0")}
                  </p>
                  <button
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-orange-600 transition-colors"
                    onClick={() => onAdd(iso, "")}
                  >
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
                {itens.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50 italic">Sem cardápio.</p>
                ) : itens.map((a) => (
                  <div key={a.id} className="flex gap-2 items-start rounded bg-white dark:bg-card border px-2 py-1.5 mb-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">{a.titulo}</p>
                      <p className="text-xs text-muted-foreground">{a.conteudo}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => onEdit(a)} className="text-muted-foreground hover:text-orange-600">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => onDelete(a.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AvisosPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [mes, setMes] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Aviso | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cardapioDefaultData, setCardapioDefaultData] = useState<string | undefined>();
  const [cardapioTipoId, setCardapioTipoId] = useState<string | undefined>();

  const { data: hojeData } = useQuery<{ hoje: string }>({
    queryKey: ["hoje"],
    queryFn: () => api("/api/hoje").then((r) => r.json()),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (hojeData?.hoje && !mes) {
      setMes(hojeData.hoje.slice(0, 7));
    }
  }, [hojeData, mes]);

  const { data: tipos = [] } = useQuery<Tipo[]>({
    queryKey: ["tipos-avisos"],
    queryFn: () => api("/api/avisos-informes/tipos").then((r) => r.json()),
    staleTime: 60_000,
  });

  // Cardápio: buscar todos os avisos do mês sem filtro (para mostrar em qualquer semana)
  const { data: avisos = [], isLoading } = useQuery<Aviso[]>({
    queryKey: ["avisos", mes],
    queryFn: () => api(`/api/avisos-informes/avisos?mes=${mes}`).then((r) => r.json()),
    enabled: !!mes,
    staleTime: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/avisos-informes/avisos/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avisos"] });
      toast({ title: "Excluído." });
      setDeleteId(null);
    },
  });

  const tipoCardapio = tipos.find((t) => t.ehCardapio && t.categoria === "aviso");
  const avisosCardapio = avisos.filter((a) => a.tipoEhCardapio);
  const avisosNormais = avisos.filter((a) => !a.tipoEhCardapio);

  const handleNovoAviso = () => {
    setEditTarget(undefined);
    setCardapioDefaultData(undefined);
    setCardapioTipoId(undefined);
    setDialogOpen(true);
  };

  const handleEditAviso = (a: Aviso) => {
    setEditTarget(a);
    setCardapioDefaultData(undefined);
    setCardapioTipoId(undefined);
    setDialogOpen(true);
  };

  const handleAddCardapio = (data: string, tipoIdCardapio: string) => {
    setEditTarget(undefined);
    setCardapioDefaultData(data);
    // pré-seleciona o tipo cardápio
    setCardapioTipoId(tipoIdCardapio || tipoCardapio?.id);
    setDialogOpen(true);
  };

  const refreshAvisos = () => qc.invalidateQueries({ queryKey: ["avisos"] });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="w-6 h-6 text-amber-500" /> Avisos
        </h1>
        <Button onClick={handleNovoAviso}>
          <Plus className="h-4 w-4 mr-1" /> Novo Aviso
        </Button>
      </div>

      {/* Seletor de mês */}
      {mes && (
        <div className="flex items-center gap-3 justify-center">
          <Button variant="outline" size="icon" onClick={() => setMes(prevMes(mes))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-base font-semibold min-w-[160px] text-center">{formatMes(mes)}</span>
          <Button variant="outline" size="icon" onClick={() => setMes(nextMes(mes))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {isLoading && !tipoCardapio ? (
        <p className="text-sm text-muted-foreground text-center">Carregando...</p>
      ) : (
        <>
          {/* ── Cardápio sempre visível se existe tipo ehCardapio ── */}
          {tipoCardapio && (
            <CardapioGrid
              todosAvisos={avisosCardapio}
              onEdit={handleEditAviso}
              onAdd={handleAddCardapio}
              onDelete={(id) => setDeleteId(id)}
            />
          )}

          {/* ── Avisos normais ── */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
              <Bell className="h-4 w-4" /> Avisos do mês — {mes ? formatMes(mes) : ""}
            </h2>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : avisosNormais.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Bell className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum aviso neste mês.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {avisosNormais.map((a) => (
                  <Card key={a.id} className="shadow-sm border-border/50">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex flex-wrap gap-1 items-center">
                            <p className="font-semibold text-sm">{a.titulo}</p>
                            {a.tipoNome && <Badge variant="outline" className="text-xs">{a.tipoNome}</Badge>}
                            <Badge variant="secondary" className="text-xs">{a.publicoAlvo}</Badge>
                            {a.publicado ? (
                              <Badge className="text-xs bg-green-100 text-green-800 border-green-200">Publicado</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-muted-foreground">Rascunho</Badge>
                            )}
                          </div>
                          {(a.dataInicio || a.dataFim) && (
                            <p className="text-xs text-muted-foreground">
                              {a.dataInicio && new Date(a.dataInicio + "T12:00:00").toLocaleDateString("pt-BR")}
                              {a.dataFim && ` – ${new Date(a.dataFim + "T12:00:00").toLocaleDateString("pt-BR")}`}
                            </p>
                          )}
                          <p className="text-sm text-muted-foreground line-clamp-2">{a.conteudo}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" onClick={() => handleEditAviso(a)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(a.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <AvisoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tipo="aviso"
        editTarget={editTarget}
        tipos={tipos}
        defaultData={cardapioDefaultData}
        defaultTipoId={cardapioTipoId}
        onSuccess={refreshAvisos}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aviso?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMut.mutate(deleteId)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
