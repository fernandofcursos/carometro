# Skill: Portal SOE — Serviço de Orientação Educacional

## Visão Geral

Módulo para digitalizar o trabalho da Orientação Educacional (OE) em cursos técnicos e de qualificação profissional. Registros sigilosos criptografados com AES-256-CBC, auditoria imutável, conformidade com LGPD, ISO 27001, normativos SEDF, MEC e CNE.

## Tabelas

| Tabela | Responsabilidade |
|---|---|
| `soe_atendimentos` | Atendimentos individuais, grupais, familiares e online com `registro_enc` (sigiloso) |
| `soe_encaminhamentos` | Encaminhamentos de professores/coordenação para a OE com `observacao_enc` |
| `soe_acoes` | Ações individuais (só OE) e coletivas (gestão também) com prazo e responsável |
| `soe_estudos_de_caso` | Reuniões multiprofissionais com deliberações e próximos passos |
| `soe_auditoria` | Log imutável via RLS — UPDATE e DELETE bloqueados para todos |

## Permissões

| Permissão | Roles | Acesso |
|---|---|---|
| `soe:manage` | `orientadora_educacional` | Tudo, incluindo campos criptografados |
| `soe:view` | `coordenacao`, `supervisao`, `direcao` | Sem campos criptografados |
| `soe:encaminhar` | `professor` | Próprios encaminhamentos + ações atribuídas |
| `soe:self` | `estudante`, `pai_responsavel` | data, tipo, motivo, status dos próprios atendimentos |

## Endpoints

| Método | Rota | Permissão |
|---|---|---|
| GET/POST | `/api/soe/atendimentos` | manage/view (GET), manage (POST) |
| GET/PUT/DELETE | `/api/soe/atendimentos/:id` | manage |
| GET/POST | `/api/soe/encaminhamentos` | encaminhar+ |
| PUT | `/api/soe/encaminhamentos/:id/status` | manage |
| GET/POST | `/api/soe/acoes` | encaminhar+ |
| PUT | `/api/soe/acoes/:id/status` | responsável ou manage |
| DELETE | `/api/soe/acoes/:id` | manage |
| GET/POST/PUT | `/api/soe/estudos-de-caso` | view/manage |
| GET | `/api/soe/portal/meus-atendimentos` | self |
| GET | `/api/soe/portal/minhas-acoes` | self |
| GET | `/api/soe/auditoria` | manage |

## Regras de Segurança (CRÍTICAS)

1. **Criptografia**: `registro_enc` e `observacao_enc` usam AES-256-CBC. Chave = `HMAC-SHA256(ENCRYPTION_KEY, escola_id)`. Nunca armazenada em texto puro. Libs: `soe-crypto.ts`
2. **Auditoria obrigatória**: `GET /atendimentos/:id` insere em `soe_auditoria` ANTES de descriptografar — sempre, sem exceção. Lib: `soe-audit.ts`
3. **Professor nunca acessa campos cifrados**: `soeGuard("encaminhar")` filtra apenas metadados
4. **Estudante vê somente**: `data_atendimento`, `tipo`, `motivo`, `status` — sem `registro_enc`
5. **`soe_auditoria` imutável**: RLS bloqueia UPDATE e DELETE para todos, inclusive superadmin

## UI

- `/soe/gestao` — Portal da OE (soe:manage): KPIs, lista estudantes, tabs Atendimentos/Encaminhamentos/Ações/Estudo de Caso, dialog de acesso auditado com confirmação LGPD obrigatória
- `/soe/analise` — Portal da Gestão (soe:view): sem registros sigilosos, aviso LGPD fixo
- `/soe/encaminhar` — Portal do Professor (soe:encaminhar): formulário de encaminhamento + lista própria + ações atribuídas
- `/portal` aba SOE — Estudante/Responsável: data, tipo, motivo, status + aviso LGPD

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/soe.ts` | 5 tabelas Drizzle ORM |
| `scripts/migrate-soe.sql` | DDL + RLS + seeds — NÃO executar antes do provisionamento de produção |
| `artifacts/api-server/src/lib/soe-crypto.ts` | cifrarRegistro / decifrarRegistro / gerarChaveRef |
| `artifacts/api-server/src/lib/soe-audit.ts` | registrarAuditoriaSoe (nunca lança exceção) |
| `artifacts/api-server/src/routes/soe.ts` | Todos os endpoints |
| `artifacts/seshat/src/pages/soe/gestao.tsx` | Portal da OE |
| `artifacts/seshat/src/pages/soe/analise.tsx` | Portal da Gestão |
| `artifacts/seshat/src/pages/soe/encaminhar.tsx` | Portal do Professor |
| `.specs/features/portal-soe.md` | Spec completa |

## Migração

```bash
psql $DATABASE_URL -f scripts/migrate-soe.sql
```

Idempotente. **ATENÇÃO: não executar em produção antes do ambiente estar provisionado.**
