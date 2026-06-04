// Fase 4: Hook para detectar mudanças de status de conexão
// Sincroniza fila quando volta online
import { useEffect, useState, useCallback } from "react";
import {
  loadQueue,
  removeFromQueue,
  incrementRetries,
  OfflineQueuedError,
} from "./offline-queue.js";

// Fase 4: Tipo para status de conexão
export type NetworkStatus = "online" | "offline" | "connecting";

// Fase 4: Hook para gerenciar status de conexão e sincronizar fila
export function useNetworkStatus() {
  // Fase 4: Status atual da conexão (online, offline, connecting)
  const [status, setStatus] = useState<NetworkStatus>(
    navigator.onLine ? "online" : "offline"
  );

  // Fase 4: Número de mutações pendentes na fila
  const [queueSize, setQueueSize] = useState(() => loadQueue().length);

  // Fase 4: Sincronizar fila quando volta online
  // useCallback evita recriar função a cada render
  const syncQueue = useCallback(async () => {
    // Carregar fila atual
    const queue = loadQueue();

    if (queue.length === 0) {
      // Fila vazia, nada a sincronizar
      return;
    }

    console.log(`[OFFLINE] Sincronizando ${queue.length} mutações...`);

    // Processar cada mutação na fila
    for (const mutation of queue) {
      try {
        // Mudar status para "connecting" enquanto sincroniza
        setStatus("connecting");

        // Fazer requisição real da mutação
        const response = await fetch(mutation.url, {
          method: mutation.method,
          credentials: "include",
          headers: {
            "Content-Type": mutation.contentType || "application/json",
          },
          body: mutation.body,
        });

        if (!response.ok) {
          // Resposta de erro do servidor
          throw new Error(`HTTP ${response.status}`);
        }

        // Sucesso! Remover da fila
        removeFromQueue(mutation.id);
        console.log(`[OFFLINE] ✅ ${mutation.method} ${mutation.url}`);
      } catch (err) {
        // Falha ao sincronizar — incrementar tentativas
        incrementRetries(mutation.id);
        console.error(
          `[OFFLINE] ❌ Falha ao sincronizar ${mutation.id}:`,
          err instanceof Error ? err.message : err
        );

        // Não quebrar loop — continuar com próximas mutações
      }
    }

    // Atualizar tamanho da fila
    setQueueSize(loadQueue().length);

    // Voltar para online após sincronizar
    setStatus("online");

    if (loadQueue().length === 0) {
      console.log("[OFFLINE] ✅ Todas as mutações sincronizadas!");
    }
  }, []);

  // Fase 4: Setup de event listeners para mudanças de conexão
  useEffect(() => {
    // Fase 4: Listener para quando vai offline
    const handleOffline = () => {
      setStatus("offline");
      console.log("[OFFLINE] Conexão perdida. Mudando para modo offline.");
    };

    // Fase 4: Listener para quando volta online
    const handleOnline = async () => {
      console.log("[OFFLINE] Conexão restaurada. Sincronizando fila...");
      // Sincronizar fila automaticamente quando volta online
      await syncQueue();
    };

    // Registrar listeners
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    // Cleanup: remover listeners ao desmontar hook
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [syncQueue]);

  return {
    // Status atual (online, offline, connecting)
    status,
    // Se está offline
    isOffline: status === "offline",
    // Se está sincronizando
    isConnecting: status === "connecting",
    // Número de mutações pendentes
    queueSize,
    // Função para sincronizar manualmente (útil para teste)
    syncQueue,
  };
}
