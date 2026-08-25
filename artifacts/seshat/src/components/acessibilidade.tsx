import { useEffect, useMemo, useState } from "react";
import { Accessibility, Plus, Minus, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  FEATURES,
  PROFILES,
  SECOES,
  alternarFeature,
  aplicar,
  carregar,
  salvar,
  type A11yState,
  type FeatureId,
  type Profile,
  type SecaoId,
} from "@/lib/acessibilidade";
import { EstruturaPaginaDialog } from "./acessibilidade-estrutura";

type Painel = "perfis" | SecaoId | null;

export function Acessibilidade() {
  const [aberto, setAberto] = useState(false);
  const [state, setState] = useState<A11yState>({ features: new Set(), profile: null });
  const [painel, setPainel] = useState<Painel>("perfis");
  const [perfilExpandido, setPerfilExpandido] = useState<string | null>(null);
  const [estruturaAberta, setEstruturaAberta] = useState(false);

  useEffect(() => {
    const inicial = carregar();
    setState(inicial);
    aplicar(inicial);
  }, []);

  const totalAtivos = state.features.size;

  const atualizar = (nova: A11yState) => {
    setState(nova);
    aplicar(nova);
    salvar(nova);
  };

  const toggleFeature = (id: FeatureId) => {
    if (id === "estrutura-pagina") {
      setEstruturaAberta(true);
      return;
    }
    const features = alternarFeature(state.features, id);
    atualizar({ features, profile: null });
  };

  const toggleProfile = (perfil: Profile) => {
    const ativo = state.profile === perfil.id;
    if (ativo) {
      atualizar({ features: new Set(), profile: null });
      return;
    }
    let features = new Set<FeatureId>();
    for (const f of perfil.features) features = alternarFeature(features, f);
    atualizar({ features, profile: perfil.id });
  };

  const resetar = () => {
    atualizar({ features: new Set(), profile: null });
  };

  useGuiaLeitura(state.features.has("guia-leitura"));
  useMascaraLeitura(state.features.has("mascara-leitura"));

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="secondary"
            onClick={() => setAberto(true)}
            aria-label="Abrir menu de acessibilidade"
            className="relative h-9 w-9 rounded-md bg-zinc-900 text-white hover:bg-zinc-800 border border-zinc-900"
          >
            <Accessibility className="h-5 w-5" strokeWidth={2.5} />
            {totalAtivos > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[0.6rem] font-bold flex items-center justify-center">
                {totalAtivos}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Acessibilidade</TooltipContent>
      </Tooltip>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent
          className="max-w-xl p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col"
        >
          <div className="bg-zinc-900 text-white px-6 py-3 flex items-center justify-between">
            <div className="flex-1" />
            <DialogTitle className="font-semibold text-base">Acessibilidade</DialogTitle>
            <div className="flex-1 flex justify-end">
              <button
                type="button"
                onClick={resetar}
                title="Restaurar padrão"
                aria-label="Restaurar configurações de acessibilidade"
                className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-white/10"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>
          <DialogDescription className="sr-only">
            Menu com ajustes de acessibilidade para personalizar a experiência de uso.
          </DialogDescription>

          <div className="overflow-y-auto p-4 space-y-2">
            <SecaoBox
              titulo="Perfis de acessibilidade"
              aberto={painel === "perfis"}
              onToggle={() => setPainel(painel === "perfis" ? null : "perfis")}
            >
              <div className="divide-y divide-border">
                {PROFILES.map((p) => {
                  const ativo = state.profile === p.id;
                  const expandido = perfilExpandido === p.id;
                  return (
                    <div key={p.id} className="py-2">
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setPerfilExpandido(expandido ? null : p.id)}
                          className="flex items-center gap-2 flex-1 text-left text-sm hover:underline"
                          aria-expanded={expandido}
                        >
                          <span className="h-5 w-5 inline-flex items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Plus className={cn("h-3 w-3 transition-transform", expandido && "rotate-45")} />
                          </span>
                          {p.titulo}
                        </button>
                        <OnOffToggle ativo={ativo} onChange={() => toggleProfile(p)} label={p.titulo} />
                      </div>
                      {expandido && (
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 pl-7">
                          {p.features.map((fid) => (
                            <FeatureTile key={fid} id={fid} ativo={state.features.has(fid)} onClick={() => toggleFeature(fid)} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </SecaoBox>

            {SECOES.map((s) => (
              <SecaoBox
                key={s.id}
                titulo={s.titulo}
                aberto={painel === s.id}
                onToggle={() => setPainel(painel === s.id ? null : s.id)}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-1">
                  {s.features.map((fid) => (
                    <FeatureTile key={fid} id={fid} ativo={state.features.has(fid)} onClick={() => toggleFeature(fid)} />
                  ))}
                </div>
              </SecaoBox>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setAberto(false)}
            className="absolute top-2 right-3 text-white/80 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </DialogContent>
      </Dialog>

      <EstruturaPaginaDialog open={estruturaAberta} onOpenChange={setEstruturaAberta} />
    </>
  );
}

function SecaoBox({
  titulo,
  aberto,
  onToggle,
  children,
}: {
  titulo: string;
  aberto: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("border rounded-md overflow-hidden", aberto && "ring-2 ring-primary")}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-card hover:bg-accent/30 text-left"
        aria-expanded={aberto}
      >
        <span className="font-semibold text-sm">{titulo}</span>
        {aberto ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </button>
      {aberto && <div className="px-3 pb-3 pt-1 bg-background">{children}</div>}
    </div>
  );
}

function OnOffToggle({
  ativo,
  onChange,
  label,
}: {
  ativo: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-card text-xs font-semibold shrink-0">
      <button
        type="button"
        onClick={() => !ativo && onChange()}
        aria-pressed={ativo}
        aria-label={`Ativar ${label}`}
        className={cn(
          "px-2.5 py-1 rounded-full transition-colors",
          ativo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        ON
      </button>
      <button
        type="button"
        onClick={() => ativo && onChange()}
        aria-pressed={!ativo}
        aria-label={`Desativar ${label}`}
        className={cn(
          "px-2.5 py-1 rounded-full transition-colors",
          !ativo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        OFF
      </button>
    </div>
  );
}

function FeatureTile({
  id,
  ativo,
  onClick,
}: {
  id: FeatureId;
  ativo: boolean;
  onClick: () => void;
}) {
  const f = FEATURES[id];
  const [hover, setHover] = useState(false);
  const Icone = f.icone;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      aria-pressed={ativo}
      title={f.descricao}
      className={cn(
        "relative aspect-square flex flex-col items-center justify-center gap-1.5 rounded-md border p-2 text-center transition-all",
        ativo
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card hover:bg-accent border-border",
      )}
    >
      {hover ? (
        <span className="text-[0.7rem] leading-tight px-1 font-medium">
          {f.descricao}
        </span>
      ) : (
        <>
          <Icone className="h-7 w-7" aria-hidden />
          <span className="text-[0.7rem] leading-tight font-medium">{f.titulo}</span>
        </>
      )}
    </button>
  );
}

function useGuiaLeitura(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return;
    const linha = document.createElement("div");
    linha.setAttribute("aria-hidden", "true");
    linha.style.cssText =
      "position:fixed;left:0;right:0;height:3px;background:#facc15;pointer-events:none;z-index:9999;box-shadow:0 0 6px rgba(0,0,0,.3);top:-9999px;";
    document.body.appendChild(linha);
    const mover = (y: number) => { linha.style.top = `${y}px`; };
    const onMouse = (e: MouseEvent) => mover(e.clientY);
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (el?.getBoundingClientRect) mover(el.getBoundingClientRect().top);
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) mover(t.clientY);
    };
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("focusin", onFocus);
    window.addEventListener("touchmove", onTouch, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("focusin", onFocus);
      window.removeEventListener("touchmove", onTouch);
      linha.remove();
    };
  }, [ativo]);
}

function useMascaraLeitura(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return;
    const top = document.createElement("div");
    const bottom = document.createElement("div");
    const base = "position:fixed;left:0;right:0;background:rgba(0,0,0,.7);pointer-events:none;z-index:9998;";
    top.style.cssText = base + "top:0;height:0;";
    bottom.style.cssText = base + "bottom:0;height:0;";
    top.setAttribute("aria-hidden", "true");
    bottom.setAttribute("aria-hidden", "true");
    document.body.append(top, bottom);
    const ALTURA = 120;
    const atualizar = (y: number) => {
      top.style.height = `${Math.max(0, y - ALTURA / 2)}px`;
      bottom.style.height = `${Math.max(0, window.innerHeight - y - ALTURA / 2)}px`;
    };
    const onMouse = (e: MouseEvent) => atualizar(e.clientY);
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (el?.getBoundingClientRect) {
        const r = el.getBoundingClientRect();
        atualizar(r.top + r.height / 2);
      }
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) atualizar(t.clientY);
    };
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("focusin", onFocus);
    window.addEventListener("touchmove", onTouch, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("focusin", onFocus);
      window.removeEventListener("touchmove", onTouch);
      top.remove();
      bottom.remove();
    };
  }, [ativo]);
}

export { useMemo };
