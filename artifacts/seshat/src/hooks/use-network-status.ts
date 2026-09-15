import { useEffect, useState, useCallback, useRef } from "react";

export type NetworkStatus = "online" | "offline" | "syncing" | "slow";

export function useNetworkStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [status, setStatus] = useState<NetworkStatus>(
    navigator.onLine ? "online" : "offline"
  );

  const setSyncing = useCallback(() => setStatus("syncing"), []);
  const setOnlineState = useCallback(() => {
    setOnline(true);
    setStatus("online");
  }, []);
  const setOfflineState = useCallback(() => {
    setOnline(false);
    setStatus("offline");
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      setStatus("online");
    };
    const handleOffline = () => {
      setOnline(false);
      setStatus("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { online, status, setSyncing, setOnlineState, setOfflineState };
}

// -------------------------------------------------------
// Fila de mutações offline — persiste em localStorage
// -------------------------------------------------------

export type OfflineMutation = {
  id: string;
  url: string;
  method: string;
  body?: string;
  contentType?: string;
  enqueuedAt: number;
  retries: number;
};

const QUEUE_KEY = "carometro:offline-queue";

function loadQueue(): OfflineMutation[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveQueue(q: OfflineMutation[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export function enqueueOfflineMutation(
  url: string,
  method: string,
  body?: unknown,
  contentType = "application/json"
) {
  const queue = loadQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url,
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    contentType,
    enqueuedAt: Date.now(),
    retries: 0,
  });
  saveQueue(queue);
}

export function useOfflineSync(onSynced?: (count: number) => void) {
  const { online } = useNetworkStatus();
  const prevOnline = useRef(online);
  const syncing = useRef(false);

  const replayQueue = useCallback(async () => {
    if (syncing.current) return;
    const queue = loadQueue();
    if (queue.length === 0) return;

    syncing.current = true;
    const remaining: OfflineMutation[] = [];
    let synced = 0;

    for (const mut of queue) {
      try {
        const res = await fetch(mut.url, {
          method: mut.method,
          credentials: "include",
          headers: mut.contentType ? { "Content-Type": mut.contentType } : {},
          body: mut.body,
        });
        if (res.ok) {
          synced++;
        } else if (res.status >= 400 && res.status < 500) {
          // Erros de cliente (validação etc.) — descartamos
        } else {
          remaining.push({ ...mut, retries: mut.retries + 1 });
        }
      } catch {
        remaining.push({ ...mut, retries: mut.retries + 1 });
      }
    }

    // Remove mutações com muitas tentativas
    saveQueue(remaining.filter((m) => m.retries < 5));
    syncing.current = false;

    if (synced > 0) onSynced?.(synced);
  }, [onSynced]);

  useEffect(() => {
    if (online && !prevOnline.current) {
      replayQueue();
    }
    prevOnline.current = online;
  }, [online, replayQueue]);

  return { replayQueue, pendingCount: loadQueue().length };
}
