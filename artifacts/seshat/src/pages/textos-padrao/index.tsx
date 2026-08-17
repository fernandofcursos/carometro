import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, FileText, Info } from "lucide-react";

interface TipOcorrencia {
  id: string;
  descricao: string;
  status: string;
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

const CORPO_MAX = 5000;

function TextoForm({
  tipos,
  placeholders,
  inicial,
  onSalvar,
  onCancelar,
}: {
  tipos: TipOcorrencia[];
  placeholders: Placeholder[];
  inicial?: Partial<TextoPadrao>;
  onSalvar: (dados: Omit<TextoPadrao, "id" | "tipoDescricao" | "criadoEm" | "atualizadoEm">) => void;
  onCancelar: () => void;
}) {
  const [tipoOcorrenciaId, setTipoOcorrenciaId] = useState(inicial?.tipoOcorrenciaId ?? "");
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [corpo, setCorpo] = useState(inicial?.corpo ?? "");
  const [ativo, setAtivo] = useState(inicial?.ativo ?? true);

  const inserirPlaceholder = (ph: string) => {
    setCorpo((prev) => prev + ph);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipoOcorrenciaId || !titulo.trim() || !corpo.trim()) return;
    onSalvar({ tipoOcorrenciaId, titulo: titulo.trim(), corpo: corpo.trim(), ativo });
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

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label htmlFor="corpo">Corpo do texto *</Label>
          <span className={`text-xs ${corpo.length > CORPO_MAX - 200 ? "text-amber-600" : "text-muted-foreground"}`}>
            {corpo.length}/{CORPO_MAX}
          </span>
        </div>
        <Textarea
          id="corpo"
          value={corpo}
          onChange={(e) => setCorpo(e.target.value.slice(0, CORPO_MAX))}
          rows={8}
          required
          placeholder="Digite o texto modelo. Use os marcadores abaixo para inserir dados dinâmicos."
          className="mt-1 font-mono text-sm"
        />
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
          <Info className="w-3 h-3" /> Clique para inserir um marcador no texto:
        </p>
        <div className="flex flex-wrap gap-2">
          {placeholders.map((ph) => (
            <button
              key={ph.placeholder}
              type="button"
              onClick={() => inserirPlaceholder(ph.placeholder)}
              className="text-xs px-2 py-1 rounded bg-muted hover:bg-amber-100 border border-border font-mono transition-colors"
              title={ph.descricao}
            >
              {ph.placeholder}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="ativo"
          checked={ativo}
          onCheckedChange={setAtivo}
        />
        <Label htmlFor="ativo">Texto ativo</Label>
        {ativo && (
          <span className="text-xs text-muted-foreground">
            (somente um texto ativo por tipo de ocorrência)
          </span>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>
        <Button type="submit">Salvar</Button>
      </DialogFooter>
    </form>
  );
}

export default function TextosPadraoPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<TextoPadrao | null>(null);
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const { data: textos = [], isLoading } = useQuery<TextoPadrao[]>({
    queryKey: ["textos-padrao"],
    queryFn: () => apiClient.get("/api/textos-padrao").then((r) => r.data),
  });

  const { data: tipos = [] } = useQuery<TipOcorrencia[]>({
    queryKey: ["tipos-ocorrencias"],
    queryFn: () => apiClient.get("/api/tipos-ocorrencias").then((r) => r.data),
  });

  const { data: placeholders = [] } = useQuery<Placeholder[]>({
    queryKey: ["textos-padrao-placeholders"],
    queryFn: () => apiClient.get("/api/textos-padrao/placeholders").then((r) => r.data),
  });

  const criarMutation = useMutation({
    mutationFn: (dados: unknown) => apiClient.post("/api/textos-padrao", dados),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["textos-padrao"] });
      setDialogAberto(false);
      toast({ title: "Texto padrão criado com sucesso." });
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao criar texto padrão",
        description: err?.response?.data?.error ?? "Erro inesperado.",
        variant: "destructive",
      });
    },
  });

  const editarMutation = useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: unknown }) =>
      apiClient.put(`/api/textos-padrao/${id}`, dados),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["textos-padrao"] });
      setEditando(null);
      toast({ title: "Texto padrão atualizado com sucesso." });
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao atualizar texto padrão",
        description: err?.response?.data?.error ?? "Erro inesperado.",
        variant: "destructive",
      });
    },
  });

  const removerMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/textos-padrao/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["textos-padrao"] });
      setRemovendoId(null);
      toast({ title: "Texto padrão removido." });
    },
    onError: () => {
      toast({ title: "Erro ao remover texto padrão.", variant: "destructive" });
    },
  });

  const alternarAtivoMutation = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      apiClient.put(`/api/textos-padrao/${id}`, { ativo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["textos-padrao"] });
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao alterar status",
        description: err?.response?.data?.error ?? "Erro inesperado.",
        variant: "destructive",
      });
    },
  });

  const textosFiltrados = textos.filter((t) => {
    const q = busca.toLowerCase();
    return (
      t.titulo.toLowerCase().includes(q) ||
      (t.tipoDescricao ?? "").toLowerCase().includes(q) ||
      t.corpo.toLowerCase().includes(q)
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

      <div className="flex gap-3">
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
              className={`rounded-lg border bg-card p-4 shadow-sm transition-opacity ${
                !texto.ativo ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-base truncate">{texto.titulo}</span>
                    <Badge
                      variant="outline"
                      className="text-xs shrink-0 bg-amber-50 border-amber-200 text-amber-800"
                    >
                      {texto.tipoDescricao ?? "—"}
                    </Badge>
                    <Badge
                      variant={texto.ativo ? "default" : "secondary"}
                      className="text-xs shrink-0"
                    >
                      {texto.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap line-clamp-3">
                    {texto.corpo}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={texto.ativo}
                    onCheckedChange={(val) =>
                      alternarAtivoMutation.mutate({ id: texto.id, ativo: val })
                    }
                    title={texto.ativo ? "Desativar" : "Ativar"}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditando(texto)}
                    title="Editar"
                  >
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

      {/* Dialog: Novo */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo texto padrão</DialogTitle>
          </DialogHeader>
          <TextoForm
            tipos={tipos}
            placeholders={placeholders}
            onSalvar={(dados) => criarMutation.mutate(dados)}
            onCancelar={() => setDialogAberto(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar */}
      <Dialog open={!!editando} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
            />
          )}
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Remover */}
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
