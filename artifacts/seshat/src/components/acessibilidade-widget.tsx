import { useEffect, useState } from "react";
import { ArrowLeftRight, EyeOff, X, RotateCcw, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FEATURES, PROFILES, SECOES,
  alternarFeature, aplicar, carregar, salvar,
  type A11yState, type FeatureId, type Profile, type SecaoId,
} from "@/lib/acessibilidade";
import { EstruturaPaginaDialog } from "./acessibilidade-estrutura";

// ---------------------------------------------------------------------------
// Persistência da ocultação do widget
// ---------------------------------------------------------------------------
type HideDuration = "session" | "24h" | "week" | "month";

function marcarOculto(duration: HideDuration) {
  if (duration === "session") {
    sessionStorage.setItem("a11y_widget_oculto", "1");
  } else {
    const ms: Record<string, number> = { "24h": 86_400_000, week: 604_800_000, month: 2_592_000_000 };
    localStorage.setItem("a11y_widget_oculto_ate", String(Date.now() + ms[duration]));
  }
}

function deveOcultar(): boolean {
  if (sessionStorage.getItem("a11y_widget_oculto") === "1") return true;
  const ate = localStorage.getItem("a11y_widget_oculto_ate");
  return !!ate && Date.now() < Number(ate);
}

// ---------------------------------------------------------------------------
// Popup de ocultação (segunda imagem)
// ---------------------------------------------------------------------------
function PopupOcultar({ onConfirmar, onCancelar }: {
  onConfirmar: (d: HideDuration) => void;
  onCancelar: () => void;
}) {
  const [selecionado, setSelecionado] = useState<HideDuration>("session");
  const opcoes: { value: HideDuration; label: string }[] = [
    { value: "session", label: "Apenas para a sessão atual nesta guia" },
    { value: "24h",     label: "Durante as próximas 24 horas" },
    { value: "week",    label: "Durante uma semana" },
    { value: "month",   label: "Durante um mês" },
  ];
  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <span className="font-semibold text-sm text-foreground">Ocultar widget de acessibilidade</span>
          <button onClick={onCancelar} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <p className="font-semibold text-sm">Escolha o período de tempo para remover o widget</p>
          <div className="space-y-3">
            {opcoes.map((o) => (
              <label key={o.value} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="hide-duration"
                  value={o.value}
                  checked={selecionado === o.value}
                  onChange={() => setSelecionado(o.value)}
                  className="accent-zinc-900 w-4 h-4"
                />
                <span className="text-sm text-foreground">{o.label}</span>
              </label>
            ))}
          </div>
        </div>
        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={() => onConfirmar(selecionado)}
            className="w-full bg-zinc-900 text-white text-sm font-semibold py-3 rounded-md hover:bg-zinc-800 transition-colors"
          >
            Confirme e remova o widget
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SecaoBox (mesmo padrão do Acessibilidade principal)
// ---------------------------------------------------------------------------
type Painel = "perfis" | SecaoId | null;

function SecaoBox({ titulo, aberto, onToggle, children }: {
  titulo: string; aberto: boolean; onToggle: () => void; children: React.ReactNode;
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

function OnOffToggle({ ativo, onChange, label }: { ativo: boolean; onChange: () => void; label: string }) {
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-card text-xs font-semibold shrink-0">
      <button
        type="button"
        onClick={() => !ativo && onChange()}
        aria-pressed={ativo}
        aria-label={`Ativar ${label}`}
        className={cn("px-2.5 py-1 rounded-full transition-colors",
          ativo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
      >ON</button>
      <button
        type="button"
        onClick={() => ativo && onChange()}
        aria-pressed={!ativo}
        aria-label={`Desativar ${label}`}
        className={cn("px-2.5 py-1 rounded-full transition-colors",
          !ativo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
      >OFF</button>
    </div>
  );
}

function FeatureTile({ id, ativo, onClick }: { id: FeatureId; ativo: boolean; onClick: () => void }) {
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
        ativo ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent border-border",
      )}
    >
      {hover
        ? <span className="text-[0.7rem] leading-tight px-1 font-medium">{f.descricao}</span>
        : <><Icone className="h-7 w-7" aria-hidden /><span className="text-[0.7rem] leading-tight font-medium">{f.titulo}</span></>
      }
    </button>
  );
}

// ---------------------------------------------------------------------------
// Widget flutuante principal (exportado)
// ---------------------------------------------------------------------------
export function AcessibilidadeWidget() {
  const [oculto, setOculto]           = useState(() => deveOcultar());
  const [expandido, setExpandido]     = useState(false);
  const [popupAberto, setPopupAberto] = useState(false);
  const [painel, setPainel]           = useState<Painel>("perfis");
  const [perfilExpandido, setPerfilExpandido] = useState<string | null>(null);
  const [estruturaAberta, setEstruturaAberta] = useState(false);
  const [state, setState]             = useState<A11yState>({ features: new Set(), profile: null });

  useEffect(() => {
    const inicial = carregar();
    setState(inicial);
    aplicar(inicial);
  }, []);

  const atualizar = (nova: A11yState) => { setState(nova); aplicar(nova); salvar(nova); };

  const toggleFeature = (id: FeatureId) => {
    if (id === "estrutura-pagina") { setEstruturaAberta(true); return; }
    atualizar({ features: alternarFeature(state.features, id), profile: null });
  };

  const toggleProfile = (perfil: Profile) => {
    const ativo = state.profile === perfil.id;
    if (ativo) { atualizar({ features: new Set(), profile: null }); return; }
    let features = new Set<FeatureId>();
    for (const f of perfil.features) features = alternarFeature(features, f);
    atualizar({ features, profile: perfil.id });
  };

  const handleOcultar = (duration: HideDuration) => {
    marcarOculto(duration);
    setPopupAberto(false);
    setOculto(true);
  };

  if (oculto) return null;

  return (
    <>
      {/* Widget fixo no canto inferior esquerdo */}
      <div
        className="fixed bottom-4 left-4 z-[10000] flex flex-col shadow-2xl rounded-lg overflow-hidden"
        style={{ width: expandido ? 340 : "auto" }}
        role="complementary"
        aria-label="Widget de acessibilidade"
      >
        {/* Barra de controle — sempre visível */}
        <div className="bg-zinc-900 text-white flex items-center gap-1 px-2 py-1.5">
          {/* <-> expandir/recolher */}
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            title={expandido ? "Recolher widget" : "Expandir widget"}
            aria-label={expandido ? "Recolher widget de acessibilidade" : "Expandir widget de acessibilidade"}
            aria-expanded={expandido}
            className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-white/15 transition-colors"
          >
            <ArrowLeftRight className={cn("h-4 w-4 transition-transform", expandido && "rotate-180")} />
          </button>

          {/* Ocultar widget */}
          <button
            type="button"
            onClick={() => setPopupAberto(true)}
            title="Ocultar widget"
            aria-label="Ocultar widget de acessibilidade"
            className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-white/15 transition-colors"
          >
            <EyeOff className="h-4 w-4" />
          </button>

          {expandido && (
            <>
              <span className="flex-1 text-center text-sm font-semibold tracking-wide">
                Acessibilidade
              </span>
              {/* Restaurar padrão */}
              <button
                type="button"
                onClick={() => atualizar({ features: new Set(), profile: null })}
                title="Restaurar padrão"
                aria-label="Restaurar configurações de acessibilidade"
                className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-white/15 transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              {/* Fechar painel (mantém widget visível) */}
              <button
                type="button"
                onClick={() => setExpandido(false)}
                aria-label="Fechar painel"
                className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-white/15 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Painel expandido */}
        {expandido && (
          <div className="bg-background border border-t-0 rounded-b-lg overflow-y-auto max-h-[70vh]">
            <div className="p-3 space-y-2">
              {/* Perfis */}
              <SecaoBox
                titulo="Perfis de acessibilidade"
                aberto={painel === "perfis"}
                onToggle={() => setPainel(painel === "perfis" ? null : "perfis")}
              >
                <div className="divide-y divide-border">
                  {PROFILES.map((p) => {
                    const ativo = state.profile === p.id;
                    const exp   = perfilExpandido === p.id;
                    return (
                      <div key={p.id} className="py-2">
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => setPerfilExpandido(exp ? null : p.id)}
                            className="flex items-center gap-2 flex-1 text-left text-sm hover:underline"
                            aria-expanded={exp}
                          >
                            <span className="h-5 w-5 inline-flex items-center justify-center rounded-full bg-primary/10 text-primary">
                              <Plus className={cn("h-3 w-3 transition-transform", exp && "rotate-45")} />
                            </span>
                            {p.titulo}
                          </button>
                          <OnOffToggle ativo={ativo} onChange={() => toggleProfile(p)} label={p.titulo} />
                        </div>
                        {exp && (
                          <div className="mt-3 grid grid-cols-2 gap-3 pl-7">
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

              {/* Demais seções */}
              {SECOES.map((s) => (
                <SecaoBox
                  key={s.id}
                  titulo={s.titulo}
                  aberto={painel === s.id}
                  onToggle={() => setPainel(painel === s.id ? null : s.id)}
                >
                  <div className="grid grid-cols-2 gap-3 p-1">
                    {s.features.map((fid) => (
                      <FeatureTile key={fid} id={fid} ativo={state.features.has(fid)} onClick={() => toggleFeature(fid)} />
                    ))}
                  </div>
                </SecaoBox>
              ))}
            </div>

            {/* Rodapé estilo EqualWeb */}
            <div className="border-t px-4 py-2 text-center text-xs text-muted-foreground bg-muted/30">
              Desligar &nbsp;·&nbsp; Enviar Feedback
            </div>
          </div>
        )}
      </div>

      {/* Popup de ocultação */}
      {popupAberto && (
        <PopupOcultar
          onConfirmar={handleOcultar}
          onCancelar={() => setPopupAberto(false)}
        />
      )}

      <EstruturaPaginaDialog open={estruturaAberta} onOpenChange={setEstruturaAberta} />
    </>
  );
}
