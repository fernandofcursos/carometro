# Feature: Importação de Turmas

> Parte do módulo de importação em lote do Seshat

## Objetivo

Importar turmas em lote via CSV, com suporte a **múltiplos turnos por turma**.

## Endpoint

`POST /api/import/turmas`

Permissão exigida: `import:execute`

## Template CSV

```csv
sigla,descricao,cursoNome,turnoNomes,ano,semestre
INF1A,Informática 1º Ano A,Técnico em Informática,Manhã,2025,1
INF1B,Informática 1º Ano B,Técnico em Informática,Manhã|Tarde,2025,1
ADM2A,Administração 2º Ano A,Técnico em Administração,Tarde,2025,2
```

> **turnoNomes** aceita múltiplos turnos separados por `|` ou `,` (ex: `Manhã|Tarde`).

## Regras de Negócio

- Campos obrigatórios: `sigla`, `cursoNome`, `turnoNomes` (ao menos 1)
- Campo opcional: `descricao` (usa sigla se omitido), `ano`, `semestre`
- Lookup por nome de curso → erro de linha se não encontrado
- Lookup por nome de turno → erro de linha se não encontrado (turno inválido ignorado, demais mantidos)
- Upsert de turma por `(sigla, cursoId)` via `onConflictDoNothing`
- Turnos vinculados em `turma_turnos` com `onConflictDoNothing`

## Casos de Teste

- POST sem auth → 401
- POST sem permissão → 403
- POST com `turnoNomes = "Manhã|Tarde"` → turma com 2 turnos vinculados
- POST com curso inexistente → erro na linha, demais processadas
- POST com turno inexistente → erro na linha, demais mantidos
- POST com turma duplicada → `onConflictDoNothing` — não incrementa `imported`
