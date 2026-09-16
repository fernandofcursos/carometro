# Spec: Portal AEE (Atendimento Educacional Especializado)

## Visão Geral

O Portal AEE gerencia o Atendimento Educacional Especializado dentro do Seshat. Permite que profissionais especializados (professor_aee, psicologo, psicopedagogo) cadastrem estudantes com necessidades educacionais especiais, elaborem Planos de Atendimento Individualizado (PAI), registrem sessões, laudos clínicos e metas — com visibilidade granular e auditoria imutável para conformidade com LGPD e ISO 27001.

---

## Requisitos de Segurança (LGPD / ISO 27001)

- **Laudos criptografados em repouso**: conteúdo armazenado com AES-256-CBC; chave derivada por escola via HMAC-SHA256.
- **Auditoria imutável**: todo acesso a laudo, plano ou perfil gera INSERT em `aee_auditoria`. Nenhum UPDATE/DELETE é permitido nessa tabela.
- **Visibilidade em camadas**: professor de sala NUNCA acessa dados clínicos (laudos, cid10, detalhes de sessão). Vê apenas adaptações e metas, e somente se houver liberação explícita.
- **Assinatura digital com senha**: PAI só transita para `vigente` após assinatura de `professor_aee` e `responsavel`, cada uma verificada via bcrypt na senha do usuário.
- **Multi-tenant isolado**: todas as queries passam por `withTenant(escolaId)` + RLS do Postgres.

---

## Tabelas do Banco de Dados

| Tabela | Responsabilidade |
|---|---|
| `aee_estudantes` | Cadastro do estudante no AEE (soft-delete). Contém `cid10` — visível só para `aee:manage`. |
| `aee_planos` | PAI numerado (`PAI-AAAA-NNNN`). Campos: `numero`, `versao`, `status`, `periodo_inicio`, `periodo_fim`, `objetivos_gerais`. |
| `aee_plano_assinaturas` | Assinaturas digitais do PAI (UNIQUE por plano+usuario+papel). Armazena `token_hash` e `ip_origem`. |
| `aee_plano_adaptacoes` | Adaptações pedagógicas do PAI (avaliacao, metodologia, recurso, espaco, tempo). |
| `aee_metas` | Metas do PAI com `indicador`, `prazo` e `status` (nao_iniciada → concluida). |
| `aee_evolucoes` | Registros periódicos de evolução de cada meta (`periodo_ref` YYYY-MM, `percentual`). |
| `aee_sessoes` | Sessões de atendimento (data, duração, local, observações). Soft-delete. Dados clínicos — não expostos ao professor de sala. |
| `aee_laudos` | Laudos clínicos com conteúdo cifrado (`conteudo_enc`). Nunca retorna `conteudo_enc` cru na API. |
| `aee_liberacoes` | Autorização granular por professor: `ver_adaptacoes`, `ver_metas`, `ver_resumo_ia`. Revogável. |
| `aee_auditoria` | Log imutável: ação, usuário, estudante, recurso, ip, user-agent, timestamp. Sem UPDATE/DELETE. |

---

## Permissões e Papéis

| Nível | Papéis | Acesso |
|---|---|---|
| `aee:manage` | `professor_aee`, `psicologo`, `psicopedagogo` | CRUD completo: estudantes, planos, laudos, sessões, metas, liberações. Lê `cid10`. |
| `aee:view` | todos os acima + `coordenacao`, `supervisao`, `direcao` | Leitura de estudantes (sem `cid10`), planos, metas, adaptações, sessões. Não acessa laudos. |
| `aee:self` | `estudante`, `pai_responsavel` | Apenas `GET /portal/meu-plano` — plano vigente + adaptações + metas do próprio estudante. |
| Professor sala | nenhum papel AEE | Apenas `GET /portal-professor/:estudanteAeeId` — retorna somente o que a liberação autoriza. |

---

## Endpoints da API (`/api/aee`)

| Método | Caminho | Permissão | Observação |
|---|---|---|---|
| GET | `/estudantes` | `aee:view` | Lista sem `cid10` para view |
| GET | `/estudantes/:id` | `aee:view` | `cid10` omitido para não-manage |
| POST | `/estudantes` | `aee:manage` | Cria registro AEE |
| PUT | `/estudantes/:id` | `aee:manage` | Atualiza |
| DELETE | `/estudantes/:id` | `aee:manage` | Soft-delete |
| GET | `/planos` | `aee:view` | Filtra por `?estudanteAeeId=` |
| POST | `/planos` | `aee:manage` | Gera `numero` sequencial |
| PUT | `/planos/:id` | `aee:manage` | Só em `rascunho` |
| POST | `/planos/:id/assinar` | autenticado | Verifica senha; transita status |
| GET | `/planos/:id/adaptacoes` | autenticado | Sem guard — usado por professor-portal |
| POST | `/planos/:id/adaptacoes` | `aee:manage` | |
| DELETE | `/planos/:id/adaptacoes/:adaptId` | `aee:manage` | |
| GET | `/metas` | `aee:view` | Requer `?planoId=` |
| POST | `/metas` | `aee:manage` | |
| PUT | `/metas/:id` | `aee:manage` | Inclui `status` |
| POST | `/metas/:id/evolucao` | `aee:manage` | Registro periódico |
| GET | `/metas/:id/evolucao` | `aee:view` | |
| GET | `/sessoes` | `aee:view` | Dados clínicos — nunca para professor sala |
| POST | `/sessoes` | `aee:manage` | |
| PUT | `/sessoes/:id` | `aee:manage` | |
| DELETE | `/sessoes/:id` | `aee:manage` | Soft-delete |
| GET | `/laudos` | `aee:manage` | Lista SEM conteúdo cifrado |
| GET | `/laudos/:id` | `aee:manage` | Descriptografa; gera auditoria ANTES |
| POST | `/laudos` | `aee:manage` | Cifra antes de gravar |
| DELETE | `/laudos/:id` | `aee:manage` | Soft-delete + auditoria |
| GET | `/liberacoes/:estudanteAeeId` | `aee:manage` | Lista liberações ativas |
| PUT | `/liberacoes` | `aee:manage` | Revoga anterior e recria |
| DELETE | `/liberacoes/:id` | `aee:manage` | Revoga (soft) |
| GET | `/auditoria` | `aee:manage` | Leitura dos logs (máx 200) |
| GET | `/portal/meu-plano` | autenticado | Portal estudante/responsável |
| GET | `/portal-professor/:estudanteAeeId` | autenticado | Portal professor — só dados liberados |

---

## Ciclo de Vida do PAI

```
rascunho → aguardando_assinatura → vigente → encerrado
```

- Criado sempre como `rascunho`. Edição só em `rascunho`.
- Ao receber primeira assinatura válida, passa para `aguardando_assinatura`.
- Ao receber assinaturas de `professor_aee` **e** `responsavel`, passa para `vigente`.
- `encerrado` é estado final — nenhuma edição permitida.
- Numeração: `PAI-AAAA-NNNN` (sequencial por escola/ano).

---

## Criptografia dos Laudos

- Algoritmo: **AES-256-CBC**
- Chave derivada em runtime: `HMAC-SHA256(ENCRYPTION_KEY, escola_id)` — nunca armazenada.
- IV: 16 bytes aleatórios gerados a cada cifrada.
- Formato armazenado em `conteudo_enc`: `"<iv_hex>:<ciphertext_hex>"`.
- `chave_ref`: 16 chars hex derivados de HMAC do escolaId+timestamp — identificador de versão de chave para rotação futura.
- `ENCRYPTION_KEY` deve ter no mínimo 32 chars; ausência lança erro na inicialização.

---

## Auditoria

- Função: `registrarAuditoriaAee()` em `aee-audit.ts`.
- Gera INSERT em `aee_auditoria` em **todo** acesso a laudo, plano, perfil, portal.
- Campos registrados: `acao`, `usuario_id`, `estudante_id`, `recurso_id`, `escola_id`, `ip_origem`, `user_agent`, `criado_em`.
- Falhas de auditoria são logadas em stderr mas **não** derrubam a operação.
- A tabela não tem UPDATE/DELETE — logs são imutáveis.

Ações auditadas: `ACCESS_ATTEMPT`, `ACCESS_DENIED`, `READ_PERFIL`, `CREATE_ESTUDANTE`, `READ_PLANOS`, `ASSINAR_PAI`, `READ_ADAPTACOES`, `READ_METAS`, `READ_LAUDO`, `CREATE_LAUDO`, `DELETE_LAUDO`, `PROFESSOR_READ_LIBERACAO`, `PORTAL_READ_PAI`.

---

## Visibilidade do Professor de Sala

O professor de sala regular (sem papel AEE) **NUNCA** acessa:
- Laudos (`aee_laudos`)
- CID-10 (`aee_estudantes.cid10`)
- Detalhes de sessões (`aee_sessoes`)

Acessa via `GET /portal-professor/:estudanteAeeId` **somente** se houver liberação ativa (`aee_liberacoes.revogado_em IS NULL`) e apenas os dados autorizados:
- `ver_adaptacoes = true` → retorna adaptações do plano vigente
- `ver_metas = true` → retorna metas do plano vigente
- `ver_resumo_ia = true` → reservado para integração futura com IA

---

## Páginas de UI

| Rota | Componente | Permissão | Descrição |
|---|---|---|---|
| `/aee/gestao` | `gestao.tsx` | `aee:manage` | Gestão completa: estudantes, PAI, laudos (com modal de confirmação), liberações |
| `/aee/analise` | `analise.tsx` | `aee:view` | Visão de acompanhamento para gestão escolar — sem dados clínicos |

---

## Migração

O script de migração está em `scripts/migrate-aee.sql`.

> **IMPORTANTE**: NÃO executar este script até que o ambiente de produção esteja provisionado e aprovado pela equipe técnica. A migração cria todas as tabelas acima e não é reversível sem backup prévio.
