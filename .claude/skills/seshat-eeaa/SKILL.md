# Skill: Módulo EEAA (Equipe Especializada de Apoio à Aprendizagem)

## Visão Geral

Módulo para gestão de estudantes com necessidades educacionais especiais. Cobre: cadastro, Planos de Atendimento Individualizado (PAI), sessões de atendimento, laudos clínicos criptografados, metas/evoluções e liberações granulares para professores de sala.

Spec completa: `.specs/features/portal-eeaa.md`

---

## Arquivos Chave

| Arquivo | Responsabilidade |
|---|---|
| `artifacts/api-server/src/routes/eeaa.ts` | Todos os endpoints REST do módulo |
| `artifacts/api-server/src/lib/eeaa-crypto.ts` | Criptografia AES-256-CBC dos laudos |
| `artifacts/api-server/src/lib/eeaa-audit.ts` | Função de auditoria imutável |
| `lib/db/src/schema/eeaa.ts` | Schema Drizzle de todas as tabelas EEAA |
| `artifacts/seshat/src/pages/eeaa/gestao.tsx` | UI de gestão (`eeaa:manage`) |
| `artifacts/seshat/src/pages/eeaa/analise.tsx` | UI de acompanhamento (`eeaa:view`) |
| `scripts/migrate-eeaa.sql` | Migração SQL — NÃO executar sem aprovação |

---

## Tabelas

```
eeaa_estudantes        — registro do estudante no EEAA (soft-delete, campo cid10 restrito)
eeaa_planos            — PAI numerado (PAI-AAAA-NNNN), status lifecycle
eeaa_plano_assinaturas — assinaturas digitais do PAI (UNIQUE plano+usuario+papel)
eeaa_plano_adaptacoes  — adaptações pedagógicas do PAI
eeaa_metas             — metas do PAI com prazo e status
eeaa_evolucoes         — registros periódicos de evolução por meta
eeaa_sessoes           — sessões de atendimento (soft-delete, dados clínicos)
eeaa_laudos            — laudos clínicos cifrados (conteudo_enc)
eeaa_liberacoes        — autorização granular por professor (revogável)
eeaa_auditoria         — log imutável (INSERT only, nunca UPDATE/DELETE)
```

---

## Modelo de Permissões

| Nível | Papéis | Acesso |
|---|---|---|
| `eeaa:manage` | `professor_eeaa`, `psicologo`, `psicopedagogo` | CRUD completo + laudos + cid10 |
| `eeaa:view` | manage + `coordenacao`, `supervisao`, `direcao` | Leitura (sem laudos, sem cid10) |
| `eeaa:self` | `estudante`, `pai_responsavel` | Apenas `/portal/meu-plano` |
| Professor sala | sem papel EEAA | Apenas `/portal-professor/:id` com liberação ativa |

Guard implementado via `eeaaGuard(nivel)` no início de cada rota.

---

## Ciclo de Vida do PAI

```
rascunho → aguardando_assinatura → vigente → encerrado
```

- Edição só em `rascunho`.
- `vigente` = assinaturas de `professor_eeaa` + `responsavel` coletadas.
- Assinatura verificada via bcrypt na senha do usuário.

---

## Invariantes de Segurança (NUNCA violar)

1. **Laudo lido → auditoria registrada ANTES de descriptografar.** O `registrarAuditoriaAee` é chamado antes de `decifrarLaudo`.
2. **`eeaa_auditoria` é imutável.** Nenhum código deve fazer UPDATE ou DELETE nessa tabela.
3. **`conteudo_enc` nunca retornado na listagem** (`GET /laudos`). Só retornado descriptografado em `GET /laudos/:id`.
4. **Professor de sala NUNCA acessa laudos, cid10 ou sessões.** O endpoint `/portal-professor/:id` retorna exclusivamente o que a liberação ativa autoriza.
5. **Chave de criptografia derivada em runtime.** `ENCRYPTION_KEY` (env) + `escola_id` via HMAC-SHA256. Nunca armazenar a chave derivada.
6. **NÃO executar `scripts/migrate-eeaa.sql`** até que o ambiente de produção seja provisionado e aprovado.

---

## Endpoints Principais

```
GET    /api/eeaa/estudantes              → eeaa:view
POST   /api/eeaa/estudantes              → eeaa:manage
GET    /api/eeaa/planos                  → eeaa:view
POST   /api/eeaa/planos                  → eeaa:manage
POST   /api/eeaa/planos/:id/assinar      → autenticado (verifica senha)
GET    /api/eeaa/laudos/:id              → eeaa:manage (+ auditoria obrigatória)
POST   /api/eeaa/laudos                  → eeaa:manage (cifra antes de gravar)
PUT    /api/eeaa/liberacoes              → eeaa:manage (revoga e recria)
GET    /api/eeaa/auditoria               → eeaa:manage (leitura de logs, máx 200)
GET    /api/eeaa/portal/meu-plano        → eeaa:self
GET    /api/eeaa/portal-professor/:id    → autenticado (sem papel EEAA, via liberação)
```

---

## Padrões de Implementação

- Todas as queries usam `withTenant(escolaId, tx => ...)` para isolamento multi-tenant.
- Soft-delete via `deletado_em` timestamp (nunca DELETE físico em estudantes, sessões, laudos).
- Liberações revogadas via `revogado_em` — nunca deletadas.
- Numeração do PAI: sequencial por escola+ano em transação para evitar race condition.

## Workflow Inter-módulos

Ver `.claude/skills/seshat-encaminhamentos/SKILL.md` para o workflow SOE ↔ EEAA ↔ SR.
