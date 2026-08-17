# Spec: Estudantes

**Agente responsável:** Hermes + Aphrodite  
**Status:** Implementado ✅

## Comportamento

### GET /api/estudantes

**Requer:** `estudantes:view`  
**Filtros opcionais:** `?turmaId=uuid`, `?busca=texto` (nome ou registro)

**Saída:**
```typescript
{
  estudantes: Array<{
    id: string; nome: string; registro: string;
    observacao: string | null; turmaId: string; temFoto: boolean;
    turmaSigla: string | null; turmaDesc: string | null;
    cursoNome: string | null; turnoNome: string | null;
    criadoEm: string; atualizadoEm: string;
  }>
}
```

> `temFoto: boolean` — `fotoDados` nunca é retornado no listing. Usar `GET /:id/foto` para imagem.

### Join de turno (ATENÇÃO)

`turmasTable` **não possui** coluna `turnoId` direta. O turno é obtido via `turmaTurnosTable` (N:N):

```typescript
.leftJoin(turmaTurnosTable, eq(turmaTurnosTable.turmaId, estudantesTable.turmaId))
.leftJoin(turnosTable, eq(turmaTurnosTable.turnoId, turnosTable.id))
```

Nunca usar `eq(turmasTable.turnoId, turnosTable.id)` — coluna removida em migration anterior.

### GET /api/estudantes/:id

Retorna shape com campo `emails: Array<{ email, tipo }> | []`.  
No frontend, sempre usar `estudante.emails ?? []` para evitar crash quando o campo chega `undefined`.

### GET /api/estudantes/:id/foto

Retorna a imagem binária descriptografada (AES-256-CBC).  
**Headers retornados:** `Content-Type: image/jpeg` (ou mime armazenado), `Cache-Control: private, max-age=604800`  
**Verificação de integridade:** SHA-256 do bytea descriptografado vs `fotoHashIntegridade`  
**Erro 500** se integridade falhar (corrupção detectada)

### POST /api/estudantes

**Requer:** `estudantes:manage`  
**Entrada:**
```typescript
{
  nome: string;       // 2–200 chars
  registro: string;   // 1–50 chars, deve ser único
  turmaId: string;    // UUID
  observacao?: string;
  fotoBase64?: string; // data URL: "data:image/jpeg;base64,..."
}
```

Foto é opcional na criação; pode ser adicionada/substituída via `POST /:id/foto`.  
Limite: `fotoBase64.length <= 5_000_000` (≈3.7MB binário após decode)

### POST /api/estudantes/:id/foto

Substitui a foto de um estudante existente.  
**Requer:** `estudantes:manage`  
**Entrada:** `{ fotoBase64: string }`

### PUT /api/estudantes/:id

Atualiza dados textuais (nome, registro, turmaId, observacao). Não toca na foto.  
**Requer:** `estudantes:manage`

### DELETE /api/estudantes/:id

Soft delete: seta `deletadoEm`. Foto permanece no banco (auditoria LGPD).  
**Requer:** `estudantes:manage`

## Armazenamento de Foto

| Campo | Tipo | Conteúdo |
|-------|------|----------|
| `foto_storage_key` | varchar(200) | UUID gerado a cada upload |
| `foto_dados` | bytea | AES-256-CBC dos bytes da imagem |
| `foto_iv` | char(24) | IV em base64 (16 bytes → 24 chars) |
| `foto_mime_type` | varchar(20) | ex: `image/jpeg` |
| `foto_tamanho_bytes` | integer | tamanho **original** (antes de cifrar) |
| `foto_hash_integridade` | char(64) | SHA-256 hex dos bytes **originais** |

## Casos de Teste

- [ ] POST sem `turmaId` → 400
- [ ] POST com `turmaId` inexistente → 400 (FK)
- [ ] POST com `registro` duplicado → 400 (unique constraint)
- [ ] GET `/:id/foto` sem foto → 404
- [ ] GET `/:id/foto` com foto corrompida → 500
- [ ] GET listing não retorna `fotoDados` no payload
- [ ] `temFoto: false` para estudantes sem foto
