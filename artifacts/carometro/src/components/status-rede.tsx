import { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useNetworkStatus, useOfflineSync } from "@/hooks/use-network-status";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export function StatusRede() {
  const { online } = useNetworkStatus();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const prevOnline = useRef<boolean | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  const { replayQueue, pendingCount } = useOfflineSync((count) => {
    setSincronizando(false);
    queryClient.invalidateQueries();
    toast({
      title: "Sincronização concluída",
      description: `${count} ${count === 1 ? "alteração sincronizada" : "alterações sincronizadas"} com sucesso.`,
      duration: 4000,
    });
  });

  useEffect(() => {
    if (prevOnline.current === null) {
      prevOnline.current = online;
      return;
    }

    if (!online && prevOnline.current) {
      toast({
        title: "Sem conexão",
        description: "Você está offline. As alterações serão salvas e sincronizadas ao reconectar.",
        duration: 6000,
      });
    }

    if (online && !prevOnline.current) {
      setSincronizando(true);
      toast({
        title: "Conexão restaurada",
        description: "Sincronizando dados pendentes…",
        duration: 3000,
      });
      replayQueue();
      queryClient.invalidateQueries();
    }

    prevOnline.current = online;
  }, [online, toast, replayQueue, queryClient]);

  if (online && !sincronizando && pendingCount === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-sm font-medium transition-all ${
        !online
          ? "bg-destructive text-destructive-foreground"
          : "bg-amber-500 text-white"
      }`}
    >
      {!online ? (
        <>
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
          <span>Sem conexão — modo offline</span>
          {pendingCount > 0 && (
            <span className="ml-1 bg-white/20 rounded-full px-2 py-0.5 text-xs">
              {pendingCount} pendente{pendingCount > 1 ? "s" : ""}
            </span>
          )}
        </>
      ) : (
        <>
          <RefreshCw className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          <span>Sincronizando…</span>
        </>
      )}
    </div>
  );
}
