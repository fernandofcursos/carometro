# Feature: Importação de Cursos

> Parte do módulo de importação em lote do Seshat

## Objetivo

Importar cursos em lote via arquivo CSV para o sistema, criando registros na tabela `cursos`.

## Endpoint

`POST /api/import/cursos`

Permissão exigida: `import:execute`

## Template CSV

```csv
nome,descricao,turnoNome,ativo
Técnico em Informática,Curso técnico de TI,Manhã,true
Técnico em Administração,Curso técnico de Administração,Tarde,true
```

> **Nota:** `turnoNome` é informativo — não persiste em cursos (cursos não têm turnoId). Use-o como referência ao preparar o CSV de disciplinas.

## Regras de Negócio

- Campo obrigatório: `nome`
- Campos opcionais: `descricao`, `turnoNome` (apenas informativo), `ativo` (padrão: `true`)
- Upsert por `nome` — se curso já existe, a linha é ignorada (`onConflictDoNothing`)
- Retorna `{ imported, errors }` com contagem e lista de erros por linha

## Casos de Teste

- POST sem auth → 401
- POST sem permissão `import:execute` → 403
- POST com `rows` válidas → `{ imported: N, errors: [] }`
- POST com linha sem `nome` → erro na linha, demais processadas
- POST com curso duplicado → `onConflictDoNothing` — `imported` não incrementa (linha ignorada sem erro)
- Auditoria registrada ao final da operação
