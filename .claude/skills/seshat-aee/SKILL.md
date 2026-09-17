# Skill: Módulo AEE (Atendimento Educacional Especializado)

## Visão Geral

Módulo para gestão de estudantes com necessidades educacionais especiais. Cobre: cadastro, Planos de Atendimento Individualizado (PAI), sessões de atendimento, laudos clínicos criptografados, metas/evoluções e liberações granulares para professores de sala.

Spec completa: `.specs/features/portal-aee.md`

---

## Arquivos Chave

| Arquivo | Responsabilidade |
|---|---|
| `artifacts/api-server/src/routes/aee.ts` | Todos os endpoints REST do módulo |
| `artifacts/api-server/src/lib/aee-crypto.ts` | Criptografia AES-256-CBC dos laudos |
| `artifacts/api-server/src/lib/aee-audit.ts` | Função de auditoria imutável |
| `lib/db/src/schema/aee.ts` | Schema Drizzle de todas as tabelas AEE |
| `artifacts/seshat/src/pages/aee/gestao.tsx` | UI de gestão (`aee:manage`) |
| `artifacts/seshat/src/pages/aee/analise.tsx` | UI de acompanhamento (`aee:view`) |
| `scripts/migrate-aee.sql` | Migração SQL — NÃO executar sem aprovação |

---

## Tabelas

```
aee_estudantes        — registro do estudante no AEE (soft-delete, campo cid10 restrito)
aee_planos            — PAI numerado (PAI-AAAA-NNNN), status lifecycle
aee_plano_assinaturas — assinaturas digitais do PAI (UNIQUE plano+usuario+papel)
aee_plano_adaptacoes  — adaptações pedagógicas do PAI
aee_metas             — metas do PAI com prazo e status
aee_evolucoes         — registros periódicos de evolução por meta
aee_sessoes           — sessões de atendimento (soft-delete, dados clínicos)
aee_laudos            — laudos clínicos cifrados (conteudo_enc)
aee_liberacoes        — autorização granular por professor (revogável)
aee_auditoria         — log imutável (INSERT only, nunca UPDATE/DELETE)
```

---

## Modelo de Permissões

| Nível | Papéis | Acesso |
|---|---|---|
| `aee:manage` | `professor_aee`, `psicologo`, `psicopedagogo` | CRUD completo + laudos + cid10 |
| `aee:view` | manage + `coordenacao`, `supervisao`, `direcao` | Leitura (sem laudos, sem cid10) |
| `aee:self` | `estudante`, `pai_responsavel` | Apenas `/portal/meu-plano` |
| Professor sala | sem papel AEE | Apenas `/portal-professor/:id` com liberação ativa |

Guard implementado via `aeeGuard(nivel)` no início de cada rota.

---

## Ciclo de Vida do PAI

```
rascunho → aguardando_assinatura → vigente → encerrado
```

- Edição só em `rascunho`.
- `vigente` = assinaturas de `professor_aee` + `responsavel` coletadas.
- Assinatura verificada via bcrypt na senha do usuário.

---

## Invariantes de Segurança (NUNCA violar)

1. **Laudo lido → auditoria registrada ANTES de descriptografar.** O `registrarAuditoriaAee` é chamado antes de `decifrarLaudo`.
2. **`aee_auditoria` é imutável.** Nenhum código deve fazer UPDATE ou DELETE nessa tabela.
3. **`conteudo_enc` nunca retornado na listagem** (`GET /laudos`). Só retornado descriptografado em `GET /laudos/:id`.
4. **Professor de sala NUNCA acessa laudos, cid10 ou sessões.** O endpoint `/portal-professor/:id` retorna exclusivamente o que a liberação ativa autoriza.
5. **Chave de criptografia derivada em runtime.** `ENCRYPTION_KEY` (env) + `escola_id` via HMAC-SHA256. Nunca armazenar a chave derivada.
6. **NÃO executar `scripts/migrate-aee.sql`** até que o ambiente de produção seja provisionado e aprovado.

---

## Endpoints Principais

```
GET    /api/aee/estudantes              → aee:view
POST   /api/aee/estudantes              → aee:manage
GET    /api/aee/planos                  → aee:view
POST   /api/aee/planos                  → aee:manage
POST   /api/aee/planos/:id/assinar      → autenticado (verifica senha)
GET    /api/aee/laudos/:id              → aee:manage (+ auditoria obrigatória)
POST   /api/aee/laudos                  → aee:manage (cifra antes de gravar)
PUT    /api/aee/liberacoes              → aee:manage (revoga e recria)
GET    /api/aee/auditoria               → aee:manage (leitura de logs, máx 200)
GET    /api/aee/portal/meu-plano        → aee:self
GET    /api/aee/portal-professor/:id    → autenticado (sem papel AEE, via liberação)
```

---

## Padrões de Implementação

- Todas as queries usam `withTenant(escolaId, tx => ...)` para isolamento multi-tenant.
- Soft-delete via `deletado_em` timestamp (nunca DELETE físico em estudantes, sessões, laudos).
- Liberações revogadas via `revogado_em` — nunca deletadas.
- Numeração do PAI: sequencial por escola+ano em transação para evitar race condition.
