# Spec: Fotos de Usuários e Estudantes

**Status:** Implementado ✅

---

## Princípio Central

> **A foto do estudante é a foto do usuário.** Quando o estudante tem `usuario_id`, salvar a foto no perfil do carômetro sincroniza automaticamente a foto no usuário, garantindo que a lista de usuários, o portal e a carteira de estudante exibam a mesma foto.

---

## Armazenamento

| Tabela/Campo | Uso |
|---|---|
| `fotos (entidade_tipo='estudante', entidade_id=estudante.id)` | Foto salva pelo carômetro |
| `fotos (entidade_tipo='usuario', entidade_id=usuario.id)` | Foto sincronizada — usada pelo portal e lista de usuários |
| `estudantes.foto_id` | FK → `fotos.id` onde `entidade_tipo='estudante'` |
| `usuarios.foto_id` | FK → `fotos.id` onde `entidade_tipo='usuario'` |
| `fotos (dados bytea)` | Foto criptografada AES-256-CBC |

Index `UNIQUE (entidade_tipo, entidade_id)` — uma foto por entidade.

---

## Fluxo de Escrita

### `POST /api/estudantes/:id/foto` (carômetro)

1. Salva/atualiza foto em `fotos` com `entidade_tipo='estudante'`
2. Atualiza `estudantes.foto_id`
3. **Se estudante tem `usuario_id`:**
   - Upsert em `fotos` com `entidade_tipo='usuario'` (mesmos dados)
   - Atualiza `usuarios.foto_id` → ID do novo registro de usuário

### `PUT /api/usuarios/:id/foto` (lista de usuários)

1. Salva/atualiza foto em `fotos` com `entidade_tipo='usuario'`
2. Atualiza `usuarios.foto_id`
3. **Não propaga para o estudante** (sentido unilateral: carômetro → usuário)

---

## Fluxo de Leitura

### `GET /api/usuarios` / `GET /api/usuarios/:id`

```
fotoUrl = usuarios.foto_id → /api/fotos/{id}
         OU estudantes.foto_id (fallback quando usuario.foto_id é null)
         OU /api/usuarios/{id}/foto (legado inline)
         OU null
```

### `GET /api/portal/me`

```
fotoUrl = usuarios.foto_id         → /api/fotos/{id}
         OU estudantes.foto_id      → /api/fotos/{id}   (sincronizado pelo POST /:id/foto)
         OU estudantes.foto_storage_key → /api/estudantes/{estudante_id}/foto  (legado inline)
         OU null
```

> O fallback para `foto_storage_key` (legado) garante que fotos antigas que ainda não foram migradas para a tabela `fotos` apareçam corretamente sem necessidade de re-upload.

### `GET /api/estudantes` / `GET /api/estudantes/:id`

```
fotoUrl = estudantes.foto_id → /api/fotos/{id}
         OU /api/estudantes/{id}/foto (legado inline)
         OU null
```

---

## Endpoint Canônico de Foto

### `GET /api/fotos/:id`

- Descriptografa foto de `fotos.dados`
- Verifica integridade SHA-256
- `Cache-Control: private, max-age=86400` (24h)
- Funciona para fotos de estudantes e de usuários

---

## Anti-padrões — Nunca Fazer

- ❌ Salvar foto apenas em `fotos(entidade_tipo='estudante')` sem sincronizar `fotos(entidade_tipo='usuario')` quando o estudante tem `usuario_id`
- ❌ Ler `usuarios.foto_id` sem fallback para `estudantes.foto_id`
- ❌ Armazenar foto fora da tabela `fotos` (campos legados `foto_dados`, `foto_iv` são apenas fallback)
- ❌ Duplicar a lógica de criptografia fora de `lib/crypto.js`

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/fotos.ts` | Schema: `entidade_tipo`, `entidade_id`, UNIQUE index |
| `artifacts/api-server/src/routes/estudantes.ts` | `POST /:id/foto` — salva + sincroniza para usuario |
| `artifacts/api-server/src/routes/usuarios.ts` | `GET /` e `GET /:id` — fallback para foto do estudante |
| `artifacts/api-server/src/routes/portal-estudante.ts` | `GET /me` — fallback para foto do estudante via LEFT JOIN |
| `artifacts/api-server/src/routes/fotos.ts` | Endpoint canônico `GET /api/fotos/:id` |
| `artifacts/api-server/src/lib/crypto.ts` | `criptografarFoto`, `descriptografarFoto`, `verificarIntegridade` |
