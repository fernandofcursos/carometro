import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListTiposOcorrencias } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, FileText, Info, Upload, GripVertical } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `Erro ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

interface TextoPadrao {
  id: string;
  tipoOcorrenciaId: string;
  tipoDescricao: string | null;
  titulo: string;
  corpo: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

interface Placeholder {
  placeholder: string;
  descricao: string;
}

interface TextoPadraoInput {
  tipoOcorrenciaId: string;
  titulo: string;
  corpo: string;
  ativo: boolean;
}

const CORPO_MAX = 10000;

// ---------------------------------------------------------------------------
// TextoForm
// ---------------------------------------------------------------------------

function TextoForm({
  tipos,
  placeholders,
  inicial,
  onSalvar,
  onCancelar,
  salvando,
}: {
  tipos: { id: string; descricao: string; status: string }[];
  placeholders: Placeholder[];
  inicial?: Partial<TextoPadrao>;
  onSalvar: (dados: TextoPadraoInput) => void;
  onCancelar: () => void;
  salvando: boolean;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tipoOcorrenciaId, setTipoOcorrenciaId] = useState(inicial?.tipoOcorrenciaId ?? "");
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [corpo, setCorpo] = useState(inicial?.corpo ?? "");
  const [ativo, setAtivo] = useState(inicial?.ativo ?? true);
  const [extraindo, setExtraindo] = useState(false);

  // Referência ao método de inserção do editor rico
  const insertRef = useRef<((text: string) => void) | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const corpoTexto = corpo.replace(/<[^>]*>/g, "").trim();
    if (!tipoOcorrenciaId || !titulo.trim() || !corpoTexto) return;
    onSalvar({ tipoOcorrenciaId, titulo: titulo.trim(), corpo, ativo });
  };

  const inserirPlaceholder = (ph: string) => {
    insertRef.current?.(ph);
  };

  // Upload de arquivo — extrai texto via API (docx/pdf) ou FileReader (md/txt)
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "md" || ext === "txt") {
      const texto = await file.text();
      // Converte markdown básico para HTML para manter formatação no editor
      const html = texto
        .replace(/^### (.+)$/gm, "<h3>$1</h3>")
        .replace(/^## (.+)$/gm, "<h2>$1</h2>")
        .replace(/^# (.+)$/gm, "<h1>$1</h1>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/_(.+?)_/g, "<em>$1</em>")
        .replace(/^- (.+)$/gm, "<li>$1</li>")
        .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
        .replace(/\n\n/g, "</p><p>")
        .replace(/^(?!<[hup])/gm, "")
        || `<p>${texto}</p>`;
      setCorpo(html.slice(0, CORPO_MAX));
      toast({ title: "Arquivo carregado", description: `${file.name} inserido no editor.` });
      return;
    }

    setExtraindo(true);
    try {
      const form = new FormData();
      form.append("arquivo", file);
      const res = await fetch(`${BASE}/api/textos-padrao/extrair-texto`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json() as { texto?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao extrair texto");
      const html = `<p>${(data.texto ?? "").replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
      setCorpo(html.slice(0, CORPO_MAX));
      toast({ title: "Arquivo carregado", description: `${file.name} inserido no editor.` });
    } catch (err) {
      toast({ title: "Erro ao carregar arquivo", description: (err as Error).message, variant: "destructive" });
    } finally {
      setExtraindo(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="tipo">Tipo de Ocorrência *</Label>
        <select
          id="tipo"
          value={tipoOcorrenciaId}
          onChange={(e) => setTipoOcorrenciaId(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Selecione o tipo…</option>
          {tipos.filter((t) => t.status === "ativo").map((t) => (
            <option key={t.id} value={t.id}>{t.descricao}</option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="titulo">Título *</Label>
        <Input
          id="titulo"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          maxLength={200}
          required
          placeholder="Ex.: Aviso de indisciplina"
          className="mt-1"
        />
      </div>

      {/* Importar arquivo — acima do editor */}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt,.docx,.pdf"
          className="hidden"
          onChange={handleUpload}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 text-xs"
          onClick={() => fileInputRef.current?.click()}
          disabled={extraindo}
        >
          <Upload className="w-3.5 h-3.5" />
          {extraindo ? "Extraindo…" : "Importar arquivo"}
        </Button>
        <span className="text-xs text-muted-foreground">.md · .txt · .docx · .pdf</span>
      </div>

      {/* Editor rico */}
      <div>
        <Label className="mb-1 block">Corpo do texto *</Label>
        <RichTextEditor
          value={corpo}
          onChange={setCorpo}
          maxLength={CORPO_MAX}
          placeholder="Digite o texto modelo. Use a barra de formatação ou arraste um marcador."
          onInsertRef={insertRef}
        />
      </div>

      {/* Marcadores — draggable + clicáveis */}
      <div>
        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
          <Info className="w-3 h-3" />
          Clique para inserir ou <strong>arraste</strong> o marcador para a posição desejada:
        </p>
        <div className="flex flex-wrap gap-2">
          {placeholders.map((ph) => (
            <button
              key={ph.placeholder}
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", ph.placeholder);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => inserirPlaceholder(ph.placeholder)}
              className="text-xs px-2 py-1 rounded bg-muted hover:bg-amber-100 border border-border font-mono transition-colors cursor-grab active:cursor-grabbing flex items-center gap-1"
              title={`${ph.descricao} — clique para inserir ou arraste`}
            >
              <GripVertical className="w-3 h-3 text-muted-foreground" />
              {ph.placeholder}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch id="ativo" checked={ativo} onCheckedChange={setAtivo} />
        <Label htmlFor="ativo">Texto ativo</Label>
        {ativo && (
          <span className="text-xs text-muted-foreground">(somente um texto ativo por tipo)</span>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="submit" disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function TextosPadraoPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<TextoPadrao | null>(null);
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const { data: textos = [], isLoading } = useQuery<TextoPadrao[]>({
    queryKey: ["textos-padrao"],
    queryFn: () => apiFetch<TextoPadrao[]>("/api/textos-padrao"),
  });

  const { data: tiposRaw } = useListTiposOcorrencias();
  const tipos = (tiposRaw as { id: string; descricao: string; status: string }[] | undefined) ?? [];

  const { data: placeholders = [] } = useQuery<Placeholder[]>({
    queryKey: ["textos-padrao-placeholders"],
    queryFn: () => apiFetch<Placeholder[]>("/api/textos-padrao/placeholders"),
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ["textos-padrao"] });

  const criarMutation = useMutation({
    mutationFn: (dados: TextoPadraoInput) =>
      apiFetch("/api/textos-padrao", { method: "POST", body: JSON.stringify(dados) }),
    onSuccess: () => {
      invalidar();
      setDialogAberto(false);
      toast({ title: "Texto padrão criado com sucesso." });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao criar texto padrão", description: err.message, variant: "destructive" });
    },
  });

  const editarMutation = useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: Partial<TextoPadraoInput> }) =>
      apiFetch(`/api/textos-padrao/${id}`, { method: "PUT", body: JSON.stringify(dados) }),
    onSuccess: () => {
      invalidar();
      setEditando(null);
      toast({ title: "Texto padrão atualizado com sucesso." });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao atualizar texto padrão", description: err.message, variant: "destructive" });
    },
  });

  const removerMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/textos-padrao/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidar();
      setRemovendoId(null);
      toast({ title: "Texto padrão removido." });
    },
    onError: () => {
      toast({ title: "Erro ao remover texto padrão.", variant: "destructive" });
    },
  });

  const textosFiltrados = textos.filter((t) => {
    const q = busca.toLowerCase();
    const textoSimples = t.corpo.replace(/<[^>]*>/g, "");
    return (
      t.titulo.toLowerCase().includes(q) ||
      (t.tipoDescricao ?? "").toLowerCase().includes(q) ||
      textoSimples.toLowerCase().includes(q)
    );
  });

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="w-6 h-6 text-amber-500" />
            Textos Padrão de Ocorrências
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Modelos de texto por tipo de ocorrência. Use marcadores para inserir dados dinâmicos.
          </p>
        </div>
        <Button onClick={() => setDialogAberto(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Novo texto
        </Button>
      </div>

      <div>
        <Input
          placeholder="Buscar por título, tipo ou conteúdo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : textosFiltrados.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {busca ? "Nenhum texto encontrado para a busca." : "Nenhum texto padrão cadastrado ainda."}
        </div>
      ) : (
        <div className="grid gap-4">
          {textosFiltrados.map((texto) => (
            <div
              key={texto.id}
              className={`rounded-lg border bg-card p-4 shadow-sm transition-opacity ${!texto.ativo ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-base truncate">{texto.titulo}</span>
                    <Badge variant="outline" className="text-xs shrink-0 bg-amber-50 border-amber-200 text-amber-800">
                      {texto.tipoDescricao ?? "—"}
                    </Badge>
                    <Badge variant={texto.ativo ? "default" : "secondary"} className="text-xs shrink-0">
                      {texto.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  {/* Preview em HTML renderizado */}
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none mt-2 line-clamp-3 text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: texto.corpo }}
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={texto.ativo}
                    onCheckedChange={(val) => editarMutation.mutate({ id: texto.id, dados: { ativo: val } })}
                    title={texto.ativo ? "Desativar" : "Ativar"}
                  />
                  <Button size="icon" variant="ghost" onClick={() => setEditando(texto)} title="Editar">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setRemovendoId(texto.id)}
                    title="Remover"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo texto padrão</DialogTitle>
          </DialogHeader>
          <TextoForm
            tipos={tipos}
            placeholders={placeholders}
            onSalvar={(dados) => criarMutation.mutate(dados)}
            onCancelar={() => setDialogAberto(false)}
            salvando={criarMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editando} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar texto padrão</DialogTitle>
          </DialogHeader>
          {editando && (
            <TextoForm
              tipos={tipos}
              placeholders={placeholders}
              inicial={editando}
              onSalvar={(dados) => editarMutation.mutate({ id: editando.id, dados })}
              onCancelar={() => setEditando(null)}
              salvando={editarMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removendoId} onOpenChange={(open) => !open && setRemovendoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover texto padrão</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O texto padrão será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removendoId && removerMutation.mutate(removendoId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
