# Skill: Portal do Coordenador

## Contexto

Portal de autoatendimento para coordenadores de curso no Seshat.

## Arquivos

- **API**: `artifacts/api-server/src/routes/portal-coordenador.ts`
- **Frontend**: `artifacts/seshat/src/pages/portal-coordenador/index.tsx`
- **Spec**: `.specs/features/portal-coordenador.md`

## Endpoints

Todos em `/api/portal-coordenador`, protegidos por `requireAuth`.

- `GET /me` — perfil + cursos coordenados. `fotoUrl` construída como `/api/fotos/${usuarioId}` (usa o ID do usuário logado, não o `fotoId`)
- `GET /dashboard` — stats + ocorrências recentes + avisos. `ocorrenciasSemana` filtra por `dataOcorrencia >= (hoje - 7 dias)` usando comparação de string de data (`YYYY-MM-DD`)
- `GET /ocorrencias` — todas as ocorrências dos estudantes nos cursos coordenados
- `POST /ocorrencias/:id/ciente` — marcar ciente
- `GET /avisos` — listar avisos do coordenador; retorna `[]` (200) se `avisosTable` não existir
- `POST /avisos` — criar aviso; retorna 503 se `avisosTable` não existir
- `PUT /avisos/:id` — editar aviso; 403 `"Sem permissão para editar este aviso."` se não for autor; 503 se tabela ausente
- `DELETE /avisos/:id` — soft-delete; 403 `"Sem permissão."` se não for autor; 503 se tabela ausente

## Tabela de vínculo

`coordenador_cursos` com campos `usuarioId` e `cursoId`. Importar via `@workspace/db/schema` com try/catch pois pode não existir.

## Padrões de Query

- **Filtragem por curso**: as queries de ocorrências e estudantes pré-computam `cursoIds` a partir de `coordenador_cursos`, depois filtram `estudanteIds` via `turmas → matriculas → estudantes`, e por fim filtram `ocorrencias` com `inArray(estudanteId, estudanteIds)`. **Não existe JOIN direto** entre `ocorrencias` e `coordenador_cursos`.
- Stats de estudantes: `matriculas.ativo = true AND matriculas.deletadoEm IS NULL` com turmas dos cursos coordenados
- Avisos: mesmo schema do professor (`titulo`, `conteudo`, `tipo`, `publicoAlvo`, `turmaId?`, `publicado`)
- `cienteEm` (timestamp) e `cientePorId` (uuid) nas ocorrências
- Frontend usa React Query v5 (sem `onSuccess` em `useQuery`)

## Estrutura da Página (Frontend)

```
PortalCoordenadorPage (/portal-coordenador)
├── Tabs: Dashboard | Ocorrências | Avisos | Perfil
│   ├── Dashboard — stats (Estudantes, Turmas, Ocorrências) + ocorrências recentes
│   │   ├── AvisosWidget (perfil="coordenador", limite=5)
│   │   └── CardapioWidget
│   ├── OcorrenciasTab — lista completa das ocorrências dos cursos coordenados
│   ├── AvisosTab — CRUD de avisos do coordenador
│   └── PerfilTab — dados do coordenador
```

## Menu

Role `coordenador` (ou admin) vê o grupo. Gradiente `from-blue-600 to-indigo-700`.
