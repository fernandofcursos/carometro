# Spec: Regras de Negócio — E-mail

**Status:** Implementado ✅

---

## Princípio Central

> **O e-mail é único em todo o sistema.** A fonte canônica é sempre `usuarios.email_encrypted`.

Não existem dois e-mails "próprios" distintos para o mesmo estudante. Qualquer atualização feita em qualquer tela reflete para todas as telas imediatamente.

---

## Armazenamento

| Campo | Tabela | Tipo | Finalidade |
|---|---|---|---|
| `email_encrypted` | `usuarios` | `bytea` AES-256-CBC | E-mail criptografado — fonte canônica |
| `email_hash` | `usuarios` | `char(64) UNIQUE` | SHA-256 do e-mail em minúsculas — garante unicidade sem expor o valor |
| `email` | `estudante_emails` | `text` | E-mail de **responsável** (`tipo='responsavel'`) — sem criptografia, sem unicidade |

> **`estudante_emails.tipo='proprio'`** é mantido sincronizado com `usuarios.email_encrypted` quando o estudante tem `usuario_id`, mas **não é a fonte canônica**.

---

## Regras

### Unicidade
- Nenhum e-mail pode ser associado a dois usuários diferentes.
- Verificado via `email_hash` (SHA-256, lower-case) com constraint `UNIQUE` no banco.
- Erro: HTTP 409 — "Este e-mail já está cadastrado para outro usuário."

### Normalização
- Sempre armazenado em minúsculas: `email.toLowerCase().trim()`.
- Hash calculado sobre o valor normalizado.

### Criptografia
- Algoritmo: AES-256-CBC
- Chave: `ENCRYPTION_KEY` (env) ou `SESSION_SECRET` como fallback
- IV: 16 bytes aleatórios por e-mail — armazenado como prefixo hex antes dos dados (`iv_hex:dados_hex`)
- Hash SHA-256 armazenado separadamente em `email_hash` para queries de unicidade

---

## Fluxo por Tela

### Página "Editar Perfil" (Usuários → `PUT /api/usuarios/:id`)
- Atualiza `email_encrypted` + `email_hash` na tabela `usuarios`
- Verifica unicidade antes de salvar
- Sincroniza `estudante_emails.tipo='proprio'` do estudante vinculado (se houver)
- Retorna email descriptografado na resposta

### Página "Informações Cadastrais" (Carômetro → `PUT /api/estudantes/:id`)
- **Com `usuario_id`:** e-mail `tipo='proprio'` redireciona a atualização para `usuarios` (mesma lógica acima) + sincroniza `estudante_emails`
- **Sem `usuario_id`:** armazena em `estudante_emails.tipo='proprio'` normalmente (estudante sem login)

### Leitura `GET /api/estudantes/:id`
- **Com `usuario_id`:** retorna email de `usuarios.email_encrypted` (descriptografado) como `tipo='proprio'`; ignora `estudante_emails.tipo='proprio'`
- **Sem `usuario_id`:** retorna email de `estudante_emails.tipo='proprio'`

### Leitura `GET /api/usuarios/:id` / `GET /api/usuarios`
- Sempre lê de `usuarios.email_encrypted` (descriptografado)

---

## Tabela `estudante_emails` — Uso Correto

| `tipo` | Uso | Unicidade | Criptografia |
|---|---|---|---|
| `'proprio'` | E-mail do estudante — **espelho** de `usuarios.email_encrypted` quando tem `usuario_id` | Não (depende de `usuarios.email_hash`) | Não |
| `'responsavel'` | E-mail de contato do pai/responsável | Não | Não |

> **Nunca editar `estudante_emails.tipo='proprio'` diretamente** quando o estudante tem `usuario_id`. A atualização deve sempre passar pelo `PUT /api/usuarios/:id` ou `PUT /api/estudantes/:id` (que redireciona para `usuarios`).

---

## Envio de E-mail

- **Boas-vindas:** enviado assincronamente no `POST /api/usuarios` com a senha temporária e código de acesso
- **Ocorrência:** enviado para `estudante_emails.tipo='proprio'` OU `usuarios.email_encrypted` (quando vinculado) do estudante, e para todos os `tipo='responsavel'`

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/usuarios.ts` | `email_encrypted` (bytea) + `email_hash` (char 64 UNIQUE) |
| `lib/db/src/schema/estudantes.ts` | `estudante_emails` (proprio / responsavel) |
| `artifacts/api-server/src/routes/usuarios.ts` | `encryptEmail()`, `decryptEmail()`, `PUT /:id` com email |
| `artifacts/api-server/src/routes/estudantes.ts` | `GET /:id` (fonte canônica), `PUT /:id` (redireciona para usuarios) |
| `artifacts/api-server/src/routes/ocorrencias.ts` | Lê emails de responsável para notificação |
