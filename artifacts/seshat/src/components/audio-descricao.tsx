import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Volume2, VolumeX, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const SUPPORTED = typeof window !== "undefined" && "speechSynthesis" in window;

function getPageText(): string {
  const main = document.querySelector("main");
  if (!main) return "";

  const clone = main.cloneNode(true) as HTMLElement;

  clone.querySelectorAll("button, [role='button'], input, textarea, select, script, style, svg").forEach((el) => el.remove());

  const text = clone.innerText ?? clone.textContent ?? "";
  return text.replace(/\s+/g, " ").trim();
}

function getPageTitle(): string {
  const h1 = document.querySelector("main h1, main h2");
  return h1?.textContent?.trim() ?? document.title ?? "";
}

export function AudioDescricao() {
  const [lendo, setLendo] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [ativo, setAtivo] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [location] = useLocation();

  const parar = useCallback(() => {
    window.speechSynthesis.cancel();
    setLendo(false);
    setPausado(false);
    utteranceRef.current = null;
  }, []);

  const ler = useCallback((texto: string) => {
    if (!SUPPORTED || !texto) return;

    window.speechSynthesis.cancel();

    const utt = new SpeechSynthesisUtterance(texto);
    utt.lang = "pt-BR";
    utt.rate = 0.95;
    utt.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    const voicePtBR = voices.find(
      (v) => v.lang === "pt-BR" || v.lang === "pt_BR"
    );
    if (voicePtBR) utt.voice = voicePtBR;

    utt.onstart = () => { setLendo(true); setPausado(false); };
    utt.onend = () => { setLendo(false); setPausado(false); utteranceRef.current = null; };
    utt.onerror = () => { setLendo(false); setPausado(false); utteranceRef.current = null; };

    utteranceRef.current = utt;
    window.speechSynthesis.speak(utt);
  }, []);

  const iniciar = useCallback(() => {
    setAtivo(true);
    setTimeout(() => {
      const titulo = getPageTitle();
      const corpo = getPageText();
      const texto = titulo ? `${titulo}. ${corpo}` : corpo;
      ler(texto);
    }, 300);
  }, [ler]);

  const alternar = useCallback(() => {
    if (!SUPPORTED) return;

    if (lendo) {
      parar();
      setAtivo(false);
    } else {
      iniciar();
    }
  }, [lendo, parar, iniciar]);

  useEffect(() => {
    if (ativo && !lendo) {
      setTimeout(() => {
        const titulo = getPageTitle();
        const corpo = getPageText();
        const texto = titulo ? `${titulo}. ${corpo}` : corpo;
        ler(texto);
      }, 400);
    }
  }, [location]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (!lendo) return;

    const keepAlive = setInterval(() => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000);

    return () => clearInterval(keepAlive);
  }, [lendo]);

  if (!SUPPORTED) return null;

  return (
    <div
      className="fixed bottom-[5.5rem] right-4 z-50"
      role="complementary"
      aria-label="Audiodescrição"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            onClick={alternar}
            aria-label={lendo ? "Parar audiodescrição" : "Iniciar audiodescrição"}
            aria-pressed={lendo}
            className={`h-12 w-12 rounded-full shadow-lg transition-all ${
              lendo
                ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground animate-pulse"
                : "bg-primary hover:bg-primary/90 text-primary-foreground"
            }`}
          >
            {lendo ? <Square className="h-5 w-5 fill-current" /> : <Volume2 className="h-5 w-5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-sm">
          {lendo ? "Parar audiodescrição" : "Audiodescrição"}
        </TooltipContent>
      </Tooltip>

      {lendo && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          Lendo conteúdo da página
        </div>
      )}
    </div>
  );
}
