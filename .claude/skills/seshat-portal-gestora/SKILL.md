# Skill: Portal da Equipe Gestora

## Localização dos arquivos

- **API**: `artifacts/api-server/src/routes/portal-gestora.ts`
- **Frontend**: `artifacts/seshat/src/pages/portal-gestora/index.tsx`
- **Spec**: `.specs/features/portal-gestora.md`

## Endpoints

Todos em `/api/portal-gestora`, protegidos apenas por `requireAuth` (sem `requirePermissao`). Dados filtrados por `req.usuarioId`.

### GET /me
Retorna `{ id, nome, fotoId, fotoUrl }`.
- `fotoUrl` construída como `/api/fotos/${usuarioId}` (usa `usuarioId`, não `fotoId`); retorna `null` se `usuario.fotoId` for falsy.

### GET /dashboard
Retorna:
```typescript
{
  stats: {
    totalEstudantes: number; totalTurmas: number; totalProfessores: number;
    ocorrenciasHoje: number; ocorrenciasSemana: number;
  };
  ocorrenciasRecentes: Array<{ id, estudanteNome, tipoDescricao, dataOcorrencia, criadoEm }>;  // limit 10
  avisos: Array<{ id, titulo, tipo, publicoAlvo, turmaSigla, criadoEm }>;  // limit 10, todos os não-deletados (sem filtro por autorId)
}
```

### GET /ocorrencias?offset=N
Lista paginada de ocorrências (limit 50). Retorna:
```typescript
Array<{
  id, estudanteNome, tipoDescricao, disciplinaNome, dataOcorrencia,
  observacao, cienteEm, registradoPorNome, criadoEm
}>
```
Busca de ocorrências: filtro **local** por nome do estudante (frontend).

### GET /avisos
Retorna avisos do usuário logado (`autorId = usuarioId`), todos os não-deletados (incluindo rascunhos). Retorna `[]` (200) se `avisosTable` não existir (check `if (!avisosTable)`).

### POST /avisos
Body: `{ titulo (max 200), conteudo, tipo: "aviso"|"informe", publicoAlvo: "estudantes"|"responsaveis"|"todos", turmaId?: uuid|null, publicado?: boolean (default false) }`.
Retorna 201 em sucesso; 503 se `avisosTable` não existir.

### PUT /avisos/:id
Atualiza aviso. Retorna 403 se o aviso não pertencer ao usuário logado (`autorId ≠ usuarioId`); 404 se não encontrado; 503 se `avisosTable` não existir.

### DELETE /avisos/:id
Soft-delete. Retorna 403 se não for autor; 404 se não encontrado; 503 se `avisosTable` não existir.

## Padrão de import dinâmico para `avisosTable`

```typescript
// No início do handler — import dinâmico com try/catch:
let avisosTable: any;
try { ({ avisosTable } = await import("@workspace/db/schema") as any); } catch {}
if (!avisosTable) return res.json([]);   // GET: retorna [] se tabela ausente
// Para POST/PUT/DELETE: retorna 503 se !avisosTable
```

> **Distinção:** `GET /avisos` retorna `[]` (200) quando a tabela está ausente. `POST/PUT/DELETE` retornam 503.

## Estrutura da Página (Frontend)

```
PortalGestoraPage (/portal-gestora)
├── Tabs: Dashboard | Ocorrências | Avisos | Perfil
│   ├── DashboardTab — stats (Estudantes, Turmas, Professores, Ocorrências hoje/semana)
│   │   ├── AvisosWidget (perfil="equipe_gestora", limite=5)
│   │   └── CardapioWidget
│   ├── OcorrenciasTab — lista paginada + busca local por nome
│   ├── AvisosTab — CRUD de avisos (cria/edita/exclui via Dialog)
│   └── PerfilTab — dados da gestora (exibe `<img>` quando `fotoUrl` não é null; fallback: ícone `<User>`)
```

Query keys: `["gestora-me"]`, `["gestora-dashboard"]`, `["gestora-ocorrencias", offset]`, `["gestora-avisos"]`.

> **Atenção:** mutações em `AvisosTab` invalidam apenas `["gestora-avisos"]` — **não** invalidam `["gestora-dashboard"]`. O array `avisos` no dashboard pode ficar desatualizado após criar/editar/excluir um aviso.

## Menu

```
Grupo: "Portal Gestora"   (role com acesso)
└── /portal-gestora
```

## Padrões

- Auth: apenas `requireAuth`, sem `requirePermissao`
- Frontend: React Query v5, sem `onSuccess` em `useQuery`; `useEffect` para side effects (ex: acumulação de páginas na paginação de ocorrências)

## Arquivos-chave

| Arquivo | Responsabilidade |
|---------|-----------------|
| `artifacts/api-server/src/routes/portal-gestora.ts` | Todos os endpoints |
| `artifacts/seshat/src/pages/portal-gestora/index.tsx` | UI: 4 tabs |
| `.specs/features/portal-gestora.md` | Spec completa |
