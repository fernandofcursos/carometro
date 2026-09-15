# Spec: Arquitetura de IA e RAG — Seshat Inteligente

**Status:** Especificado ✅ / Implementação pendente

---

## Visão Geral

Camada de inteligência artificial integrada ao Seshat para assistência pedagógica, busca semântica e automação de tarefas administrativas. A arquitetura usa **RAG (Retrieval-Augmented Generation)** sobre os dados da própria escola, respeitando LGPD, ISO 27001 e o isolamento multi-tenant.

---

## Casos de Uso

| # | Caso de Uso | Perfis | Modelo |
|---|---|---|---|
| 1 | **Assistente Pedagógico** — responde dúvidas sobre normas SEEDF, regulamentos, calendário | todos | Claude Opus 5 |
| 2 | **Busca Semântica de Regulamentos** — encontra trechos relevantes em documentos da escola | secretaria, coordenação | Claude Haiku 4.5 (embedding) |
| 3 | **Sugestão de Texto para Ocorrências** — sugere redação baseada em histórico similar | secretaria, coordenação | Claude Haiku 4.5 |
| 4 | **Análise de Requerimento** — classifica tipo, sugere parecer baseado em precedentes | secretaria, supervisão | Claude Opus 5 |
| 5 | **Resumo de Histórico Escolar** — sintetiza ocorrências, notas e frequência do estudante | coordenação, gestão | Claude Opus 5 |
| 6 | **Chatbot do Portal do Estudante** — responde dúvidas sobre matrícula, horários, cartões | estudante, responsável | Claude Haiku 4.5 |

---

## Arquitetura em Camadas

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Seshat)                        │
│  ChatWidget · SearchBar · SuggestionBadge · SummaryCard         │
└─────────────────────────┬───────────────────────────────────────┘
                          │ REST / SSE (streaming)
┌─────────────────────────▼───────────────────────────────────────┐
│                     API Gateway (Express)                       │
│  POST /api/ia/chat  ·  POST /api/ia/busca  ·  POST /api/ia/...  │
│  requireAuth + requirePermissao("ia:use")                       │
│  TenantContext → escola_id do JWT                               │
└──────────┬──────────────────────────────────┬───────────────────┘
           │                                  │
┌──────────▼──────────┐            ┌──────────▼──────────────────┐
│   RAG Engine        │            │   Claude API                │
│  (Node.js service)  │            │   @anthropic-ai/sdk         │
│                     │            │                             │
│  1. Embed query     │            │  model: claude-opus-5       │
│  2. Retrieve chunks │            │  thinking: adaptive         │
│  3. Build context   │            │  streaming: true            │
│  4. Call Claude     │            │  max_tokens: 64000          │
└──────────┬──────────┘            └─────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────────┐
│                   PostgreSQL 18 + pgvector                      │
│                                                                 │
│  ia_documentos          ia_chunks           ia_embeddings       │
│  (documentos fonte)     (fragmentos)        (vetores float[])   │
│                                                                 │
│  ia_conversas           ia_mensagens        ia_cache            │
│  (sessões de chat)      (histórico)         (respostas cacheadas)│
│                                                                 │
│  ← todos com escola_id (multi-tenant via RLS) →                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Stack Tecnológico

| Componente | Tecnologia | Justificativa |
|---|---|---|
| **LLM principal** | Claude Opus 5 (`claude-opus-5`) | Melhor raciocínio para tarefas pedagógicas complexas |
| **LLM rápido** | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) | Embeddings, classificação, chatbot simples — custo reduzido |
| **Embeddings** | `text-embedding-3` via Anthropic + pgvector | Sem infra externa — embeddings armazenados no próprio PostgreSQL |
| **Vector DB** | pgvector (extensão PostgreSQL) | Zero overhead operacional — mesma instância PG |
| **Streaming** | SSE (Server-Sent Events) | Resposta progressiva sem WebSockets |
| **Cache** | Redis (opcional) OU tabela `ia_cache` PostgreSQL | Cache de respostas frequentes |
| **SDK** | `@anthropic-ai/sdk` | SDK oficial TypeScript |

---

## Modelo de Dados

### Tabela `ia_documentos`

```sql
CREATE TABLE ia_documentos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id     uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  titulo        varchar(300) NOT NULL,
  tipo          varchar(50) NOT NULL,  -- 'regulamento','edital','circular','ata','outro'
  fonte         varchar(500),           -- URL ou path original
  conteudo_raw  text,                   -- texto extraído (PDF/DOCX)
  status        varchar(20) NOT NULL DEFAULT 'pendente',  -- 'pendente','indexado','erro'
  indexado_em   timestamptz,
  criado_por_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
```

### Tabela `ia_chunks`

```sql
CREATE TABLE ia_chunks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id     uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  documento_id  uuid        NOT NULL REFERENCES ia_documentos(id) ON DELETE CASCADE,
  conteudo      text        NOT NULL,
  posicao       integer     NOT NULL,  -- ordem no documento
  tokens        integer,               -- contagem para controle de contexto
  criado_em     timestamptz NOT NULL DEFAULT now()
);
```

### Tabela `ia_embeddings`

```sql
-- Requer: CREATE EXTENSION vector;
CREATE TABLE ia_embeddings (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id     uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  chunk_id      uuid        NOT NULL REFERENCES ia_chunks(id) ON DELETE CASCADE,
  embedding     vector(1536) NOT NULL,  -- dimensão do modelo de embedding
  modelo        varchar(100) NOT NULL DEFAULT 'claude-embedding-v1',
  criado_em     timestamptz NOT NULL DEFAULT now()
);

-- Índice HNSW para busca vetorial eficiente
CREATE INDEX idx_ia_embeddings_hnsw
  ON ia_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Índice por escola (busca isolada por tenant)
CREATE INDEX idx_ia_embeddings_escola ON ia_embeddings(escola_id);
```

### Tabela `ia_conversas`

```sql
CREATE TABLE ia_conversas (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id     uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  usuario_id    uuid        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo        varchar(300),
  contexto      varchar(50) NOT NULL DEFAULT 'geral',  -- 'estudante','secretaria','portal'
  tokens_totais integer     NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
```

### Tabela `ia_mensagens`

```sql
CREATE TABLE ia_mensagens (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id     uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  conversa_id   uuid        NOT NULL REFERENCES ia_conversas(id) ON DELETE CASCADE,
  papel         varchar(10) NOT NULL,   -- 'user' | 'assistant'
  conteudo      text        NOT NULL,
  tokens        integer,
  modelo        varchar(100),
  latencia_ms   integer,               -- tempo de resposta para monitoramento
  chunks_usados uuid[],               -- IDs dos chunks recuperados (auditoria RAG)
  criado_em     timestamptz NOT NULL DEFAULT now()
);
```

### Tabela `ia_cache`

```sql
CREATE TABLE ia_cache (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id     uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  hash_query    varchar(64) NOT NULL,  -- SHA-256 da query normalizada
  resposta      text        NOT NULL,
  hits          integer     NOT NULL DEFAULT 1,
  expira_em     timestamptz NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escola_id, hash_query)
);
```

---

## API Endpoints

### `POST /api/ia/chat`

**Requer:** `ia:use`

```typescript
// Request
{ conversaId?: string; mensagem: string; contexto?: "geral" | "estudante" | "secretaria" }

// Response (SSE stream)
data: { tipo: "chunk", conteudo: "texto..." }
data: { tipo: "fim", conversaId: "uuid", tokensUsados: 1234 }
data: { tipo: "erro", mensagem: "..." }
```

**Fluxo:**

```
1. Embed query → vector(1536)
2. SELECT chunks WHERE escola_id = ? ORDER BY embedding <=> query_vec LIMIT 5
3. Montar contexto: [system_prompt] + [chunks recuperados] + [histórico conversa]
4. Chamar Claude Opus 5 com streaming
5. Salvar mensagem em ia_mensagens
6. Retornar SSE ao frontend
```

### `POST /api/ia/busca`

**Requer:** `ia:use`

```typescript
// Request
{ query: string; tipos?: string[]; limite?: number }

// Response
{
  resultados: Array<{
    chunk_id: string;
    documento: { id, titulo, tipo };
    trecho: string;
    score: number;        // similaridade cosine (0-1)
    destaque: string;     // trecho com contexto
  }>
}
```

### `POST /api/ia/sugestao-ocorrencia`

**Requer:** `ocorrencias:create`

```typescript
// Request
{ tipoOcorrenciaId: string; contexto?: string }

// Response
{ sugestao: string; baseadoEm: number }  // baseadoEm = n° de ocorrências similares
```

### `POST /api/ia/documentos`

**Requer:** `ia:manage`

Upload e indexação de documentos (PDF/DOCX/TXT) para a base de conhecimento da escola.

```typescript
// Multipart form: arquivo (file), titulo (string), tipo (string)
// Response: { documentoId: string; status: "indexando" }
// Processamento assíncrono: extrai texto → chunking → embedding → indexação
```

### `GET /api/ia/documentos`

**Requer:** `ia:manage`

Lista documentos da base de conhecimento da escola (escopo tenant).

---

## Sistema de Prompts

### System Prompt Base (todas as conversas)

```typescript
const SYSTEM_BASE = `Você é o Assistente Pedagógico do Seshat, sistema de gestão escolar do ${escola.nome}.
Contexto: ${escola.cidade} — ${escola.uf} — Secretaria de Educação do Distrito Federal (SEEDF).
Data atual: ${hoje}.

REGRAS:
- Responda APENAS com base nos documentos e dados fornecidos como contexto.
- Se não souber a resposta com certeza, diga claramente e oriente o usuário a consultar a secretaria.
- Nunca invente informações sobre notas, faltas, datas ou regulamentos.
- Respeite a privacidade: não mencione dados de outros estudantes.
- Linguagem: português brasileiro, formal mas acessível.
- Quando citar uma norma, informe a fonte (documento, artigo, página).`;
```

### Prompt de Recuperação (RAG)

```typescript
const promptRAG = `
## Documentos de Referência (extraídos da base de conhecimento da escola)

${chunks.map((c, i) => `[${i+1}] ${c.documentoTitulo} — ${c.conteudo}`).join("\n\n")}

## Histórico da Conversa
${historico.slice(-6).map(m => `${m.papel === "user" ? "Estudante" : "Assistente"}: ${m.conteudo}`).join("\n")}

## Pergunta Atual
${pergunta}

Responda com base exclusivamente nos documentos acima. Se a resposta não estiver nos documentos, diga "Não encontrei essa informação nos documentos disponíveis. Recomendo consultar a secretaria."`;
```

---

## Segurança e LGPD

### Isolamento Multi-Tenant

- Todos os embeddings e documentos filtrados por `escola_id` via **RLS** (ver spec multi-tenant)
- Impossível acessar dados de outra escola — garantia em nível de banco

### LGPD

- Dados de estudantes **nunca** são indexados como documento (apenas consultados em tempo real com filtro de tenant)
- Mensagens de chat armazenadas com retenção máxima de **90 dias** (job de limpeza automático)
- Usuário pode solicitar exclusão de histórico via `DELETE /api/ia/conversas`
- Logs de auditoria: quem consultou o quê, quando

### ISO 27001

- API keys do Claude armazenadas apenas em variáveis de ambiente (nunca no banco)
- TLS obrigatório — dados em trânsito sempre criptografados
- Rate limiting por usuário: 60 req/min para `/api/ia/*`
- Auditoria de todas as chamadas à IA em tabela `auditoria`

---

## Infraestrutura e Custo

### Estimativa de Custo Mensal (escola média — 500 estudantes)

| Serviço | Volume estimado | Custo |
|---|---|---|
| Claude Opus 5 (chat complexo) | 200 conversas × 5k tokens | ~$5 |
| Claude Haiku 4.5 (chatbot, sugestões) | 1.000 req × 2k tokens | ~$2 |
| pgvector (sem custo extra) | — | $0 |
| **Total estimado** | | **~$7/mês/escola** |

### Infra necessária

```yaml
# docker-compose.yml — extensão pgvector
db:
  image: pgvector/pgvector:pg18  # imagem com extensão pré-instalada
  # A extensão é ativada via migration: CREATE EXTENSION IF NOT EXISTS vector;
```

---

## Permissões

```sql
INSERT INTO permissoes (recurso, acao) VALUES
  ('ia', 'use'),     -- usar o assistente / chat
  ('ia', 'manage')   -- gerenciar documentos da base de conhecimento
ON CONFLICT (recurso, acao) DO NOTHING;

-- ia:use → todos os perfis autenticados (exceto portaria)
-- ia:manage → secretaria, coordenacao, gestao, administrador
```

---

## Implementação — Fases

### Fase 1 — Fundação (MVP)

- [ ] `CREATE EXTENSION vector` + tabelas `ia_*`
- [ ] Endpoint `/api/ia/chat` com Claude Haiku 4.5 (sem RAG — contexto da conversa apenas)
- [ ] Widget de chat no frontend (componente flutuante)
- [ ] Rate limiting e auditoria

### Fase 2 — RAG

- [ ] Upload e indexação de documentos (`ia_documentos`, `ia_chunks`, `ia_embeddings`)
- [ ] Busca vetorial com pgvector
- [ ] Sistema de prompts com contexto de chunks recuperados
- [ ] Endpoint `/api/ia/busca`

### Fase 3 — Assistência Especializada

- [ ] Sugestão de texto para ocorrências
- [ ] Análise e classificação de requerimentos
- [ ] Resumo de histórico escolar
- [ ] Chatbot no Portal do Estudante e Portal do Responsável

### Fase 4 — Otimização

- [ ] Cache de respostas frequentes (`ia_cache`)
- [ ] Prompt caching do Claude para redução de custo
- [ ] Compaction de conversas longas (beta `compact-2026-01-12`)
- [ ] Dashboard de uso e custo por escola

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `scripts/migrate-ia-rag.sql` | DDL + extensão pgvector |
| `lib/db/src/schema/ia.ts` | Schema Drizzle (ia_documentos, ia_chunks, ia_embeddings, ia_conversas, ia_mensagens) |
| `artifacts/api-server/src/routes/ia.ts` | Endpoints /api/ia/* |
| `artifacts/api-server/src/lib/rag-engine.ts` | Motor RAG: embed → retrieve → prompt → stream |
| `artifacts/api-server/src/lib/embedding.ts` | Geração de embeddings via Claude API |
| `artifacts/seshat/src/components/ia/ChatWidget.tsx` | Widget de chat flutuante |
| `artifacts/seshat/src/pages/ia/documentos.tsx` | Gestão de documentos da base de conhecimento |
| `.specs/features/arquitetura-ia-rag.md` | Esta spec |
| `.claude/skills/seshat-ia-rag/SKILL.md` | Skill de implementação |
