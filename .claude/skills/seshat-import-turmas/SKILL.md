# Skill: Import Turmas

## Objetivo
Importar turmas em lote via CSV. Uma turma pode ser vinculada a múltiplos turnos.

## Endpoint
`POST /api/import/turmas` — permissão: `import:execute`

## Template CSV

```csv
sigla,descricao,cursoNome,turnoNomes,ano,semestre
INF1A,Informática 1º Ano A,Técnico em Informática,Manhã,2025,1
INF1B,Informática 1º Ano B,Técnico em Informática,Manhã|Tarde,2025,1
```

**turnoNomes**: múltiplos separados por `|` ou `,`

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/turmas.ts` | Schema da tabela turmas (sem turnoId) |
| `lib/db/src/schema/turma-turnos.ts` | Junção N:N turma ↔ turno |
| `artifacts/api-server/src/routes/import.ts` | Rota POST /api/import/turmas |
| `artifacts/api-server/src/routes/turmas.ts` | CRUD de turmas |
| `artifacts/seshat/src/pages/turmas/index.tsx` | Frontend com checkboxes de turno |
| `artifacts/seshat/src/pages/importar/index.tsx` | Card de importação |

## Regras

- `sigla` + `cursoNome` obrigatórios
- `turnoNomes` obrigatório (ao menos 1)
- `onConflictDoNothing` em turmas e turma_turnos
- Turno não encontrado → erro na linha, demais turnos processados

## Casos de uso comuns

```bash
# Aplicar schema após editar turmas.ts ou turma-turnos.ts
pnpm --filter @workspace/db run push-force

# Testar importação
curl -X POST http://localhost:8080/api/import/turmas \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rows":[{"data":{"sigla":"INF1A","descricao":"Informática 1A","cursoNome":"Técnico em Informática","turnoNomes":"Manhã|Tarde","ano":"2025","semestre":"1"}}]}'
```
