# Spec: Carômetro — Estudantes e Ocorrências

**Agente responsável:** Hermes + Hefesto  
**Status:** Implementado ✅

---

## Conceito

Página `/carometro` exibe o registro fotográfico de estudantes agrupados por **turno** → **curso** → **turma**.
Cada cartão de estudante dá acesso ao histórico de ocorrências e, conforme o perfil do usuário, ao formulário de registro.

---

## Padrão Visual — Cards 3×4

Todos os carômetros usam proporção **3:4 (retrato)** para maximizar o número de fotos visíveis por página.

| Elemento | Valor |
|---|---|
| Proporção do card | `aspect-[3/4]` |
| Grade estudantes | `grid-cols-3 sm:4 md:6 lg:8 xl:10`, `gap-2` |
| Cards equipe (normal) | `w-20 h-[107px]` (≈ 3:4) |
| Cards equipe (small) | `w-16 h-[85px]` (≈ 3:4) |
| Gap entre cards equipe | `flex flex-wrap gap-2` |
| Avatar sem foto | estudantes: `w-10 h-10` · equipe: `w-11/w-9` |
| Nome | `text-[10px]` (estudantes) · `text-[9px/10px]` (equipe) |
| Registro | `text-[9px]` |
| Botão ocorrência | `h-5 text-[9px]` |

Nunca usar `w-24`/`w-28`/`h-32`/`h-36`/`gap-3`/`gap-4` nos cards — descontinuado.

---

## Regras de Agrupamento

- Ordem: Turno (alfabético) → Curso (alfabético) → Turma (sigla)
- Estudantes dentro de cada turma: ordenados por nome
- Turma vinculada a múltiplos turnos: aparece no grupo do seu turno via `turma_turnos`
- Estudante com foto: exibido com foto descriptografada (AES-256); sem foto: avatar com iniciais

---

## Navegação — Fluxo do Carômetro

Clicar na **foto ou nome** do estudante abre o **modal de dados cadastrais e ocorrências** diretamente no carômetro — sem navegar para outra página.

O modal contém:
- Cabeçalho com foto, nome, registro, turma, botão "Ver perfil completo" → `/estudantes/:id`
- Aba **Registrar** (visível para `ocorrencias:create`): formulário de nova ocorrência
- Aba **Histórico**: lista de ocorrências com ações por role

O botão separado "Ocorrência" / "Ver ocorrências" foi removido do card — o clique na foto já abre o modal para todos os perfis com `carometro:view`.

A página `/estudantes/:id` (Dados Cadastrais completos) permanece acessível pelo link "Ver perfil completo" dentro do modal, e pode ser usada em outras funcionalidades.

---

## Acesso por Perfil

| Perfil | Ação disponível |
|---|---|
| `ocorrencias:create` (professor, coordenação, supervisão, direção) | Registrar + editar + excluir ocorrências; notificar responsáveis por e-mail |
| `ocorrencias:view` (gestão, secretaria) | Visualizar histórico completo; notificar responsáveis |
| `pai_responsavel` | Visualizar ocorrências + botão "Marcar como Ciente" (bloqueado após ciência) |
| `estudante` | Visualizar ocorrências em modo leitura |
| Demais com `carometro:view` | Visualizar cartões de estudantes sem botão de ocorrências |

A permissão `carometro:view` é necessária para acessar a página.

---

## Formulário de Ocorrência

| Campo | Tipo | Regra |
|---|---|---|
| Data de Registro | Exibição | Fixa — data do servidor no momento do acesso, não editável |
| Data da Ocorrência | `<input type="date">` | Default: hoje; máximo: hoje |
| Disciplina — Turno | Select | Mostra as disciplinas do professor logado com turno ("Matemática — Manhã"). Captura `disciplinaId` + `turnoId` |
| Tipo de Ocorrência | Select | Lista de `tipos_ocorrencias` com status "ativo" |
| Descrição | Textarea | Máx. 300 caracteres; contador exibido (torna-se âmbar após 280) |
| Notificar responsáveis | Checkbox | Visível **somente** se o estudante for menor de idade (< 18 anos); envia e-mail para todos os e-mails tipo "responsavel" na tabela `estudante_emails` |

---

## Ocorrência — Regras

- `dataRegistro` = `criadoEm` (timestamp do servidor, definido no INSERT)
- `dataOcorrencia` = data informada no formulário (pode ser anterior a hoje)
- `turnoId` é derivado da oferta de disciplina selecionada (ou selecionado independentemente)
- Menor de idade: `estudante.data_nascimento` calculado em runtime; se idade < 18 → exibe badge "Menor" e checkbox de notificação
- Notificação por e-mail: `POST /api/ocorrencias/:id/notificar-pais` ou automaticamente via `enviarEmailPais: true` no POST

---

## Ciência (Pai/Responsável)

- Botão "Marcar como Ciente" aparece quando:
  - Usuário tem role `pai_responsavel`
  - `ocorrencia.ciente_em` é null
- Após clicar: `POST /api/ocorrencias/:id/ciente`
  - Grava `ciente_em = now()` e `ciente_por_id = req.usuarioId`
  - Retorna 409 se já registrado
- Exibição pós-ciência: badge "Ciente" com data

---

## Vínculo Enturmação → Carômetro

Ao enturmar um estudante via `POST /api/matriculas`, o sistema **cria ou vincula** automaticamente um registro na tabela `estudantes` para que o aluno apareça no carômetro e possa ter ocorrências registradas:

| Situação | Ação |
|---|---|
| Nenhum registro `estudantes` para este `usuarioId` + nenhum para este `registro` | Cria novo registro em `estudantes` com nome, turmaId, registro, usuarioId, dataNascimento |
| Registro `estudantes` existe para este `registro` mas sem `usuarioId` | Vincula: define `usuarioId` no registro legado |
| Registro `estudantes` já existe para este `usuarioId` | Atualiza `turmaId` para a turma atual |
| Falha na sincronização | Loga erro; a matrícula é salva mesmo assim (tolerância a falha) |

O campo `usuarioId` na tabela `estudantes` é único (índice parcial: `WHERE usuario_id IS NOT NULL`).

---

## Menor de Idade — Regras de Ciência e Notificação

| Regra | Comportamento |
|---|---|
| Estudante < 18 anos registra ocorrência | E-mail automático enviado aos e-mails responsável (`estudante_emails` tipo "responsavel") **sem** exigir marcar `enviarEmailPais` |
| Estudante < 18 anos tenta marcar "Ciente" | API retorna 403; frontend exibe mensagem "A ciência deve ser registrada pelo responsável" |
| Pai/Responsável marca "Ciente" | Sempre permitido, independentemente da idade |
| Estudante maior de 18 anos | Pode marcar "Ciente" por conta própria |

---

## Modelo de Dados

### `estudantes` — coluna adicionada (v2)

| Coluna | Tipo | Descrição |
|---|---|---|
| `usuario_id` | `uuid FK usuarios NULL UNIQUE` | Vincula ao usuário enturmado |

### `ocorrencias` — colunas adicionadas

| Coluna | Tipo | Descrição |
|---|---|---|
| `turno_id` | `uuid FK turnos NULL` | Turno da disciplina/aula da ocorrência |
| `ciente_em` | `timestamptz NULL` | Quando o responsável marcou ciência |
| `ciente_por_id` | `uuid FK usuarios NULL` | Quem marcou ciência |
| `notificacao_pais_enviada_em` | `timestamptz NULL` | Quando e-mail de notificação foi enviado |
| `observacao` | `varchar(300)` | Antes era `text`; limitado a 300 chars |

### `estudantes` — coluna adicionada

| Coluna | Tipo | Descrição |
|---|---|---|
| `data_nascimento` | `date NULL` | Usado para verificar se o estudante é menor de idade |

---

## Endpoints

### GET /api/carometro
**Requer:** `carometro:view`  
Agora inclui `dataNascimento`, `cursoId`, `turnoId` em cada estudante do grupo.  
Agrupamento server-side: turno → curso → turma (ordenado).

### GET /api/ocorrencias
**Requer:** `ocorrencias:view`  
Retorna `turnoNome`, `registradoPorNome`, `cienteEm`, `cientePorId`, `notificacaoPaisEnviadaEm`.

### GET /api/ocorrencias/estudante/:estudanteId
**Requer:** `requireAuth` (sem permissão específica)  
Retorna subset de campos (sem `registradoPorNome`) para pais e estudantes.

### POST /api/ocorrencias
**Requer:** `ocorrencias:create`  
Aceita: `turnoId`, `observacao` (max 300), `enviarEmailPais` (boolean).

### POST /api/ocorrencias/:id/ciente
**Requer:** `requireAuth`  
Marca ciência. Retorna 409 se já registrada.

### POST /api/ocorrencias/:id/notificar-pais
**Requer:** `ocorrencias:create`  
Envia e-mail para todos os e-mails tipo "responsavel" do estudante.

---

## E-mail de Ocorrência

Template HTML enviado por `enviarEmailOcorrencia()` no mailer:
- Campos: tipo, data, turno (se houver), disciplina (se houver), descrição (se houver)
- Instrução para acessar o sistema e registrar ciência

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/ocorrencias.ts` | Colunas novas: turnoId, cienteEm, cientePorId, notificacaoPaisEnviadaEm |
| `lib/db/src/schema/estudantes.ts` | Coluna nova: dataNascimento |
| `scripts/migrate-ocorrencias-v2.sql` | Migration idempotente |
| `artifacts/api-server/src/routes/ocorrencias.ts` | CRUD + /ciente + /notificar-pais |
| `artifacts/api-server/src/routes/seshat.ts` | Fix join turmaTurnos; inclui dataNascimento/cursoId/turnoId |
| `artifacts/api-server/src/lib/mailer.ts` | enviarEmailOcorrencia() |
| `artifacts/seshat/src/pages/seshat.tsx` | UI: agrupamento turno→curso, modal com tabs, Ciente, notificação |
