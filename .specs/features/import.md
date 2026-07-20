# Feature: Importação em Massa via XLSX

> Athena aprovado | Status: implementado

## Objetivo

Permitir importação em lote de cursos, turmas e estudantes a partir de planilhas XLSX exportadas de sistemas de gestão escolar externos.

## Endpoints

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| `POST` | `/api/import/cursos` | `import:execute` | Importar cursos |
| `POST` | `/api/import/turmas` | `import:execute` | Importar turmas |
| `POST` | `/api/import/estudantes` | `import:execute` | Importar estudantes |

## Formato de Entrada

```json
{
  "rows": [
    { "data": { "nome": "Técnico em Informática", "descricao": "...", "ativo": true } }
  ]
}
```

- O campo `data` contém os dados de uma linha da planilha.
- O frontend converte o XLSX para este formato antes de enviar.

## Formato de Saída

```json
{ "imported": 3, "errors": ["linha 2: turma 'ADM1' não encontrada"] }
```

## Regras de Negócio

### Cursos
- Campo obrigatório: `nome`
- Campos opcionais: `descricao`, `ativo`
- Upsert por `nome` (atualiza se já existir)

### Turmas
- Campos obrigatórios: `descricao`, `sigla`, `curso` (nome), `turno` (nome)
- Lookup por nome de curso e turno — retorna erro de linha se não encontrado
- Upsert por `sigla`

### Estudantes
- Campos obrigatórios: `nome`, `registro`
- Campos opcionais: `turma` (sigla), `email`, `observacao`
- Upsert por `registro` (preserva foto existente)
- Email criptografado (AES-256-CBC) se fornecido

## Casos de Teste

- POST /api/import/cursos sem auth → 401
- POST /api/import/cursos sem permissão → 403
- POST com rows válidas → `{ imported: N, errors: [] }`
- POST /api/import/turmas com curso inexistente → `{ imported: 0, errors: ["..."] }`
- POST /api/import/estudantes upsert → não duplica registro existente
