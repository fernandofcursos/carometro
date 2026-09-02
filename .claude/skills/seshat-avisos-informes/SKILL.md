# Skill: seshat-avisos-informes

Módulo de Avisos e Informes do Seshat.

## Rotas de API

- `GET /api/avisos-informes/tipos` — tipos ativos
- `GET /api/avisos-informes/avisos?mes=YYYY-MM[&excluirCardapio=true]` — avisos do mês; com `excluirCardapio=true` omite os do tipo Cardápio. Retorna `tipoNome` e `tipoEhCardapio` via LEFT JOIN com tipos.
- `GET /api/avisos-informes/informes?mes=YYYY-MM` — informes do mês
- `POST/PUT /api/avisos-informes/avisos` / `informes` — criar/editar
- `DELETE /api/avisos-informes/avisos/:id` / `informes/:id` — excluir
- `GET /api/avisos-informes/feed?perfil=ROLE&limite=N` — feed para dashboards (exclui automaticamente avisos com `ehCardapio=true`)
- `POST/PUT/DELETE /api/avisos-informes/tipos/:id` — CRUD de tipos

## Regras de apresentação nos dashboards

- **Feed (AvisosWidget)** — nunca exibe avisos do tipo Cardápio (`ehCardapio=true`). O `/feed` já os filtra na API.
- **CardapioWidget** — exibe somente avisos do tipo Cardápio, em grade Seg–Sex. Presente em todos os dashboards abaixo do AvisosWidget.
- Os dois widgets são complementares e nunca duplicam conteúdo.

## Regras da página Avisos (gestão)

- **"Avisos do mês"** — lista apenas avisos com `ehCardapio=false`; a requisição passa `excluirCardapio=true`.
- **CardapioWidget (editavel)** — exibe e permite editar o cardápio semanal. Único local onde cardápio é gerenciado.
- As duas seções são complementares; cardápio nunca aparece na lista de avisos normais.

## Componentes reutilizáveis

- `artifacts/seshat/src/components/avisos-widget.tsx` — feed de avisos (sem cardápio)
- `artifacts/seshat/src/components/cardapio-widget.tsx` — grade semanal Seg–Sex
  - Props: `editavel?: boolean`, `onEdit?`, `onAdd?`, `onDelete?`, `className?`
  - `editavel=false` (padrão): leitura, sem ações — use nos dashboards
  - `editavel=true`: CRUD completo — use apenas na página Avisos
  - Busca própria: `GET /api/avisos-informes/avisos?mes=YYYY-MM`, filtra `tipoEhCardapio=true`
  - Navegação por semana; destaque laranja no dia atual; skeleton de loading

## Arquivos principais

- `artifacts/seshat/src/components/avisos-widget.tsx`
- `artifacts/seshat/src/components/cardapio-widget.tsx`
- `artifacts/seshat/src/pages/avisos/index.tsx`
- `artifacts/seshat/src/pages/informes/index.tsx`
- `artifacts/seshat/src/pages/tipos-avisos/index.tsx`
- `artifacts/api-server/src/routes/avisos-informes.ts`

## Spec completa

`.specs/features/avisos-informes.md`

## Permissão

`avisos:manage` — gestão; feed e cardapio-widget são lidos por todos os usuários autenticados.

## Tipos especiais

`ehCardapio: true` — avisos exibidos exclusivamente no CardapioWidget (grade semanal Seg–Sex baseada em `dataInicio`). Nunca aparecem no feed nem na lista de avisos normais.

## Perfis válidos para feed

`estudante`, `professor`, `coordenador`, `pai_responsavel`, `equipe_gestora`, `todos`
