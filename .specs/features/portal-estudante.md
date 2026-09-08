# Spec: Portal do Estudante

**Agente responsável:** Hefesto + Hermes
**Status:** Implementado ✅

## Conceito

O Portal do Estudante é o espaço de autoatendimento para usuários com role `estudante`. Acessível em `/portal`, permite ao estudante consultar seus dados, visualizar ocorrências, dar ciência (se maior de idade) e obter seus documentos (carteira de estudante e cartão de liberação).

---

## Regras de Acesso

| Perfil | Capacidade |
|---|---|
| **Menor de idade** (< 18 anos) | Visualização de dados, enturmação, disciplinas e ocorrências — **sem** dar ciência |
| **Maior de idade** (≥ 18 anos) | Visualização + **dar ciência** em ocorrências + emitir carteira de estudante e cartão de liberação |
| **Administrador** (`usuarios:manage` / `roles:manage`) | Vê o menu "Meu Portal" para ajuste e teste — o portal exibirá dados vazios pois admin não é estudante |

A verificação de idade usa `usuarios.data_nascimento`. O campo `isMaior` é computado no backend e enviado na resposta de `/api/portal/me`.

> **Visibilidade do menu "Meu Portal":** `isEstudante || isAdmin` — o administrador acessa o portal do estudante para verificar a experiência e ajustar configurações.
>
> **Carômetro administrativo:** NUNCA visível para `estudante` ou `pai_responsavel`, mesmo que esses perfis tenham a permissão `carometro:view` atribuída no banco. A verificação é dupla: permissão **E** ausência dos roles `estudante`/`pai_responsavel`.

---

## Menu

```
Grupo: "Meu Portal"  (visível apenas quando user.roles.includes('estudante'))
└── "Meu Perfil" → /portal
```

A visibilidade é baseada em `user.roles` (não em permissions), pois o estudante pode não ter permissões admin.

---

## Abas do Portal

### Minha Enturmação
- Matrículas ativas: Curso, Turno, Turma, Registro, Semestre/Ano
- Disciplinas cursadas agrupadas com badges Disciplina · Curso · Turno

### Ocorrências
- Lista de ocorrências do estudante (por `estudantes.usuario_id = usuario_id`)
- Badge verde "Ciente em {data}" se já reconhecida
- Botão "Dar ciência" — somente para `isMaior = true`
- Mensagem informativa para menores de idade

### Documentos
- **Carteira de Estudante** (layout de cartão físico com QR Code)
- **Cartão de Liberação** (placeholder — regras a definir)

---

## Endpoints API

### GET /api/portal/me
**Requer:** `requireAuth` (sem permissão adicional — dados do próprio usuário)

```typescript
{
  usuario: {
    id: string;
    nome: string | null;
    codigoAcesso: string;
    dataNascimento: string | null;  // YYYY-MM-DD
    fotoUrl: string | null;
    isMaior: boolean;               // calculado no backend: idade >= 18
  };
  matriculas: Array<{
    id: string; turmaId: string; turmaSigla: string; turmaDescricao: string;
    cursoId: string; cursoNome: string; moduloMenor: boolean;
    turnoId: string | null; turnoNome: string | null;  // turno específico da matrícula
    registro: string; ano: number; semestre: number;
  }>;
  disciplinas: Array<{
    disciplinaOfertaId: string;
    disciplinaNome: string; cursoNome: string; turnoNome: string;
  }>;
}
```

### GET /api/portal/ocorrencias
**Requer:** `requireAuth`

Retorna ocorrências vinculadas ao `estudantes.usuario_id` do usuário logado.

```typescript
Array<{
  id: string;
  tipoOcorrenciaDescricao: string;
  dataOcorrencia: string;
  observacao: string | null;
  cienteEm: string | null;
  cientePorId: string | null;
}>
```

### POST /api/portal/ocorrencias/:id/ciencia
**Requer:** `requireAuth` + `isMaior = true`

- 403 se menor de idade
- 403 se ocorrência não pertence ao estudante logado
- 404 se não encontrada
- 409 se ciência já registrada

Atualiza `ocorrencias.ciente_em = now()` e `ciente_por_id = usuario_id`.

### GET /api/portal/carteira
**Requer:** `requireAuth`

Gera token HMAC-SHA256 para validação da carteira. O token codifica `{usuarioId, tipo: 'carteira', validade: '1/2025', ts}` e é assinado com `SESSION_SECRET`.

```typescript
{ token: string; validade: string }
```

### GET /api/verificar/:token (público — sem requireAuth)
Verifica a autenticidade de um cartão/carteira a partir do token gerado.

```typescript
{
  valido: boolean;
  tipo: string;
  validade: string;
  nome: string;
  fotoUrl: string | null;
  emitidoEm: string;  // ISO 8601
}
```

---

## Carteira de Estudante

### Base Legal

| Norma | Aplicação |
|---|---|
| Lei Federal 12.989/2014 | Direito à meia-entrada em eventos culturais/esportivos |
| LGPD — Lei 13.709/2018, art. 6º | Finalidade, adequação e necessidade dos dados expostos |
| ISO 27001 A.9.4 | Controle de acesso ao documento; autenticação do portador |
| Resolução SEEDF | Template e dados obrigatórios conforme normativos vigentes da Secretaria de Educação do DF |

### Layout — CIE 2026 (horizontal)

Cartão horizontal (`560×320px`), fundo lavanda `#eaecf8`:

| Elemento | Detalhe |
|---|---|
| **Logo esquerda** | Brasão do GDF / SEEDF — embutida em base64 no componente |
| **Logo direita** | Logo CEP Escola Técnica de Santa Maria — embutida em base64 |
| **Título** | "Carteira de / Identificação Estudantil" ao lado da logo esquerda |
| **Faixa lateral** | Strip azul escuro `#1a2f7a` de 14px na borda direita |
| **Curvas decorativas** | SVG roxo (`#6d28d9` / `#7c3aed` / `#8b5cf6`) no canto inferior esquerdo |
| **Foto do estudante** | `me.usuario.fotoUrl` — 72×88px, `objectFit: cover`; fallback `UserCircle` |
| **Ano** | Destaque em 26px bold `#1a2f7a` no rodapé direito |
| **COD CIE** | Últimos 12 chars do token, abaixo do QR Code |
| **LGPD** | Texto de rodapé esquerdo |

### Dados exibidos na carteira

| Campo | Fonte |
|---|---|
| Foto | `me.usuario.fotoUrl` (via `GET /api/portal/me`) |
| Nome | `usuarios.nome` |
| Matrícula/Registro | `matriculas.registro` |
| Curso | `cursos.nome` |
| Turno | `matriculas.turno_id → turnos.nome` — turno específico da matrícula do estudante |
| Turma | `turmas.sigla` |
| Validade | `{semestre}º sem. / {ano}` da primeira matrícula ativa |
| Instituição | Secretaria de Estado de Educação do Distrito Federal |
| QR Code | URL de verificação com token HMAC-SHA256 assinado |

### Token de validação (QR Code)

```
payload = JSON.stringify({ usuarioId, tipo, validade, ts })
token   = base64url(payload) + "." + base64url(HMAC-SHA256(base64url(payload), SESSION_SECRET))
url     = {window.location.origin}/verificar/{token}
```

- Assinatura garante integridade e autenticidade
- Token sem expiração fixa — validade é semântica (campo `validade`)
- Verificação pública via `GET /api/verificar/:token` não requer login

---

## Cartão de Liberação

### Tipos

| Tipo | Fonte de dados | Condição de exibição |
|---|---|---|
| **Semestral** | `carteiras` (tipo = `cartao-semestral`, status = `ativa`) | Após aprovação de requerimento pela coordenação/supervisão/direção |
| **Diário** | `cartoes_saida` (status = `aprovado`) | Somente na janela de ±5 min do `horario_saida` no dia `data_saida` |

### Regras de Emissão

- **Semestral**: requerimento preenchido pelo estudante → aprovação coordenação/supervisão/direção → emitido via `POST /api/carteiras/emitir-liberacao/:usuarioId`
- **Diário — menor de idade**: requerimento preenchido pelo pai/responsável → aprovação → disponível apenas na janela horária
- **Diário — maior de idade**: requerimento preenchido pelo próprio estudante → aprovação → disponível apenas na janela horária
- **Janela de validade**: cartão diário visível somente entre `horario_saida - 5min` e `horario_saida + 5min`. Fora dessa janela, nova solicitação necessária.
- **QR Code**: lido pelo app Seshat para validar saída e registrar ocorrência de saída antecipada.

### Layout Visual (padrão CIE)

Mesmo layout da Carteira de Estudante, com paleta de cor diferente por tipo:

| Tipo | Paleta |
|---|---|
| **Semestral** | Verde (`#dcfce7` fundo, `#166534` faixa) |
| **Diário — Segunda** | Azul-claro/prata (Lua) |
| **Diário — Terça** | Vermelho/vinho (Marte) |
| **Diário — Quarta** | Amarelo/laranja (Mercúrio) |
| **Diário — Quinta** | Roxo/azul-royal (Júpiter) |
| **Diário — Sexta** | Rosa/pastel (Vênus) |

A cor é determinada pelo `dia da semana` de `data_saida`. Sábado/domingo seguem o padrão de Segunda.

### Endpoints

- `GET /api/portal/cartoes-saida` — retorna cartões diários aprovados do estudante (filtra `estudanteId` via `usuario_id`)
- `GET /api/portal/carteiras` — inclui o semestral (`tipo = 'cartao-semestral'`)

### Revalidação

O frontend revalida a query `portal-cartoes-saida` a cada **30 segundos** para verificar se a janela horária foi atingida sem exigir reload manual.

Emitido automaticamente junto com a carteira ao enturmar o estudante (tipo `cartao-semestral`). Pode ser cancelado/revogado independentemente da carteira de estudante. Regras de uso e critérios de liberação serão implementadas em fase posterior.

---

## Emissão Automática na Enturmação

Ao criar uma matrícula (`POST /api/matriculas`), o sistema automaticamente chama `emitirCarteirasParaMatricula()` que cria:
1. Uma carteira do tipo `carteira` (carteira de estudante)
2. Uma carteira do tipo `cartao-semestral` (cartão de liberação semestral)

Ambas com `status = 'ativa'` e token HMAC assinado, **independente da idade do estudante**.

Se já existir carteira ativa para aquele período e tipo, não cria nova (idempotente).

---

## Ciclo de Vida das Carteiras

```
Enturmação → status: 'ativa'
  ↓ (coordenador ou equipe gestora)
Cancelamento → status: 'cancelada'   (uso: extravio, término de matrícula)
Revogação    → status: 'revogada'    (uso: fraude, uso indevido, suspeita)
  ↓ (novo semestre)
Renovação    → nova carteira 'ativa' para o período seguinte
```

Renovação via enturmação no novo semestre (nova matrícula cria novas carteiras) ou via `POST /api/carteiras/renovar/:usuarioId` com `{ano, semestre}`.

---

## Gestão Administrativa (`/carteiras`)

Página acessível para usuários com `estudantes:manage` (coordenadores).

| Ação | Endpoint | Descrição |
|---|---|---|
| Listar | `GET /api/carteiras` | Filtros: `usuarioId`, `ano`, `semestre`, `status` |
| Cancelar | `POST /api/carteiras/:id/cancelar` | Documento perdido/invalido; nova emissão possível |
| Revogar | `POST /api/carteiras/:id/revogar` | Fraude/uso indevido; QR code invalidado imediatamente |
| Renovar | `POST /api/carteiras/renovar/:usuarioId` | Emite novas carteiras para novo período |

### Diferença: cancelar vs. revogar

| | Cancelar | Revogar |
|---|---|---|
| Uso | Extravio, fim de matrícula | Fraude, uso indevido |
| Reemissão | Possível (nova enturmação) | Documentar ocorrência antes |
| Status QR | Inválido imediatamente | Inválido imediatamente |

---

## Frontend

| Componente | Responsabilidade |
|---|---|
| `PortalEstudantePage` | Página principal — foto, dados, abas |
| `OcorrenciasTab` | Lista de ocorrências + mutation de ciência + AlertDialog de confirmação |
| `CarteiraEstudante` | Cartão visual com QR code + botão imprimir |
| `CartaoLiberacao` | Placeholder com badge "Em breve" |
| `QrCodeCanvas` | Renderiza QR code em `<canvas>` via biblioteca `qrcode` |

### Verificação de Idade

```typescript
function calcularIdade(dataNascimento: string | null): number | null
function isMaiorDeIdade(dataNascimento: string | null): boolean  // backend
```

Verificação duplicada no frontend (para UI) e no backend (para autorização real).

---

## Segurança e LGPD

- **LGPD art. 6º — Finalidade**: dados usados exclusivamente para fins educacionais e de identificação
- **LGPD art. 46 — Segurança**: token HMAC-SHA256 protege integridade da carteira; SESSION_SECRET nunca é exposto
- **ISO 27001 A.9.4**: acesso ao portal restrito ao próprio estudante — nenhum outro usuário vê os dados de outro
- **Menor de idade**: restrição de ação (dar ciência) protege menores de comprometimento sem assistência responsável
- **Foto**: exposta apenas via `/api/fotos/{id}` com autenticação; QR Code de verificação pública não expõe foto diretamente (apenas nome e link)

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `artifacts/api-server/src/routes/portal-estudante.ts` | GET /me, GET /ocorrencias, POST /ciencia, GET /carteira, verificação pública |
| `artifacts/api-server/src/index.ts` | Registra `/api/portal` e `/api/verificar` |
| `artifacts/seshat/src/pages/portal/index.tsx` | UI do portal (abas, carteira, ciência) |
| `artifacts/seshat/src/App.tsx` | Rota `/portal` |
| `artifacts/seshat/src/components/layout.tsx` | Grupo "Meu Portal" (isEstudante) |
