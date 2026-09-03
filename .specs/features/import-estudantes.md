# Feature: Importação de Estudantes

> Parte do módulo de importação em lote do Seshat

## Objetivo

Importar estudantes em lote via CSV, vinculando-os a turmas existentes.

## Endpoint

`POST /api/import/estudantes`

Permissão exigida: `import:execute`

## Template CSV

```csv
nome,registro,emailProprio,emailResponsavel,turmaSigla
João Silva,2024001,joao@escola.edu.br,responsavel@email.com,INF1A
Maria Oliveira,2024002,,mae@email.com,INF1A
```

## Regras de Negócio

- Campos obrigatórios: `nome`, `registro`
- Campos opcionais: `emailProprio` (ou `email`), `emailResponsavel`, `turmaSigla` (ou `turma`)
- Pré-requisito: turmas devem existir (pela sigla)
- Upsert por `registro`:
  - Se estudante existe: atualiza `nome`, `turmaId`, `observacao`, `atualizadoEm`
  - Se não existe: insere novo registro
  - Foto existente é preservada na atualização
- Lookup de turma por sigla (case-insensitive); erro se não encontrada
- Retorna `{ imported, errors }`

## Casos de Teste

- POST sem auth → 401
- POST sem permissão → 403
- POST com linha válida → `{ imported: 1, errors: [] }`
- POST sem `nome` ou `registro` → erro na linha
- POST com `turmaSigla` inexistente → erro na linha
- POST com registro duplicado → atualiza dados, não duplica
- Foto do estudante não é afetada pelo upsert
- Auditoria registrada ao final
