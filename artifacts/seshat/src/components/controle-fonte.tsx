import { useEffect, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const STORAGE_KEY = "carometro:tamanho-fonte";
const PASSO = 10;
const MIN = 80;
const MAX = 160;
const PADRAO = 100;

function salvar(valor: number) {
  localStorage.setItem(STORAGE_KEY, String(valor));
}

function carregar(): number {
  const salvo = localStorage.getItem(STORAGE_KEY);
  if (!salvo) return PADRAO;
  const n = parseInt(salvo, 10);
  return isNaN(n) ? PADRAO : Math.min(MAX, Math.max(MIN, n));
}

function aplicar(valor: number) {
  document.documentElement.style.fontSize = `${valor}%`;
}

export function ControleFonte() {
  const [tamanho, setTamanho] = useState<number>(PADRAO);

  useEffect(() => {
    const inicial = carregar();
    setTamanho(inicial);
    aplicar(inicial);
  }, []);

  const alterar = (novo: number) => {
    const valor = Math.min(MAX, Math.max(MIN, novo));
    setTamanho(valor);
    aplicar(valor);
    salvar(valor);
  };

  const podeAumentar = tamanho < MAX;
  const podeDiminuir = tamanho > MIN;
  const ePadrao = tamanho === PADRAO;

  return (
    <div
      className="fixed bottom-[9.5rem] right-4 z-50 flex flex-col gap-1 items-center"
      role="group"
      aria-label="Controle de tamanho de fonte"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="secondary"
            onClick={() => alterar(tamanho + PASSO)}
            disabled={!podeAumentar}
            aria-label="Aumentar tamanho da fonte"
            className="h-10 w-10 rounded-full shadow-md border border-border/60 text-base font-bold"
          >
            <span className="text-lg font-bold leading-none select-none" aria-hidden>A<sup className="text-xs">+</sup></span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Aumentar fonte</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="secondary"
            onClick={() => alterar(tamanho - PASSO)}
            disabled={!podeDiminuir}
            aria-label="Diminuir tamanho da fonte"
            className="h-10 w-10 rounded-full shadow-md border border-border/60"
          >
            <span className="text-base font-bold leading-none select-none" aria-hidden>A<sup className="text-xs">−</sup></span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Diminuir fonte</TooltipContent>
      </Tooltip>

      {!ePadrao && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              onClick={() => alterar(PADRAO)}
              aria-label="Restaurar tamanho padrão da fonte"
              className="h-8 w-8 rounded-full shadow-sm border border-border/60 text-muted-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Restaurar padrão ({PADRAO}%)</TooltipContent>
        </Tooltip>
      )}

      <span className="text-[0.6rem] text-muted-foreground font-mono mt-0.5 select-none" aria-live="polite" aria-atomic>
        {tamanho}%
      </span>
    </div>
  );
}
