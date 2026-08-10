# Skill: Import Turmas

Feature de importação em lote de turmas no Seshat.

## Endpoint

`POST /api/import/turmas` — permissão `import:execute`

## Template CSV

```csv
sigla,descricao,cursoNome,turnoNome,ano,semestre
INF1A,Informática 1º Ano A,Técnico em Informática,Manhã,2025,1
```

## Arquivos-chave

- Rota: `artifacts/api-server/src/routes/import.ts` (handler `POST /turmas`)
- Frontend: `artifacts/seshat/src/pages/importar/index.tsx` (card "4. Importar Turmas")
- Schema: `lib/db/src/schema/turmas.ts`
- Spec: `.specs/features/import-turmas.md`

## Regras

- Upsert por `sigla` + `cursoId` (índice `uq_turmas_sigla_curso`) — `onConflictDoNothing`
- Campos `ano` (integer) e `semestre` (smallint 1 ou 2) são nullable
- Variantes aceitas: `cursoNome`/`curso`/`Curso`, `turnoNome`/`turno`/`Turno`, `ano`/`Ano`, `semestre`/`Semestre`

## Dependências

Cursos e turnos devem existir antes de importar turmas.

## Casos de Uso Comuns

- Importar turmas de múltiplos anos: incluir colunas `ano` e `semestre` no CSV
- Turma duplicada (mesma sigla + curso): silenciosamente ignorada por `onConflictDoNothing`
- Adicionar campo `ativo`: está no schema turmas, basta incluir no handler
