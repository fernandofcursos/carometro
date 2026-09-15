# Spec: Arquitetura Multi-Tenant

**Status:** Especificado ✅ / Implementação pendente

---

## Visão Geral

Transformação do Seshat de sistema single-tenant (uma escola) para **multi-tenant**, permitindo que múltiplas escolas usem a mesma instância com isolamento completo de dados.

---

## Abordagem Escolhida: Row-Level Security (RLS)

### Opções avaliadas

| Abordagem | Isolamento | Complexidade Ops | Complexidade Dev | Escolha |
|---|---|---|---|---|
| **RLS** (uma tabela, `escola_id` + políticas) | Alto | Baixa | Média | ✅ **Escolhida** |
| Schema-por-tenant | Muito alto | Alta (N schemas) | Alta (migrations N×) | ❌ |
| Banco-por-tenant | Máximo | Muito alta | Muito alta | ❌ |

**RLS** é a abordagem correta para este sistema:
- PostgreSQL 18 com RLS é battle-tested para multi-tenant SaaS
- Uma única migration atende todos os tenants
- Drizzle ORM suporta bem via `SET LOCAL app.current_escola_id`
- Zero overhead operacional adicional

---

## Modelo de Dados — Tabela Central

### Nova tabela `escolas`

```sql
CREATE TABLE escolas (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              varchar(300) NOT NULL,
  sigla             varchar(20)  NOT NULL,
  inep              varchar(8),            -- código INEP da escola
  cnpj              varchar(14),
  -- Endereço
  logradouro        varchar(300),
  numero            varchar(20),
  complemento       varchar(100),
  bairro            varchar(100),
  cidade            varchar(100) NOT NULL DEFAULT 'Brasília',
  uf                char(2)      NOT NULL DEFAULT 'DF',
  cep               varchar(8),
  -- Contato
  email             varchar(300),
  telefone          varchar(20),
  site              varchar(300),
  -- Status e controle
  plano             varchar(20)  NOT NULL DEFAULT 'basico',  -- 'basico','pro','enterprise'
  ativo             boolean      NOT NULL DEFAULT true,
  criado_em         timestamptz  NOT NULL DEFAULT now(),
  atualizado_em     timestamptz  NOT NULL DEFAULT now(),
  -- Configurações JSON (paleta de cores, logos, features habilitadas)
  config            jsonb        NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (sigla),
  UNIQUE (inep)
);
```

### Coluna `escola_id` em todas as tabelas tenant-scoped

Todas as tabelas do sistema recebem a coluna:

```sql
escola_id uuid NOT NULL REFERENCES escolas(id) ON DELETE RESTRICT
```

---

## Tabelas por Categoria

### Globais (sem `escola_id` — compartilhadas entre todos os tenants)

| Tabela | Justificativa |
|---|---|
| `roles` | Papéis do sistema são padronizados |
| `permissoes` | Permissões são padronizadas |
| `roles_permissoes` | Vínculo role ↔ permissão é global |
| `escolas` | Registro de tenants |

### Tenant-Scoped (recebem `escola_id`)

Todas as demais tabelas: `usuarios`, `estudantes`, `cursos`, `turmas`, `turma_turnos`, `turnos`, `matriculas`, `disciplinas`, `disciplina_ofertas`, `usuario_disciplinas`, `carteiras`, `cartoes_saida`, `requerimentos`, `requerimento_tipos`, `requerimento_assuntos`, `requerimento_assinaturas`, `ocorrencias`, `tipos_ocorrencias`, `textos_padrao_ocorrencias`, `estudante_emails`, `responsaveis_estudantes`, `avisos`, `aviso_turmas`, `aviso_roles`, `aviso_anexos`, `horarios_aulas`, `calendario_letivo`, `professores`, `professor_disciplinas`, `fotos`, `ia_documentos`, `ia_chunks`, `ia_embeddings`, `ia_conversas`, `ia_mensagens`, `ia_cache`, `auditoria`.

---

## Row-Level Security — Implementação

### Mecanismo

```sql
-- 1. Habilitar RLS em cada tabela tenant-scoped (exemplo: usuarios)
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios FORCE ROW LEVEL SECURITY;  -- força mesmo para superuser

-- 2. Política de leitura e escrita
CREATE POLICY tenant_isolation ON usuarios
  USING (escola_id = current_setting('app.current_escola_id', true)::uuid)
  WITH CHECK (escola_id = current_setting('app.current_escola_id', true)::uuid);

-- 3. Super-admin bypass (via role especial)
CREATE POLICY super_admin_bypass ON usuarios
  USING (current_setting('app.is_super_admin', true) = 'true');
```

### Ativação por Request no Drizzle

```typescript
// artifacts/api-server/src/lib/tenant.ts

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function withTenant<T>(
  escolaId: string,
  fn: () => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`
      SET LOCAL app.current_escola_id = ${escolaId};
      SET LOCAL app.is_super_admin = 'false';
    `);
    return await fn();
  });
}

export async function withSuperAdmin<T>(fn: () => Promise<T>): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`
      SET LOCAL app.is_super_admin = 'true';
    `);
    return await fn();
  });
}
```

### Middleware Express

```typescript
// artifacts/api-server/src/middleware/tenant.ts

export function requireTenant(req: Request, res: Response, next: NextFunction) {
  const escolaId = req.user?.escolaId;
  if (!escolaId) {
    return res.status(400).json({ error: "Contexto de escola não definido." });
  }
  res.locals.escolaId = escolaId;
  next();
}

// Uso nas rotas:
router.use(requireAuth, requireTenant);
```

---

## JWT — Claim `escolaId`

O token JWT agora inclui `escolaId`:

```typescript
// Payload do JWT
interface JWTPayload {
  sub: string;        // usuarioId
  escolaId: string;   // tenant do usuário
  iat: number;
  exp: number;
}

// Middleware requireAuth popula req.user.escolaId
```

**Usuário multi-escola:** um usuário que pertence a mais de uma escola gera tokens separados por escola. Login especifica qual escola (`POST /api/auth/login { email, senha, escolaId }`).

---

## Fluxo Multi-Escola (usuário em mais de uma escola)

### Login com escola única
1. `POST /api/auth/login { identificador, senha }` → JWT com `escolaId` incluído
2. Sistema detecta escola automaticamente (única matrícula ativa)

### Login com múltiplas escolas
1. `POST /api/auth/login { identificador, senha }` → `{ requiresEscolaSelection: true, escolasDisponiveis: [...], tempToken }`
2. Frontend exibe modal de seleção de escola
3. `POST /api/auth/selecionar-escola { escolaId }` (com tempToken) → JWT final com `escolaId`

### Chave de API Anthropic por escola
Configurada em `escolas.config.anthropicApiKey`. Se ausente, usa `ANTHROPIC_API_KEY` da plataforma.

---

## Tenant Management — Super-Admin

### Novo perfil: `super_admin`

O Super-Admin é o administrador da plataforma (Seshat como SaaS) — não pertence a nenhuma escola específica. Ele usa `withSuperAdmin()` para acessar dados de qualquer tenant.

```
POST /api/admin/escolas         — criar escola (provision tenant)
GET  /api/admin/escolas         — listar todas as escolas
PUT  /api/admin/escolas/:id     — atualizar escola
DELETE /api/admin/escolas/:id   — desativar escola
POST /api/admin/escolas/:id/admin — criar primeiro usuário admin da escola
GET  /api/admin/relatorios      — métricas cross-tenant (sem dados de estudantes — LGPD)
```

---

## PostgreSQL — Atualização para Versão 18

### Por que PostgreSQL 18?

PostgreSQL 18 (lançado em outubro de 2025) traz melhorias significativas:

| Recurso | Benefício para o Seshat |
|---|---|
| **RLS aprimorado** | Políticas mais eficientes, menos overhead em JOINs |
| **pgvector nativo** | Suporte melhorado ao tipo `vector` (benefício direto para RAG) |
| **Índices HNSW aprimorados** | Busca vetorial 2-3× mais rápida |
| **Logical replication** | Backup incremental facilitado |
| **JSON Path melhorado** | Queries em campos `jsonb` da tabela `escolas.config` |
| **Otimizador de queries melhorado** | Plans mais eficientes para queries com RLS |

### Mudanças no Docker

```yaml
# docker-compose.yml — imagem pgvector/pgvector para ter a extensão vector
# usando PostgreSQL 18 com pgvector pré-compilado
db:
  image: pgvector/pgvector:pg18

# docker-compose.prod.yml — mesma mudança em produção
db:
  image: pgvector/pgvector:pg18
```

> **Nota:** A imagem `pgvector/pgvector:pg18` mantém a mesma interface do `postgres:16-alpine` mas inclui a extensão `vector` compilada. Não há breaking changes no protocolo de conexão entre PG16 e PG18 para as features que o sistema usa.

### Migração de dados (upgrade de instância existente)

```bash
# Para ambientes com dados existentes (não Docker fresh start):
# 1. pg_upgrade do pg_catalog + dump/restore
# 2. OU: dump → novo container PG18 → restore
pg_dumpall -h old-host > backup.sql
# Sobe novo container PG18
psql -h new-host -f backup.sql
```

---

## Migração SQL

Ver `scripts/migrate-multi-tenant.sql` — script idempotente que:

1. Cria tabela `escolas`
2. Insere escola padrão (migração de dados existentes)
3. Adiciona `escola_id` em todas as tabelas
4. Preenche `escola_id` com a escola padrão para dados existentes
5. Adiciona `NOT NULL` constraint após preenchimento
6. Habilita RLS em todas as tabelas tenant-scoped
7. Cria políticas de isolamento
8. Adiciona claim `escola_id` ao processo de login
9. Cria tabelas de IA (`ia_*`) com `escola_id`
10. Ativa extensão `vector`

---

## Considerações de Performance

### Índices

Toda tabela tenant-scoped ganha índice composto `(escola_id, ...)`:

```sql
-- Padrão: índice por tenant + campo de busca mais frequente
CREATE INDEX idx_usuarios_escola ON usuarios(escola_id, email);
CREATE INDEX idx_estudantes_escola ON estudantes(escola_id);
CREATE INDEX idx_matriculas_escola ON matriculas(escola_id, ativo);
-- etc. para todas as tabelas
```

### RLS e Performance

O PostgreSQL planeja queries com RLS incluindo o filtro `escola_id` automaticamente. Com índice em `(escola_id, ...)`, a performance é equivalente à query explícita — sem overhead perceptível para tabelas de até ~1M linhas por tenant.

---

## Onboarding de Nova Escola

```
1. Super-admin cria escola: POST /api/admin/escolas
2. Sistema cria usuário admin padrão (senha temporária enviada por e-mail)
3. Admin da escola faz primeiro login → configura perfil, logo, dados da escola
4. Admin cria usuários: secretaria, coordenação, professores
5. Admin executa imports de cursos, turmas, estudantes (via /import/*)
6. Sistema está operacional para a nova escola
```

**Estimativa:** escola nova operacional em 1-2 dias úteis de configuração.

---

## LGPD e Isolamento

- Cada escola só acessa os **seus próprios dados** — garantido por RLS no banco
- Super-admin acessa dados estruturais (contagem de usuários, status) mas **nunca** dados pessoais de estudantes via painel cross-tenant
- Relatórios cross-tenant: apenas métricas agregadas (n° de escolas, n° de matrículas, uso de features)
- Cada escola pode solicitar exportação dos seus dados e exclusão completa

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `scripts/migrate-multi-tenant.sql` | DDL completa: escolas + escola_id + RLS |
| `scripts/migrate-ia-rag.sql` | pgvector + tabelas ia_* |
| `lib/db/src/schema/escolas.ts` | Schema Drizzle da tabela escolas |
| `lib/db/src/schema/ia.ts` | Schema Drizzle das tabelas de IA |
| `artifacts/api-server/src/middleware/tenant.ts` | withTenant() + requireTenant |
| `artifacts/api-server/src/routes/admin-escolas.ts` | CRUD super-admin de escolas |
| `artifacts/api-server/src/routes/ia.ts` | Endpoints /api/ia/* |
| `artifacts/api-server/src/lib/rag-engine.ts` | Motor RAG |
| `docker-compose.yml` | Atualizar para pgvector/pgvector:pg18 |
| `docker-compose.prod.yml` | Atualizar para pgvector/pgvector:pg18 |
| `.specs/features/multi-tenant.md` | Esta spec |
| `.claude/skills/seshat-multi-tenant/SKILL.md` | Skill de implementação |
