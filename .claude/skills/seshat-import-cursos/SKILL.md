# Skill: Import Cursos

Feature de importação em lote de cursos no Seshat.

## Endpoint

`POST /api/import/cursos` — permissão `import:execute`

## Template CSV

```csv
sigla,nome,descricao,turnoNome,ativo
INFO,Técnico em Informática,Curso técnico de TI,Manhã,true
```

- `turnoNome` é informativo — cursos não têm turnoId no banco
- `ativo` padrão: `true`

## Arquivos-chave

- Rota: `artifacts/api-server/src/routes/import.ts` (handler `POST /cursos`)
- Frontend: `artifacts/seshat/src/pages/importar/index.tsx` (card "1. Importar Cursos")
- Schema: `lib/db/src/schema/cursos.ts`
- Spec: `.specs/features/import-cursos.md`

## Regras

- `sigla` é **obrigatória** — linhas sem sigla são rejeitadas com erro "sigla é obrigatória"; truncada em 4 chars e convertida para maiúsculas
- Upsert por `(sigla, nome)` via `onConflictDoNothing`
- Campos normalizados: `sigla`/`Sigla`, `nome`/`Curso`/`curso`, `descricao`/`Descrição`/`Descricao`
- Auditoria registrada ao final

## Casos de Uso Comuns para Desenvolvimento

- Adicionar novo campo ao CSV: edite o handler em `import.ts` e atualize o template no frontend
- Mudar para upsert com atualização: trocar `onConflictDoNothing` por `onConflictDoUpdate`
- Validar campos extras: adicionar ao schema zod `rowSchema` ou validar na lógica do loop
