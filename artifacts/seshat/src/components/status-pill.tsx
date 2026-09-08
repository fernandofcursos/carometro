import { useState } from "react";
import { cn } from "@/lib/utils";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

export function StatusPill() {
  const { status, setOnlineState, setOfflineState, setSyncing } = useNetworkStatus();
  const [demo, setDemo] = useState(0);

  const cycleStates = [
    { status: "online" as const, label: "Online", set: setOnlineState },
    { status: "offline" as const, label: "Offline", set: setOfflineState },
    { status: "syncing" as const, label: "Sincronizando…", set: setSyncing },
  ];

  const handleClick = () => {
    const next = (demo + 1) % cycleStates.length;
    setDemo(next);
    cycleStates[next].set();
  };

  const current = cycleStates.find((s) => s.status === status) ?? cycleStates[0];

  return (
    <button
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-wide transition-colors hover:opacity-80",
        status === "online" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
        status === "offline" && "border-destructive/30 bg-destructive/10 text-destructive",
        status === "syncing" && "border-amber-500/30 bg-amber-500/10 text-amber-600"
      )}
    >
      <span className="relative flex h-2 w-2">
        {status === "syncing" ? (
          <RefreshCw className="h-2 w-2 animate-spin" />
        ) : (
          <>
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
                status === "online" && "bg-emerald-500",
                status === "offline" && "bg-destructive"
              )}
            />
            <span
              className={cn(
                "relative inline-flex rounded-full h-2 w-2",
                status === "online" && "bg-emerald-500",
                status === "offline" && "bg-destructive"
              )}
            />
          </>
        )}
      </span>
      <span>{current.label}</span>
    </button>
  );
}
