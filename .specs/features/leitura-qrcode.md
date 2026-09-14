# Spec: Leitura de QR Code — Carteira e Cartão de Liberação

**Status:** Especificado ✅ / Implementação pendente

---

## Visão Geral

O sistema oferece dois fluxos de leitura de QR Code, com propósitos e regras distintos:

| Documento | Canal de leitura | Autenticação | Efeito colateral |
|---|---|---|---|
| **Carteira de Estudante** | Câmera (externo) + UI interna | Externo: nenhuma · Interno: autenticado | Nenhum — apenas validação |
| **Cartão de Liberação** | UI interna apenas | Obrigatória | Registra ocorrência + envia e-mail |

---

## Perfis com Acesso à Leitura Interna

`portaria`, `coordenacao`, `gestao`, `secretaria`

Permissão nova: **`carteiras:verificar`**

> A `portaria` é o perfil principal para leitura de Cartão de Liberação na saída física do estudante.

---

## 1. Carteira de Estudante

### 1.1 Leitura Externa (pública — sem login)

Endpoint já existente:

```
GET /api/verificar/:token
```

- Público — sem `requireAuth`
- Valida assinatura HMAC-SHA256 do token
- Consulta banco para confirmar `status = 'ativa'` (revogação em tempo real)
- QR Code contém `{origin}/verificar/{token}`

**Resposta (válida):**
```json
{
  "valido": true,
  "status": "ativa",
  "tipo": "carteira",
  "validade": "2026-1",
  "nome": "Nome do Estudante",
  "fotoUrl": "https://...",
  "emitidoEm": "2026-03-01T00:00:00Z"
}
```

**Resposta (inválida/revogada):**
```json
{ "valido": false, "status": "cancelada", "erro": "Carteira cancelada." }
```

A página `/verificar/:token` no frontend exibe o resultado visualmente — sem login.

### 1.2 Leitura Interna (sistema)

Endpoint autenticado:

```
POST /api/leitura-qr/carteira
```

**Requer:** `carteiras:verificar`

**Body:** `{ token: string }`

Mesma lógica de validação do externo, mas com registro de `auditoria` (quem leu, quando, IP).

**Resposta:** idêntica ao externo, acrescida de `{ auditoriaId: string }`.

---

## 2. Cartão de Liberação

### 2.1 Canal único — leitura interna

```
POST /api/leitura-qr/cartao-liberacao
```

**Requer:** `carteiras:verificar`

**Body:** `{ token: string }`

### 2.2 Lógica de validação

```
1. Decodificar e verificar HMAC-SHA256 do token
2. Identificar tipo: 'cartao-semestral' (tabela carteiras) ou 'cartoes_saida' (diário)
3. Verificar status: 'ativa' (semestral) ou 'aprovado' (diário)
4. Validar janela horária: dentroJanelaHorario(dataSaida, horarioSaida) → ±5 min
5. SE válido → registrar ocorrência + enviar e-mail (ver §2.4)
6. Atualizar: cartoes_saida.lido_em e lido_por_id (diário); carteiras.lido_em e lido_por_id (semestral)
```

### 2.3 Janela horária

```typescript
function dentroJanelaHorario(dataSaida: string | null, horarioSaida: string): boolean {
  const [hh, mm] = horarioSaida.split(":").map(Number);
  const agora = new Date();
  const hoje = agora.toISOString().substring(0, 10);
  // Semestral: dataSaida = null → valida apenas horário do dia atual
  if (dataSaida && dataSaida !== hoje) return false;
  const totalMin = agora.getHours() * 60 + agora.getMinutes();
  const alvoMin  = hh * 60 + mm;
  return Math.abs(totalMin - alvoMin) <= 5; // ±5 min
}
```

**Respostas:**

| Situação | HTTP | Body |
|---|---|---|
| Token inválido (assinatura) | 400 | `{ valido: false, erro: "Token inválido." }` |
| Não encontrado no banco | 404 | `{ valido: false, erro: "Cartão não encontrado." }` |
| Revogado/cancelado | 403 | `{ valido: false, status: "cancelada", erro: "Cartão revogado ou cancelado." }` |
| Fora da janela horária | 422 | `{ valido: false, erro: "Fora do horário de saída autorizado.", horarioSaida, janela: "±5 min" }` |
| **Válido** | 200 | Ver abaixo |

**Resposta válida:**
```json
{
  "valido": true,
  "tipo": "cartao-semestral" | "diario",
  "nome": "Nome do Estudante",
  "fotoUrl": "...",
  "horarioSaida": "16:30",
  "dataSaida": "2026-09-14",
  "ocorrenciaId": "uuid",
  "emailEnviado": true
}
```

### 2.4 Registro automático de ocorrência

Ao validar com sucesso um Cartão de Liberação, o sistema:

1. Busca (ou cria) o tipo de ocorrência `"Saída Antecipada"` (`slug = 'saida-antecipada'`)
2. Insere em `ocorrencias`:
   ```typescript
   {
     estudanteId:      // estudante vinculado ao cartão
     tipoOcorrenciaId: // tipo "Saída Antecipada"
     dataOcorrencia:   // today (YYYY-MM-DD)
     registradoPorId:  // req.usuarioId (portaria/coordenação que leu o QR)
     observacao:       // "Saída antecipada via cartão [semestral/diário]. Horário: HH:MM."
     turnoId:          // turno da matrícula ativa do estudante (se disponível)
   }
   ```
3. Envia e-mail automático seguindo as regras de `POST /api/ocorrencias` (menor → responsáveis, maior → próprio)

> **Idempotência:** Se o mesmo token já foi lido (`lido_em IS NOT NULL`) e a ocorrência já existe para o dia, retorna 200 com `{ valido: true, jaRegistrado: true }` — sem duplicar a ocorrência.

### 2.5 Colunas adicionadas ao banco

**`carteiras`** (para rastrear leitura do cartao-semestral):
```sql
lido_em      timestamptz  -- quando o QR foi lido/validado
lido_por_id  uuid FK → usuarios (set null)
```

**`cartoes_saida`** (para rastrear leitura do cartão diário):
```sql
lido_em      timestamptz
lido_por_id  uuid FK → usuarios (set null)
```

---

## 3. UI Interna — Página de Leitura `/leitura-qr`

Acessível por: `portaria`, `coordenacao`, `gestao`, `secretaria`

### Layout

```
┌─────────────────────────────────────────────────┐
│ 📷 Leitura de QR Code                           │
│─────────────────────────────────────────────────│
│  [Tabs: Carteira de Estudante | Cartão de Saída]│
│                                                 │
│  ┌───────────────────┐   ┌────────────────────┐ │
│  │  CÂMERA / QR      │   │  RESULTADO         │ │
│  │  (QrScanner)      │   │  ✅ Válido         │ │
│  │                   │   │  Nome: João Silva  │ │
│  │  ── ou ──         │   │  Turma: 2024.1     │ │
│  │  [Cole o token]   │   │  Saída: 16:30      │ │
│  └───────────────────┘   └────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Componente `QrScanner`

Usa `@zxing/browser` (já disponível como dependência de terceiros ou via CDN em artifact):
```typescript
import { BrowserQRCodeReader } from "@zxing/browser";
// Lê da câmera em tempo real; ao detectar → POST /api/leitura-qr/carteira ou /cartao-liberacao
// Após leitura: pausa scanner por 3 s para evitar dupla leitura
```

Alternativa de entrada manual: campo `<Input placeholder="Cole o token aqui">` para ambientes sem câmera.

### Aba "Cartão de Saída"

Ao validar com sucesso:
- Exibe `CartaoLiberacaoCard` no padrão CIE (mesmo componente do Portal do Estudante)
- Exibe badge verde "✅ Saída autorizada — Ocorrência registrada"
- Exibe nome do registrador e horário da leitura

---

## 4. Segurança do Token — Análise e Recomendação

### Opções avaliadas

| Algoritmo | Tipo | Vantagem | Desvantagem |
|---|---|---|---|
| **HMAC-SHA256** (atual) | Simétrico | Rápido, compacto, sem PKI | Requer compartilhamento da chave secreta (`SESSION_SECRET`) |
| **Ed25519** | Assimétrico (digital) | Chave pública publicável; auditável por terceiros sem a chave privada | Precisa gerar e armazenar par de chaves; tokens maiores |
| **JWT RS256** | Assimétrico (RSA) | Padrão de mercado, auditável | Tokens maiores, RSA mais lento que Ed25519 |
| **QR dinâmico** (OTP) | Temporal + HMAC | Token expira em segundos; impossível reutilizar | Exige relógio sincronizado (NTP); não funciona offline |

### Recomendação

**Fase atual:** manter **HMAC-SHA256** — já implementado, seguro para uso interno e validação externa via endpoint dedicado. Atende LGPD e ISO 27001 A.10.1 (criptografia).

**Fase futura (certificado digital):** migrar para **Ed25519**:
- Chave privada: armazenada em `SIGNING_PRIVATE_KEY` (env, nunca no banco)
- Chave pública: publicável em `GET /api/verificar/pubkey` — permite validação off-line por terceiros sem contatar o servidor
- Tokens assinados com `@noble/ed25519` (sem deps nativas)
- Compatível com a Infraestrutura de Chaves Públicas Brasileira (ICP-Brasil) em conceito

### Estrutura do token HMAC-SHA256 (atual)

```
base64url(payload) + "." + HMAC-SHA256(base64url(payload), SESSION_SECRET)

payload = { usuarioId, tipo, ano, semestre, ts: Date.now() }
```

### Estrutura do token Ed25519 (futura)

```
base64url(payload) + "." + base64url(Ed25519Sign(payload, privateKey))

// Verificação off-line:
Ed25519Verify(signature, payload, publicKey) // sem chamada ao banco
// Verificação on-line (revogação):
GET /api/verificar/:token → consulta status no banco
```

---

## 5. Permissões — Seed

```sql
-- Nova permissão
INSERT INTO permissoes (recurso, acao) VALUES ('carteiras', 'verificar')
ON CONFLICT (recurso, acao) DO NOTHING;

-- Atribuir aos roles
INSERT INTO roles_permissoes (role_id, permissao_id)
SELECT r.id, p.id FROM roles r, permissoes p
WHERE r.nome IN ('portaria', 'coordenacao', 'gestao', 'secretaria')
  AND p.recurso = 'carteiras' AND p.acao = 'verificar'
ON CONFLICT DO NOTHING;
```

> O role `portaria` pode não existir — a migração cria se necessário (ver `scripts/migrate-leitura-qrcode.sql`).

---

## 6. Tipo de Ocorrência — Seed

```sql
INSERT INTO tipos_ocorrencias (id, descricao, status, slug)
VALUES (gen_random_uuid(), 'Saída Antecipada', 'ativo', 'saida-antecipada')
ON CONFLICT (slug) DO NOTHING;
```

> `slug` é coluna única nova em `tipos_ocorrencias` (ver migração).

---

## 7. E-mail Automático — Comportamento

Disparo imediato após leitura do cartão (fire-and-forget, falhas apenas logadas):

**Assunto:** `[Seshat] Saída Antecipada — {NOME_ESTUDANTE} — {DATA}`

**Corpo:** usa texto padrão do tipo `saida-antecipada` se cadastrado, ou template padrão:
```
Informamos que {NOME_ESTUDANTE} realizou saída antecipada das aulas
em {DATA_OCORRENCIA} às {HORA_SAIDA} (horário autorizado).

Tipo: Cartão de Liberação {Semestral | Diário}
Registrado por: {NOME_PORTARIA}
```

**Destinatário:** segue regra de ocorrências:
- Menor de 18 → responsáveis (`estudante_emails.tipo = 'responsavel'`)
- Maior de 18 → próprio estudante (`estudante_emails.tipo = 'proprio'`)

---

## 8. Menu

| Perfil | Grupo | Link | Ícone |
|---|---|---|---|
| `portaria` | "Portaria" | `/leitura-qr` | `QrCode` |
| `coordenacao` | "Gestão" | `/leitura-qr` | `QrCode` |
| `gestao` | "Gestão" | `/leitura-qr` | `QrCode` |
| `secretaria` | "Secretaria" | `/leitura-qr` | `QrCode` |

---

## 9. Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/carteiras.ts` | Colunas `lido_em`, `lido_por_id` |
| `lib/db/src/schema/cartoes-saida.ts` | Colunas `lido_em`, `lido_por_id` |
| `lib/db/src/schema/tipos-ocorrencias.ts` | Coluna `slug` (nova) |
| `scripts/migrate-leitura-qrcode.sql` | DDL + seed permissão + seed tipo ocorrência |
| `artifacts/api-server/src/routes/leitura-qr.ts` | POST /carteira + POST /cartao-liberacao |
| `artifacts/api-server/src/routes/verificar.ts` | GET /verificar/:token (público, já existe) |
| `artifacts/seshat/src/pages/leitura-qr/index.tsx` | UI com scanner + resultado |
| `artifacts/seshat/src/App.tsx` | Rota `/leitura-qr` |
| `artifacts/seshat/src/components/layout.tsx` | Menu portaria/coordenação/gestão/secretaria |
| `.specs/features/leitura-qrcode.md` | Esta spec |
| `.claude/skills/seshat-leitura-qrcode/SKILL.md` | Skill de implementação |
