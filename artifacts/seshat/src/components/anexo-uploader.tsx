import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileText, Trash2, Upload, Loader2, Paperclip } from "lucide-react";
import { AnexoViewer } from "./anexo-viewer";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}${path}`, { credentials: "include", ...opts });

type Anexo = {
  id: string;
  avisoId: string;
  nomeOriginal: string;
  nomeArquivo: string;
  mimeType: string;
  tamanho: number;
  criadoEm: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type AnexoUploaderProps = {
  avisoId: string | null;
  editavel?: boolean;
  className?: string;
};

export function AnexoUploader({ avisoId, editavel = true, className }: AnexoUploaderProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [viewerAnexo, setViewerAnexo] = useState<Anexo | null>(null);

  const { data: anexos = [], isLoading } = useQuery<Anexo[]>({
    queryKey: ["avisos-anexos", avisoId],
    queryFn: () => api(`/api/avisos-informes/avisos/${avisoId}/anexos`).then((r) => r.json()),
    enabled: !!avisoId,
    staleTime: 30_000,
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("arquivo", file);
      const r = await api(`/api/avisos-informes/avisos/${avisoId}/anexos`, { method: "POST", body: fd });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? "Erro ao enviar arquivo.");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avisos-anexos", avisoId] });
      toast({ title: "Anexo enviado com sucesso." });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await api(`/api/avisos-informes/anexos/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Erro ao excluir anexo.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avisos-anexos", avisoId] });
      toast({ title: "Anexo removido." });
    },
    onError: () => {
      toast({ title: "Erro ao remover anexo.", variant: "destructive" });
    },
  });

  const handleFiles = (files: FileList | null) => {
    if (!files || !avisoId) return;
    Array.from(files).forEach((file) => uploadMut.mutate(file));
  };

  if (!avisoId) {
    return (
      <div className={cn("rounded-md border border-dashed border-border px-4 py-3", className)}>
        <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5" />
          Salve o aviso para adicionar anexos
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Existing attachments */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carregando anexos...
        </div>
      ) : anexos.length > 0 ? (
        <div className="space-y-1.5">
          {anexos.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm group"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <button
                type="button"
                className="flex-1 min-w-0 text-left truncate hover:underline text-sm"
                onClick={() => setViewerAnexo(a)}
              >
                {a.nomeOriginal}
              </button>
              <span className="text-xs text-muted-foreground shrink-0">{formatBytes(a.tamanho)}</span>
              {editavel && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteMut.mutate(a.id)}
                  disabled={deleteMut.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* Upload zone */}
      {editavel && (
        <>
          <div
            className={cn(
              "relative rounded-md border-2 border-dashed border-border px-4 py-5 text-center cursor-pointer transition-colors",
              isDragging && "border-primary bg-primary/5",
              uploadMut.isPending && "opacity-60 pointer-events-none"
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
          >
            {uploadMut.isPending ? (
              <div className="flex flex-col items-center gap-1.5">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Enviando...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Clique ou arraste</span> para enviar
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, DOC, DOCX, XLSX, JPG, PNG — máx. 2 MB
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        </>
      )}

      <AnexoViewer
        open={!!viewerAnexo}
        onOpenChange={(v) => !v && setViewerAnexo(null)}
        anexo={viewerAnexo}
      />
    </div>
  );
}
