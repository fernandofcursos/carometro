import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RichTextEditor } from "@/components/rich-text-editor";
import { AnexoUploader } from "@/components/anexo-uploader";
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
  Bell, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Upload, X as XIcon, FileText,
} from "lucide-react";
import { CardapioWidget } from "@/components/cardapio-widget";
import { PublicoAlvoSelector } from "@/components/publico-alvo-selector";
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

const ALLOWED_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png";
const MAX_FILE_BYTES = 2 * 1024 * 1024;

function PendingFilesZone({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const valid: File[] = [];
    Array.from(incoming).forEach((f) => {
      if (f.size > MAX_FILE_BYTES) return; // silently skip oversized
      valid.push(f);
    });
    onChange([...files, ...valid]);
  };

  const remove = (idx: number) => onChange(files.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / (1024 * 1024)).toFixed(1)} MB`}
              </span>
              <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div
        className={cn(
          "rounded-md border-2 border-dashed px-4 py-4 text-center cursor-pointer transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-border"
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); }}
      >
        <div className="flex flex-col items-center gap-1">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Clique ou arraste</span> para anexar
          </p>
          <p className="text-xs text-muted-foreground">PDF, DOC, DOCX, XLSX, JPG, PNG — máx. 2 MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ALLOWED_ACCEPT}
          multiple
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>
    </div>
  );
}

function AvisoDialog({ open, onOpenChange, tipo, editTarget, onSuccess, tipos, defaultData, defaultTipoId }: AvisoDialogProps) {
  const { toast } = useToast();
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [publicoAlvo, setPublicoAlvo] = useState<string[]>(["todos"]);
  const [turmaId, setTurmaId] = useState("");
  const [tipoId, setTipoId] = useState("");
  const [publicado, setPublicado] = useState(false);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const tipoSelecionado = tipos.find((t) => t.id === tipoId);
  const isCardapio = tipoSelecionado?.ehCardapio ?? false;

  useEffect(() => {
    if (open) {
      if (editTarget) {
        setTitulo(editTarget.titulo);
        setConteudo(editTarget.conteudo);
        setPublicoAlvo(Array.isArray(editTarget.publicoAlvo) ? editTarget.publicoAlvo : [editTarget.publicoAlvo]);
        setTurmaId(editTarget.turmaId ?? "");
        setTipoId(editTarget.tipoId ?? "");
        setPublicado(editTarget.publicado);
        setDataInicio(editTarget.dataInicio ?? "");
        setDataFim(editTarget.dataFim ?? "");
      } else {
        setTitulo(""); setConteudo(""); setPublicoAlvo(["todos"]);
        setTurmaId(""); setPublicado(false);
        setTipoId(defaultTipoId ?? "");
        setDataInicio(defaultData ?? ""); setDataFim("");
      }
      setPendingFiles([]);
    }
  }, [open, editTarget, defaultData, defaultTipoId]);

  const uploadFiles = async (avisoId: string, files: File[]) => {
    for (const file of files) {
      const fd = new FormData();
      fd.append("arquivo", file);
      await api(`/api/avisos-informes/avisos/${avisoId}/anexos`, { method: "POST", body: fd });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        titulo, conteudo, tipo,
        publicoAlvo,
        turmaId: turmaId || null,
        tipoId: tipoId || null,
        publicado,
        dataInicio: dataInicio || null,
        dataFim: dataFim || null,
      };
      const resourcePath = tipo === "aviso" ? "avisos" : "informes";
      const url = editTarget
        ? `/api/avisos-informes/${resourcePath}/${editTarget.id}`
        : `/api/avisos-informes/${resourcePath}`;
      const method = editTarget ? "PUT" : "POST";
      const r = await apiJson(url, { method, body: JSON.stringify(body) });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast({ title: "Erro", description: d.error ?? "Falha ao salvar", variant: "destructive" });
        return;
      }
      const saved = await r.json();
      if (pendingFiles.length > 0) {
        await uploadFiles(saved.id, pendingFiles);
      }
      toast({ title: editTarget ? "Atualizado!" : "Criado!" });
      onSuccess();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const tiposFiltrados = tipos.filter((t) => t.categoria === tipo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
            {isCardapio ? (
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={3}
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
              />
            ) : (
              <RichTextEditor
                value={conteudo}
                onChange={setConteudo}
                placeholder="Descreva o conteúdo do aviso..."
              />
            )}
          </div>

          <div>
            <Label className="mb-1.5 block">Público-alvo</Label>
            <PublicoAlvoSelector value={publicoAlvo} onChange={setPublicoAlvo} />
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

          {!isCardapio && (
            <div className="space-y-2">
              <Label className="block">Anexos</Label>
              {/* Arquivos já salvos (modo edição) */}
              {editTarget && <AnexoUploader avisoId={editTarget.id} />}
              {/* Novos arquivos pendentes (antes de salvar) */}
              <PendingFilesZone files={pendingFiles} onChange={setPendingFiles} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
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
                            {(Array.isArray(a.publicoAlvo) ? a.publicoAlvo : [a.publicoAlvo]).map((p) => (
                              <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
                            ))}
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
                          <div
                            className="prose prose-sm dark:prose-invert max-w-none line-clamp-2 text-sm text-muted-foreground [&_*]:m-0 [&_p]:leading-snug"
                            dangerouslySetInnerHTML={{ __html: a.conteudo }}
                          />
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
