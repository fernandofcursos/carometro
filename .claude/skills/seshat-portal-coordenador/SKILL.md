# Skill: Portal do Coordenador

## Contexto

Portal de autoatendimento para coordenadores de curso no Seshat.

## Arquivos

- **API**: `artifacts/api-server/src/routes/portal-coordenador.ts`
- **Frontend**: `artifacts/seshat/src/pages/portal-coordenador/index.tsx`
- **Spec**: `.specs/features/portal-coordenador.md`

## Endpoints

Todos em `/api/portal-coordenador`, protegidos por `requireAuth`.

- `GET /me` — perfil + cursos coordenados. `fotoUrl` construída como `/api/fotos/${usuarioId}` **somente se `usuario.fotoId` for truthy**, caso contrário retorna `null`
- `GET /dashboard` — stats + ocorrências recentes (`.limit(10)`) + avisos (`.limit(10)`, UI renderiza no máximo 5). `ocorrenciasSemana` filtra por `dataOcorrencia >= (hoje - 7 dias)` usando comparação de string de data (`YYYY-MM-DD`). Avisos filtrados por `autorId = usuarioId`
- `GET /ocorrencias` — todas as ocorrências dos estudantes nos cursos coordenados
- `POST /ocorrencias/:id/ciente` — marcar ciente
- `GET /avisos` — listar avisos do coordenador (filtro `autorId = usuarioId`); retorna `[]` (200) se `avisosTable` for `null`/`undefined` após import; retorna 500 se o próprio módulo falhar ao importar
- `POST /avisos` — criar aviso; retorna 503 `"Funcionalidade de avisos não disponível ainda."` se `avisosTable` não existir
- `PUT /avisos/:id` — editar aviso; 403 `"Sem permissão para editar este aviso."` se não for autor; 503 `"Funcionalidade de avisos não disponível ainda."` se tabela ausente
- `DELETE /avisos/:id` — soft-delete; 403 `"Sem permissão."` se não for autor; 503 `"Funcionalidade de avisos não disponível ainda."` se tabela ausente

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
│   └── PerfilTab — dados do coordenador (avatar por inicial, fotoUrl retornada pela API não é renderizada na UI)
```

Query keys: `["coor-me"]`, `["coor-dashboard"]`, `["coor-ocorrencias"]`, `["coor-avisos"]`. O `cienteMut.onSuccess` invalida tanto `["coor-ocorrencias"]` quanto `["coor-dashboard"]` para manter contadores sincronizados.

## Menu

Role `coordenador` (ou admin) vê o grupo. Gradiente `from-blue-600 to-indigo-700`.
