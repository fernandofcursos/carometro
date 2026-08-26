# Skill: Fotos — Armazenamento, Criptografia e Serviço

## Arquitetura

Fotos são armazenadas **criptografadas (AES-256-CBC)** em uma tabela dedicada `fotos`, separada das tabelas de entidades. Cada entidade (`estudante`, `usuario`) tem no máximo uma foto (UNIQUE por entidade).

```
estudantes.foto_id ──FK──> fotos.id
usuarios.foto_id   ──FK──> fotos.id
```

## Tabela `fotos`

```typescript
fotosTable: {
  id: uuid PK,
  entidadeTipo: varchar(20) NOT NULL,  // 'estudante' | 'usuario'
  entidadeId: uuid NOT NULL,
  mimeType: varchar(20) DEFAULT 'image/jpeg',
  tamanhoBytes: integer NOT NULL,
  iv: char(24) NOT NULL,              // base64 do IV AES-256-CBC
  hashIntegridade: char(64) NOT NULL, // SHA-256 hex dos bytes originais
  dados: bytea NOT NULL,              // bytes criptografados
  criadoEm, atualizadoEm
  UNIQUE (entidadeTipo, entidadeId)
}
```

## Endpoint canônico — GET /api/fotos/:id

```typescript
// Requer: requireAuth (sem permissão adicional)
// Lê fotosTable por PK
// descriptografarFoto(foto.dados, foto.iv) → Buffer
// verificarIntegridade(buffer, foto.hashIntegridade) → boolean
// res.set("Cache-Control", "private, max-age=86400")
// res.set("Content-Type", foto.mimeType)
// res.send(buffer)
```

**Erro 404** se foto não existe. **Erro 500** se integridade falhar.

## Padrão de escrita (estudantes e usuarios)

```typescript
// Upsert na tabela fotos
const [fotoRow] = await db.insert(fotosTable).values({
  entidadeTipo: "estudante", entidadeId: estudanteId,
  mimeType: foto.mimeType, tamanhoBytes: foto.tamanhoBytes,
  iv: foto.iv, hashIntegridade: foto.hash, dados: foto.dadosCriptografados,
}).onConflictDoUpdate({
  target: [fotosTable.entidadeTipo, fotosTable.entidadeId],
  set: { /* todos os campos */ atualizadoEm: new Date() },
}).returning({ id: fotosTable.id });

// Atualizar FK
await db.update(estudantesTable)
  .set({ fotoId: fotoRow.id })
  .where(eq(estudantesTable.id, estudanteId));
```

## fotoUrl — Lógica de construção

```typescript
// Prioridade:
fotoUrl = fotoId
  ? `/api/fotos/${fotoId}`             // novo padrão (canônico)
  : (fotoStorageKey
    ? `/api/estudantes/${id}/foto`     // fallback legado (sem fotoId ainda)
    : null)
```

## Endpoints de compatibilidade retroativa

`GET /api/estudantes/:id/foto` e `GET /api/usuarios/:id/foto`:
- Se `fotoId` preenchido → `302 redirect` para `/api/fotos/:fotoId`
- Caso contrário → descriptografa do bytea inline e serve (dados legados)

## Colunas inline legadas (estudantes e usuarios)

`foto_storage_key`, `foto_dados`, `foto_iv`, `foto_mime_type`, `foto_tamanho_bytes`, `foto_hash_integridade` — mantidas para compatibilidade até a migração estar completa.

Após `scripts/migrate-fotos.sql` popular todos os `foto_id`, usar o bloco `DROP COLUMN` comentado no script para remover as colunas legadas.

## Crypto

```typescript
// lib/api-server/src/lib/crypto.ts
criptografarFoto(dadosBase64: string): {
  dadosCriptografados: Buffer, iv: string, hash: string,
  mimeType: string, tamanhoBytes: number
}

descriptografarFoto(dados: Buffer, iv: string): Buffer

verificarIntegridade(dadosBrutos: Buffer, hashEsperado: string): boolean
```

`ENCRYPTION_KEY` env var (hex 64 chars = 32 bytes AES-256). **Nunca hardcodar.**

## Performance

- Carômetro (`GET /api/carometro`) **não descriptografa mais em lote** — retorna apenas `fotoUrl`
- Browser busca cada foto individualmente com cache de 24h
- Uma turma de 100 alunos = 0 decrypts na listagem (vs ~100 decrypts antes)

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/fotos.ts` | Schema da tabela fotos |
| `lib/db/src/schema/estudantes.ts` | FK `fotoId` → fotos |
| `lib/db/src/schema/usuarios.ts` | FK `fotoId` → fotos |
| `artifacts/api-server/src/routes/fotos.ts` | GET /api/fotos/:id |
| `artifacts/api-server/src/routes/estudantes.ts` | Dual-write + fallback read |
| `artifacts/api-server/src/routes/usuarios.ts` | Dual-write + fallback read |
| `artifacts/api-server/src/routes/seshat.ts` | fotoUrl sem decrypt em lote |
| `artifacts/api-server/src/lib/crypto.ts` | criptografarFoto / descriptografarFoto |
| `scripts/migrate-fotos.sql` | Migration idempotente (Etapa 1 + 2 + DROP comentado) |
