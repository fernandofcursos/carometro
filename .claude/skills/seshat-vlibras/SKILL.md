---
description: Integração do VLibras (acessibilidade LIBRAS) no Seshat
---

# Skill: VLibras — Acessibilidade LIBRAS

## O que é

VLibras é o plugin oficial do governo brasileiro que traduz conteúdo web para LIBRAS (Língua Brasileira de Sinais) via avatar 3D. Exigido pela Lei Brasileira de Inclusão (LBI — Lei 13.146/2015) em sistemas de informação públicos.

## Onde está

Arquivo: `artifacts/seshat/index.html`

O widget é injetado **diretamente no HTML estático** — não é um componente React. O React monta sobre `#root`; o VLibras opera independentemente via DOM attributes.

## Implementação correta

```html
<!-- Estrutura obrigatória no <body>, ANTES de #root -->
<div vw class="enabled">
  <div vw-access-button class="active"></div>
  <div vw-plugin-wrapper>
    <div class="vw-plugin-top-wrapper"></div>
  </div>
</div>

<div id="root"></div>

<!-- Scripts no final do <body> — VLibras APÓS o módulo principal -->
<script type="module" src="/src/main.tsx"></script>

<!-- VLibras: CDN oficial gov.br — NÃO usar jsDelivr/GitHub mirror -->
<script src="https://vlibras.gov.br/app/vlibras-plugin.js"></script>
<script>
  try {
    new window.VLibras.Widget("https://vlibras.gov.br/app");
  } catch (e) {
    console.warn("VLibras: falha ao inicializar", e);
  }
</script>
```

## Regras críticas

| Regra | Motivo |
|---|---|
| **CDN: `https://vlibras.gov.br/app/vlibras-plugin.js`** | URL oficial e estável. jsDelivr/GitHub mirrors podem sair do ar ou mudar de branch sem aviso. |
| **Sem `defer` no script do plugin** | `defer` + inicialização em `load` causa falha silenciosa em alguns browsers — o widget não aparece. |
| **Inicializar imediatamente após o `<script>` do plugin** | O script síncrono popula `window.VLibras` antes da linha seguinte. Wrappers `addEventListener("load", ...)` são desnecessários e arriscados. |
| **`<div vw>` antes de `#root`** | O plugin do VLibras procura o atributo `vw` no DOM na inicialização; deve existir quando `new VLibras.Widget()` é chamado. |
| **Botão `.active`** | Sem a classe `active` em `vw-access-button`, o botão flutuante não aparece. |

## O que NÃO fazer

```html
<!-- ❌ CDN errado — branch @sgd pode sair do ar -->
<script src="https://cdn.jsdelivr.net/gh/spbgovbr-vlibras/vlibras-portal@sgd/app/vlibras-plugin.js" defer></script>

<!-- ❌ defer + load — widget não inicializa em alguns browsers -->
<script defer>
  window.addEventListener("load", function () {
    new window.VLibras.Widget("...");
  });
</script>
```

## Diagnóstico de falha

Se o botão VLibras não aparecer:

1. Abrir DevTools → Network → filtrar por `vlibras` → verificar se o script carregou (status 200).
2. Console → verificar aviso `"VLibras: falha ao inicializar"`.
3. Checar se `<div vw class="enabled">` existe no DOM antes de `#root`.
4. Checar se `window.VLibras` existe após o carregamento do script.
5. O plugin VLibras injeta CSS e elementos extras no `<body>` — inspecionar se os elementos `.vw-*` foram criados.

## Arquivo-chave

| Arquivo | Responsabilidade |
|---|---|
| `artifacts/seshat/index.html` | Toda a integração VLibras — HTML + scripts |
