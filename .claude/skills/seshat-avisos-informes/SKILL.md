# Skill: seshat-avisos-informes

Módulo de Avisos e Informes do Seshat.

## Rotas de API

- `GET /api/avisos-informes/tipos` — tipos ativos
- `GET /api/avisos-informes/avisos?mes=YYYY-MM` — avisos do mês
- `GET /api/avisos-informes/informes?mes=YYYY-MM` — informes do mês
- `POST/PUT /api/avisos-informes/avisos` / `informes` — criar/editar
- `DELETE /api/avisos-informes/avisos/:id` / `informes/:id` — excluir
- `GET /api/avisos-informes/feed?perfil=ROLE&limite=N` — feed para dashboards
- `POST/PUT/DELETE /api/avisos-informes/tipos/:id` — CRUD de tipos

## Arquivos principais

- `artifacts/seshat/src/components/avisos-widget.tsx` — widget de feed
- `artifacts/seshat/src/pages/avisos/index.tsx`
- `artifacts/seshat/src/pages/informes/index.tsx`
- `artifacts/seshat/src/pages/tipos-avisos/index.tsx`

## Spec completa

`.specs/features/avisos-informes.md`

## Permissão

`avisos:manage` — gestão; feed é lido por todos os usuários autenticados.

## Tipos especiais

`ehCardapio: true` — avisos exibidos em grade semanal (Seg–Sex) baseada em `dataInicio`.

## Perfis válidos para feed

`estudante`, `professor`, `coordenador`, `pai_responsavel`, `equipe_gestora`, `todos`
