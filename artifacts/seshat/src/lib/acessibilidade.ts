import {
  Ear,
  Map as MapIcon,
  Keyboard,
  MousePointer2,
  Pause,
  Contrast,
  Moon,
  Sun,
  Droplets,
  Palette,
  EyeOff,
  Type,
  AlignJustify,
  StretchHorizontal,
  Link as LinkIcon,
  Heading,
  ImageOff,
  ScanLine,
  BookOpen,
  Info,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";

export type FeatureId =
  | "leitor-tela"
  | "estrutura-pagina"
  | "navegacao-teclado"
  | "cursor-grande"
  | "pausar-animacoes"
  | "alto-contraste"
  | "contraste-invertido"
  | "tons-cinza"
  | "modo-escuro"
  | "modo-claro"
  | "saturacao-baixa"
  | "saturacao-alta"
  | "filtro-daltonismo"
  | "texto-maior"
  | "espacamento-texto"
  | "altura-linha"
  | "fonte-legivel"
  | "destacar-links"
  | "destacar-titulos"
  | "ocultar-imagens"
  | "guia-leitura"
  | "mascara-leitura"
  | "tooltips";

export type Feature = {
  id: FeatureId;
  titulo: string;
  descricao: string;
  icone: LucideIcon;
  /** CSS class added to <html>; null when it triggers an interactive component. */
  htmlClass: string | null;
  /** Mutually exclusive group; activating one deactivates the others. */
  grupo?: string;
};

export const FEATURES: Record<FeatureId, Feature> = {
  "leitor-tela": {
    id: "leitor-tela",
    titulo: "Leitor de tela",
    descricao: "Adiciona skip link e reforça indicadores de foco para compatibilidade com leitores de tela (NVDA, JAWS, VoiceOver).",
    icone: Ear,
    htmlClass: "a11y-screen-reader",
  },
  "estrutura-pagina": {
    id: "estrutura-pagina",
    titulo: "Estrutura da página",
    descricao: "Gere uma lista de marcos de página, cabeçalhos e links.",
    icone: MapIcon,
    htmlClass: null,
  },
  "navegacao-teclado": {
    id: "navegacao-teclado",
    titulo: "Navegação por teclado",
    descricao: "Destaca o foco do teclado em todos os elementos interativos.",
    icone: Keyboard,
    htmlClass: "a11y-keyboard-nav",
  },
  "cursor-grande": {
    id: "cursor-grande",
    titulo: "Cursor grande",
    descricao: "Aumenta o tamanho do cursor do mouse.",
    icone: MousePointer2,
    htmlClass: "a11y-cursor-large",
  },
  "pausar-animacoes": {
    id: "pausar-animacoes",
    titulo: "Pausar animações",
    descricao: "Interrompe transições e animações da página.",
    icone: Pause,
    htmlClass: "a11y-pause-animations",
  },
  "alto-contraste": {
    id: "alto-contraste",
    titulo: "Alto contraste",
    descricao: "Tema preto e amarelo de alto contraste real — não usa filter, não quebra o layout.",
    icone: Contrast,
    htmlClass: "a11y-high-contrast",
    grupo: "visual",
  },
  "contraste-invertido": {
    id: "contraste-invertido",
    titulo: "Contraste invertido",
    descricao: "Inverte as cores da página.",
    icone: Palette,
    htmlClass: "a11y-invert",
    grupo: "visual",
  },
  "tons-cinza": {
    id: "tons-cinza",
    titulo: "Tons de cinza",
    descricao: "Remove todas as cores da página.",
    icone: Droplets,
    htmlClass: "a11y-grayscale",
    grupo: "visual",
  },
  "modo-escuro": {
    id: "modo-escuro",
    titulo: "Modo escuro",
    descricao: "Fundo escuro com texto claro.",
    icone: Moon,
    htmlClass: "dark",
    grupo: "visual",
  },
  "modo-claro": {
    id: "modo-claro",
    titulo: "Modo claro",
    descricao: "Fundo claro com texto escuro.",
    icone: Sun,
    htmlClass: "a11y-light",
    grupo: "visual",
  },
  "saturacao-baixa": {
    id: "saturacao-baixa",
    titulo: "Saturação baixa",
    descricao: "Reduz a intensidade das cores.",
    icone: Droplets,
    htmlClass: "a11y-low-saturation",
    grupo: "visual",
  },
  "saturacao-alta": {
    id: "saturacao-alta",
    titulo: "Saturação alta",
    descricao: "Aumenta a intensidade das cores.",
    icone: Droplets,
    htmlClass: "a11y-high-saturation",
    grupo: "visual",
  },
  "filtro-daltonismo": {
    id: "filtro-daltonismo",
    titulo: "Filtro deuteranopia",
    descricao: "Aplica filtro de correção para deuteranopia (deficiência em percepção do verde).",
    icone: Palette,
    htmlClass: "a11y-colorblind",
  },
  "texto-maior": {
    id: "texto-maior",
    titulo: "Texto maior",
    descricao: "Aumenta o tamanho geral do texto.",
    icone: ZoomIn,
    htmlClass: "a11y-text-larger",
  },
  "espacamento-texto": {
    id: "espacamento-texto",
    titulo: "Espaçamento de letras",
    descricao: "Aumenta o espaço entre letras e palavras.",
    icone: AlignJustify,
    htmlClass: "a11y-letter-spacing",
  },
  "altura-linha": {
    id: "altura-linha",
    titulo: "Altura das linhas",
    descricao: "Aumenta o espaço entre as linhas de texto.",
    icone: StretchHorizontal,
    htmlClass: "a11y-line-height",
  },
  "fonte-legivel": {
    id: "fonte-legivel",
    titulo: "Fonte legível",
    descricao: "Aplica fonte sem serifa fácil de ler.",
    icone: Type,
    htmlClass: "a11y-readable-font",
  },
  "destacar-links": {
    id: "destacar-links",
    titulo: "Destacar links",
    descricao: "Sublinha e destaca todos os links da página.",
    icone: LinkIcon,
    htmlClass: "a11y-highlight-links",
  },
  "destacar-titulos": {
    id: "destacar-titulos",
    titulo: "Destacar títulos",
    descricao: "Adiciona contorno em todos os títulos.",
    icone: Heading,
    htmlClass: "a11y-highlight-headings",
  },
  "ocultar-imagens": {
    id: "ocultar-imagens",
    titulo: "Ocultar imagens",
    descricao: "Esconde todas as imagens da página.",
    icone: ImageOff,
    htmlClass: "a11y-hide-images",
  },
  "guia-leitura": {
    id: "guia-leitura",
    titulo: "Guia de leitura",
    descricao: "Exibe uma linha horizontal que acompanha o cursor.",
    icone: ScanLine,
    htmlClass: null,
  },
  "mascara-leitura": {
    id: "mascara-leitura",
    titulo: "Máscara de leitura",
    descricao: "Escurece a tela e destaca apenas a linha do cursor.",
    icone: BookOpen,
    htmlClass: null,
  },
  tooltips: {
    id: "tooltips",
    titulo: "Mostrar descrições",
    descricao: "Exibe o atributo title de elementos como dica.",
    icone: Info,
    htmlClass: "a11y-show-titles",
  },
};

export type SecaoId = "voz" | "cor" | "conteudo";

export const SECOES: { id: SecaoId; titulo: string; features: FeatureId[] }[] = [
  {
    id: "voz",
    titulo: "Ajuste de voz e navegação",
    features: ["leitor-tela", "estrutura-pagina", "navegacao-teclado", "cursor-grande", "pausar-animacoes"],
  },
  {
    id: "cor",
    titulo: "Ajuste de Cor",
    features: [
      "alto-contraste",
      "contraste-invertido",
      "modo-escuro",
      "modo-claro",
      "tons-cinza",
      "saturacao-baixa",
      "saturacao-alta",
      "filtro-daltonismo",
    ],
  },
  {
    id: "conteudo",
    titulo: "Ajuste de Conteúdo",
    features: [
      "texto-maior",
      "espacamento-texto",
      "altura-linha",
      "fonte-legivel",
      "destacar-links",
      "destacar-titulos",
      "ocultar-imagens",
      "guia-leitura",
      "mascara-leitura",
      "tooltips",
    ],
  },
];

export type ProfileId =
  | "cega"
  | "motora"
  | "daltonismo"
  | "baixa-visao"
  | "epilepsia"
  | "tdah"
  | "alfabetizacao"
  | "terceira-idade"
  | "dislexia"
  | "wcag";

export type Profile = {
  id: ProfileId;
  titulo: string;
  features: FeatureId[];
};

export const PROFILES: Profile[] = [
  { id: "cega", titulo: "Pessoa cega", features: ["leitor-tela", "navegacao-teclado", "estrutura-pagina", "pausar-animacoes"] },
  { id: "motora", titulo: "Pessoa com deficiência motora", features: ["navegacao-teclado", "cursor-grande", "pausar-animacoes"] },
  { id: "daltonismo", titulo: "Pessoa com daltonismo", features: ["filtro-daltonismo"] },
  { id: "baixa-visao", titulo: "Pessoa com baixa visão", features: ["texto-maior", "alto-contraste", "cursor-grande", "destacar-titulos"] },
  { id: "epilepsia", titulo: "Pessoa com epilepsia", features: ["pausar-animacoes", "saturacao-baixa"] },
  { id: "tdah", titulo: "Pessoa com TDAH", features: ["mascara-leitura", "pausar-animacoes", "fonte-legivel"] },
  { id: "alfabetizacao", titulo: "Pessoa em alfabetização", features: ["fonte-legivel", "destacar-links", "texto-maior", "guia-leitura"] },
  { id: "terceira-idade", titulo: "Pessoa na terceira idade", features: ["texto-maior", "alto-contraste", "destacar-links", "cursor-grande"] },
  { id: "dislexia", titulo: "Pessoa com dislexia", features: ["fonte-legivel", "espacamento-texto", "altura-linha", "guia-leitura"] },
  { id: "wcag", titulo: "Torne o site compatível com WCAG", features: ["alto-contraste", "destacar-links", "navegacao-teclado", "pausar-animacoes", "fonte-legivel"] },
];

const STORAGE_KEY = "carometro:a11y";

export type A11yState = {
  features: Set<FeatureId>;
  profile: ProfileId | null;
};

export function carregar(): A11yState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { features: new Set(), profile: null };
    const parsed = JSON.parse(raw) as { features?: FeatureId[]; profile?: ProfileId | null };
    return {
      features: new Set(parsed.features ?? []),
      profile: parsed.profile ?? null,
    };
  } catch {
    return { features: new Set(), profile: null };
  }
}

export function salvar(state: A11yState) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ features: [...state.features], profile: state.profile }),
  );
}

const SKIP_LINK_ID = "a11y-skip-to-main";

function gerarSkipLink() {
  let link = document.getElementById(SKIP_LINK_ID) as HTMLAnchorElement | null;
  if (!link) {
    link = document.createElement("a");
    link.id = SKIP_LINK_ID;
    link.href = "#conteudo-principal";
    link.className = "a11y-skip-link";
    link.textContent = "Ir para o conteúdo principal";
    document.body.insertBefore(link, document.body.firstChild);
  }
}

function removerSkipLink() {
  document.getElementById(SKIP_LINK_ID)?.remove();
}

export function aplicar(state: A11yState) {
  const html = document.documentElement;
  const todasClasses = Object.values(FEATURES)
    .map((f) => f.htmlClass)
    .filter((c): c is string => !!c);
  for (const c of todasClasses) html.classList.remove(c);
  for (const id of state.features) {
    const cls = FEATURES[id].htmlClass;
    if (cls) html.classList.add(cls);
  }
  // Skip link: injetado no DOM quando leitor-tela está ativo
  if (state.features.has("leitor-tela")) {
    gerarSkipLink();
  } else {
    removerSkipLink();
  }
}

/** Returns the new feature set after toggling, respecting mutually exclusive groups. */
export function alternarFeature(features: Set<FeatureId>, id: FeatureId): Set<FeatureId> {
  const nova = new Set(features);
  if (nova.has(id)) {
    nova.delete(id);
    return nova;
  }
  const grupo = FEATURES[id].grupo;
  if (grupo) {
    for (const f of Object.values(FEATURES)) {
      if (f.grupo === grupo) nova.delete(f.id);
    }
  }
  nova.add(id);
  return nova;
}
