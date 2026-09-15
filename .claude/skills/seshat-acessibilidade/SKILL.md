---
description: Menu de acessibilidade do Seshat — features, perfis, CSS, regras e bugs conhecidos
---

# Skill: Menu de Acessibilidade — Seshat

## Arquivos-chave

| Arquivo | Papel |
|---|---|
| `src/lib/acessibilidade.ts` | Fonte da verdade: `FEATURES`, `PROFILES`, `SECOES`, `aplicar()`, `alternarFeature()`, skip link |
| `src/components/acessibilidade.tsx` | Dialog do menu + hooks `useGuiaLeitura`, `useMascaraLeitura` |
| `src/components/acessibilidade-widget.tsx` | Widget flutuante (somente login) |
| `src/components/acessibilidade-estrutura.tsx` | Dialog de estrutura da página |
| `src/components/layout.tsx` | `<main id="conteudo-principal">` + botão no header (visível em mobile e desktop) |
| `src/index.css` | Classes `a11y-*` + `.a11y-skip-link` |

---

## Regra de grupos de exclusão mútua

Todas as features de cor pertencem ao grupo `visual` — ativar qualquer uma desativa as demais.
`alternarFeature()` em `acessibilidade.ts` remove automaticamente todas do mesmo grupo antes de adicionar a nova.

| Grupo | Features |
|---|---|
| `visual` | `alto-contraste`, `contraste-invertido`, `tons-cinza`, `modo-escuro`, `modo-claro`, `saturacao-baixa`, `saturacao-alta` |
| _(sem grupo)_ | todas as demais — podem ser combinadas livremente |

---

## Regras críticas de implementação

### ❌ NÃO aplicar `filter` no `<html>`
`filter` em `html` cria stacking context que prende `position:fixed` (sidebar, header, dialogs Radix) dentro dele, quebrando o layout. Regra:

- **`alto-contraste`**: sobrescrita de variáveis CSS `:root` — sem filter, sem stacking context
- **Demais filtros** (`invert`, `grayscale`, `saturate`, `colorblind`): aplicados no `body` — elementos portados pelo Radix ficam fora do filtro (aceitável)

### ❌ NÃO usar `visibility:hidden` em `ocultar-imagens`
`visibility:hidden` preserva espaço visual deixando lacunas. Usar `display:none`.

### ❌ NÃO ocultar `[aria-hidden="true"]` para leitor de tela
A regra anterior `[aria-hidden="true"] { display:none }` escondia ícones decorativos (legítimos como `aria-hidden`) quebrando o layout. Leitores de tela já ignoram `aria-hidden` nativamente. A abordagem correta é:
1. Skip link injetado no DOM por `aplicar()` quando `leitor-tela` ativo
2. Reforço de outline de foco via `a11y-screen-reader`

### ❌ NÃO remover `aria-describedby` do Dialog
O `<DialogContent>` não deve ter `aria-describedby={undefined}` explícito — o Radix conecta automaticamente o `<DialogDescription>` ao dialog para leitores de tela anunciarem a descrição.

---

## Skip link

Quando `leitor-tela` é ativado, `aplicar()` injeta:
```html
<a id="a11y-skip-to-main" href="#conteudo-principal" class="a11y-skip-link">
  Ir para o conteúdo principal
</a>
```
- Visível apenas quando recebe foco (Tab) — aparece no topo da página
- O destino é `<main id="conteudo-principal">` em `layout.tsx`
- Removido do DOM quando `leitor-tela` é desativado

---

## `alto-contraste` — variáveis CSS

Sobrescreve as variáveis HSL do `:root` para um tema preto/amarelo de alto contraste real (razão de contraste > 7:1, WCAG AAA):

```css
html.a11y-high-contrast {
  --background: 0 0% 0%;       /* preto */
  --foreground: 60 100% 50%;   /* amarelo */
  --primary: 60 100% 50%;
  --primary-foreground: 0 0% 0%;
  /* + sidebar, card, popover, border, etc. */
  color-scheme: dark;
}
```

---

## `guia-leitura` e `mascara-leitura`

Ambos respondem a **três tipos de input**:
- `mousemove` — posição do cursor
- `focusin` — posição do elemento focado por teclado (Tab)
- `touchmove` — posição do toque (passivo)

Linha da guia aparece em `top: -9999px` inicialmente e só se move após o primeiro evento.

---

## `ocultar-imagens` — exceção `data-a11y-keep`

Ícones de interface que não devem ser ocultados recebem o atributo:
```tsx
<svg data-a11y-keep ... />
```
O CSS exclui `svg[data-a11y-keep]` da regra `display:none`.

---

## Controle de fonte (separado)

`controle-fonte.tsx` manipula `document.documentElement.style.fontSize` diretamente (inline style). Por ter especificidade maior que qualquer classe CSS, **sobrepõe** a feature `texto-maior` (`a11y-text-larger { font-size: 120% }`). Se o usuário usar `ControleFonte`, a feature `texto-maior` não terá efeito visual (comportamento esperado — o tamanho inline prevalece).

---

## Acessibilidade do próprio menu

- `FeatureTile`: `aria-pressed={ativo}`, `title={descricao}` (aparece no hover como tooltip)
- `SecaoBox`: `aria-expanded={aberto}` no botão
- `OnOffToggle`: `aria-pressed` e `aria-label` em ambos os botões (ON/OFF)
- `DialogDescription className="sr-only"`: lida pelos leitores de tela ao abrir o dialog
- Botão no header: `aria-label="Abrir menu de acessibilidade"`

---

## Perfil "Pessoa cega" — o que NÃO fazer

O perfil `cega` ativa `leitor-tela` + `navegacao-teclado` + `estrutura-pagina` + `pausar-animacoes`.

**Não incluir** `alto-contraste` ou filtros visuais no perfil cega — pessoas cegas usam leitores de tela e não se beneficiam de ajustes visuais; incluí-los desnecessariamente pode degradar a performance da página.
