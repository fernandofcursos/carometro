# Portal da Equipe Gestora

## Visão Geral

Portal de autoatendimento para membros da equipe gestora da escola. Oferece visibilidade completa de estudantes, turmas, professores e ocorrências.

## Acesso

- Role: `equipe_gestora`
- Admins também acessam (para teste/ajuste)
- URL: `/portal-gestora`

## API — `/api/portal-gestora`

Todos os endpoints requerem autenticação (`requireAuth`). Sem restrição por permissão — a equipe gestora tem visibilidade total.

| Método | Endpoint       | Descrição |
|--------|---------------|-----------|
| GET    | /me           | Dados do usuário logado |
| GET    | /dashboard    | Stats gerais + ocorrências recentes + avisos |
| GET    | /ocorrencias  | Todas as ocorrências ativas, paginadas (limit=50, ?offset) |
| GET    | /avisos       | Avisos criados pelo usuário logado |
| POST   | /avisos       | Criar aviso |
| PUT    | /avisos/:id   | Editar aviso (403 se não for o autor) |
| DELETE | /avisos/:id   | Soft-delete (403 se não for o autor) |

### Dashboard response

```json
{
  "stats": {
    "totalEstudantes": 120,
    "totalTurmas": 8,
    "totalProfessores": 15,
    "ocorrenciasHoje": 3,
    "ocorrenciasSemana": 12
  },
  "ocorrenciasRecentes": [...],
  "avisos": [...]
}
```

## Frontend

Arquivo: `artifacts/seshat/src/pages/portal-gestora/index.tsx`

### Tabs

1. **Dashboard** — 5 cards de estatísticas + ocorrências recentes + avisos recentes
2. **Ocorrências** — lista paginada com busca local por nome do estudante
3. **Avisos** — CRUD completo (criar, editar, excluir)
4. **Perfil** — dados do usuário logado

### Design

- Header com gradiente roxo (`from-purple-600 to-violet-700`)
- Grid de stats: 2 colunas mobile, 5 colunas desktop (`sm:grid-cols-5`)
- Badge de ciente/pendente nas ocorrências

## Menu

Adicionado em `layout.tsx` após o bloco do Portal do Professor e antes do Portal do Responsável.
