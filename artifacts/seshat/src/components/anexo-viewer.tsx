import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText, X } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type AnexoViewerProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  anexo: { id: string; nomeOriginal: string; mimeType: string } | null;
};

export function AnexoViewer({ open, onOpenChange, anexo }: AnexoViewerProps) {
  if (!anexo) return null;

  const url = `${BASE}/api/avisos-informes/anexos/${anexo.id}/arquivo`;
  const isImage = ["image/jpeg", "image/png"].includes(anexo.mimeType);
  const isPdf = anexo.mimeType === "application/pdf";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base truncate pr-8">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{anexo.nomeOriginal}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2">
          {isImage ? (
            <img
              src={url}
              alt={anexo.nomeOriginal}
              className="max-w-full rounded-md border border-border mx-auto block"
            />
          ) : isPdf ? (
            <iframe
              src={url}
              title={anexo.nomeOriginal}
              className="w-full rounded-md border border-border"
              style={{ height: "60vh" }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <FileText className="h-16 w-16 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground text-center">
                Visualização não disponível para este tipo de arquivo.
              </p>
              <a href={url} download={anexo.nomeOriginal}>
                <Button variant="outline" className="gap-2">
                  <Download className="h-4 w-4" />
                  Baixar {anexo.nomeOriginal}
                </Button>
              </a>
            </div>
          )}
        </div>

        {(isImage || isPdf) && (
          <div className="mt-3 flex justify-end">
            <a href={url} download={anexo.nomeOriginal}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Baixar
              </Button>
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
