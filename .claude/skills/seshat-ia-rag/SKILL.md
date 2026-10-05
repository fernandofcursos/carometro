# Skill: IA e RAG

## Modelos

- **Complexo**: `claude-opus-5` (chat pedagógico, análise)
- **Rápido**: `claude-haiku-4-5-20251001` (embeddings, sugestões, chatbot)

## Endpoints

| Método | Rota | Permissão |
|---|---|---|
| POST | `/api/ia/chat` | `ia:use` |
| POST | `/api/ia/busca` | `ia:use` |
| POST | `/api/ia/sugestao-ocorrencia` | `ocorrencias:create` |
| POST | `/api/ia/documentos` | `ia:manage` |
| GET | `/api/ia/documentos` | `ia:manage` |

## SDK Anthropic

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Chat com streaming (SSE)
const stream = await client.messages.stream({
  model: "claude-opus-5",
  max_tokens: 64000,
  thinking: { type: "adaptive" },
  system: SYSTEM_BASE,
  messages: [{ role: "user", content: pergunta }],
});

for await (const chunk of stream) {
  if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
    res.write(`data: ${JSON.stringify({ tipo: "chunk", conteudo: chunk.delta.text })}\n\n`);
  }
}
```

## Tabelas IA

`ia_documentos`, `ia_chunks`, `ia_embeddings`, `ia_conversas`, `ia_mensagens`, `ia_cache`

Todas com `escola_id` (RLS isolado por tenant).

## Migração

Incluída em `scripts/migrate-multi-tenant.sql` (passos 10 e 11).

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/ia.ts` | Schema Drizzle das tabelas IA |
| `artifacts/api-server/src/routes/ia.ts` | Endpoints /api/ia/* |
| `artifacts/api-server/src/lib/rag-engine.ts` | Motor RAG |
| `.specs/features/arquitetura-ia-rag.md` | Spec completa |
