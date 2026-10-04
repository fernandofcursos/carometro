# QR Code — Verificação Oficial da Carteira de Estudante

**Data:** 2026-10-04  
**Status:** aprovado para implementação

---

## Objetivo

Tornar o QR Code da Carteira de Estudante verificável em qualquer situação, por qualquer pessoa, com valor jurídico/probatório:

- **A.** Câmera comum escaneia e valida sem login nem app especial
- **B.** Porteiro de outra instituição acessa portal público sem conta no Seshat
- **C.** Token é assinatura digital institucional com valor probatório (Lei 14.063/2020)

---

## Fundamento Técnico

O modelo atual (HMAC-SHA256 com `SESSION_SECRET`) é uma assinatura simétrica — validar exige conhecer o segredo. Isso impossibilita A, B e C.

A solução é criptografia assimétrica **Ed25519**:

- A escola assina com sua chave privada (guardada no banco, cifrada)
- A chave pública é publicada em endpoint sem autenticação
- Qualquer browser, app ou `openssl` verifica a assinatura offline

---

## Arquitetura

```
Emissão:
  servidor → payload JSON → base64url(payload) → Ed25519.sign(privKey) → token

Token:
  base64url(payload) . base64url(assinatura_ed25519)

Verificação (browser):
  decodifica payload → busca pubkey em /api/verificar/pubkey/:escolaId
  → WebCrypto.verify(Ed25519, pubKey, assinatura, payload)
  → GET /api/verificar/status/:token (online) → resultado consolidado
```

---

## Token

### Estrutura

```
base64url(payload) . base64url(ed25519_signature_64bytes)
```

### Payload

```typescript
type TokenPayload = {
  v: 1;
  tipo: "carteira" | "cartao-semestral" | "cartao-diario";
  escolaId: string;           // UUID da escola
  escolaNome: string;         // nome exibido na página de verificação
  usuarioId: string;          // UUID do usuário
  estudanteNome: string;      // nome completo
  cursoNome: string;
  turmaSigla: string;
  ano: number;
  semestre: 1 | 2;
  ts: number;                 // Unix timestamp de emissão (ms)
  exp: number;                // Unix timestamp de expiração (ms) — último segundo do semestre
};
```

**Expiração:** `exp` é calculado como o último segundo do semestre letivo, definido no calendário pedagógico da escola. Na ausência de calendário, padrão: 31/07 (semestre 1) ou 31/12 (semestre 2) às 23:59:59.

**COD CIE (display):** `base64url(payload).slice(-12).toUpperCase()` — inalterado visualmente.

---

## Gestão de Chaves

### Schema — tabela `escolas`

```sql
ALTER TABLE escolas
  ADD COLUMN IF NOT EXISTS signing_public_key  text,
  ADD COLUMN IF NOT EXISTS signing_private_key text,   -- cifrada AES-256-GCM com SESSION_SECRET
  ADD COLUMN IF NOT EXISTS signing_public_key_anterior text; -- preenchida na rotação
```

```typescript
// lib/db/src/schema/escolas.ts — acrescentar:
signingPublicKey:          text("signing_public_key"),
signingPrivateKey:         text("signing_private_key"),
signingPublicKeyAnterior:  text("signing_public_key_anterior"),
```

### Geração — `POST /api/admin/escolas/:id/gerar-chave`

Permissão: `escolas:manage`

```typescript
// 1. Gera par Ed25519
const { privateKey, publicKey } = await crypto.subtle.generateKey(
  { name: "Ed25519" }, true, ["sign", "verify"]
);

// 2. Exporta
const pubRaw  = Buffer.from(await crypto.subtle.exportKey("raw", publicKey)).toString("base64");
const privRaw = Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey)).toString("base64");

// 3. Cifra chave privada com AES-256-GCM + SESSION_SECRET
const privCifrada = cifrarAES(privRaw, process.env.SESSION_SECRET!);

// 4. Na rotação: move chave pública atual → signing_public_key_anterior
// 5. Salva novo par no banco
// 6. Retorna { escolaId, publicKey: pubRaw } — nunca a privada
```

Resposta:
```json
{ "escolaId": "...", "publicKey": "<base64>", "algoritmo": "Ed25519" }
```

### Rotação

Ao gerar nova chave, a chave pública atual é copiada para `signing_public_key_anterior`. O endpoint de verificação tenta a chave atual; se falhar, tenta a anterior (grace period para tokens já emitidos). Não há terceira chave — após duas rotações, tokens da geração mais antiga ficam inválidos.

### Chave Pública Pública

`GET /api/verificar/pubkey/:escolaId` — **sem autenticação**

```json
{
  "escolaId": "...",
  "escolaNome": "CEF Tal",
  "algoritmo": "Ed25519",
  "publicKey": "<base64 raw 32 bytes>",
  "publicKeyAnterior": "<base64 raw 32 bytes | null>"
}
```

---

## Página de Verificação Pública

### Rota

`GET /verificar/:token` — **sem autenticação**, acessível por qualquer pessoa.

O QR Code codifica a URL completa: `https://<host>/verificar/<token>`

Ao escanear com qualquer câmera, o sistema operacional abre o navegador diretamente nessa página.

### Layout

```
┌─────────────────────────────────────────────┐
│  [Logo escola]   CEF Tal                    │
│                                             │
│  ✅ Assinatura válida                       │  ← verificação criptográfica (offline)
│  ✅ Carteira ativa                          │  ← verificação de status (online)
│                                             │
│  Estudante:  João Silva                     │
│  Curso:      Técnico em Informática         │
│  Turma:      TI-M1-2026                     │
│  Semestre:   1/2026                         │
│  Validade:   até 31/07/2026                 │
│                                             │
│  Verificado em: 04/10/2026 09:14            │
└─────────────────────────────────────────────┘
```

### Dois passos distintos

| Passo | Verifica | Requer rede | Exibido como |
|---|---|---|---|
| **Assinatura Ed25519** | Token genuíno desta escola | Não (WebCrypto) | "✅ Assinatura válida" / "❌ Assinatura inválida" |
| **Status no banco** | Não revogada/cancelada | Sim | "✅ Carteira ativa" / "❌ Carteira revogada" / "⚠️ Status não verificável (offline)" |

### Estados possíveis

| Assinatura | Status | Mensagem principal |
|---|---|---|
| válida | ativo | ✅ Carteira autêntica e ativa |
| válida | revogada | ❌ Carteira revogada pela instituição |
| válida | offline | ⚠️ Autenticidade verificada — status indisponível (sem conexão) |
| inválida | qualquer | ❌ Documento inautêntico — não emitido por esta escola |
| expirada (`exp`) | qualquer | ❌ Carteira vencida — semestre encerrado |

### Implementação da verificação no browser

```typescript
// Usa Web Crypto API (disponível em todos os browsers modernos)
const pubKeyBuffer = base64ToBuffer(pubKeyBase64);
const cryptoKey = await crypto.subtle.importKey(
  "raw", pubKeyBuffer, { name: "Ed25519" }, false, ["verify"]
);
const [payloadB64, sigB64] = token.split(".");
const valid = await crypto.subtle.verify(
  "Ed25519",
  cryptoKey,
  base64urlToBuffer(sigB64),
  base64urlToBuffer(payloadB64)
);
```

### Endpoint de status (público, sem auth)

`GET /api/verificar/status/:token`

Decodifica `escolaId` do payload (sem verificar assinatura — apenas leitura). Busca `carteiras` pelo hash SHA-256 do token. Retorna apenas metadados, sem dados pessoais:

```json
{ "status": "ativa" | "revogada" | "cancelada", "tipo": "carteira", "exp": 1769000000 }
```

404 se não encontrado (token nunca existiu ou foi limpo do banco).

---

## Scanner Interno — `/leitura-qr`

Mantém o design da skill `seshat-leitura-qrcode`, com uma alteração: `verificarToken(token)` usa `verificarEd25519` em vez de `verificarTokenHMAC`.

O scanner interno opera autenticado (`carteiras:verificar`) e, para cartão de liberação, registra ocorrência de saída antecipada e dispara e-mail — comportamento inalterado.

---

## `lib/token.ts`

```typescript
// Assina com chave privada da escola (Ed25519)
export async function assinarEd25519(
  payload: TokenPayload,
  privKeyBase64: string,         // cifrada no banco; quem chama decifra antes
): Promise<string>

// Verifica assinatura Ed25519
// Tenta chave atual; se falhar e pubKeyAnterior existir, tenta a anterior
export async function verificarEd25519(
  token: string,
  pubKeyBase64: string,
  pubKeyAnteriorBase64?: string | null,
): Promise<TokenPayload | null>
```

Funções auxiliares de cifra da chave privada em repouso:

```typescript
// AES-256-GCM, derivado de SESSION_SECRET via PBKDF2
export function cifrarChavePrivada(privKeyB64: string, secret: string): string
export function decifrarChavePrivada(cifrado: string, secret: string): string
```

---

## Migração dos Tokens HMAC Existentes

**Estratégia: reemissão automática.**

Como a feature de leitura de QR ainda não existe (nenhum QR é escaneado hoje), não há tokens em circulação ativa sendo validados. Na primeira execução após o deploy:

1. Script `scripts/migrate-tokens-ed25519.ts` busca todas as carteiras com `status = 'ativa'`
2. Para cada escola que já tem chave gerada: re-assina com Ed25519, atualiza `carteiras.token`
3. Carteiras de escolas sem chave: permanecem com token HMAC até a escola gerar sua chave (o portal de emissão força a geração na primeira emissão)

O endpoint `POST /api/carteiras/emitir-liberacao` e `emitirCarteirasParaMatricula` passam a usar `assinarEd25519`. Se a escola não tiver chave ainda, retorna 422 com mensagem orientando o admin a gerar o par de chaves primeiro.

---

## Arquivos Afetados

| Arquivo | Ação |
|---|---|
| `lib/db/src/schema/escolas.ts` | + `signingPublicKey`, `signingPrivateKey`, `signingPublicKeyAnterior` |
| `scripts/migrate-qrcode-ed25519.sql` | DDL: colunas em `escolas` + `carteiras` (`lido_em`, `lido_por_id`) |
| `artifacts/api-server/src/lib/token.ts` | `assinarEd25519`, `verificarEd25519`, cifra/decifra chave privada |
| `artifacts/api-server/src/routes/verificar.ts` | `GET /api/verificar/pubkey/:escolaId`, `GET /api/verificar/status/:token` |
| `artifacts/api-server/src/routes/admin-escolas.ts` | `POST /api/admin/escolas/:id/gerar-chave` |
| `artifacts/api-server/src/routes/leitura-qr.ts` | Scanner interno (novo) |
| `artifacts/api-server/src/lib/ocorrencia-helper.ts` | Helper ocorrência + e-mail (novo) |
| `artifacts/seshat/src/pages/verificar/index.tsx` | Página pública de verificação (nova) |
| `artifacts/seshat/src/pages/leitura-qr/index.tsx` | Scanner interno UI (novo) |
| `artifacts/seshat/src/App.tsx` | Rota `/verificar/:token` (pública) + `/leitura-qr` (auth) |
| `artifacts/seshat/src/components/layout.tsx` | Item de menu "Leitura de QR" |
| `scripts/migrate-tokens-ed25519.ts` | Re-emissão das carteiras HMAC existentes |
| `.claude/skills/seshat-leitura-qrcode/SKILL.md` | Atualizar para refletir Ed25519 |

---

## Invariantes de Segurança

1. A chave privada nunca sai do servidor e nunca é retornada por nenhum endpoint.
2. A chave privada é cifrada em repouso (AES-256-GCM derivado de `SESSION_SECRET`).
3. O endpoint de status não retorna dados pessoais — apenas `status`, `tipo` e `exp`.
4. A página pública não exige cookies, sessão ou qualquer rastreamento.
5. A verificação criptográfica ocorre no browser do visitante — o servidor não recebe o token no fluxo de verificação pública (só no fluxo de status).

---

## Spec de referência anterior

`.specs/features/leitura-qrcode.md` — mantida; este documento a supersede no que tange ao modelo de token. Os endpoints do scanner interno e o fluxo de ocorrência de saída antecipada permanecem conforme especificado lá.
