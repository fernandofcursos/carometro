# ADR-004: E-mail Criptografado (AES-256-CBC) + Hash (SHA-256)

**Status:** Aceito  
**Data:** 2025

## Contexto

LGPD exige proteção de dados pessoais. E-mail é dado pessoal sensível. Precisávamos armazená-lo de forma que:
1. Seja pesquisável (para login por e-mail)
2. Não vaze em caso de dump do banco

## Decisão

Armazenar **dois campos** para cada e-mail:

| Campo | Tipo | Conteúdo |
|-------|------|----------|
| `email_encrypted` | `text` | AES-256-CBC(email, SESSION_SECRET) — formato `ivHex:encryptedHex` |
| `email_hash` | `text` | SHA-256(email.toLowerCase()) — para busca/unicidade |

### Login por e-mail

1. Recebe e-mail do formulário
2. Calcula SHA-256 → busca por `email_hash` (índice único)
3. Se encontrado → verifica senha com bcrypt
4. Descriptografa `email_encrypted` para retornar ao frontend

### Por que dois campos?

- Hash: determinístico, permite busca e constraint UNIQUE, mas irreversível (não vaza o e-mail)
- Encrypted: reversível, permite exibir o e-mail ao usuário logado

## Implementação

```typescript
// lib: artifacts/api-server/src/lib/crypto.ts
function getChaveEncriptacao(): Buffer {
  return createHash("sha256").update(SESSION_SECRET).digest();
}

function encrypt(plain: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", getChaveEncriptacao(), iv);
  return iv.toString("hex") + ":" + Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]).toString("hex");
}

function descriptografarEmail(encrypted: string): string {
  const [ivHex, encHex] = encrypted.split(":");
  const decipher = createDecipheriv("aes-256-cbc", getChaveEncriptacao(), Buffer.from(ivHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
}
```

## Consequências

- **Positivo:** e-mail nunca exposto em texto plano no banco
- **Negativo:** se `SESSION_SECRET` for perdido, e-mails armazenados não podem ser recuperados — backup do secret é crítico
