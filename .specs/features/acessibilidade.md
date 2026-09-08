# Feature: Menu de Acessibilidade

> Status: implementado ✅

## Objetivo

Permitir que qualquer usuário personalize a experiência visual e de navegação do sistema, incluindo perfis pré-configurados para deficiências específicas. Cobre a LBI (Lei 13.146/2015) e segue WCAG 2.1 AA.

---

## Arquitetura

O sistema opera em três camadas independentes:

| Camada | Componente | Mecanismo |
|---|---|---|
| Menu de acessibilidade | `acessibilidade.tsx` (Dialog) | Gerencia `Set<FeatureId>`, aplica classes no `<html>`, persiste em `localStorage` |
| Widget flutuante (login) | `acessibilidade-widget.tsx` | Mesma lógica, UI drawer fixo no canto inferior esquerdo — somente na tela de login |
| Controle de fonte | `controle-fonte.tsx` | Manipula `document.documentElement.style.fontSize` (80%–160%, passo 10%) |
| Audiodescrição | `audio-descricao.tsx` | Web Speech API lendo o conteúdo da `<main>` |

---

## Acesso ao menu

- **Desktop e mobile**: botão de acessibilidade no header do app autenticado (sempre visível)
- **Login**: widget flutuante fixo no canto inferior esquerdo
- **Skip link**: injetado no topo do DOM quando a feature `leitor-tela` está ativa — `<a href="#conteudo-principal">` com classe `.a11y-skip-link` (aparece ao receber foco com Tab)
- **`<main id="conteudo-principal">`**: destino do skip link — definido em `layout.tsx`

---

## Features (23 total)

### Seção: Ajuste de voz e navegação

| Feature ID | Classe HTML | O que faz |
|---|---|---|
| `leitor-tela` | `a11y-screen-reader` | Injeta skip link no DOM; reforça outline de foco (azul); compatível com NVDA/JAWS/VoiceOver |
| `estrutura-pagina` | _(nenhuma)_ | Abre Dialog com lista de marcos, cabeçalhos e links da página |
| `navegacao-teclado` | `a11y-keyboard-nav` | Destaca foco com outline amarelo + glow em todos os elementos interativos |
| `cursor-grande` | `a11y-cursor-large` | Substitui cursor por SVG 48×48px |
| `pausar-animacoes` | `a11y-pause-animations` | `animation:none; transition:none; scroll-behavior:auto` em tudo |

### Seção: Ajuste de Cor — grupo exclusivo `visual`

> Todas as opções de cor são mutuamente exclusivas (grupo `visual`). Ativar uma desativa as demais.

| Feature ID | Classe HTML | Mecanismo | Comportamento |
|---|---|---|---|
| `alto-contraste` | `a11y-high-contrast` | Sobrescrita de variáveis CSS `:root` (preto + amarelo) | **Não usa `filter`** — não quebra `position:fixed` |
| `contraste-invertido` | `a11y-invert` | `filter: invert(1) hue-rotate(180deg)` no `body` | Imagens re-invertidas; dialogs Radix (portals) não são filtrados |
| `tons-cinza` | `a11y-grayscale` | `filter: grayscale(1)` no `body` | — |
| `modo-escuro` | `dark` | Variáveis CSS do tema escuro (já existente) | — |
| `modo-claro` | `a11y-light` | `color-scheme: light` | — |
| `saturacao-baixa` | `a11y-low-saturation` | `filter: saturate(0.5)` no `body` | — |
| `saturacao-alta` | `a11y-high-saturation` | `filter: saturate(1.8)` no `body` | — |
| `filtro-daltonismo` | `a11y-colorblind` | `filter: feColorMatrix` (deuteranopia) no `body` | Corrige deuteranopia (deficiência no verde) |

### Seção: Ajuste de Conteúdo

| Feature ID | Classe HTML | O que faz |
|---|---|---|
| `texto-maior` | `a11y-text-larger` | `font-size: 120%` no `html` |
| `espacamento-texto` | `a11y-letter-spacing` | `letter-spacing: 0.08em; word-spacing: 0.16em` em todos |
| `altura-linha` | `a11y-line-height` | `line-height: 2` em todos |
| `fonte-legivel` | `a11y-readable-font` | `font-family: Verdana, Tahoma, Arial` em todos |
| `destacar-links` | `a11y-highlight-links` | Sublinha + fundo amarelo em todos os `<a>` |
| `destacar-titulos` | `a11y-highlight-headings` | Outline em h1–h6 |
| `ocultar-imagens` | `a11y-hide-images` | `display: none` em img, picture, video, svg (exceto `[data-a11y-keep]`) |
| `guia-leitura` | _(nenhuma)_ | JS: linha amarela fixada que acompanha mouse, foco de teclado e toque |
| `mascara-leitura` | _(nenhuma)_ | JS: dois overlays escuros que isolam a linha atual (mouse + foco + toque) |
| `tooltips` | `a11y-show-titles` | `::after` com `attr(title)` em elementos com `[title]` ao hover |

---

## Perfis pré-configurados (10)

| Perfil | Features ativadas |
|---|---|
| Pessoa cega | `leitor-tela`, `navegacao-teclado`, `estrutura-pagina`, `pausar-animacoes` |
| Pessoa com deficiência motora | `navegacao-teclado`, `cursor-grande`, `pausar-animacoes` |
| Pessoa com daltonismo | `filtro-daltonismo` |
| Pessoa com baixa visão | `texto-maior`, `alto-contraste`, `cursor-grande`, `destacar-titulos` |
| Pessoa com epilepsia | `pausar-animacoes`, `saturacao-baixa` |
| Pessoa com TDAH | `mascara-leitura`, `pausar-animacoes`, `fonte-legivel` |
| Pessoa em alfabetização | `fonte-legivel`, `destacar-links`, `texto-maior`, `guia-leitura` |
| Pessoa na terceira idade | `texto-maior`, `alto-contraste`, `destacar-links`, `cursor-grande` |
| Pessoa com dislexia | `fonte-legivel`, `espacamento-texto`, `altura-linha`, `guia-leitura` |
| Compatibilidade WCAG | `alto-contraste`, `destacar-links`, `navegacao-teclado`, `pausar-animacoes`, `fonte-legivel` |

---

## Persistência

Chave `localStorage`: `carometro:a11y`
```json
{ "features": ["navegacao-teclado", "texto-maior"], "profile": "dislexia" }
```
Restaurado e aplicado no `useEffect` de montagem do componente.

---

## Decisões técnicas

### `alto-contraste` usa variáveis CSS, não `filter`
`filter: contrast()` no `<html>` cria um stacking context que prende `position: fixed` (sidebar, modais, dropdowns) dentro dele, quebrando o layout. A sobrescrita de variáveis CSS não tem esse efeito colateral.

### Filtros de cor aplicados no `body`, não no `html`
`filter` no `html` afeta elementos `position: fixed` — mesmo problema do alto contraste. No `body`, o conteúdo principal é filtrado corretamente; portals Radix (dialogs, tooltips) ficam fora do filtro por serem montados diretamente no `body` como filhos do body, porém a semântica é aceitável.

### `leitor-tela` não oculta `aria-hidden`
A implementação anterior `[aria-hidden="true"] { display: none }` escondia ícones decorativos (legítimos como `aria-hidden`) quebrando o layout. Leitores de tela (NVDA, JAWS) já ignoram `aria-hidden` nativamente — ocultar visualmente não os beneficia e danifica a UI para todos. A implementação correta é skip link + reforço de foco.

### `ocultar-imagens` usa `display: none`, não `visibility: hidden`
`visibility: hidden` preserva o espaço visual deixando lacunas em branco. `display: none` colapsa o espaço, que é o comportamento esperado.

### SVGs com `[data-a11y-keep]` não são ocultados
Ícones de interface que não são decorativos podem receber `data-a11y-keep` para não serem ocultados quando `ocultar-imagens` está ativo.

### `guia-leitura` e `mascara-leitura` respondem a mouse, teclado e toque
Adicionados listeners `focusin` e `touchmove` além do `mousemove` para funcionar com teclado e touchscreen.

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `artifacts/seshat/src/lib/acessibilidade.ts` | Definição de features, perfis, seções; lógica de toggle, persistência, skip link |
| `artifacts/seshat/src/components/acessibilidade.tsx` | Dialog do menu (app autenticado), hooks de guia/máscara |
| `artifacts/seshat/src/components/acessibilidade-widget.tsx` | Widget flutuante (login) |
| `artifacts/seshat/src/components/acessibilidade-estrutura.tsx` | Dialog de estrutura da página |
| `artifacts/seshat/src/components/controle-fonte.tsx` | Widget A+/A− independente |
| `artifacts/seshat/src/components/audio-descricao.tsx` | Audiodescrição via Web Speech API |
| `artifacts/seshat/src/index.css` | Todas as classes `a11y-*` + `.a11y-skip-link` |
| `artifacts/seshat/src/components/layout.tsx` | `<main id="conteudo-principal">` + botão de acessibilidade no header |
