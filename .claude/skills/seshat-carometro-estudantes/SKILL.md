# Skill: Carômetro Estudantes — Ocorrências

## Conceito

Página `/carometro` = galeria fotográfica de estudantes agrupados por turno → curso → turma.
Cada cartão abre um modal com histórico de ocorrências e, conforme perfil, formulário de registro.

## Menu

```
Grupo: "Carômetro"  (carometro:view)
└── "Estudantes" → /carometro
```

## Agrupamento (frontend)

```typescript
// rawGroups vem da API como CarometroGroup[]
// Regrupar: turnoNome → cursoNome → CarometroGroup[]
const byTurno: Record<string, Record<string, CarometroGroup[]>> = {};
for (const g of groups) { byTurno[g.turnoNome][g.cursoNome].push(g); }
```

## API do Carômetro — GET /api/carometro

Retorna por turma:
```typescript
{
  turmaId, turmaSigla, turmaDescricao,
  cursoId, cursoNome,
  turnoId, turnoNome,
  estudantes: [{ id, nome, registro, dataNascimento, fotoUrl }]
}
```

JOIN via `turmaTurnosTable` (não mais `turmasTable.turnoId`):
```ts
.leftJoin(turmaTurnosTable, eq(turmaTurnosTable.turmaId, estudantesTable.turmaId))
.leftJoin(turnosTable, eq(turmaTurnosTable.turnoId, turnosTable.id))
```

Deduplica estudantes em Map por `estudante.id` (turma multi-turno gera N linhas).

## Ocorrências — Schema

### `ocorrencias` (colunas adicionadas)

| Coluna | Tipo |
|---|---|
| `turno_id` | uuid FK turnos NULL |
| `ciente_em` | timestamptz NULL |
| `ciente_por_id` | uuid FK usuarios NULL |
| `notificacao_pais_enviada_em` | timestamptz NULL |
| `observacao` | varchar(300) — era text |

### `estudantes` (coluna adicionada)

| Coluna | Tipo |
|---|---|
| `data_nascimento` | date NULL |

## Endpoints de Ocorrências

| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/api/ocorrencias?estudanteId=` | `ocorrencias:view` | Lista com joins completos |
| GET | `/api/ocorrencias/estudante/:id` | requireAuth | Lista resumida (pais/estudantes) |
| POST | `/api/ocorrencias` | `ocorrencias:create` | Cria; aceita `turnoId`, `enviarEmailPais` |
| PUT | `/api/ocorrencias/:id` | `ocorrencias:create` | Edita |
| DELETE | `/api/ocorrencias/:id` | `ocorrencias:create` | Soft delete |
| POST | `/api/ocorrencias/:id/ciente` | requireAuth | Marca ciência (409 se já registrada) |
| POST | `/api/ocorrencias/:id/notificar-pais` | `ocorrencias:create` | Envia e-mail aos responsáveis |

## Formulário — Campos

| Campo | Comportamento |
|---|---|
| Data de Registro | Exibição read-only = data do servidor (criadoEm) |
| Data da Ocorrência | Input date, default hoje, max hoje |
| Disciplina — Turno | Select com opções `${d.disciplinaNome} — ${d.turnoNome}` (user.disciplinas) |
| Tipo de Ocorrência | Select de tipos_ocorrencias ativos |
| Descrição | Textarea maxLength=300; contador; cor âmbar > 280 |
| Notificar responsáveis | Checkbox visível APENAS se estudante for menor de idade (< 18 anos) |

## Menor de Idade

```typescript
function isMenor(dataNascimento: string | null): boolean {
  if (!dataNascimento) return false;
  const nasc = new Date(dataNascimento);
  // ... calcula idade
  return idade < 18;
}
```

Exibe badge "Menor" no cartão; ativa checkbox de notificação no formulário.

## Ciência (Pai/Responsável)

Frontend:
```typescript
const isPaiResp = useHasRole("pai_responsavel");
// Se isPaiResp && !ocorrencia.cienteEm → exibe botão "Marcar como Ciente"
// POST /api/ocorrencias/:id/ciente
// Após: badge "Ciente" com data; botão desaparece
```

## Visibilidade do Botão por Role

| Condição | Botão |
|---|---|
| `ocorrencias:create` | "Ocorrência" (âmbar) |
| `pai_responsavel` ou `estudante` | "Ver ocorrências" (neutro) |
| Demais | Sem botão |

## Mailer — enviarEmailOcorrencia()

```typescript
await enviarEmailOcorrencia({
  para, estudanteNome, tipoOcorrencia,
  dataOcorrencia, turnoNome?, disciplinaNome?, observacao?
});
```

## Migration

```bash
psql $DATABASE_URL -f scripts/migrate-ocorrencias-v2.sql
pnpm --filter @workspace/db run push-force
```

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/ocorrencias.ts` | Novas colunas |
| `lib/db/src/schema/estudantes.ts` | dataNascimento |
| `scripts/migrate-ocorrencias-v2.sql` | Migration idempotente |
| `artifacts/api-server/src/routes/ocorrencias.ts` | CRUD + ciente + notificar |
| `artifacts/api-server/src/routes/seshat.ts` | GET /api/carometro com join correto |
| `artifacts/api-server/src/lib/mailer.ts` | enviarEmailOcorrencia |
| `artifacts/seshat/src/pages/seshat.tsx` | Página completa |
| `.specs/features/carometro-estudantes.md` | Spec completa |
