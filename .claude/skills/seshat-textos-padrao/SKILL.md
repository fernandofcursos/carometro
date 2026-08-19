# Skill: Textos Padrão de Tipos de Ocorrências

## Schema (Drizzle)

```typescript
// lib/db/src/schema/textos-padrao-ocorrencias.ts
export const textosPadraoOcorrenciasTable = pgTable("textos_padrao_ocorrencias", {
  id: uuid("id").primaryKey().defaultRandom(),
  tipoOcorrenciaId: uuid("tipo_ocorrencia_id").notNull()
    .references(() => tiposOcorrenciasTable.id, { onDelete: "cascade" }),
  titulo: varchar("titulo", { length: 200 }).notNull(),
  corpo: text("corpo").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm: timestamp("deletado_em", { withTimezone: true }),
});
```

## Índice Parcial (1 ativo por tipo)

```sql
CREATE UNIQUE INDEX uq_texto_padrao_ativo_por_tipo
ON textos_padrao_ocorrencias (tipo_ocorrencia_id)
WHERE ativo = true AND deletado_em IS NULL;
```

## Placeholders

| Marcador | Dado |
|---|---|
| `{{NOME_ESTUDANTE}}` | nome do estudante |
| `{{DATA_REGISTRO}}` | criadoEm formatado |
| `{{DATA_OCORRENCIA}}` | dataOcorrencia formatado |
| `{{TIPO_OCORRENCIA}}` | descricao do tipo |
| `{{DESCRICAO}}` | observacao |

## renderizarTexto (API)

```typescript
function renderizarTexto(corpo: string, dados: {
  nomeEstudante?: string;
  dataRegistro?: string;
  dataOcorrencia?: string;
  tipoOcorrencia?: string;
  descricao?: string;
}): string {
  return corpo
    .replace(/\{\{NOME_ESTUDANTE\}\}/g, dados.nomeEstudante ?? "{{NOME_ESTUDANTE}}")
    .replace(/\{\{DATA_REGISTRO\}\}/g, dados.dataRegistro ?? "{{DATA_REGISTRO}}")
    // ... etc
}
```

## Busca de texto ativo por tipo

```typescript
const [texto] = await db
  .select()
  .from(textosPadraoOcorrenciasTable)
  .where(and(
    eq(textosPadraoOcorrenciasTable.tipoOcorrenciaId, tipoId),
    eq(textosPadraoOcorrenciasTable.ativo, true),
    isNull(textosPadraoOcorrenciasTable.deletadoEm),
  ))
  .limit(1);
```

## Soft delete

```typescript
await db.update(textosPadraoOcorrenciasTable)
  .set({ deletadoEm: new Date(), ativo: false, atualizadoEm: new Date() })
  .where(eq(textosPadraoOcorrenciasTable.id, id));
```

## Validação de conflito (POST e reativação via PUT)

```typescript
const [existente] = await db.select({ id: textosPadraoOcorrenciasTable.id })
  .from(textosPadraoOcorrenciasTable)
  .where(and(
    eq(textosPadraoOcorrenciasTable.tipoOcorrenciaId, tipoId),
    eq(textosPadraoOcorrenciasTable.ativo, true),
    isNull(textosPadraoOcorrenciasTable.deletadoEm),
  ))
  .limit(1);
if (existente) return res.status(409).json({ error: "Já existe um texto padrão ativo..." });
```

## Permissão

Toda a gestão de textos padrão reusa `tipos-ocorrencias:manage`.  
`GET /placeholders` e `GET /tipo/:id` requerem apenas `requireAuth`.

## Integração com formulário de ocorrência

```typescript
// Quando tipo é selecionado, buscar texto ativo:
const { data: textoPadrao } = useQuery({
  queryKey: ["texto-padrao-tipo", tipoId],
  queryFn: () => apiClient.get(`/api/textos-padrao/tipo/${tipoId}`).then(r => r.data),
  enabled: !!tipoId,
  retry: false,
});

// Se encontrado, oferecer botão:
{textoPadrao && (
  <Button type="button" variant="outline" size="sm"
    onClick={() => setObservacao(textoPadrao.corpo)}>
    Usar texto padrão: {textoPadrao.titulo}
  </Button>
)}
```

## Migration

```bash
psql $DATABASE_URL -f scripts/migrate-textos-padrao.sql
pnpm --filter @workspace/db run push-force
```
