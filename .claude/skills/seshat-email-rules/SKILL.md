# Skill: Regras de E-mail

## Princípio Central

> **E-mail é único em todo o sistema. Fonte canônica: `usuarios.email_encrypted`.**

Nunca existem dois e-mails "próprios" distintos para o mesmo estudante. Qualquer tela que exiba ou edite o email do estudante usa a mesma fonte.

---

## Armazenamento

```
usuarios.email_encrypted  →  AES-256-CBC, chave = ENCRYPTION_KEY ?? SESSION_SECRET
usuarios.email_hash       →  SHA-256(email.toLowerCase()), UNIQUE no banco
estudante_emails.tipo='proprio'    →  espelho de usuarios.email_encrypted (sincronizado)
estudante_emails.tipo='responsavel' →  email de contato do pai/responsável (independente)
```

---

## Leitura

### `GET /api/estudantes/:id`
```typescript
// Com usuario_id → email vem de usuarios.email_encrypted (descriptografado)
if (e.usuarioId && e.emailEncrypted) {
  emails = [
    { email: decryptEmail(e.emailEncrypted, secret), tipo: "proprio" },
    ...emailsDB.filter(em => em.tipo === "responsavel"),
  ];
} else {
  emails = emailsDB; // sem vínculo: usa estudante_emails normalmente
}
```

### `GET /api/usuarios` / `GET /api/usuarios/:id`
- Sempre decripta de `usuarios.email_encrypted`

---

## Escrita — Regras por Endpoint

### `PUT /api/usuarios/:id` — Editar Perfil (tela de usuários)
```typescript
// 1. Normalizar
const emailNorm = email.toLowerCase().trim();
const novoHash  = createHash("sha256").update(emailNorm).digest("hex");

// 2. Verificar unicidade (exceto o próprio usuário)
const conflito = await db.select().from(usuariosTable)
  .where(and(eq(usuariosTable.emailHash, novoHash), ne(usuariosTable.id, usuarioId)));
if (conflito.length) return res.status(409).json({ error: "Este e-mail já está cadastrado para outro usuário." });

// 3. Persistir criptografado
await db.update(usuariosTable).set({
  emailEncrypted: encryptEmail(emailNorm, secret),
  emailHash: novoHash,
});

// 4. Sincronizar estudante_emails.tipo='proprio' do estudante vinculado
const [estudante] = await db.select({ id: estudantesTable.id })
  .from(estudantesTable).where(eq(estudantesTable.usuarioId, usuarioId));
if (estudante) {
  await db.delete(estudanteEmailsTable)
    .where(and(eq(...estudanteId, estudante.id), eq(...tipo, "proprio")));
  await db.insert(estudanteEmailsTable).values({ estudanteId: estudante.id, email: emailNorm, tipo: "proprio" });
}
```

### `PUT /api/estudantes/:id` — Informações Cadastrais (carômetro)
```typescript
// Com usuario_id → redireciona para usuarios (não salva em estudante_emails direto)
if (estudante.usuarioId && emailProprio) {
  // verificar unicidade + update usuarios.email_encrypted + estudante_emails sync
}
// Sem usuario_id → salva em estudante_emails normalmente
// Emails de responsável → sempre em estudante_emails.tipo='responsavel'
```

---

## Criptografia

```typescript
function encryptEmail(email: string, secret: string): string {
  const key = createHash("sha256").update(secret).digest();
  const iv  = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const enc = Buffer.concat([cipher.update(email, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + enc.toString("hex");
}

function decryptEmail(encrypted: string, secret: string): string {
  try {
    const key = createHash("sha256").update(secret).digest();
    const [ivHex, encHex] = encrypted.split(":");
    if (!ivHex || !encHex) return "";
    const decipher = createDecipheriv("aes-256-cbc", key, Buffer.from(ivHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
  } catch { return ""; }
}
```

> Ambas as funções existem em `artifacts/api-server/src/routes/usuarios.ts` e foram replicadas em `estudantes.ts`. Se precisar de uma terceira rota, extraia para `../lib/crypto.js`.

---

## Erros

| Situação | HTTP | Mensagem |
|---|---|---|
| Email inválido (formato) | 400 | "E-mail inválido" (Zod) |
| Email já existe (POST criar) | 400 | "O e-mail informado já está cadastrado para outro usuário." |
| Email já existe (PUT atualizar) | 409 | "Este e-mail já está cadastrado para outro usuário." |

---

## Anti-padrões — Nunca Fazer

- ❌ Salvar email em `estudante_emails.tipo='proprio'` diretamente quando o estudante tem `usuario_id`
- ❌ Ler email do estudante de `estudante_emails.tipo='proprio'` quando ele tem `usuario_id`
- ❌ Atualizar `usuarios.email_encrypted` sem recalcular `email_hash`
- ❌ Calcular hash de email sem normalizar para minúsculas primeiro
- ❌ Desabilitar constraint UNIQUE de `email_hash` — ela é a garantia de unicidade real

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/usuarios.ts` | `email_encrypted` (bytea) + `email_hash` (char64 UNIQUE) |
| `lib/db/src/schema/estudantes.ts` | `estudante_emails` (proprio / responsavel) |
| `artifacts/api-server/src/routes/usuarios.ts` | `encryptEmail`, `decryptEmail`, `PUT /:id` com email |
| `artifacts/api-server/src/routes/estudantes.ts` | `GET /:id` usa usuarios como fonte canônica; `PUT /:id` redireciona |
| `.specs/features/regras-email.md` | Spec completa |
