# Design: Portal AEE — Atendimento Educacional Especializado

**Data:** 2026-09-16  
**Status:** Aprovado — aguardando implementação  
**Abordagem:** Módulo integrado ao Seshat (Abordagem 1)

---

## 1. Contexto e Objetivo

O Portal AEE digitaliza o ciclo completo do Atendimento Educacional Especializado na escola: desde o vínculo do estudante com necessidades especiais até o acompanhamento de metas, passando pelo Plano de Atendimento Individualizado (PAI), sessões, laudos e a comunicação pedagógica com professores de sala regular.

**Conformidade obrigatória:** LGPD, ISO 27001, ECA, LBI (Lei Brasileira de Inclusão), Política Nacional de Educação Especial na Perspectiva da Educação Inclusiva.

---

## 2. Perfis de Acesso e Permissões

| Role | Permissão | Descrição |
|------|-----------|-----------|
| `professor_aee` | `aee:manage` | Acesso completo: PAI, sessões, laudos, metas, liberações, auditoria |
| `psicologo` | `aee:manage` | Mesmo acesso do professor AEE |
| `psicopedagogo` | `aee:manage` | Mesmo acesso do professor AEE |
| `coordenacao` | `aee:view` | PAI + adaptações + metas + sessões — sem laudos |
| `supervisao` | `aee:view` | Idem coordenação |
| `direcao` | `aee:view` | Idem coordenação |
| `professor` | `aee:view` | Somente campos liberados pela equipe AEE por estudante |
| `estudante` (≥18) | `aee:self` | Próprias adaptações, metas e evolução — sem laudos |
| `pai_responsavel` | `aee:self` | Adaptações, metas e evolução do filho — sem laudos |

### Matriz de Visibilidade

| Dado | Equipe AEE | Gestão | Professor sala | Estudante/Resp. |
|------|------------|--------|----------------|-----------------|
| Laudo / diagnóstico | ✅ | ❌ | ❌ | ❌ |
| Sessões de atendimento | ✅ | ✅ | ❌ | ❌ |
| PAI completo | ✅ | ✅ | ❌ | ❌ |
| Adaptações pedagógicas | ✅ | ✅ | ✅ (liberado) | ✅ |
| Metas de aprendizagem | ✅ | ✅ | ✅ (liberado) | ✅ |
| Evolução por período | ✅ | ✅ | ❌ | ✅ |
| Resumo IA | ✅ | ✅ | ✅ (sem clínico) | ❌ |
| Log de auditoria | ✅ | ❌ | ❌ | ❌ |

---

## 3. Banco de Dados

Todas as tabelas têm `escola_id` (multi-tenant, RLS), `criado_em`, `atualizado_em`, `deletado_em` (soft delete).

### 3.1 Tabelas

#### `aee_estudantes`
Vínculo do estudante ao serviço AEE.

```sql
id                uuid PK
escola_id         uuid FK escolas
usuario_id        uuid FK usuarios  -- o estudante
necessidades      text              -- descrição geral (não clínica)
cid10             varchar(10)       -- CID-10 opcional (dado sensível — acesso aee:manage)
profissional_id   uuid FK usuarios  -- professor AEE responsável
ativo             boolean DEFAULT true
criado_em         timestamptz
atualizado_em     timestamptz
deletado_em       timestamptz
```

#### `aee_planos`
PAI com versões e ciclo de vida.

```sql
id                uuid PK
escola_id         uuid FK escolas
estudante_aee_id  uuid FK aee_estudantes
numero            varchar(20)       -- PAI-2026-0001
versao            smallint DEFAULT 1
status            varchar(20)       -- 'rascunho' | 'aguardando_assinatura' | 'vigente' | 'encerrado'
periodo_inicio    date
periodo_fim       date
objetivos_gerais  text
criado_por_id     uuid FK usuarios
criado_em         timestamptz
atualizado_em     timestamptz
deletado_em       timestamptz
```

#### `aee_plano_assinaturas`
Assinaturas digitais do PAI.

```sql
id                uuid PK
plano_id          uuid FK aee_planos
usuario_id        uuid FK usuarios
papel             varchar(30)       -- 'professor_aee' | 'responsavel' | 'estudante'
metodo            varchar(30)       -- 'senha' | 'gov_br' | 'certificado_digital'
token_hash        varchar(64)       -- SHA-256
assinado_em       timestamptz
ip_origem         inet
UNIQUE(plano_id, usuario_id, papel)
```

#### `aee_plano_adaptacoes`
Adaptações pedagógicas — visíveis aos professores liberados.

```sql
id                uuid PK
plano_id          uuid FK aee_planos
descricao         text NOT NULL
area              varchar(50)       -- 'avaliacao' | 'metodologia' | 'recurso' | 'espaco' | 'tempo'
criado_em         timestamptz
```

#### `aee_metas`
Metas de aprendizagem com prazo.

```sql
id                uuid PK
plano_id          uuid FK aee_planos
descricao         text NOT NULL
indicador         text              -- como medir o alcance
prazo             date
status            varchar(20)       -- 'nao_iniciada' | 'em_andamento' | 'alcancada' | 'nao_alcancada'
criado_em         timestamptz
atualizado_em     timestamptz
```

#### `aee_evolucoes`
Registros de evolução por meta e período.

```sql
id                uuid PK
meta_id           uuid FK aee_metas
profissional_id   uuid FK usuarios
periodo_ref       varchar(7)        -- 'AAAA-MM' ex: '2026-09'
observacao        text NOT NULL
percentual        smallint          -- 0–100 (% de alcance estimado)
registrado_em     timestamptz
```

#### `aee_sessoes`
Atendimentos individuais realizados.

```sql
id                uuid PK
escola_id         uuid FK escolas
estudante_aee_id  uuid FK aee_estudantes
profissional_id   uuid FK usuarios
data_sessao       date NOT NULL
duracao_min       smallint          -- duração em minutos
local             varchar(100)      -- 'sala_recursos' | 'sala_aula' | 'remoto'
observacoes       text
criado_em         timestamptz
```

#### `aee_laudos`
Laudos e diagnósticos — conteúdo criptografado.

```sql
id                uuid PK
escola_id         uuid FK escolas
estudante_aee_id  uuid FK aee_estudantes
tipo              varchar(50)       -- 'psicologico' | 'psicopedagogico' | 'fonoaudiologico' | 'medico' | 'outro'
titulo            varchar(200)
conteudo_enc      bytea NOT NULL    -- pgp_sym_encrypt(texto, chave_derivada)
chave_ref         varchar(64)       -- referência para rotação de chave
profissional_ext  varchar(200)      -- nome do profissional externo (se for laudo externo)
data_laudo        date
criado_por_id     uuid FK usuarios
criado_em         timestamptz
deletado_em       timestamptz
```

#### `aee_liberacoes`
Controle granular do que cada professor de sala pode visualizar.

```sql
id                uuid PK
escola_id         uuid FK escolas
estudante_aee_id  uuid FK aee_estudantes
professor_id      uuid FK usuarios
ver_adaptacoes    boolean DEFAULT true
ver_metas         boolean DEFAULT false
ver_resumo_ia     boolean DEFAULT false
concedido_por_id  uuid FK usuarios
concedido_em      timestamptz
revogado_em       timestamptz       -- NULL = ativo
```

#### `aee_auditoria`
Log imutável de todos os acessos a dados AEE.

```sql
id                uuid PK
escola_id         uuid FK escolas
acao              varchar(50)       -- 'READ_LAUDO' | 'READ_PAI' | 'UPDATE_META' | 'ACCESS_DENIED' | etc.
usuario_id        uuid NOT NULL     -- quem acessou
estudante_id      uuid              -- qual estudante foi acessado
recurso_id        uuid              -- id do laudo/plano/sessão acessado
ip_origem         inet
user_agent        text
criado_em         timestamptz NOT NULL DEFAULT now()
-- SEM deletado_em — imutável por design
```

### 3.2 Segurança no Banco

**Criptografia de laudos:**
```
Chave derivada por escola (nunca armazenada):
  CHAVE = HMAC-SHA256(ENCRYPTION_KEY_GLOBAL, escola_id)

Gravação:
  conteudo_enc = pgp_sym_encrypt(texto_laudo, CHAVE)

Leitura (somente aee:manage):
  texto = pgp_sym_decrypt(conteudo_enc, CHAVE)
  → sempre seguida de INSERT em aee_auditoria

Rotação:
  chave_ref permite re-criptografar em background sem downtime
```

**Imutabilidade da auditoria via RLS:**
```sql
CREATE POLICY aee_auditoria_no_update ON aee_auditoria FOR UPDATE USING (false);
CREATE POLICY aee_auditoria_no_delete ON aee_auditoria FOR DELETE USING (false);
```

**RLS multi-tenant (padrão do projeto):**
```sql
-- Todas as tabelas aee_* têm política tenant_isolation herdada
-- withTenant(escolaId, tx) obrigatório em todas as rotas AEE
```

---

## 4. API Endpoints

Todas as rotas requerem `requireAuth` + `aeeGuard(nivel)`.  
Todas as chamadas DB são envolvidas em `withTenant(req.escolaId, tx)`.

### 4.1 Estudantes AEE

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| GET | `/api/aee/estudantes` | `aee:view` | Lista estudantes vinculados ao AEE |
| POST | `/api/aee/estudantes` | `aee:manage` | Vincula estudante ao AEE |
| GET | `/api/aee/estudantes/:id` | `aee:view` | Perfil completo (camadas por role) |
| PUT | `/api/aee/estudantes/:id` | `aee:manage` | Atualiza perfil AEE |
| DELETE | `/api/aee/estudantes/:id` | `aee:manage` | Encerra vínculo (soft delete) |

### 4.2 Planos (PAI)

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| GET | `/api/aee/planos` | `aee:view` | Lista PAIs |
| POST | `/api/aee/planos` | `aee:manage` | Cria PAI (status: rascunho) |
| PUT | `/api/aee/planos/:id` | `aee:manage` | Edita PAI (somente rascunho) |
| POST | `/api/aee/planos/:id/assinar` | `aee:manage` \| `aee:self` | Assina PAI digitalmente |
| GET | `/api/aee/planos/:id/adaptacoes` | `aee:view` \| `aee:self` | Adaptações do PAI |
| POST | `/api/aee/planos/:id/adaptacoes` | `aee:manage` | Adiciona adaptação |
| DELETE | `/api/aee/planos/:id/adaptacoes/:adaptId` | `aee:manage` | Remove adaptação |

### 4.3 Metas e Evolução

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| GET | `/api/aee/metas` | `aee:view` | Metas do PAI vigente |
| POST | `/api/aee/metas` | `aee:manage` | Cria meta |
| PUT | `/api/aee/metas/:id` | `aee:manage` | Atualiza meta |
| POST | `/api/aee/metas/:id/evolucao` | `aee:manage` | Registra evolução |
| GET | `/api/aee/metas/:id/evolucao` | `aee:view` \| `aee:self` | Histórico de evolução |

### 4.4 Sessões

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| GET | `/api/aee/sessoes` | `aee:view` | Lista sessões |
| POST | `/api/aee/sessoes` | `aee:manage` | Registra sessão |
| PUT | `/api/aee/sessoes/:id` | `aee:manage` | Edita sessão |
| DELETE | `/api/aee/sessoes/:id` | `aee:manage` | Remove sessão (soft delete) |

### 4.5 Laudos (acesso restrito + auditoria obrigatória)

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| GET | `/api/aee/laudos` | `aee:manage` | Lista laudos (sem conteúdo) |
| POST | `/api/aee/laudos` | `aee:manage` | Salva laudo (criptografa antes de gravar) |
| GET | `/api/aee/laudos/:id` | `aee:manage` | Descriptografa + retorna + **auditoria** |
| DELETE | `/api/aee/laudos/:id` | `aee:manage` | Soft delete + auditoria |

### 4.6 Liberações

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| GET | `/api/aee/liberacoes/:estudanteAeeId` | `aee:manage` | Lista liberações do estudante |
| PUT | `/api/aee/liberacoes` | `aee:manage` | Cria/atualiza liberação por professor |
| DELETE | `/api/aee/liberacoes/:id` | `aee:manage` | Revoga liberação |

### 4.7 Auditoria

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| GET | `/api/aee/auditoria` | `aee:manage` | Log de acessos (somente leitura) |

### 4.8 Portais (estudante, responsável, professor)

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| GET | `/api/portal-aee/meu-plano` | `aee:self` | PAI vigente (só adaptações e metas) |
| GET | `/api/portal-aee/minha-evolucao` | `aee:self` | Evolução por período |
| GET | `/api/portal-professor/aee/:estudanteId` | `aee:view` | Somente campos liberados |

### 4.9 Middleware de segurança

```typescript
// aeeGuard — validação dupla: role no banco + registro de tentativa
async function aeeGuard(nivel: "manage" | "view" | "self") {
  return async (req, res, next) => {
    const roles = await buscarRoles(req.usuarioId!);
    // Registra tentativa — inclusive acessos negados
    await registrarAuditoriaAee(req, "ACCESS_ATTEMPT", nivel);
    if (!temAcessoAee(roles, nivel)) {
      await registrarAuditoriaAee(req, "ACCESS_DENIED", nivel);
      return res.status(403).json({ error: "Acesso negado." });
    }
    next();
  };
}

// Professor sala: guard adicional verifica aee_liberacoes
async function aeeGuardProfessor(req, res, next) {
  const liberacao = await buscarLiberacao(req.usuarioId!, req.params.estudanteId);
  if (!liberacao) return res.status(403).json({ error: "Acesso não liberado pela equipe AEE." });
  req.liberacao = liberacao; // campos autorizados passados adiante
  next();
}
```

---

## 5. Assinatura Digital do PAI

Mesmo mecanismo dos Requerimentos, com três papéis:

```typescript
// Token: SHA256(`${planoId}:${usuarioId}:${papel}:${Date.now()}:${senha}`)
// Armazenado como SHA-256 (64 chars) em aee_plano_assinaturas.token_hash

// Papéis obrigatórios para ativar o PAI:
// 'professor_aee'   — sempre obrigatório
// 'responsavel'     — sempre obrigatório
// 'estudante'       — obrigatório se usuário for maior de idade

// Transição de status:
// 'rascunho' → 'aguardando_assinatura' (ao solicitar assinaturas)
// 'aguardando_assinatura' → 'vigente' (após TODAS as assinaturas obrigatórias)
// 'vigente' → 'encerrado' (ao criar nova versão ou ao fim do período)

// Métodos suportados:
// 'senha'               — bcrypt.compare + SHA-256 (implementado)
// 'gov_br'              — placeholder (futuro)
// 'certificado_digital' — placeholder (futuro)
```

---

## 6. UI por Perfil

### `/aee/gestao` — Equipe AEE

- **KPIs:** Estudantes ativos, PAIs vigentes, sessões no mês, % metas no prazo
- **Lista de estudantes:** busca por nome, filtro por status do PAI
- **Perfil do estudante (modal/página):**
  - Aba 1: PAI vigente + histórico de versões + status de assinaturas
  - Aba 2: Sessões de atendimento (lista + novo registro)
  - Aba 3: Metas e Evolução (timeline + gráfico de progresso)
  - Aba 4: Laudos (clique exige confirmação + gera auditoria)
  - Aba 5: Adaptações pedagógicas
  - Aba 6: Liberações por professor
  - Aba 7: Resumo IA (gerado a partir de adaptações + metas)

### `/aee/analise` — Coordenação / Supervisão / Direção

- Mesma lista de estudantes — sem abas Laudos e Liberações
- PAI: leitura + acompanhamento de assinaturas pendentes
- Metas e Evolução: visualização agregada por período
- Sessões: visualização sem criar/editar

### Portal do Estudante / Responsável — aba AEE

- PAI vigente: adaptações e metas (sem laudos, sem sessões)
- Gráfico de progresso por meta e por período
- Assinatura pendente: botão proeminente quando PAI aguarda assinatura
- Histórico de PAIs anteriores (somente adaptações)

### Portal do Professor — card AEE

- Badge "Atendido pelo AEE" sempre visível na listagem da turma
- Conteúdo: somente campos liberados pela equipe AEE
  - Adaptações pedagógicas recomendadas
  - Metas de aprendizagem do período atual
- Nenhum dado clínico — nunca

### Menu

```
Grupo: "AEE"  (visível para aee:manage | aee:view)
  ├── "Atendimento"      → /aee/gestao    (aee:manage)
  └── "Acompanhamento"   → /aee/analise   (aee:view — gestão)
```

---

## 7. Integração com IA do Seshat

```typescript
// Resumo pedagógico — disponível para equipe AEE e gestão
// Entrada: adaptações + metas + evolução do período atual
// Nunca inclui: laudos, diagnósticos, CID-10, dados clínicos

// Filtro duplo antes de enviar para IA:
// 1. Remove campos marcados como clínicos do payload
// 2. Registra em aee_auditoria: { acao: 'IA_RESUMO', usuario_id, estudante_id }

// System prompt:
// "Você é um assistente pedagógico especializado em educação inclusiva.
//  Com base nas adaptações e metas a seguir, sugira estratégias de ensino
//  e identifique padrões de evolução. NUNCA solicite, mencione ou infira
//  diagnósticos clínicos ou condições de saúde."
```

---

## 8. Migração SQL

Arquivo: `scripts/migrate-aee.sql`  
Padrão: idempotente (`CREATE TABLE IF NOT EXISTS`, seed em bloco `DO $$ ... $$`).

**Sequência:**
1. Criar extensão `pgcrypto` (se não existir)
2. Criar tabelas `aee_*` na ordem de dependência
3. Criar índices (por `escola_id`, `estudante_aee_id`, `profissional_id`)
4. Habilitar RLS + FORCE em todas as tabelas `aee_*`
5. Aplicar política `tenant_isolation` (padrão do projeto)
6. Aplicar políticas de imutabilidade em `aee_auditoria`
7. Inserir permissões: `aee:manage`, `aee:view`, `aee:self`

---

## 9. Arquivos a criar

| Arquivo | Responsabilidade |
|---------|-----------------|
| `lib/db/src/schema/aee.ts` | Schemas Drizzle das 9 tabelas |
| `scripts/migrate-aee.sql` | DDL idempotente + RLS + permissões |
| `artifacts/api-server/src/routes/aee.ts` | Todos os endpoints + aeeGuard |
| `artifacts/api-server/src/lib/aee-crypto.ts` | Criptografia/descriptografia de laudos |
| `artifacts/api-server/src/lib/aee-audit.ts` | registrarAuditoriaAee() |
| `artifacts/seshat/src/pages/aee/gestao.tsx` | UI equipe AEE |
| `artifacts/seshat/src/pages/aee/analise.tsx` | UI gestão escolar |
| `.specs/features/portal-aee.md` | Spec do módulo (referência futura) |
| `.claude/skills/seshat-aee/SKILL.md` | Skill do módulo AEE |

---

## 10. Testes

- `src/tests/aee.test.ts` — cobertura de todos os endpoints
- Casos obrigatórios:
  - Professor de sala não vê laudos (403)
  - Professor de sala não vê dados sem liberação (403)
  - Leitura de laudo gera registro em `aee_auditoria`
  - PAI não ativa sem todas as assinaturas obrigatórias
  - `aee_auditoria` não aceita UPDATE nem DELETE
  - Descriptografia falha com chave errada
  - Acesso negado registrado na auditoria

---

## 11. Numeração

```
PAI-AAAA-NNNN  ex: PAI-2026-0001
Gerada via COUNT(*) WHERE EXTRACT(year FROM criado_em) = anoAtual + lpad (padrão dos Requerimentos)
```
