# Portal SOE — Serviço de Orientação Educacional

## Objetivo

Digitalizar o trabalho da Orientação Educacional (OE) em cursos técnicos e de qualificação profissional, garantindo registro seguro de atendimentos sigilosos, encaminhamentos por professores e gestão, acompanhamento de ações individuais e coletivas, estudos de caso multiprofissionais e um mini-portal para estudantes e responsáveis — tudo em conformidade com LGPD, ISO 27001, normativos SEDF, MEC e CNE.

## Público-alvo do SOE (conforme atribuições institucionais)

Estudantes que apresentam comportamentos que influenciam negativamente o sucesso escolar ou que tenham direitos violados: timidez, isolamento, ansiedade, automutilação, conflitos professor/aluno, bullying, entre outros. O SOE **não é** serviço disciplinar.

## Conformidade legal e normativa

- **LGPD** (Lei 13.709/2018) — Art. 11: dados de saúde, vida sexual, crianças e adolescentes são dados sensíveis; exigem criptografia, finalidade declarada, minimização e rastreabilidade de acessos.
- **ISO 27001** — Controle A.8.24 (criptografia), A.8.15 (logging imutável), A.9 (controle de acesso por papel).
- **SEDF** — Regimento Escolar da rede pública do DF: sigilo de informações de estudantes em situação de vulnerabilidade.
- **MEC / CNE** — Resolução CNE/CP nº 2/2017 e normas sobre privacidade de dados educacionais sensíveis.

## Abordagem arquitetural

Módulo monolítico integrado, seguindo o mesmo padrão do módulo AEE já existente: um schema file, um route file, criptografia AES-256-CBC com chave derivada por escola, auditoria imutável via RLS.

## Global Constraints

- Criptografia obrigatória: `registro_enc` e `observacao_enc` usam AES-256-CBC; chave = `HMAC-SHA256(ENCRYPTION_KEY, escola_id)` — nunca armazenada em texto puro.
- Todo acesso a campos criptografados gera INSERT em `soe_auditoria` **antes** de retornar dados.
- `soe_auditoria`: imutável via RLS — `UPDATE` e `DELETE` bloqueados para todos os usuários, incluindo superadmin.
- `scripts/migrate-soe.sql` **não deve ser executado** até que o ambiente de produção esteja provisionado.
- Professor (`soe:encaminhar`) **nunca** acessa conteúdo de atendimentos nem campos criptografados.
- Estudante/responsável (`soe:self`) vê apenas `data`, `tipo`, `motivo` e `status` dos próprios atendimentos — sem nenhum campo sigiloso.

---

## Modelo de dados

### `soe_atendimentos`

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| escola_id | uuid NOT NULL | Multi-tenant |
| estudante_id | uuid NOT NULL FK → usuarios | — |
| orientadora_id | uuid NOT NULL FK → usuarios | OE responsável |
| encaminhamento_id | uuid nullable FK → soe_encaminhamentos | Origem |
| data_atendimento | date NOT NULL | — |
| tipo | enum NOT NULL | `individual` `grupo` `familiar` `online` |
| motivo | text NOT NULL | Visível à gestão e ao estudante/responsável |
| registro_enc | text | AES-256-CBC: `iv_hex:ciphertext_hex` — só OE |
| chave_ref | varchar(64) | HMAC-SHA256 de referência; nunca texto puro |
| status | enum NOT NULL | `aberto` `em_acompanhamento` `encerrado` |
| criado_em | timestamptz DEFAULT now() | — |
| atualizado_em | timestamptz DEFAULT now() | — |
| deletado_em | timestamptz nullable | Soft delete |

### `soe_encaminhamentos`

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | — |
| escola_id | uuid NOT NULL | — |
| estudante_id | uuid NOT NULL FK → usuarios | — |
| encaminhado_por_id | uuid NOT NULL FK → usuarios | Professor, coord, etc. |
| motivo | text NOT NULL | Visível ao encaminhador e à OE |
| prioridade | enum NOT NULL | `normal` `urgente` |
| status | enum NOT NULL | `pendente` `em_atendimento` `concluido` `arquivado` |
| observacao_enc | text | Resposta da OE — AES-256-CBC; só OE escreve/lê |
| chave_ref | varchar(64) | — |
| criado_em | timestamptz | — |
| atualizado_em | timestamptz | — |

### `soe_acoes`

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | — |
| escola_id | uuid NOT NULL | — |
| tipo | enum NOT NULL | `individual` `coletiva` |
| titulo | varchar(200) NOT NULL | — |
| descricao | text | — |
| responsavel_id | uuid NOT NULL FK → usuarios | A quem foi atribuída |
| estudante_id | uuid nullable FK → usuarios | Só para ações individuais |
| atendimento_id | uuid nullable FK → soe_atendimentos | Vínculo opcional |
| prazo | date | — |
| status | enum NOT NULL | `pendente` `em_andamento` `concluida` `cancelada` |
| criado_por_id | uuid NOT NULL FK → usuarios | — |
| criado_em | timestamptz | — |
| atualizado_em | timestamptz | — |

### `soe_estudos_de_caso`

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | — |
| escola_id | uuid NOT NULL | — |
| estudante_id | uuid NOT NULL FK → usuarios | — |
| data_reuniao | date NOT NULL | — |
| participantes | text | Nomes e funções dos presentes |
| deliberacoes | text | Registro das decisões |
| proximos_passos | text | — |
| status | enum NOT NULL | `agendado` `realizado` `cancelado` |
| criado_por_id | uuid NOT NULL FK → usuarios | — |
| criado_em | timestamptz | — |
| atualizado_em | timestamptz | — |

### `soe_auditoria` (imutável)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | — |
| escola_id | uuid NOT NULL | — |
| acao | text NOT NULL | Ex: `READ_REGISTRO`, `CREATE_ATENDIMENTO` |
| usuario_id | uuid NOT NULL | Quem acessou |
| estudante_id | uuid nullable | Estudante relacionado |
| recurso_id | uuid nullable | ID do registro acessado |
| ip_origem | text | — |
| user_agent | text | — |
| criado_em | timestamptz DEFAULT now() | — |

RLS: `UPDATE` e `DELETE` bloqueados via políticas `USING (false)` para todos.

---

## Permissões

| Permissão | Roles sugeridas |
|---|---|
| `soe:manage` | `orientadora_educacional` |
| `soe:view` | `coordenacao`, `supervisao`, `direcao` |
| `soe:encaminhar` | `professor` |
| `soe:self` | `estudante`, `pai_responsavel` |

Seeds em `migrate-soe.sql`:
```sql
INSERT INTO permissoes (recurso, acao) VALUES
  ('soe', 'manage'), ('soe', 'view'),
  ('soe', 'encaminhar'), ('soe', 'self')
ON CONFLICT DO NOTHING;
```

---

## Visibilidade por perfil

| Dado | OE (manage) | Gestão (view) | Professor (encaminhar) | Estudante/Resp. (self) |
|---|:---:|:---:|:---:|:---:|
| `registro_enc` (sigiloso) | ✅ + audit | ❌ | ❌ | ❌ |
| `observacao_enc` (resposta OE) | ✅ | ❌ | ❌ | ❌ |
| Motivo do atendimento | ✅ | ✅ | ❌ | ✅ próprio |
| Status do atendimento | ✅ | ✅ | ❌ | ✅ próprio |
| Encaminhamentos | ✅ | ✅ criar/ver | ✅ próprios | ❌ |
| Ações | ✅ | ✅ coletivas + atribuídas | ✅ atribuídas | ✅ individuais próprias |
| Estudos de caso | ✅ | ✅ | ❌ | ❌ |
| Log de auditoria | ✅ | ❌ | ❌ | ❌ |

---

## API Endpoints

Todos sob `/api/soe`, protegidos por `requireAuth` + `soeGuard(nivel)`.

### Atendimentos

| Método | Rota | Permissão | Comportamento |
|---|---|---|---|
| GET | `/atendimentos` | manage ou view | OE recebe tudo; gestão recebe sem `registro_enc` |
| POST | `/atendimentos` | manage | Cifra `registro` → `registro_enc` antes de salvar |
| GET | `/atendimentos/:id` | manage | INSERT em `soe_auditoria` antes de descriptografar |
| PUT | `/atendimentos/:id` | manage | Atualiza qualquer campo incl. `status`; re-cifra se `registro` alterado |
| DELETE | `/atendimentos/:id` | manage | Soft delete |

### Encaminhamentos

| Método | Rota | Permissão | Comportamento |
|---|---|---|---|
| GET | `/encaminhamentos` | manage, view, ou encaminhar | Professor vê só os seus |
| POST | `/encaminhamentos` | encaminhar ou view | Qualquer perfil pode encaminhar |
| GET | `/encaminhamentos/:id` | manage ou próprio encaminhador | — |
| PUT | `/encaminhamentos/:id/status` | manage | OE atualiza status + cifra `observacao_enc` |

### Ações

| Método | Rota | Permissão | Comportamento |
|---|---|---|---|
| GET | `/acoes` | manage, view, ou encaminhar | Professor: só atribuídas a si |
| POST | `/acoes` | manage (individual) ou view (coletiva) | — |
| PUT | `/acoes/:id/status` | responsável atribuído ou manage | — |
| DELETE | `/acoes/:id` | manage | Soft delete |

### Estudos de Caso

| Método | Rota | Permissão | Comportamento |
|---|---|---|---|
| GET | `/estudos-de-caso` | manage ou view | — |
| POST | `/estudos-de-caso` | manage | — |
| PUT | `/estudos-de-caso/:id` | manage | Atualiza deliberações, próximos passos, status |

### Portal Estudante / Responsável

| Método | Rota | Permissão | Comportamento |
|---|---|---|---|
| GET | `/portal/meus-atendimentos` | self | Só do próprio; sem `registro_enc` |
| GET | `/portal/minhas-acoes` | self | Ações individuais do estudante |

### Auditoria

| Método | Rota | Permissão | Comportamento |
|---|---|---|---|
| GET | `/auditoria` | manage | Log de acessos aos campos sigilosos |

---

## UI — Páginas

### Menu

```
Grupo: "SOE"  (ícone: HeartHandshake)
├── "Atendimentos"   → /soe/gestao        visível: soe:manage
├── "Acompanhamento" → /soe/analise       visível: soe:view (sem soe:manage)
└── "Encaminhamentos" → /soe/encaminhar   visível: soe:encaminhar (sem soe:view)
```

### `/soe/gestao` — Portal da OE

- KPIs: Atendimentos abertos · Encaminhamentos pendentes · Ações em andamento · Estudos de caso agendados
- Lista de estudantes com busca
- Painel de detalhes com tabs: **Atendimentos · Encaminhamentos · Ações · Estudo de Caso**
- Tab Atendimentos: lista com data/tipo/status; botão "Ver registro sigiloso" → dialog com confirmação LGPD obrigatória antes de descriptografar; botão "Novo atendimento"; OE pode atualizar status a qualquer momento
- Tab Encaminhamentos: lista dos encaminhamentos do estudante, status, botão para responder com `observacao_enc`
- Tab Ações: ações individuais do estudante + botão "Nova ação"
- Tab Estudo de Caso: histórico de reuniões + botão "Novo estudo de caso"

### `/soe/analise` — Portal da Gestão

- Aviso fixo: *"Registros sigilosos não estão disponíveis nesta visão conforme LGPD."*
- Lista de estudantes com motivo, tipo e status dos atendimentos
- Painel de ações coletivas: criar, acompanhar, atualizar status das atribuídas a si
- Painel de estudos de caso: ver deliberações, participar

### `/soe/encaminhar` — Portal do Professor

- Formulário de encaminhamento: seleciona estudante, motivo, prioridade
- Lista dos próprios encaminhamentos com status e resposta da OE (quando disponível)
- Lista de ações atribuídas: título, prazo, botão "Marcar como concluída"

### Aba SOE no `/portal` (estudante/responsável)

- Lista dos próprios atendimentos: data, tipo, motivo, status
- Lista de ações individuais: título, descrição, prazo
- Aviso: *"Seus dados são protegidos conforme a LGPD. Para dúvidas, procure a orientadora educacional."*

---

## Arquivos

| Arquivo | Ação |
|---|---|
| `lib/db/src/schema/soe.ts` | Criar — 5 tabelas Drizzle |
| `scripts/migrate-soe.sql` | Criar — DDL + RLS + seeds (não executar em produção antes do provisionamento) |
| `artifacts/api-server/src/lib/soe-crypto.ts` | Criar — cifrarRegistro / decifrarRegistro / gerarChaveRef |
| `artifacts/api-server/src/lib/soe-audit.ts` | Criar — registrarAuditoriaSoe |
| `artifacts/api-server/src/routes/soe.ts` | Criar — todos os endpoints |
| `artifacts/api-server/src/index.ts` | Modificar — registrar `/api/soe` |
| `artifacts/seshat/src/pages/soe/gestao.tsx` | Criar |
| `artifacts/seshat/src/pages/soe/analise.tsx` | Criar |
| `artifacts/seshat/src/pages/soe/encaminhar.tsx` | Criar |
| `artifacts/seshat/src/pages/portal/index.tsx` | Modificar — adicionar aba SOE |
| `artifacts/seshat/src/App.tsx` | Modificar — rotas `/soe/*` |
| `artifacts/seshat/src/components/layout.tsx` | Modificar — grupo "SOE" |
| `.specs/features/portal-soe.md` | Criar — cópia da spec para referência dos agentes |
| `.claude/skills/seshat-soe/SKILL.md` | Criar — skill para sessões futuras |
