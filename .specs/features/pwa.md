# Feature: PWA — Progressive Web App

**Agente responsável:** Atlas + Hermes  
**Athena:** aprovado  
**Status:** Implementado ✅

## Objetivo

Permitir que o Carômetro seja instalado como aplicativo em qualquer dispositivo (desktop, tablet, celular Android/iOS) sem loja de aplicativos, mantendo comportamento nativo: ícone na tela inicial, tela cheia (sem barra do browser), carregamento instantâneo via cache.

## Requisitos

### Instalabilidade
- Web App Manifest completo: `name`, `short_name`, `icons`, `display: standalone`, `theme_color`, `start_url`
- Ícones obrigatórios: 192×192 (any), 512×512 (any), 512×512 (maskable)
- Service Worker registrado automaticamente via Workbox (Vite Plugin PWA)
- Prompt de instalação capturado e exibido via componente `<InstalarApp>`

### Layout Responsivo
- Breakpoints Tailwind: `sm` (640px), `md` (768px), `lg` (1024px)
- Menu lateral recolhível em mobile (drawer via Sheet do shadcn/ui)
- Grid de fotos (carômetro): colunas ajustadas por breakpoint (2 col mobile, 4 col tablet, 6+ desktop)
- Formulários com campos em coluna única em mobile, duas colunas em tablet+
- Botões de ação com tamanho mínimo de toque 44×44px (WCAG 2.5.5)

### Orientação
- `orientation: "portrait-primary"` no manifest — câmera e formulários preferem retrato
- Layout não deve quebrar em landscape

### Atualização Automática
- `registerType: "autoUpdate"` — Service Worker atualizado silenciosamente
- Cache de assets estáticos limpo ao atualizar (`cleanupOutdatedCaches: true`)

## Estratégias de Cache (Workbox)

| Rota | Estratégia | Cache | TTL |
|------|-----------|-------|-----|
| Assets estáticos (JS/CSS/HTML/imagens) | `CacheFirst` | `workbox-precache` | Versionado |
| `/api/(listas)` | `NetworkFirst` | `api-listas` | 24h / 60 entradas |
| `/api/auth/me` | `NetworkFirst` | `api-auth` | 8h / 1 entrada |
| `/api/estudantes/:id/foto` | `CacheFirst` | `fotos-estudantes` | 7 dias / 500 entradas |
| `/api/*` (demais) | Sem cache | — | — |
| Navegação SPA | `NetworkFirst` → fallback `/index.html` | — | — |

> Rotas `/api/` são excluídas do `navigateFallback` para não servir HTML em respostas de API.

## Componentes de Suporte

| Componente | Localização | Função |
|-----------|-------------|--------|
| `<InstalarApp>` | `components/instalar-app.tsx` | Captura `beforeinstallprompt`, exibe banner de instalação |
| `<StatusRede>` | `components/status-rede.tsx` | Indica online/offline com banner não intrusivo |
| `<ControleFonte>` | `components/controle-fonte.tsx` | Acessibilidade: aumentar/diminuir fonte |
| `<AudioDescricao>` | `components/audio-descricao.tsx` | Acessibilidade: leitura de tela |

## Arquivos de Infraestrutura PWA

```
artifacts/carometro/
├── public/
│   ├── favicon.svg
│   ├── icon-192.png         ← ícone padrão
│   ├── icon-512.png         ← ícone grande
│   ├── icon-maskable.png    ← ícone com safe zone (Android)
│   ├── manifest.json        ← gerado pelo Vite Plugin PWA
│   └── robots.txt
└── vite.config.ts           ← VitePWA configurado com workbox
```

## Casos de Teste

- [ ] App instalável no Chrome (desktop e Android)
- [ ] App instalável no Safari (iOS — via "Adicionar à tela de início")
- [ ] Ícone maskable exibido corretamente no Android
- [ ] `display: standalone` — sem barra de URL ao abrir pelo ícone
- [ ] Assets estáticos carregam offline após primeira visita
- [ ] Listas carregam do cache quando offline (máx 24h)
- [ ] Fotos carregam do cache quando offline (máx 7 dias)
- [ ] Service Worker atualiza silenciosamente em nova versão
- [ ] Layout responsivo em 375px (iPhone SE), 768px (iPad), 1280px (desktop)
- [ ] Botões de ação com área de toque ≥ 44×44px
