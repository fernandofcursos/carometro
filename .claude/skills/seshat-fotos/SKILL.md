# Skill: Fotos — Sincronização Estudante ↔ Usuário

## Princípio

> Foto salva pelo carômetro (estudante) = foto do usuário. Uma única imagem aparece em todas as telas.

---

## Escrita — `POST /api/estudantes/:id/foto`

```typescript
// 1. Upsert em fotos com entidade_tipo='estudante'
const [fotoRow] = await db.insert(fotosTable).values({
  entidadeTipo: "estudante", entidadeId: estudanteId,
  mimeType, tamanhoBytes, iv, hashIntegridade, dados,
}).onConflictDoUpdate({
  target: [fotosTable.entidadeTipo, fotosTable.entidadeId],
  set: { mimeType, tamanhoBytes, iv, hashIntegridade, dados, atualizadoEm: new Date() },
}).returning({ id: fotosTable.id });

// 2. Atualizar estudantes.foto_id
const [estudante] = await db.update(estudantesTable)
  .set({ fotoId: fotoRow.id, atualizadoEm: new Date() })
  .where(eq(estudantesTable.id, estudanteId))
  .returning({ id: estudantesTable.id, usuarioId: estudantesTable.usuarioId });

// 3. Sincronizar para usuário vinculado
if (estudante.usuarioId) {
  const [fotoUsuarioRow] = await db.insert(fotosTable).values({
    entidadeTipo: "usuario", entidadeId: estudante.usuarioId,
    mimeType, tamanhoBytes, iv, hashIntegridade, dados,
  }).onConflictDoUpdate({
    target: [fotosTable.entidadeTipo, fotosTable.entidadeId],
    set: { mimeType, tamanhoBytes, iv, hashIntegridade, dados, atualizadoEm: new Date() },
  }).returning({ id: fotosTable.id });

  await db.update(usuariosTable)
    .set({ fotoId: fotoUsuarioRow.id, atualizadoEm: new Date() })
    .where(eq(usuariosTable.id, estudante.usuarioId));
}
```

---

## Leitura com Fallback

### `GET /api/usuarios` / `GET /api/usuarios/:id`

```typescript
// u = registro da tabela usuarios (db.select().from(usuariosTable))
let estudanteFotoId: string | null = null;
if (!u.fotoId) {
  const [est] = await db.select({ fotoId: estudantesTable.fotoId })
    .from(estudantesTable)
    .where(and(eq(estudantesTable.usuarioId, u.id), isNull(estudantesTable.deletadoEm)));
  estudanteFotoId = est?.fotoId ?? null;
}
const fotoUrl = u.fotoId
  ? `/api/fotos/${u.fotoId}`
  : (estudanteFotoId
      ? `/api/fotos/${estudanteFotoId}`
      : ((u.fotoStorageKey && u.fotoDados) ? `/api/usuarios/${u.id}/foto` : null));
```

### `GET /api/portal/me`

```typescript
// Adicionar LEFT JOIN com estudantesTable na query do usuario
const [usuario] = await db.select({
  id: usuariosTable.id,
  fotoId: usuariosTable.fotoId,
  estudanteFotoId: estudantesTable.fotoId,
  // ...outros campos
})
.from(usuariosTable)
.leftJoin(estudantesTable, and(
  eq(estudantesTable.usuarioId, usuariosTable.id),
  isNull(estudantesTable.deletadoEm),
))
.where(and(eq(usuariosTable.id, usuarioId), isNull(usuariosTable.deletadoEm)));

// fotoUrl
const fotoUrl = usuario.fotoId
  ? `/api/fotos/${usuario.fotoId}`
  : (usuario.estudanteFotoId ? `/api/fotos/${usuario.estudanteFotoId}` : null);
```

---

## Anti-padrões

- ❌ Salvar foto em `fotos(entidade_tipo='estudante')` sem sincronizar para `fotos(entidade_tipo='usuario')` quando `usuario_id` existe
- ❌ Retornar `fotoUrl` de `usuarios` sem fallback para `estudantes.foto_id`
- ❌ Usar dois registros em `fotos` com o mesmo `entidade_tipo + entidade_id` (viola UNIQUE)

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/fotos.ts` | Schema com UNIQUE `(entidade_tipo, entidade_id)` |
| `artifacts/api-server/src/routes/estudantes.ts` | `POST /:id/foto` — sync estudante → usuario |
| `artifacts/api-server/src/routes/usuarios.ts` | `GET /` e `GET /:id` — fallback estudante |
| `artifacts/api-server/src/routes/portal-estudante.ts` | `GET /me` — LEFT JOIN + fallback |
| `.specs/features/fotos.md` | Spec completa |
