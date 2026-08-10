# Feature: Importação de Turmas

> Parte do módulo de importação em lote do Seshat

## Objetivo

Importar turmas em lote via CSV, vinculando-as a cursos e turnos existentes.

## Endpoint

`POST /api/import/turmas`

Permissão exigida: `import:execute`

## Template CSV

```csv
sigla,descricao,cursoNome,turnoNome,ano,semestre
INF1A,Informática 1º Ano A,Técnico em Informática,Manhã,2025,1
INF1B,Informática 1º Ano B,Técnico em Informática,Tarde,2025,1
ADM2A,Administração 2º Ano A,Técnico em Administração,Manhã,2025,2
```

## Regras de Negócio

- Campos obrigatórios: `sigla`, `cursoNome`, `turnoNome`
- Campos opcionais: `descricao` (padrão: valor de `sigla`), `ano` (integer), `semestre` (1 ou 2)
- Suporte a variantes: `cursoNome`/`curso`/`Curso`, `turnoNome`/`turno`/`Turno`, `ano`/`Ano`, `semestre`/`Semestre`
- Lookup de `cursoId` e `turnoId` por nome (case-insensitive)
- Upsert por `sigla` + `cursoId` (índice único `uq_turmas_sigla_curso`); `onConflictDoNothing`
- `ano` e `semestre` são campos nullable no banco

## Casos de Teste

- POST sem auth → 401
- POST sem permissão → 403
- POST com linha válida (sem ano/semestre) → `{ imported: 1, errors: [] }`
- POST com ano e semestre → persistidos corretamente
- POST com `cursoNome` inexistente → erro na linha
- POST com `turnoNome` inexistente → erro na linha
- POST com turma duplicada → `onConflictDoNothing`, sem erro
- Auditoria registrada ao final
