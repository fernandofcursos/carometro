import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Info, ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor";
import { AnexoUploader } from "@/components/anexo-uploader";
import { PublicoAlvoSelector } from "@/components/publico-alvo-selector";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}${path}`, { credentials: "include", ...opts });
const apiJson = (path: string, opts?: RequestInit) =>
  api(path, { headers: { "Content-Type": "application/json" }, ...opts });

type Tipo = {
  id: string; nome: string; descricao: string | null;
  categoria: "aviso" | "informe"; ehCardapio: boolean;
  perfisDestino: string[]; ativo: boolean;
};

type Informe = {
  id: string; titulo: string; conteudo: string;
  tipo: "aviso" | "informe"; publicoAlvo: string; publicado: boolean;
  dataInicio: string | null; dataFim: string | null;
  tipoId: string | null; tipoNome: string | null; tipoEhCardapio: boolean;
  turmaId: string | null; turmaSigla: string | null;
  autorId: string | null; autorNome: string | null;
  criadoEm: string;
};

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

// ── InformeDialog ──────────────────────────────────────────────────────────────

function InformeDialog({ open, onOpenChange, editTarget, onSuccess, tipos }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editTarget?: Informe;
  onSuccess: () => void;
  tipos: Tipo[];
}) {
  const { toast } = useToast();
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [publicoAlvo, setPublicoAlvo] = useState<string[]>(["todos"]);
  const [tipoId, setTipoId] = useState("");
  const [publicado, setPublicado] = useState(false);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  useEffect(() => {
    if (open) {
      if (editTarget) {
        setTitulo(editTarget.titulo);
        setConteudo(editTarget.conteudo);
        setPublicoAlvo(Array.isArray(editTarget.publicoAlvo) ? editTarget.publicoAlvo : [editTarget.publicoAlvo]);
        setTipoId(editTarget.tipoId ?? "");
        setPublicado(editTarget.publicado);
        setDataInicio(editTarget.dataInicio ?? "");
        setDataFim(editTarget.dataFim ?? "");
      } else {
        setTitulo(""); setConteudo(""); setPublicoAlvo(["todos"]);
        setTipoId(""); setPublicado(false);
        setDataInicio(""); setDataFim("");
      }
    }
  }, [open, editTarget]);

  const handleSave = async () => {
    const body = {
      titulo, conteudo, tipo: "informe" as const,
      publicoAlvo, turmaId: null,
      tipoId: tipoId || null,
      publicado,
      dataInicio: dataInicio || null,
      dataFim: dataFim || null,
    };
    const url = editTarget
      ? `/api/avisos-informes/informes/${editTarget.id}`
      : `/api/avisos-informes/informes`;
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

  const tiposFiltrados = tipos.filter((t) => t.categoria === "informe");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editTarget ? "Editar" : "Novo"} Informe</DialogTitle>
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
          <div>
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div>
            <Label>Conteúdo</Label>
            <RichTextEditor
              value={conteudo}
              onChange={setConteudo}
              placeholder="Descreva o conteúdo do informe..."
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Público-alvo</Label>
            <PublicoAlvoSelector value={publicoAlvo} onChange={setPublicoAlvo} />
          </div>
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
          <div className="flex items-center gap-2">
            <Checkbox id="publicado-informe" checked={publicado} onCheckedChange={(v) => setPublicado(!!v)} />
            <Label htmlFor="publicado-informe">Publicado</Label>
          </div>
          <AnexoUploader avisoId={editTarget?.id ?? null} />
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

export default function InformesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [mes, setMes] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Informe | undefined>();
  const [savedId, setSavedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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

  const { data: informes = [], isLoading } = useQuery<Informe[]>({
    queryKey: ["informes", mes],
    queryFn: () => api(`/api/avisos-informes/informes?mes=${mes}`).then((r) => r.json()),
    enabled: !!mes,
    staleTime: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/avisos-informes/informes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["informes"] });
      toast({ title: "Excluído." });
      setDeleteId(null);
    },
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Info className="w-6 h-6 text-blue-500" /> Informes
        </h1>
        <Button onClick={() => { setEditTarget(undefined); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo Informe
        </Button>
      </div>

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

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center">Carregando...</p>
      ) : informes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Info className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhum informe em {mes ? formatMes(mes) : ""}.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {informes.map((a) => (
            <Card key={a.id} className="shadow-sm border-border/50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap gap-1 items-center">
                      <p className="font-semibold text-sm">{a.titulo}</p>
                      {a.tipoNome && <Badge variant="outline" className="text-xs">{a.tipoNome}</Badge>}
                      {(Array.isArray(a.publicoAlvo) ? a.publicoAlvo : [a.publicoAlvo]).map((p) => (
                        <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
                      ))}
                      {a.publicado ? (
                        <Badge className="text-xs bg-green-100 text-green-800 border-green-200">Publicado</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-gray-500">Rascunho</Badge>
                      )}
                    </div>
                    {(a.dataInicio || a.dataFim) && (
                      <p className="text-xs text-muted-foreground">
                        {a.dataInicio && new Date(a.dataInicio + "T12:00:00").toLocaleDateString("pt-BR")}
                        {a.dataFim && ` – ${new Date(a.dataFim + "T12:00:00").toLocaleDateString("pt-BR")}`}
                      </p>
                    )}
                    <div className="prose prose-sm dark:prose-invert max-w-none line-clamp-2 text-muted-foreground" dangerouslySetInnerHTML={{ __html: a.conteudo }} />
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => { setEditTarget(a); setDialogOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(a.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <InformeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editTarget={editTarget}
        tipos={tipos}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["informes"] })}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir informe?</AlertDialogTitle>
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
