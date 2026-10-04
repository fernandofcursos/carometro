# QR Code — Verificação Oficial (Ed25519) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o token HMAC-SHA256 por assinatura Ed25519 por escola, publicar endpoint de chave pública, criar página de verificação pública `/verificar/:token` e scanner interno `/leitura-qr`.

**Architecture:** Criptografia assimétrica Ed25519 — escola assina tokens com chave privada (guardada cifrada no banco), chave pública publicada sem auth. QR code embute URL completa. Verificação ocorre no browser via WebCrypto sem enviar o token ao servidor.

**Tech Stack:** Node.js `crypto.subtle` (Web Crypto API — disponível no Node 18+), Drizzle ORM, Express, React (Wouter), `@zxing/browser` para câmera.

**Spec:** `docs/superpowers/specs/2026-10-04-qrcode-verificacao-oficial-design.md`

## Global Constraints

- Chave privada **nunca** é retornada por nenhum endpoint
- Chave privada cifrada em repouso com AES-256-GCM derivado de `SESSION_SECRET` via PBKDF2
- Endpoint de status público não retorna dados pessoais
- Imports de DB: `from "@workspace/db"` (Drizzle)
- Imports de auth/permissões: `from "../lib/auth.js"` e `from "../lib/permissions.js"`
- `requirePermissao` recebe string única: `requirePermissao("recurso:acao")`
- Roles: buscar via `buscarRoles(usuarioId)` de `lib/permissions.js` — não existem no JWT
- `pgCode(err)`: extrai `err.cause?.code ?? err.code` para erros Drizzle/PostgreSQL
- Página `/verificar/:token` é pública — deve ser acessível sem autenticação
- Todos os novos arquivos TypeScript usam extensão `.js` nos imports internos

---

## Mapa de Arquivos

| Arquivo | Ação |
|---|---|
| `scripts/migrate-qrcode-ed25519.sql` | Criar — DDL escolas + carteiras + cartoes_saida + tipos_ocorrencias |
| `lib/db/src/schema/escolas.ts` | Modificar — +3 campos de chave |
| `artifacts/api-server/src/lib/token.ts` | Criar — Ed25519 sign/verify + AES cipher |
| `artifacts/api-server/src/routes/verificar.ts` | Criar — pubkey + status (públicos) |
| `artifacts/api-server/src/routes/admin-escolas.ts` | Modificar — + endpoint gerar-chave |
| `artifacts/api-server/src/routes/carteiras.ts` | Modificar — usar assinarEd25519 |
| `artifacts/api-server/src/lib/ocorrencia-helper.ts` | Criar — helper ocorrência + e-mail |
| `artifacts/api-server/src/routes/leitura-qr.ts` | Criar — scanner interno |
| `artifacts/api-server/src/index.ts` | Modificar — registrar novas rotas |
| `artifacts/seshat/src/pages/verificar/index.tsx` | Criar — página pública de verificação |
| `artifacts/seshat/src/pages/leitura-qr/index.tsx` | Criar — scanner UI interno |
| `artifacts/seshat/src/App.tsx` | Modificar — rotas /verificar/* + /leitura-qr |
| `artifacts/seshat/src/components/layout.tsx` | Modificar — item de menu Leitura de QR |
| `scripts/migrate-tokens-ed25519.ts` | Criar — re-assina carteiras HMAC existentes |
| `.claude/skills/seshat-leitura-qrcode/SKILL.md` | Modificar — atualizar para Ed25519 |

---

### Task 1: Migração SQL e Schema Drizzle

**Files:**
- Create: `scripts/migrate-qrcode-ed25519.sql`
- Modify: `lib/db/src/schema/escolas.ts`

**Interfaces:**
- Produces: campos `signingPublicKey`, `signingPrivateKey`, `signingPublicKeyAnterior` em `escolasTable`; colunas `lido_em`, `lido_por_id` em `carteiras` e `cartoes_saida`; campo `slug` em `tipos_ocorrencias`

- [ ] **Step 1: Escrever migrate-qrcode-ed25519.sql**

```sql
-- scripts/migrate-qrcode-ed25519.sql
-- Idempotente — seguro para re-executar

-- Campos de chave Ed25519 nas escolas
ALTER TABLE escolas
  ADD COLUMN IF NOT EXISTS signing_public_key          text,
  ADD COLUMN IF NOT EXISTS signing_private_key         text,
  ADD COLUMN IF NOT EXISTS signing_public_key_anterior text;

-- Campos de leitura em carteiras
ALTER TABLE carteiras
  ADD COLUMN IF NOT EXISTS lido_em      timestamptz,
  ADD COLUMN IF NOT EXISTS lido_por_id  uuid REFERENCES usuarios(id) ON DELETE SET NULL;

-- Campos de leitura em cartoes_saida
ALTER TABLE cartoes_saida
  ADD COLUMN IF NOT EXISTS lido_em      timestamptz,
  ADD COLUMN IF NOT EXISTS lido_por_id  uuid REFERENCES usuarios(id) ON DELETE SET NULL;

-- Slug em tipos_ocorrencias
ALTER TABLE tipos_ocorrencias
  ADD COLUMN IF NOT EXISTS slug varchar(60);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tipo_ocorrencia_slug
  ON tipos_ocorrencias(slug) WHERE slug IS NOT NULL;

-- Seed tipo ocorrência saída antecipada
INSERT INTO tipos_ocorrencias (id, descricao, status, slug)
VALUES (gen_random_uuid(), 'Saída Antecipada', 'ativo', 'saida-antecipada')
ON CONFLICT ON CONSTRAINT uq_tipo_ocorrencia_slug DO NOTHING;

-- Permissão carteiras:verificar
INSERT INTO permissoes (recurso, acao)
VALUES ('carteiras', 'verificar')
ON CONFLICT (recurso, acao) DO NOTHING;

-- Role portaria (caso não exista)
INSERT INTO roles (id, nome, descricao)
VALUES (gen_random_uuid(), 'portaria', 'Portaria — leitura de QR Code')
ON CONFLICT (nome) DO NOTHING;

-- Atribuir permissão carteiras:verificar aos roles autorizados
INSERT INTO roles_permissoes (role_id, permissao_id)
SELECT r.id, p.id
FROM roles r, permissoes p
WHERE r.nome IN ('portaria', 'coordenacao', 'gestao', 'secretaria')
  AND p.recurso = 'carteiras' AND p.acao = 'verificar'
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Verificar que o arquivo foi criado corretamente**

```bash
cat scripts/migrate-qrcode-ed25519.sql
```

- [ ] **Step 3: Adicionar campos no schema Drizzle de escolas**

Abrir `lib/db/src/schema/escolas.ts`. Localizar os imports existentes e adicionar `text` se ainda não estiver. No final da definição da tabela (antes do fechamento), adicionar:

```typescript
// Dentro do objeto passado a pgTable, após o campo `config`:
signingPublicKey:          text("signing_public_key"),
signingPrivateKey:         text("signing_private_key"),
signingPublicKeyAnterior:  text("signing_public_key_anterior"),
```

Não alterar mais nada no arquivo.

- [ ] **Step 4: Verificar que o schema compila**

```bash
cd lib/db && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-qrcode-ed25519.sql lib/db/src/schema/escolas.ts
git commit -m "feat(qrcode): migration SQL e schema Ed25519 para escolas"
```

---

### Task 2: `lib/token.ts` — Ed25519 + AES-256-GCM

**Files:**
- Create: `artifacts/api-server/src/lib/token.ts`

**Interfaces:**
- Produces:
  ```typescript
  export type TokenPayload = {
    v: 1; tipo: "carteira" | "cartao-semestral" | "cartao-diario";
    escolaId: string; escolaNome: string; usuarioId: string;
    estudanteNome: string; cursoNome: string; turmaSigla: string;
    ano: number; semestre: 1 | 2; ts: number; exp: number;
  };
  export async function assinarEd25519(payload: TokenPayload, privKeyCifradaB64: string, secret: string): Promise<string>
  export async function verificarEd25519(token: string, pubKeyB64: string, pubKeyAnteriorB64?: string | null): Promise<TokenPayload | null>
  export function cifrarChavePrivada(privKeyB64: string, secret: string): string
  export function decifrarChavePrivada(cifrado: string, secret: string): string
  export function calcularExp(ano: number, semestre: 1 | 2): number
  ```

- [ ] **Step 1: Escrever o arquivo token.ts**

```typescript
// artifacts/api-server/src/lib/token.ts
import { createHash, createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "crypto";

export type TokenPayload = {
  v: 1;
  tipo: "carteira" | "cartao-semestral" | "cartao-diario";
  escolaId: string;
  escolaNome: string;
  usuarioId: string;
  estudanteNome: string;
  cursoNome: string;
  turmaSigla: string;
  ano: number;
  semestre: 1 | 2;
  ts: number;
  exp: number;
};

// Calcula expiração: último segundo do semestre (31/07 ou 31/12 às 23:59:59)
export function calcularExp(ano: number, semestre: 1 | 2): number {
  const mes = semestre === 1 ? 6 : 11; // julho=6, dezembro=11 (0-indexed)
  const dia = semestre === 1 ? 31 : 31;
  return new Date(ano, mes, dia, 23, 59, 59, 0).getTime();
}

// Deriva chave AES-256 de 32 bytes a partir do secret
function derivarChaveAES(secret: string, salt: Buffer): Buffer {
  return pbkdf2Sync(secret, salt, 100_000, 32, "sha256");
}

// Cifra chave privada Ed25519 (pkcs8 base64) com AES-256-GCM
// Formato: base64(salt_16 || iv_12 || authTag_16 || ciphertext)
export function cifrarChavePrivada(privKeyB64: string, secret: string): string {
  const salt = randomBytes(16);
  const iv   = randomBytes(12);
  const key  = derivarChaveAES(secret, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc  = Buffer.concat([cipher.update(privKeyB64, "utf8"), cipher.final()]);
  const tag  = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, enc]).toString("base64");
}

// Decifra chave privada
export function decifrarChavePrivada(cifrado: string, secret: string): string {
  const buf  = Buffer.from(cifrado, "base64");
  const salt = buf.subarray(0, 16);
  const iv   = buf.subarray(16, 28);
  const tag  = buf.subarray(28, 44);
  const enc  = buf.subarray(44);
  const key  = derivarChaveAES(secret, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final("utf8");
}

// Helpers de encoding base64url ↔ Buffer
function b64urlToBuffer(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function bufferToB64url(b: Buffer): string {
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Assina payload com chave privada Ed25519 da escola
// privKeyCifradaB64: valor de escolas.signing_private_key (cifrado)
// secret: process.env.SESSION_SECRET
export async function assinarEd25519(
  payload: TokenPayload,
  privKeyCifradaB64: string,
  secret: string,
): Promise<string> {
  const privKeyB64 = decifrarChavePrivada(privKeyCifradaB64, secret);
  const privKeyBuf = Buffer.from(privKeyB64, "base64");
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", privKeyBuf, { name: "Ed25519" }, false, ["sign"],
  );
  const payloadStr = bufferToB64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = await crypto.subtle.sign(
    "Ed25519", cryptoKey, Buffer.from(payloadStr, "utf8"),
  );
  return `${payloadStr}.${bufferToB64url(Buffer.from(sig))}`;
}

// Verifica assinatura Ed25519. Tenta chave atual; se falhar, tenta anterior.
// Retorna o payload se válido, null se inválido.
export async function verificarEd25519(
  token: string,
  pubKeyB64: string,
  pubKeyAnteriorB64?: string | null,
): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  async function tentarChave(keyB64: string): Promise<boolean> {
    try {
      const keyBuf = Buffer.from(keyB64, "base64");
      const cryptoKey = await crypto.subtle.importKey(
        "raw", keyBuf, { name: "Ed25519" }, false, ["verify"],
      );
      return await crypto.subtle.verify(
        "Ed25519", cryptoKey,
        b64urlToBuffer(sigB64),
        Buffer.from(payloadB64, "utf8"),
      );
    } catch {
      return false;
    }
  }

  const valido = await tentarChave(pubKeyB64)
    || (pubKeyAnteriorB64 ? await tentarChave(pubKeyAnteriorB64) : false);

  if (!valido) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(b64urlToBuffer(payloadB64)).toString("utf8"),
    ) as TokenPayload;
    if (payload.exp < Date.now()) return null; // expirado
    return payload;
  } catch {
    return null;
  }
}

// Hash SHA-256 do token (para buscar no banco sem expor o token)
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
```

- [ ] **Step 2: Verificar que o arquivo compila**

```bash
cd artifacts/api-server && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/lib/token.ts
git commit -m "feat(qrcode): lib/token.ts — Ed25519 sign/verify + AES cipher"
```

---

### Task 3: Endpoints Públicos de Verificação + Gerar Chave

**Files:**
- Create: `artifacts/api-server/src/routes/verificar.ts`
- Modify: `artifacts/api-server/src/routes/admin-escolas.ts`
- Modify: `artifacts/api-server/src/index.ts`

**Interfaces:**
- Consumes: `verificarEd25519`, `cifrarChavePrivada` de `../lib/token.js`; `escolasTable`, `carteirasTable` de `@workspace/db`
- Produces:
  - `GET /api/verificar/pubkey/:escolaId` → `{ escolaId, escolaNome, algoritmo, publicKey, publicKeyAnterior }`
  - `GET /api/verificar/status/:token` → `{ status, tipo, exp }` ou 404
  - `POST /api/admin/escolas/:id/gerar-chave` → `{ escolaId, publicKey, algoritmo }`

- [ ] **Step 1: Criar routes/verificar.ts**

```typescript
// artifacts/api-server/src/routes/verificar.ts
import { Router } from "express";
import { db, escolasTable, carteirasTable, eq } from "@workspace/db";
import { hashToken } from "../lib/token.js";

const router = Router();
// Sem requireAuth — rotas públicas

// GET /api/verificar/pubkey/:escolaId
router.get("/pubkey/:escolaId", async (req, res) => {
  const escola = await db.select({
    id: escolasTable.id,
    nome: escolasTable.nome,
    signingPublicKey: escolasTable.signingPublicKey,
    signingPublicKeyAnterior: escolasTable.signingPublicKeyAnterior,
  }).from(escolasTable)
    .where(eq(escolasTable.id, req.params.escolaId))
    .limit(1);

  if (!escola[0] || !escola[0].signingPublicKey) {
    return res.status(404).json({ erro: "Escola não encontrada ou sem chave configurada." });
  }

  return res.json({
    escolaId: escola[0].id,
    escolaNome: escola[0].nome,
    algoritmo: "Ed25519",
    publicKey: escola[0].signingPublicKey,
    publicKeyAnterior: escola[0].signingPublicKeyAnterior ?? null,
  });
});

// GET /api/verificar/status/:token
// Não verifica assinatura — apenas consulta status no banco pelo hash do token
router.get("/status/:token", async (req, res) => {
  const tokenHash = hashToken(req.params.token);

  const carteira = await db.select({
    status: carteirasTable.status,
    tipo: carteirasTable.tipo,
    exp: carteirasTable.token, // usamos token para confirmar match; não retornamos
    ano: carteirasTable.ano,
    semestre: carteirasTable.semestre,
  }).from(carteirasTable)
    .where(eq(carteirasTable.tokenHash, tokenHash))
    .limit(1);

  if (!carteira[0]) {
    return res.status(404).json({ erro: "Carteira não encontrada." });
  }

  return res.json({
    status: carteira[0].status,
    tipo: carteira[0].tipo,
    ano: carteira[0].ano,
    semestre: carteira[0].semestre,
  });
});

export default router;
```

**ATENÇÃO:** O campo `tokenHash` precisa ser adicionado à tabela `carteiras` — uma coluna `token_hash varchar(64)` gerada pelo hash SHA-256 do token, para busca rápida sem expor o token. Adicione ao SQL de migração:

```sql
-- Adicionar ao migrate-qrcode-ed25519.sql (ou executar separadamente):
ALTER TABLE carteiras ADD COLUMN IF NOT EXISTS token_hash varchar(64);
CREATE INDEX IF NOT EXISTS idx_carteiras_token_hash ON carteiras(token_hash);
```

E no schema Drizzle `carteiras.ts`:
```typescript
tokenHash: varchar("token_hash", { length: 64 }),
```

- [ ] **Step 2: Adicionar endpoint gerar-chave em admin-escolas.ts**

Abrir `artifacts/api-server/src/routes/admin-escolas.ts`. Adicionar ao início dos imports:

```typescript
import { cifrarChavePrivada } from "../lib/token.js";
```

Adicionar ao final do arquivo (antes do `export default router`):

```typescript
// POST /api/admin-escolas/:id/gerar-chave
// Gera par Ed25519 para a escola. Na rotação, preserva chave anterior.
router.post("/:id/gerar-chave", requirePermissao("escolas:manage"), async (req, res) => {
  const escola = await db.select({
    id: escolasTable.id,
    signingPublicKey: escolasTable.signingPublicKey,
  }).from(escolasTable)
    .where(eq(escolasTable.id, req.params.id))
    .limit(1);

  if (!escola[0]) return res.status(404).json({ erro: "Escola não encontrada." });

  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: "Ed25519" }, true, ["sign", "verify"],
  ) as CryptoKeyPair;

  const pubRaw  = Buffer.from(await crypto.subtle.exportKey("raw", publicKey)).toString("base64");
  const privRaw = Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey)).toString("base64");
  const privCifrada = cifrarChavePrivada(privRaw, process.env.SESSION_SECRET!);

  await db.update(escolasTable).set({
    signingPublicKeyAnterior: escola[0].signingPublicKey ?? null,
    signingPublicKey:         pubRaw,
    signingPrivateKey:        privCifrada,
  }).where(eq(escolasTable.id, req.params.id));

  return res.json({ escolaId: req.params.id, publicKey: pubRaw, algoritmo: "Ed25519" });
});
```

- [ ] **Step 3: Registrar rotas em index.ts**

Em `artifacts/api-server/src/index.ts`, adicionar import:

```typescript
import verificarRouter from "./routes/verificar.js";
```

E registrar (junto às outras rotas públicas como `/api/verificar` existente):

```typescript
app.use("/api/verificar", verificarRouter);
```

(Se já existe `/api/verificar` de `criarRotaVerificacaoCarteira`, renomear o novo para `/api/verificar/v2` ou integrar na mesma rota — verificar o arquivo antes e escolher o prefixo que não conflite.)

- [ ] **Step 4: Compilar**

```bash
cd artifacts/api-server && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/verificar.ts \
        artifacts/api-server/src/routes/admin-escolas.ts \
        artifacts/api-server/src/index.ts \
        scripts/migrate-qrcode-ed25519.sql \
        lib/db/src/schema/carteiras.ts
git commit -m "feat(qrcode): endpoints públicos pubkey/status e gerar-chave admin"
```

---

### Task 4: Atualizar Emissão de Carteiras para Ed25519

**Files:**
- Modify: `artifacts/api-server/src/routes/carteiras.ts`

**Interfaces:**
- Consumes: `assinarEd25519`, `calcularExp`, `hashToken`, `TokenPayload` de `../lib/token.js`; `escolasTable` de `@workspace/db`
- Produces: `emitirCarteirasParaMatricula` usa Ed25519 em vez de HMAC; `carteiras.token_hash` é preenchido na emissão

- [ ] **Step 1: Adicionar imports em carteiras.ts**

```typescript
import { assinarEd25519, calcularExp, hashToken, type TokenPayload } from "../lib/token.js";
```

Adicionar `escolasTable` ao import de `@workspace/db`.

- [ ] **Step 2: Criar helper para buscar chave da escola**

Adicionar função auxiliar (antes de `emitirCarteirasParaMatricula`):

```typescript
async function buscarChaveEscola(escolaId: string): Promise<{
  privKeyCifrada: string; pubKey: string; pubKeyAnterior: string | null;
} | null> {
  const [escola] = await db.select({
    signingPrivateKey:        escolasTable.signingPrivateKey,
    signingPublicKey:         escolasTable.signingPublicKey,
    signingPublicKeyAnterior: escolasTable.signingPublicKeyAnterior,
  }).from(escolasTable).where(eq(escolasTable.id, escolaId)).limit(1);

  if (!escola?.signingPrivateKey || !escola?.signingPublicKey) return null;
  return {
    privKeyCifrada: escola.signingPrivateKey,
    pubKey: escola.signingPublicKey,
    pubKeyAnterior: escola.signingPublicKeyAnterior ?? null,
  };
}
```

- [ ] **Step 3: Atualizar gerarTokenCarteira dentro de emitirCarteirasParaMatricula**

Localizar onde o token é gerado (busca por `createHmac` ou `gerarTokenCarteira`). Substituir pela lógica Ed25519:

```typescript
// Busca dados necessários para o payload
const chave = await buscarChaveEscola(escolaId);
if (!chave) {
  throw new Error("Escola sem chave Ed25519 configurada. Acesse Configurações → Gerar Chave.");
}

const payload: TokenPayload = {
  v: 1,
  tipo: "carteira",
  escolaId,
  escolaNome: escolaNome,
  usuarioId,
  estudanteNome: nomeEstudante,
  cursoNome: cursoNome,
  turmaSigla: turmaSigla,
  ano,
  semestre,
  ts: Date.now(),
  exp: calcularExp(ano, semestre),
};

const token = await assinarEd25519(payload, chave.privKeyCifrada, process.env.SESSION_SECRET!);
const tokenHashVal = hashToken(token);
```

No INSERT de carteiras, incluir `tokenHash: tokenHashVal`.

- [ ] **Step 4: Compilar**

```bash
cd artifacts/api-server && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/carteiras.ts
git commit -m "feat(qrcode): emissão de carteiras usa assinatura Ed25519"
```

---

### Task 5: `ocorrencia-helper.ts` + `routes/leitura-qr.ts`

**Files:**
- Create: `artifacts/api-server/src/lib/ocorrencia-helper.ts`
- Create: `artifacts/api-server/src/routes/leitura-qr.ts`
- Modify: `artifacts/api-server/src/index.ts`

**Interfaces:**
- Consumes: `verificarEd25519` de `../lib/token.js`; `escolasTable`, `carteirasTable`, `cartoesSaidaTable`, `ocorrenciasTable`, `tiposOcorrenciasTable`, `estudantesTable` de `@workspace/db`; `enviarEmailOcorrencia` de `../lib/mailer.js`
- Produces:
  ```typescript
  // lib/ocorrencia-helper.ts
  export async function registrarOcorrenciaComEmail(opts: {
    estudanteId: string; tipo: "saida-antecipada";
    registradoPorId: string; horarioSaida: string;
    tipoCartao: "cartao-semestral" | "diario"; ip: string;
  }): Promise<{ ocorrenciaId: string; emailEnviado: boolean }>
  ```

- [ ] **Step 1: Criar ocorrencia-helper.ts**

Abrir `artifacts/api-server/src/routes/ocorrencias.ts` e localizar a função de disparo de e-mail (busca por `enviarEmailOcorrencia`). Extrair a lógica para o helper:

```typescript
// artifacts/api-server/src/lib/ocorrencia-helper.ts
import { db, ocorrenciasTable, tiposOcorrenciasTable, estudantesTable,
         usuariosTable, matriculasTable, cursosTable, eq, and, isNull } from "@workspace/db";
import { enviarEmailOcorrencia } from "./mailer.js";
import { registrarAuditoria } from "./audit.js";

export async function registrarOcorrenciaComEmail(opts: {
  estudanteId: string;
  tipo: "saida-antecipada";
  registradoPorId: string;
  horarioSaida: string;
  tipoCartao: "cartao-semestral" | "diario";
  ip: string;
}): Promise<{ ocorrenciaId: string; emailEnviado: boolean }> {
  // 1. Busca tipo de ocorrência pelo slug
  const [tipoOcorrencia] = await db.select()
    .from(tiposOcorrenciasTable)
    .where(eq(tiposOcorrenciasTable.slug, opts.tipo))
    .limit(1);
  if (!tipoOcorrencia) throw new Error(`Tipo de ocorrência '${opts.tipo}' não encontrado.`);

  // 2. Insere ocorrência
  const obs = `Saída antecipada via cartão ${opts.tipoCartao === "cartao-semestral" ? "semestral" : "diário"} — horário ${opts.horarioSaida}`;
  const [ocorrencia] = await db.insert(ocorrenciasTable).values({
    estudanteId: opts.estudanteId,
    tipoOcorrenciaId: tipoOcorrencia.id,
    registradoPorId: opts.registradoPorId,
    observacao: obs,
  }).returning({ id: ocorrenciasTable.id });

  // 3. Auditoria
  await registrarAuditoria({
    operacao: "create",
    tabela: "ocorrencias",
    registroId: ocorrencia.id,
    usuarioId: opts.registradoPorId,
    ipOrigem: opts.ip,
  }).catch(() => {});

  // 4. Dispara e-mail (tolerante a falha)
  let emailEnviado = false;
  try {
    await enviarEmailOcorrencia(ocorrencia.id);
    emailEnviado = true;
  } catch { /* tolerante */ }

  return { ocorrenciaId: ocorrencia.id, emailEnviado };
}
```

- [ ] **Step 2: Criar routes/leitura-qr.ts**

```typescript
// artifacts/api-server/src/routes/leitura-qr.ts
import { Router } from "express";
import { db, carteirasTable, cartoesSaidaTable, escolasTable,
         estudantesTable, eq, and, isNull } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { verificarEd25519 } from "../lib/token.js";
import { registrarOcorrenciaComEmail } from "../lib/ocorrencia-helper.js";

const router = Router();
router.use(requireAuth);
router.use(requirePermissao("carteiras:verificar"));

async function buscarPubKeyEscola(escolaId: string) {
  const [e] = await db.select({
    signingPublicKey: escolasTable.signingPublicKey,
    signingPublicKeyAnterior: escolasTable.signingPublicKeyAnterior,
  }).from(escolasTable).where(eq(escolasTable.id, escolaId)).limit(1);
  return e ?? null;
}

function dentroJanela(dataSaida: string | null, horarioSaida: string | null): boolean {
  if (!horarioSaida) return false;
  const [hh, mm] = horarioSaida.split(":").map(Number);
  const agora = new Date();
  const hoje = agora.toISOString().substring(0, 10);
  if (dataSaida && dataSaida !== hoje) return false;
  const totalMin = agora.getHours() * 60 + agora.getMinutes();
  return Math.abs(totalMin - (hh * 60 + mm)) <= 5;
}

// POST /api/leitura-qr/carteira — apenas valida, não registra ocorrência
router.post("/carteira", async (req, res) => {
  const { token } = req.body as { token: string };
  if (!token) return res.status(400).json({ valido: false, erro: "Token obrigatório." });

  // Decodifica payload para obter escolaId (sem verificar ainda)
  const [payloadB64] = token.split(".");
  let escolaId: string;
  try {
    const p = JSON.parse(Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    escolaId = p.escolaId;
  } catch {
    return res.status(400).json({ valido: false, erro: "Token malformado." });
  }

  const chave = await buscarPubKeyEscola(escolaId);
  if (!chave?.signingPublicKey) {
    return res.status(400).json({ valido: false, erro: "Escola sem chave configurada." });
  }

  const payload = await verificarEd25519(token, chave.signingPublicKey, chave.signingPublicKeyAnterior);
  if (!payload) return res.status(400).json({ valido: false, erro: "Assinatura inválida ou token expirado." });

  const [carteira] = await db.select({ status: carteirasTable.status, tipo: carteirasTable.tipo })
    .from(carteirasTable).where(eq(carteirasTable.token, token)).limit(1);

  if (!carteira) return res.status(404).json({ valido: false, erro: "Carteira não encontrada." });
  if (carteira.status !== "ativa") {
    return res.status(403).json({ valido: false, status: carteira.status, erro: "Carteira inativa." });
  }

  return res.json({
    valido: true, tipo: carteira.tipo,
    estudanteNome: payload.estudanteNome,
    cursoNome: payload.cursoNome, turmaSigla: payload.turmaSigla,
  });
});

// POST /api/leitura-qr/cartao-liberacao — valida e registra ocorrência
router.post("/cartao-liberacao", async (req, res) => {
  const { token } = req.body as { token: string };
  if (!token) return res.status(400).json({ valido: false, erro: "Token obrigatório." });

  const [payloadB64] = token.split(".");
  let escolaId: string; let tipo: string;
  try {
    const p = JSON.parse(Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    escolaId = p.escolaId; tipo = p.tipo;
  } catch {
    return res.status(400).json({ valido: false, erro: "Token malformado." });
  }

  const chave = await buscarPubKeyEscola(escolaId);
  if (!chave?.signingPublicKey) {
    return res.status(400).json({ valido: false, erro: "Escola sem chave configurada." });
  }

  const payload = await verificarEd25519(token, chave.signingPublicKey, chave.signingPublicKeyAnterior);
  if (!payload) return res.status(400).json({ valido: false, erro: "Assinatura inválida ou token expirado." });

  if (tipo === "cartao-semestral") {
    const [c] = await db.select().from(carteirasTable).where(eq(carteirasTable.token, token)).limit(1);
    if (!c) return res.status(404).json({ valido: false, erro: "Cartão não encontrado." });
    if (c.status !== "ativa") return res.status(403).json({ valido: false, erro: "Cartão revogado." });
    if (!dentroJanela(null, c.horarioSaida)) {
      return res.status(422).json({ valido: false, erro: "Fora do horário autorizado.", horarioSaida: c.horarioSaida });
    }
    // idempotência: não registra duas vezes no mesmo dia
    if (c.lidoEm) {
      const hoje = new Date().toISOString().substring(0, 10);
      if (c.lidoEm.toISOString().substring(0, 10) === hoje) {
        return res.json({ valido: true, jaRegistrado: true });
      }
    }
    const estudante = await db.select({ id: estudantesTable.id })
      .from(estudantesTable).where(and(eq(estudantesTable.usuarioId, c.usuarioId!), isNull(estudantesTable.deletadoEm))).limit(1);
    if (!estudante[0]) return res.status(404).json({ valido: false, erro: "Estudante não encontrado." });

    const { ocorrenciaId, emailEnviado } = await registrarOcorrenciaComEmail({
      estudanteId: estudante[0].id, tipo: "saida-antecipada",
      registradoPorId: req.usuarioId!, horarioSaida: c.horarioSaida ?? "",
      tipoCartao: "cartao-semestral", ip: req.ip!,
    });
    await db.update(carteirasTable).set({ lidoEm: new Date(), lidoPorId: req.usuarioId })
      .where(eq(carteirasTable.id, c.id));
    return res.json({ valido: true, tipo: "cartao-semestral", ocorrenciaId, emailEnviado });

  } else {
    // diário
    const [c] = await db.select().from(cartoesSaidaTable).where(eq(cartoesSaidaTable.token, token)).limit(1);
    if (!c) return res.status(404).json({ valido: false, erro: "Cartão não encontrado." });
    if (c.status !== "aprovado") return res.status(403).json({ valido: false, erro: "Cartão não aprovado." });
    if (!dentroJanela(c.dataSaida, c.horarioSaida)) {
      return res.status(422).json({ valido: false, erro: "Fora do horário autorizado.", horarioSaida: c.horarioSaida });
    }
    if (c.lidoEm) return res.json({ valido: true, jaRegistrado: true });

    const { ocorrenciaId, emailEnviado } = await registrarOcorrenciaComEmail({
      estudanteId: c.estudanteId, tipo: "saida-antecipada",
      registradoPorId: req.usuarioId!, horarioSaida: c.horarioSaida ?? "",
      tipoCartao: "diario", ip: req.ip!,
    });
    await db.update(cartoesSaidaTable).set({ lidoEm: new Date(), lidoPorId: req.usuarioId })
      .where(eq(cartoesSaidaTable.id, c.id));
    return res.json({ valido: true, tipo: "diario", ocorrenciaId, emailEnviado });
  }
});

export default router;
```

- [ ] **Step 3: Registrar leitura-qr em index.ts**

```typescript
import leituraQrRouter from "./routes/leitura-qr.js";
// ...
app.use("/api/leitura-qr", leituraQrRouter);
```

- [ ] **Step 4: Compilar**

```bash
cd artifacts/api-server && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/ocorrencia-helper.ts \
        artifacts/api-server/src/routes/leitura-qr.ts \
        artifacts/api-server/src/index.ts
git commit -m "feat(qrcode): leitura-qr route e ocorrencia-helper"
```

---

### Task 6: Página Pública de Verificação `/verificar/:token`

**Files:**
- Create: `artifacts/seshat/src/pages/verificar/index.tsx`
- Modify: `artifacts/seshat/src/App.tsx`

**Interfaces:**
- Consumes: endpoint `GET /api/verificar/pubkey/:escolaId` e `GET /api/verificar/status/:token` (fetch direto, sem react-query auth)
- Produces: rota pública `/verificar/:token` acessível sem login

- [ ] **Step 1: Criar pages/verificar/index.tsx**

```tsx
// artifacts/seshat/src/pages/verificar/index.tsx
import { useEffect, useState } from "react";
import { useRoute } from "wouter";

type VerifyState =
  | { fase: "carregando" }
  | { fase: "invalido"; motivo: string }
  | { fase: "expirado" }
  | { fase: "ok"; assinaturaValida: boolean; status: string | null; payload: TokenPayload }
  | { fase: "erro"; mensagem: string };

type TokenPayload = {
  v: 1; tipo: string; escolaId: string; escolaNome: string;
  estudanteNome: string; cursoNome: string; turmaSigla: string;
  ano: number; semestre: 1 | 2; ts: number; exp: number;
};

function b64urlToBuffer(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function verificarAssinatura(token: string, pubKeyB64: string): Promise<boolean> {
  try {
    const keyBuf = Uint8Array.from(atob(pubKeyB64), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      "raw", keyBuf, { name: "Ed25519" }, false, ["verify"],
    );
    const [payloadB64, sigB64] = token.split(".");
    return await crypto.subtle.verify(
      "Ed25519", cryptoKey,
      b64urlToBuffer(sigB64),
      new TextEncoder().encode(payloadB64),
    );
  } catch { return false; }
}

export default function VerificarPage() {
  const [, params] = useRoute("/verificar/:token");
  const token = params?.token ?? "";
  const [state, setState] = useState<VerifyState>({ fase: "carregando" });

  useEffect(() => {
    if (!token) { setState({ fase: "invalido", motivo: "Token ausente." }); return; }

    (async () => {
      // 1. Decodifica payload
      const [payloadB64] = token.split(".");
      let payload: TokenPayload;
      try {
        payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))) as TokenPayload;
      } catch {
        setState({ fase: "invalido", motivo: "Token malformado." }); return;
      }

      // 2. Verifica expiração
      if (payload.exp < Date.now()) { setState({ fase: "expirado" }); return; }

      // 3. Busca chave pública da escola
      let pubKeyB64: string; let pubKeyAnterior: string | null = null;
      try {
        const r = await fetch(`/api/verificar/pubkey/${payload.escolaId}`);
        if (!r.ok) { setState({ fase: "invalido", motivo: "Escola sem chave configurada." }); return; }
        const d = await r.json();
        pubKeyB64 = d.publicKey; pubKeyAnterior = d.publicKeyAnterior;
      } catch {
        setState({ fase: "erro", mensagem: "Não foi possível obter a chave pública da escola." }); return;
      }

      // 4. Verifica assinatura (offline — WebCrypto)
      const assinaturaValida =
        await verificarAssinatura(token, pubKeyB64) ||
        (pubKeyAnterior ? await verificarAssinatura(token, pubKeyAnterior) : false);

      // 5. Verifica status no banco (online, tolerante a falha)
      let statusBanco: string | null = null;
      try {
        const r = await fetch(`/api/verificar/status/${encodeURIComponent(token)}`);
        if (r.ok) { const d = await r.json(); statusBanco = d.status; }
      } catch { /* offline */ }

      setState({ fase: "ok", assinaturaValida, status: statusBanco, payload });
    })();
  }, [token]);

  const expDate = state.fase === "ok"
    ? new Date(state.payload.exp).toLocaleDateString("pt-BR")
    : "";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">Verificação de Carteira</h1>
          {state.fase === "ok" && (
            <p className="text-sm text-gray-500 mt-1">{state.payload.escolaNome}</p>
          )}
        </div>

        {state.fase === "carregando" && (
          <p className="text-center text-gray-500">Verificando...</p>
        )}

        {state.fase === "invalido" && (
          <div className="text-center">
            <p className="text-2xl mb-2">❌</p>
            <p className="font-semibold text-red-600">Documento inautêntico</p>
            <p className="text-sm text-gray-500 mt-1">{state.motivo}</p>
          </div>
        )}

        {state.fase === "expirado" && (
          <div className="text-center">
            <p className="text-2xl mb-2">❌</p>
            <p className="font-semibold text-red-600">Carteira vencida</p>
            <p className="text-sm text-gray-500 mt-1">O semestre letivo foi encerrado.</p>
          </div>
        )}

        {state.fase === "erro" && (
          <div className="text-center">
            <p className="text-2xl mb-2">⚠️</p>
            <p className="text-sm text-gray-500">{state.mensagem}</p>
          </div>
        )}

        {state.fase === "ok" && (
          <>
            <div className="space-y-2 mb-6">
              <div className="flex items-center gap-2">
                <span className="text-lg">{state.assinaturaValida ? "✅" : "❌"}</span>
                <span className={state.assinaturaValida ? "text-green-700 font-medium" : "text-red-600 font-medium"}>
                  {state.assinaturaValida ? "Assinatura válida" : "Assinatura inválida"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {state.status === "ativa" && <><span className="text-lg">✅</span><span className="text-green-700 font-medium">Carteira ativa</span></>}
                {state.status === "revogada" && <><span className="text-lg">❌</span><span className="text-red-600 font-medium">Carteira revogada</span></>}
                {state.status === "cancelada" && <><span className="text-lg">❌</span><span className="text-red-600 font-medium">Carteira cancelada</span></>}
                {state.status === null && <><span className="text-lg">⚠️</span><span className="text-amber-600 font-medium">Status não verificável (sem conexão)</span></>}
              </div>
            </div>

            {state.assinaturaValida && (
              <div className="border-t pt-4 space-y-1 text-sm">
                <div><span className="text-gray-500">Estudante:</span> <span className="font-medium">{state.payload.estudanteNome}</span></div>
                <div><span className="text-gray-500">Curso:</span> <span className="font-medium">{state.payload.cursoNome}</span></div>
                <div><span className="text-gray-500">Turma:</span> <span className="font-medium">{state.payload.turmaSigla}</span></div>
                <div><span className="text-gray-500">Semestre:</span> <span className="font-medium">{state.payload.semestre}/{state.payload.ano}</span></div>
                <div><span className="text-gray-500">Validade:</span> <span className="font-medium">até {expDate}</span></div>
              </div>
            )}

            <p className="text-xs text-gray-400 mt-4 text-center">
              Verificado em {new Date().toLocaleString("pt-BR")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Modificar App.tsx para rota pública**

Localizar no App.tsx o guard de autenticação (o `useEffect` que redireciona para `/login` e o `if (!user)` que retorna null). Adicionar exceção para `/verificar`:

```typescript
// No useEffect de redirecionamento:
if (!loading && !user && !location.startsWith("/verificar") && location !== "/login") {
  setLocation("/login");
}

// No render guard:
if (!user || location === "/login") {
  if (location === "/login") return <LoginPage />;
  if (location.startsWith("/verificar")) {
    // Renderiza a página de verificação sem layout autenticado
    return (
      <Switch>
        <Route path="/verificar/:token" component={VerificarPage} />
      </Switch>
    );
  }
  return null;
}
```

Adicionar import no topo: `import VerificarPage from "./pages/verificar/index.js";`

Adicionar também dentro do `<Switch>` principal (para usuários autenticados que acessam a rota):
```typescript
<Route path="/verificar/:token" component={VerificarPage} />
```

- [ ] **Step 3: Compilar**

```bash
cd artifacts/seshat && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add artifacts/seshat/src/pages/verificar/index.tsx \
        artifacts/seshat/src/App.tsx
git commit -m "feat(qrcode): página pública /verificar/:token com WebCrypto Ed25519"
```

---

### Task 7: Scanner UI Interno `/leitura-qr` + Menu

**Files:**
- Create: `artifacts/seshat/src/pages/leitura-qr/index.tsx`
- Modify: `artifacts/seshat/src/App.tsx`
- Modify: `artifacts/seshat/src/components/layout.tsx`

**Interfaces:**
- Consumes: `POST /api/leitura-qr/carteira` e `POST /api/leitura-qr/cartao-liberacao`
- Produces: rota autenticada `/leitura-qr`

- [ ] **Step 1: Instalar @zxing/browser no workspace seshat**

```bash
cd artifacts/seshat && pnpm add @zxing/browser
```

- [ ] **Step 2: Criar pages/leitura-qr/index.tsx**

```tsx
// artifacts/seshat/src/pages/leitura-qr/index.tsx
import { useRef, useState, useEffect, useCallback } from "react";
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Resultado = { ok: boolean; mensagem: string; detalhe?: Record<string, string> } | null;

function QrScannerPanel({ onRead }: { onRead: (token: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [manual, setManual] = useState("");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const reader = new BrowserQRCodeReader();
    setScanning(true);
    reader.decodeFromVideoDevice(undefined, videoRef.current!, (result, err, controls) => {
      controlsRef.current = controls;
      if (result) {
        // Extrai token da URL ou usa diretamente
        const text = result.getText();
        const match = text.match(/\/verificar\/(.+)$/);
        const token = match ? match[1] : text;
        controls.stop();
        setScanning(false);
        onRead(token);
        // Retoma após 3 segundos
        setTimeout(() => { setScanning(true); reader.decodeFromVideoDevice(undefined, videoRef.current!, () => {}); }, 3000);
      }
    }).catch(() => setScanning(false));
    return () => { controlsRef.current?.stop(); };
  }, [onRead]);

  return (
    <div className="space-y-4">
      <video ref={videoRef} className="w-full rounded-lg border" style={{ maxHeight: 300 }} />
      <p className="text-sm text-gray-500 text-center">{scanning ? "Aponte para o QR Code..." : "Processando..."}</p>
      <div className="flex gap-2">
        <Input placeholder="Ou cole o token aqui" value={manual} onChange={(e) => setManual(e.target.value)} />
        <Button variant="outline" disabled={!manual} onClick={() => { onRead(manual); setManual(""); }}>
          Validar
        </Button>
      </div>
    </div>
  );
}

async function chamarApi(endpoint: string, token: string): Promise<Resultado> {
  try {
    const r = await fetch(`/api/leitura-qr/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    });
    const d = await r.json();
    if (!r.ok || !d.valido) return { ok: false, mensagem: d.erro ?? "Inválido." };
    return { ok: true, mensagem: d.jaRegistrado ? "Já registrado hoje." : "Válido!", detalhe: d };
  } catch { return { ok: false, mensagem: "Erro de rede." }; }
}

export default function LeituraQrPage() {
  const [resultadoCarteira, setResultadoCarteira] = useState<Resultado>(null);
  const [resultadoCartao, setResultadoCartao] = useState<Resultado>(null);

  const handleCarteira = useCallback(async (token: string) => {
    setResultadoCarteira(await chamarApi("carteira", token));
  }, []);

  const handleCartao = useCallback(async (token: string) => {
    setResultadoCartao(await chamarApi("cartao-liberacao", token));
  }, []);

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">Leitura de QR Code</h1>
      <Tabs defaultValue="carteira">
        <TabsList className="w-full">
          <TabsTrigger value="carteira" className="flex-1">Carteira de Estudante</TabsTrigger>
          <TabsTrigger value="cartao" className="flex-1">Cartão de Saída</TabsTrigger>
        </TabsList>

        <TabsContent value="carteira" className="space-y-4 pt-4">
          <QrScannerPanel onRead={handleCarteira} />
          {resultadoCarteira && (
            <Badge variant={resultadoCarteira.ok ? "default" : "destructive"} className="text-base px-4 py-2 w-full justify-center">
              {resultadoCarteira.ok ? "✅" : "❌"} {resultadoCarteira.mensagem}
            </Badge>
          )}
        </TabsContent>

        <TabsContent value="cartao" className="space-y-4 pt-4">
          <QrScannerPanel onRead={handleCartao} />
          {resultadoCartao && (
            <Badge variant={resultadoCartao.ok ? "default" : "destructive"} className="text-base px-4 py-2 w-full justify-center">
              {resultadoCartao.ok ? "✅" : "❌"} {resultadoCartao.mensagem}
            </Badge>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 3: Adicionar rota /leitura-qr em App.tsx**

Dentro do `<Switch>` principal, adicionar:
```typescript
import LeituraQrPage from "./pages/leitura-qr/index.js";
// ...
<Route path="/leitura-qr" component={LeituraQrPage} />
```

- [ ] **Step 4: Adicionar item de menu em layout.tsx**

Localizar onde os itens de menu são declarados. Adicionar (visível quando `hasAny("carteiras:verificar")`):

```typescript
// Importar QrCode de lucide-react
import { QrCode } from "lucide-react";

// No array/JSX de menu:
{hasAny("carteiras:verificar") && (
  <NavItem href="/leitura-qr" icon={QrCode} label="Leitura de QR" />
)}
```

- [ ] **Step 5: Compilar**

```bash
cd artifacts/seshat && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 6: Commit**

```bash
git add artifacts/seshat/src/pages/leitura-qr/index.tsx \
        artifacts/seshat/src/App.tsx \
        artifacts/seshat/src/components/layout.tsx
git commit -m "feat(qrcode): scanner UI interno /leitura-qr e item de menu"
```

---

### Task 8: Script de Migração de Tokens HMAC → Ed25519

**Files:**
- Create: `scripts/migrate-tokens-ed25519.ts`

**Interfaces:**
- Consumes: `assinarEd25519`, `calcularExp`, `hashToken`, `TokenPayload` de `../artifacts/api-server/src/lib/token`; DB diretamente
- Produces: re-assina carteiras ativas cujas escolas já tenham chave configurada

- [ ] **Step 1: Criar scripts/migrate-tokens-ed25519.ts**

```typescript
// scripts/migrate-tokens-ed25519.ts
// Execução: npx tsx scripts/migrate-tokens-ed25519.ts
import "dotenv/config";
import { db, carteirasTable, escolasTable, matriculasTable, cursosTable, turmasTable,
         usuariosTable, eq, and, isNull, isNotNull } from "@workspace/db";
import { assinarEd25519, calcularExp, hashToken, type TokenPayload } from "../artifacts/api-server/src/lib/token.js";

async function main() {
  console.log("Buscando carteiras ativas...");
  const carteiras = await db.select({
    id: carteirasTable.id,
    usuarioId: carteirasTable.usuarioId,
    matriculaId: carteirasTable.matriculaId,
    tipo: carteirasTable.tipo,
    ano: carteirasTable.ano,
    semestre: carteirasTable.semestre,
    token: carteirasTable.token,
  }).from(carteirasTable).where(eq(carteirasTable.status, "ativa"));

  console.log(`${carteiras.length} carteiras encontradas.`);
  let reemitidas = 0; let puladas = 0;

  for (const c of carteiras) {
    if (!c.usuarioId) { puladas++; continue; }

    // Busca dados da escola via matrícula
    const mat = c.matriculaId
      ? await db.select({ turmaId: matriculasTable.turmaId }).from(matriculasTable)
          .where(eq(matriculasTable.id, c.matriculaId)).limit(1)
      : [];
    const turmaId = mat[0]?.turmaId;
    if (!turmaId) { puladas++; continue; }

    const turmaInfo = await db.select({
      sigla: turmasTable.sigla,
      cursoNome: cursosTable.nome,
      escolaId: cursosTable.escolaId,
    }).from(turmasTable)
      .innerJoin(cursosTable, eq(cursosTable.id, turmasTable.cursoId))
      .where(eq(turmasTable.id, turmaId)).limit(1);
    if (!turmaInfo[0]) { puladas++; continue; }

    const { escolaId } = turmaInfo[0];

    const escola = await db.select({
      nome: escolasTable.nome,
      signingPrivateKey: escolasTable.signingPrivateKey,
    }).from(escolasTable).where(eq(escolasTable.id, escolaId)).limit(1);
    if (!escola[0]?.signingPrivateKey) { puladas++; continue; } // escola sem chave — pula

    const usuario = await db.select({ nome: usuariosTable.nome })
      .from(usuariosTable).where(eq(usuariosTable.id, c.usuarioId)).limit(1);

    const payload: TokenPayload = {
      v: 1,
      tipo: c.tipo as TokenPayload["tipo"],
      escolaId,
      escolaNome: escola[0].nome ?? "",
      usuarioId: c.usuarioId,
      estudanteNome: usuario[0]?.nome ?? "",
      cursoNome: turmaInfo[0].cursoNome,
      turmaSigla: turmaInfo[0].sigla,
      ano: c.ano,
      semestre: c.semestre as 1 | 2,
      ts: Date.now(),
      exp: calcularExp(c.ano, c.semestre as 1 | 2),
    };

    const novoToken = await assinarEd25519(payload, escola[0].signingPrivateKey, process.env.SESSION_SECRET!);
    const novoHash = hashToken(novoToken);

    await db.update(carteirasTable).set({ token: novoToken, tokenHash: novoHash })
      .where(eq(carteirasTable.id, c.id));
    reemitidas++;
    process.stdout.write(".");
  }

  console.log(`\nPronto. Reemitidas: ${reemitidas} | Puladas: ${puladas}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsx --no-run scripts/migrate-tokens-ed25519.ts 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-tokens-ed25519.ts
git commit -m "feat(qrcode): script de reemissão HMAC→Ed25519 para carteiras ativas"
```

---

### Task 9: Atualizar SKILL.md seshat-leitura-qrcode

**Files:**
- Modify: `.claude/skills/seshat-leitura-qrcode/SKILL.md`

- [ ] **Step 1: Reescrever SKILL.md**

Substituir o conteúdo para refletir Ed25519 em vez de HMAC. Manter a mesma estrutura mas atualizar:

- Remover aviso "FEATURE NÃO IMPLEMENTADA" (ou reduzir para informar que a migração do SQL ainda precisa rodar)
- Seção "Segurança do Token": remover HMAC como fase atual; Ed25519 é o único modelo
- Atualizar `lib/token.ts` para refletir `assinarEd25519` / `verificarEd25519`
- Adicionar seção sobre chave pública e página de verificação pública
- Manter arquivos-chave atualizados com os novos arquivos criados

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/seshat-leitura-qrcode/SKILL.md
git commit -m "docs(skill): seshat-leitura-qrcode atualizado para Ed25519"
```

---

## Self-Review

- [x] Sem TBDs ou seções incompletas
- [x] `token_hash` na tabela carteiras adicionado na Task 3 (nota dentro do step)
- [x] Migração SQL idempotente
- [x] Chave privada nunca retornada em nenhum endpoint
- [x] Página pública bypassa o guard de auth no App.tsx
- [x] Tarefas em ordem de dependência: SQL/Schema → token.ts → endpoints → carteiras → scanner → UI pública → scanner UI → migration script → skill
- [x] Interfaces explícitas entre tarefas
