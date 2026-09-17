# Skill: Portal da Equipe Gestora

## Localização dos arquivos

- **API**: `artifacts/api-server/src/routes/portal-gestora.ts`
- **Frontend**: `artifacts/seshat/src/pages/portal-gestora/index.tsx`
- **Spec**: `.specs/features/portal-gestora.md`

## Endpoints

- `GET /api/portal-gestora/me` — perfil do usuário logado
- `GET /api/portal-gestora/dashboard` — stats + ocorrências recentes + avisos
- `GET /api/portal-gestora/ocorrencias?offset=N` — lista paginada (limit 50)
- `GET/POST/PUT/DELETE /api/portal-gestora/avisos[/:id]` — CRUD de avisos

## Padrões

- Auth: apenas `requireAuth`, sem `requirePermissao`
- Avisos: tabela pode não existir — sempre use `try/catch` com `import("@workspace/db/schema") as any`
- Frontend: React Query v5, sem `onSuccess` em `useQuery`, usar `useEffect` para side effects
- Busca de ocorrências: filtro local por nome do estudante
