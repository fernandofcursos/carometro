# Feature: Importação de Disciplinas

> Parte do módulo de importação em lote do Seshat

## Objetivo

Importar disciplinas e suas ofertas (vínculo disciplina + curso + turno) em lote via CSV.

## Endpoint

`POST /api/import/disciplinas`

Permissão exigida: `import:execute`

## Template CSV

```csv
nome,cursoNome,turnoNome,ativo
Programação Web,Técnico em Informática,Manhã,true
Banco de Dados,Técnico em Informática,Manhã,true
Contabilidade,Técnico em Administração,Tarde,true
```

## Regras de Negócio

- Campos obrigatórios: `nome`, `cursoNome`, `turnoNome`
- Campo opcional: `ativo` (padrão: `true`)
- Pré-requisito: cursos e turnos devem existir previamente
- Lógica de importação por linha:
  1. Upsert `disciplina` por `nome` (`onConflictDoNothing`, depois select)
  2. Lookup `cursoId` por `cursoNome` (case-insensitive); erro se não encontrado
  3. Lookup `turnoId` por `turnoNome` (case-insensitive); erro se não encontrado
  4. Upsert em `disciplina_ofertas` pelo índice único `uq_disciplina_oferta` (disciplinaId, cursoId, turnoId)
- Retorna `{ imported, errors }`

## Casos de Teste

- POST sem auth → 401
- POST sem permissão → 403
- POST com linha válida → `{ imported: 1, errors: [] }`
- POST com `cursoNome` inexistente → erro na linha: `"<nome>": curso "<x>" não encontrado`
- POST com `turnoNome` inexistente → erro na linha: `"<nome>": turno "<x>" não encontrado`
- POST com disciplina + oferta já existente → `onConflictDoNothing`, importado sem erro
- Auditoria registrada ao final
