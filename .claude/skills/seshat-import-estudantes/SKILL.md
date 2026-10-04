# Skill: Import Estudantes

Feature de importação em lote de estudantes no Seshat.

## Endpoint

`POST /api/import/estudantes` — permissão `import:execute`

## Template CSV

```csv
nome,registro,turma,observacao
João Silva,2024001,INF1A,Transferido em março
```

> **Atenção:** `emailProprio` e `emailResponsavel` são enviados pelo frontend mas **ignorados pelo backend** — não são persistidos.

## Arquivos-chave

- Rota: `artifacts/api-server/src/routes/import.ts` (handler `POST /estudantes`)
- Frontend: `artifacts/seshat/src/pages/importar/index.tsx` (card "5. Importar Estudantes")
- Schema: `lib/db/src/schema/estudantes.ts`
- Spec: `.specs/features/import-estudantes.md`

## Regras

- Upsert por `registro`:
  - Existe → atualiza `nome`, `turmaId`, `observacao`, `atualizadoEm`
  - Não existe → insere novo
- Lookup de turma por `turma` ou `turmaSigla` ou `Turma` (nessa ordem, case-insensitive)
- Foto existente não é afetada pela importação
- Variantes de campo: `registro`/`Registro`/`Matrícula`/`Matricula`; `observacao`/`Observação`/`Observacao`

## Dependências

Turmas devem existir antes de importar estudantes.

## Casos de Uso Comuns

- Atualizar turma de estudante existente: incluir `registro` correto no CSV
- Importar sem email: deixar colunas de email em branco — aceito
- Transferência de turma: basta mudar `turmaSigla` no CSV do mesmo `registro`
