import { useEffect, useState } from "react";
import { X, Download, Share, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "carometro:install-dispensado";
const DISPENSADO_POR = 7 * 24 * 60 * 60 * 1000; // 7 dias

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function jaInstalado() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function ehMobile() {
  return (
    /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent) ||
    window.matchMedia("(max-width: 768px)").matches ||
    ("ontouchstart" in window && window.matchMedia("(pointer: coarse)").matches)
  );
}

function ehIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) && !(window as { MSStream?: unknown }).MSStream;
}

function foiDispensado() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (!v) return false;
    return Date.now() - Number(v) < DISPENSADO_POR;
  } catch {
    return false;
  }
}

function marcarDispensado() {
  try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {}
}

export function InstalarApp() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visivel, setVisivel] = useState(false);
  const [ios, setIos] = useState(false);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    if (jaInstalado() || !ehMobile() || foiDispensado()) return;

    if (ehIOS()) {
      setIos(true);
      setVisivel(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setVisivel(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dispensar = () => {
    marcarDispensado();
    setVisivel(false);
  };

  const instalar = async () => {
    if (!prompt) return;
    setInstalando(true);
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      setVisivel(false);
    } else {
      marcarDispensado();
      setVisivel(false);
    }
    setInstalando(false);
    setPrompt(null);
  };

  if (!visivel) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Instalar Seshat"
      className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom duration-300"
    >
      <div className="mx-3 mb-3 rounded-2xl bg-background border border-border shadow-2xl overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <div className="shrink-0 w-12 h-12 rounded-xl bg-[#FF3C00] flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-lg select-none">C</span>
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground leading-tight">
              Instalar Seshat
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              {ios
                ? "Adicione à sua tela inicial para acesso rápido, mesmo offline."
                : "Instale o app para acesso rápido e uso offline."}
            </p>

            {ios ? (
              <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Como instalar no iOS:</p>
                <div className="flex items-center gap-2">
                  <div className="shrink-0 w-5 h-5 rounded bg-muted flex items-center justify-center">
                    <span className="text-[10px] font-bold text-muted-foreground">1</span>
                  </div>
                  <span>
                    Toque em{" "}
                    <span className="inline-flex items-center gap-0.5 align-middle font-medium text-foreground">
                      <Share className="w-3 h-3" /> Compartilhar
                    </span>{" "}
                    no Safari
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="shrink-0 w-5 h-5 rounded bg-muted flex items-center justify-center">
                    <span className="text-[10px] font-bold text-muted-foreground">2</span>
                  </div>
                  <span>
                    Selecione{" "}
                    <span className="inline-flex items-center gap-0.5 align-middle font-medium text-foreground">
                      <Plus className="w-3 h-3" /> Adicionar à Tela de Início
                    </span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={instalar}
                  disabled={instalando}
                  className="h-8 text-xs gap-1.5 bg-[#FF3C00] hover:bg-[#e03500] text-white"
                >
                  <Download className="w-3.5 h-3.5" />
                  {instalando ? "Instalando…" : "Instalar"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={dispensar}
                  className="h-8 text-xs text-muted-foreground"
                >
                  Agora não
                </Button>
              </div>
            )}
          </div>

          <button
            onClick={dispensar}
            aria-label="Fechar"
            className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
