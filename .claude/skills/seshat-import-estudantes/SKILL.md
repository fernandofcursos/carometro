# Skill: Import Estudantes

Feature de importação em lote de estudantes no Seshat.

## Endpoint

`POST /api/import/estudantes` — permissão `import:execute`

## Template CSV

```csv
nome,registro,emailProprio,emailResponsavel,turmaSigla
João Silva,2024001,joao@escola.edu.br,responsavel@email.com,INF1A
```

## Arquivos-chave

- Rota: `artifacts/api-server/src/routes/import.ts` (handler `POST /estudantes`)
- Frontend: `artifacts/seshat/src/pages/importar/index.tsx` (card "5. Importar Estudantes")
- Schema: `lib/db/src/schema/estudantes.ts`
- Spec: `.specs/features/import-estudantes.md`

## Regras

- Upsert por `registro`:
  - Existe → atualiza `nome`, `turmaId`, `observacao`, `atualizadoEm`
  - Não existe → insere novo
- Lookup de turma por `turmaSigla` ou `turma` (case-insensitive)
- Foto existente não é afetada pela importação
- Variantes de campo: `registro`/`Registro`/`Matrícula`/`Matricula`

## Dependências

Turmas devem existir antes de importar estudantes.

## Casos de Uso Comuns

- Atualizar turma de estudante existente: incluir `registro` correto no CSV
- Importar sem email: deixar colunas de email em branco — aceito
- Transferência de turma: basta mudar `turmaSigla` no CSV do mesmo `registro`
