# Skill: Portal do Coordenador

## Contexto

Portal de autoatendimento para coordenadores de curso no Seshat.

## Arquivos

- **API**: `artifacts/api-server/src/routes/portal-coordenador.ts`
- **Frontend**: `artifacts/seshat/src/pages/portal-coordenador/index.tsx`
- **Spec**: `.specs/features/portal-coordenador.md`

## Endpoints

Todos em `/api/portal-coordenador`, protegidos por `requireAuth`.

- `GET /me` — perfil + cursos coordenados
- `GET /dashboard` — stats + ocorrências recentes + avisos
- `GET /ocorrencias` — todas as ocorrências dos estudantes nos cursos coordenados
- `POST /ocorrencias/:id/ciente` — marcar ciente
- `GET /avisos` — listar avisos do coordenador
- `POST /avisos` — criar aviso
- `PUT /avisos/:id` — editar aviso (403 se não for autor)
- `DELETE /avisos/:id` — soft-delete (403 se não for autor)

## Tabela de vínculo

`coordenador_cursos` com campos `usuarioId` e `cursoId`. Importar via `@workspace/db/schema` com try/catch pois pode não existir.

## Padrões

- JOIN chain para ocorrências: `ocorrencias → estudantes → matriculas (ativo=true, deletadoEm IS NULL) → turmas → cursos → coordenador_cursos`
- Stats de estudantes: `matriculas.ativo = true AND matriculas.deletadoEm IS NULL` com turmas dos cursos coordenados
- Avisos: mesmo schema do professor (`titulo`, `conteudo`, `tipo`, `publicoAlvo`, `turmaId?`, `publicado`)
- `cienteEm` (timestamp) e `cientePorId` (uuid) nas ocorrências
- Frontend usa React Query v5 (sem `onSuccess` em `useQuery`)

## Menu

Role `coordenador` (ou admin) vê o grupo. Gradiente `from-blue-600 to-indigo-700`.
