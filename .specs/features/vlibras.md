# Feature: VLibras — Acessibilidade LIBRAS

> Status: implementado ✅

## Objetivo

Disponibilizar o plugin VLibras para tradução de conteúdo em LIBRAS (Língua Brasileira de Sinais), conforme exigência da Lei Brasileira de Inclusão (LBI — Lei 13.146/2015).

## Implementação

O widget é integrado diretamente no `artifacts/seshat/index.html` — não é um componente React. Funciona de forma independente sobre o HTML da página.

### Requisitos técnicos

| Item | Valor |
|---|---|
| CDN oficial | `https://vlibras.gov.br/app/vlibras-plugin.js` |
| URL do widget | `https://vlibras.gov.br/app` |
| Carregamento | Script síncrono, ao final do `<body>`, SEM `defer` |
| Inicialização | `new window.VLibras.Widget(url)` imediatamente após o script |

### Estrutura HTML obrigatória

```html
<!-- Antes de #root — atributos vw são detectados pelo plugin na init -->
<div vw class="enabled">
  <div vw-access-button class="active"></div>
  <div vw-plugin-wrapper>
    <div class="vw-plugin-top-wrapper"></div>
  </div>
</div>

<div id="root"></div>

<script type="module" src="/src/main.tsx"></script>
<script src="https://vlibras.gov.br/app/vlibras-plugin.js"></script>
<script>
  try {
    new window.VLibras.Widget("https://vlibras.gov.br/app");
  } catch (e) {
    console.warn("VLibras: falha ao inicializar", e);
  }
</script>
```

## Decisões de implementação

### Por que não usar jsDelivr/GitHub mirror?

O mirror `cdn.jsdelivr.net/gh/spbgovbr-vlibras/vlibras-portal@sgd/...` depende de um branch específico do GitHub que pode ser renomeado, removido ou ficar desatualizado sem aviso. A URL oficial `vlibras.gov.br` é mantida pelo próprio governo e é a referência estável.

### Por que sem `defer`?

O atributo `defer` adia a execução do script, mas ao combiná-lo com `window.addEventListener("load", ...)` para inicializar o widget, alguns browsers disparam o evento `load` antes de `window.VLibras` estar populado — resultando em widget invisível sem erros no console. O carregamento síncrono ao final do `<body>` garante que `window.VLibras.Widget` esteja disponível na linha imediatamente seguinte.

## Arquivo-chave

`artifacts/seshat/index.html`
