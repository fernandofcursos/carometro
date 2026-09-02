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
  Bell, ChevronLeft, ChevronRight, Plus, Pencil, Trash2,
} from "lucide-react";
import { CardapioWidget } from "@/components/cardapio-widget";

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
    queryFn: () => api(`/api/avisos-informes/avisos?mes=${mes}&excluirCardapio=true`).then((r) => r.json()),
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
            <CardapioWidget
              editavel
              onEdit={(a) => handleEditAviso(a as unknown as Aviso)}
              onAdd={(data) => handleAddCardapio(data, tipoCardapio?.id ?? "")}
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
