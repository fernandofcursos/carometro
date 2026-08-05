# Seshat

Sistema de foto-roster escolar com controle de ocorrências, autenticação por perfil e exportação de dados.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — rodar o servidor API (porta 5000/8080)
- `pnpm --filter @workspace/api-server run seed-admin [email]` — criar o primeiro administrador
- `pnpm run typecheck` — verificação de tipos em todos os pacotes
- `pnpm run build` — typecheck + build de todos os pacotes
- `pnpm --filter @workspace/api-spec run codegen` — regenerar hooks e schemas Zod a partir da spec OpenAPI
- `pnpm --filter @workspace/db run push` — aplicar mudanças de schema no banco (apenas dev)
- Required env: `DATABASE_URL`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Pino logging
- DB: PostgreSQL + Drizzle ORM
- Auth: JWT (httpOnly cookie, 8h), bcryptjs (12 rounds)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + TanStack Query + Tailwind CSS + shadcn/ui

## Where things live

- `lib/db/src/schema/` — source of truth for DB schema (Drizzle)
- `lib/api-spec/openapi.yaml` — source of truth for API contract
- `lib/api-zod/src/generated/` — Zod schemas gerados (não editar manualmente)
- `lib/api-client-react/src/generated/` — hooks React Query gerados (não editar manualmente)
- `artifacts/api-server/src/routes/` — rotas Express
- `artifacts/api-server/src/lib/` — utilitários (auth JWT, crypto AES, codegen)
- `artifacts/seshat/src/pages/` — páginas React
- `artifacts/seshat/src/contexts/auth.tsx` — contexto de autenticação

## Architecture decisions

- **Auth por código de acesso**: usuários fazem login com `codigoAcesso` (8 chars alfanumérico único) + senha, não e-mail. E-mail é armazenado criptografado (AES-256-CBC).
- **Primeiro acesso obrigatório**: usuários criados pelo admin têm `primeiroAcesso=true`; ao logar, são forçados a definir nova senha antes de usar o sistema.
- **JWT em cookie httpOnly**: token de 8h, assinado com `SESSION_SECRET`. `credentials: "include"` em todos os fetches do frontend.
- **Disciplinas N:M**: usuários têm disciplinas via `usuario_disciplinas`. Na tela de ocorrências, o usuário vê apenas suas próprias disciplinas; administradores veem todas.
- **Exportação por disciplina**: endpoint `/api/ocorrencias/export` aceita `disciplinaId` além de `estudanteId`, gerando XLSX filtrado.

## Product

- **Carômetro**: visualização em grade de fotos de estudantes por turma
- **Estudantes**: CRUD completo com foto (câmera ou upload), campo de observação livre (máx 300 chars)
- **Ocorrências**: registro vinculado a estudante + tipo + disciplina (opcional), exportação XLSX
- **Usuários**: autenticação JWT, perfis (administrador/gestor/soe/aee), código de acesso único, senha gerada uma vez
- **Disciplinas**: CRUD, atribuídas por usuário N:M
- **Importação CSV**: cursos, turmas e estudantes em lote

## User preferences

- Português do Brasil em toda a interface e código (labels, mensagens, comentários)
- shadcn/ui + Tailwind CSS; sem estilos inline desnecessários
- Express routes com inline Zod validation; sem controllers separados

## Gotchas

- Após mudança de schema: `pnpm --filter @workspace/db run push` → `pnpm --filter @workspace/api-spec run codegen`
- Rotas de import: rows vêm como `{ data: Record<string, unknown> }` — acessar via `row.data.fieldName`
- `BASE = import.meta.env.BASE_URL.replace(/\/$/, "")` para todos os fetches do frontend
- Não usar `pnpm dev` na raiz; usar workflows individualmente
- Para criar o primeiro administrador (sem UI): `pnpm --filter @workspace/api-server run seed-admin admin@email.com`

## Pointers

- Ver skill `pnpm-workspace` para estrutura do workspace, TypeScript e detalhes de pacotes
