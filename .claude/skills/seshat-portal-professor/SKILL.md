# Skill: Portal do Professor

## Rota Base: `/api/portal-professor`

Todos os endpoints usam apenas `requireAuth` — sem `requirePermissao`. Todos os dados são filtrados por `req.usuarioId`.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/me` | Dados do professor + disciplinas vinculadas |
| GET | `/dashboard` | Quadro de horários por curso, cardápio, avisos |
| GET | `/ocorrencias` | Ocorrências registradas pelo professor |
| POST | `/ocorrencias` | Registrar ocorrência |
| PUT | `/ocorrencias/:id` | Editar ocorrência própria (403 se não for autor) |
| DELETE | `/ocorrencias/:id` | Soft-delete ocorrência própria |
| GET | `/avisos` | Listar avisos do professor |
| POST | `/avisos` | Criar aviso/informe |
| PUT | `/avisos/:id` | Editar aviso (403 se não for autor) |
| DELETE | `/avisos/:id` | Soft-delete aviso |

## Relação Professor ↔ Disciplinas

```
usuarios (professor)
  └─< usuario_disciplinas
         └── disciplina_oferta_id → disciplina_ofertas
                  ├── disciplina_id → disciplinas (nome, sigla)
                  ├── curso_id     → cursos
                  └── turno_id     → turnos
```

## Schema `avisos`

```typescript
// lib/db/src/schema/avisos.ts
avisosTable: {
  id, titulo (varchar 200), conteudo (text),
  tipo (varchar 20: 'aviso' | 'informe'),
  publicoAlvo (varchar 30: 'estudantes' | 'responsaveis' | 'todos'),
  turmaId (FK → turmas, nullable), autorId (FK → usuarios),
  publicado (boolean, default false),
  criadoEm, atualizadoEm, deletadoEm
}
```

## Dashboard Response Shape

```typescript
{
  hoje: string;                 // "YYYY-MM-DD"
  diaSemana: number;            // 0=dom … 6=sab
  horariosDisponiveis: boolean;
  horariosPorCurso: Array<{
    cursoId, cursoNome, turnoId, turnoNome,
    agenda: Array<{             // um por dia da semana (1-5)
      dia: number; diaNome: string;
      aulas: Array<{ horaInicio, horaFim, disciplinaNome, disciplinaSigla, turmaSigla, sala }>
    }>
  }>;
  cardapioDisponivel: boolean;
  cardapio: Array<{ dia, diaNome, data, itens: Array<{ refeicao, descricao }> }>;
  avisos: Array<{ id, titulo, conteudo, tipo, publicoAlvo, turmaSigla, criadoEm }>;
}
```

## Frontend

`artifacts/seshat/src/pages/portal-professor/index.tsx`

4 tabs:
- **Dashboard** — QuadroHorariosCurso por curso, avisos recentes, cardápio
- **Ocorrências** — lista + criar/editar/excluir via Dialog
- **Avisos** — lista + criar/editar/excluir via Dialog
- **Perfil** — dados do professor + disciplinas vinculadas agrupadas por curso

## Menu (layout.tsx)

```
Grupo: "Portal do Professor"   (isProfessor || isAdmin)
  icon: BookOpen, color: #16a34a
  └── "Meu Portal" → /portal-professor   (Home icon)
```

## Migração SQL

```
scripts/migrate-portal-professor.sql
```

Cria tabela `avisos` com o padrão `add_constraint_if_not_exists`.

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/avisos.ts` | Schema da tabela avisos |
| `artifacts/api-server/src/routes/portal-professor.ts` | Todos os endpoints |
| `artifacts/seshat/src/pages/portal-professor/index.tsx` | UI: 4 tabs |
| `artifacts/seshat/src/components/layout.tsx` | Menu "Portal do Professor" |
| `scripts/migrate-portal-professor.sql` | DDL: CREATE TABLE avisos |
| `.specs/features/portal-professor.md` | Spec completa |
