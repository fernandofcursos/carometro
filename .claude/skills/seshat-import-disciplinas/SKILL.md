# Skill: Import Disciplinas

Feature de importação em lote de disciplinas e suas ofertas no Seshat.

## Endpoint

`POST /api/import/disciplinas` — permissão `import:execute`

## Template CSV

```csv
nome,cursoNome,turnoNome,ativo
Programação Web,Técnico em Informática,Manhã,true
```

## Arquivos-chave

- Rota: `artifacts/api-server/src/routes/import.ts` (handler `POST /disciplinas`)
- Frontend: `artifacts/seshat/src/pages/importar/index.tsx` (card "2. Importar Disciplinas")
- Schema disciplinas: `lib/db/src/schema/disciplinas.ts`
- Schema ofertas: `lib/db/src/schema/disciplina-ofertas.ts`
- Spec: `.specs/features/import-disciplinas.md`

## Regras

1. Upsert disciplina por `nome` — `onConflictDoNothing`, depois select pelo nome
2. Lookup `cursoId` por `cursoNome` (case-insensitive)
3. Lookup `turnoId` por `turnoNome` (case-insensitive)
4. Upsert em `disciplina_ofertas` pelo índice `uq_disciplina_oferta` (disciplinaId, cursoId, turnoId)

## Dependências em Ordem

Cursos e turnos devem existir antes de importar disciplinas.

## Casos de Uso Comuns

- Erro "curso não encontrado": importar cursos primeiro via `POST /api/import/cursos`
- Erro "turno não encontrado": verificar se turno existe na tabela `turnos`
- Reativar oferta desativada: editar `ativo` no CSV — atualmente `onConflictDoNothing` não atualiza; seria preciso trocar por upsert com update
