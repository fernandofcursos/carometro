import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Info, BellOff, Paperclip, FileText, Image, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AnexoViewer } from "./anexo-viewer";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}${path}`, { credentials: "include", ...opts });

type AnexoInfo = {
  id: string;
  nomeOriginal: string;
  mimeType: string;
};

type FeedItem = {
  id: string;
  titulo: string;
  conteudo: string;
  tipo: "aviso" | "informe";
  publicoAlvo: string;
  publicado: boolean;
  dataInicio: string | null;
  dataFim: string | null;
  tipoNome: string | null;
  tipoEhCardapio: boolean;
  perfisDestino: string[];
  turmaSigla: string | null;
  criadoEm: string;
  anexos: AnexoInfo[];
};

export type AvisosWidgetProps = {
  perfil: string;
  limite?: number;
};

function mimeIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return <Image className="h-3 w-3" />;
  if (mimeType === "application/pdf") return <FileText className="h-3 w-3" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return <FileSpreadsheet className="h-3 w-3" />;
  return <FileText className="h-3 w-3" />;
}

function AnexoChips({ anexos }: { anexos: AnexoInfo[] }) {
  const [viewer, setViewer] = useState<AnexoInfo | null>(null);

  if (anexos.length === 0) return null;

  const abrirAnexo = (a: AnexoInfo) => {
    const isInline = a.mimeType.startsWith("image/") || a.mimeType === "application/pdf";
    if (isInline) {
      // imagem/PDF → viewer modal inline
      setViewer(a);
    } else {
      // doc/xlsx → nova aba (download)
      window.open(`${BASE}/api/avisos-informes/anexos/${a.id}/arquivo`, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-1 mt-2">
        {anexos.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => abrirAnexo(a)}
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors truncate max-w-[200px]"
            title={a.nomeOriginal}
          >
            {mimeIcon(a.mimeType)}
            <span className="truncate">{a.nomeOriginal}</span>
          </button>
        ))}
      </div>
      <AnexoViewer
        open={!!viewer}
        onOpenChange={(v) => !v && setViewer(null)}
        anexo={viewer}
      />
    </>
  );
}

export function AvisosWidget({ perfil, limite = 5 }: AvisosWidgetProps) {
  const { data: items, isLoading } = useQuery<FeedItem[]>({
    queryKey: ["avisos-feed", perfil, limite],
    queryFn: async () => {
      const r = await api(`/api/avisos-informes/feed?perfil=${encodeURIComponent(perfil)}&limite=${limite}`);
      if (!r.ok) throw new Error("Erro ao carregar avisos");
      return r.json();
    },
    staleTime: 60_000,
  });

  return (
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-500" />
          Avisos &amp; Informes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 items-start">
                <Skeleton className="h-4 w-4 rounded-full mt-0.5 shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : !items || items.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <BellOff className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum aviso no momento.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex gap-3 items-start rounded-lg border p-3">
                {item.tipo === "aviso" ? (
                  <Bell className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
                ) : (
                  <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.titulo}</p>
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none line-clamp-3 text-xs text-muted-foreground [&_*]:m-0 [&_p]:leading-snug"
                    dangerouslySetInnerHTML={{ __html: item.conteudo }}
                  />
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="outline" className={cn("text-xs", item.tipo === "aviso" ? "border-amber-300 text-amber-700" : "border-blue-300 text-blue-700")}>
                      {item.tipoNome ?? (item.tipo === "aviso" ? "Aviso" : "Informe")}
                    </Badge>
                    {item.dataInicio && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.dataInicio + "T12:00:00").toLocaleDateString("pt-BR")}
                      </span>
                    )}
                    {item.anexos?.length > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Paperclip className="h-3 w-3" />
                        {item.anexos.length}
                      </span>
                    )}
                  </div>
                  <AnexoChips anexos={item.anexos ?? []} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
