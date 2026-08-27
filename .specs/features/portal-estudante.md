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

A verificação de idade usa `usuarios.data_nascimento`. O campo `isMaior` é computado no backend e enviado na resposta de `/api/portal/me`.

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
- Matrículas ativas: Curso, Turno(s), Turma, Registro, Semestre/Ano
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
    turnos: Array<{ id: string; nome: string }>;
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

### Dados exibidos na carteira

| Campo | Fonte |
|---|---|
| Foto | `usuarios.foto_id` → `/api/fotos/{id}` |
| Nome | `usuarios.nome` |
| Matrícula/Registro | `matriculas.registro` |
| Curso | `cursos.nome` |
| Turno(s) | `turma_turnos → turnos.nome` |
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

## Cartão de Liberação Semestral

Status: Layout implementado, **regras de liberação a definir**.

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
