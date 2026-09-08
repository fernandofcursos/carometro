# Feature: Importação em Massa

> Módulo de importação em lote do Seshat via CSV

## Visão Geral

Permite importação em lote de dados a partir de arquivos CSV enviados pelo frontend.

**Ordem de importação recomendada:**
1. Cursos
2. Disciplinas
3. Professores
4. Turmas
5. Estudantes

## Specs por Entidade

| Entidade | Spec | Endpoint |
|----------|------|----------|
| Cursos | [import-cursos.md](./import-cursos.md) | `POST /api/import/cursos` |
| Disciplinas | [import-disciplinas.md](./import-disciplinas.md) | `POST /api/import/disciplinas` |
| Professores | [import-professores.md](./import-professores.md) | `POST /api/import/professores` |
| Turmas | [import-turmas.md](./import-turmas.md) | `POST /api/import/turmas` |
| Estudantes | [import-estudantes.md](./import-estudantes.md) | `POST /api/import/estudantes` |

## Formato de Entrada Comum

```json
{
  "rows": [
    { "data": { "campo1": "valor1", "campo2": "valor2" } }
  ]
}
```

## Formato de Saída Comum

```json
{ "imported": 3, "errors": ["linha 2: turma 'INF1A' não encontrada"] }
```

## Permissão

Todos os endpoints exigem: `import:execute`
