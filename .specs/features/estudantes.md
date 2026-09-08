# Spec: Estudantes

**Agente responsável:** Hermes + Aphrodite  
**Status:** Implementado ✅

## Comportamento

### GET /api/estudantes

**Requer:** `estudantes:view`  
**Filtros opcionais:** `?turmaId=uuid`, `?busca=texto` (nome ou registro), `?usuarioId=uuid`

O filtro `?usuarioId=` retorna o(s) estudante(s) vinculados ao usuário com aquele ID (via `estudantes.usuario_id`). Usado pelo modal de edição de usuário (`EditarUsuarioModal`) para encontrar o `estudanteId` antes de atualizar os responsáveis.

**Saída:** `Array<Estudante>` (não objeto wrapper — array direto)

```typescript
Array<{
  id: string;
  nome: string;
  registro: string;
  observacao: string | null;
  turmaId: string;
  usuarioId: string | null;   // ID do usuario vinculado (útil para lookup pós-enturmação)
  turmaSigla: string;
  turmaDescricao: string;
  turnoNome: string;
  cursoNome: string;
  criadoEm: string;
  fotoUrl: string | null;
  emails: Array<{ email: string; tipo: string }>;
}>
```

> `fotoDados` nunca é retornado no listing. Usar `GET /:id/foto` para imagem.

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

Compatibilidade retroativa. Comportamento:
- Se o estudante já tem `fotoId` → `302 redirect` para `GET /api/fotos/:fotoId`
- Caso contrário → descriptografa do bytea inline e serve diretamente (dados legados ainda não migrados)

### GET /api/fotos/:id

Endpoint canônico de fotos. Lê da tabela `fotos`, descriptografa e serve.  
**Headers:** `Content-Type: image/jpeg`, `Cache-Control: private, max-age=86400`  
**Verificação de integridade:** SHA-256 do bytea descriptografado vs `hash_integridade`  
**Erro 500** se integridade falhar

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
Escreve na tabela `fotos` (upsert por `entidade_tipo + entidade_id`) e atualiza `estudantes.foto_id`.  
**Resposta:** `{ ok: true, fotoUrl: "/api/fotos/:id" }`

### PUT /api/estudantes/:id

Atualiza dados textuais (nome, registro, turmaId, observacao, dataNascimento). Não toca na foto.  
**Requer:** `estudantes:manage`  
`dataNascimento` aceita `"YYYY-MM-DD"` ou `null` para limpar.

### GET /api/estudantes/:id — resposta completa

```typescript
{
  id, nome, registro, observacao, dataNascimento,
  turmaId, turmaSigla, turmaDescricao, turnoNome, cursoNome,
  usuarioId: string | null,
  criadoEm, fotoUrl,
  emails: Array<{ email, tipo }>,
  responsaveis: Array<{ id, nome, codigoAcesso, email }>,
}
```

### Criptografia de email dos responsáveis

A descriptografia de `emailEncrypted` em `estudantes.ts` usa `SESSION_SECRET` (igual a `usuarios.ts`).  
**Nunca usar** `ENCRYPTION_KEY` para emails de usuários — a chave canônica é `SESSION_SECRET`.

### GET /api/estudantes/:id — responsaveis

A resposta inclui `responsaveis: Array<{ id, nome, codigoAcesso, email }>` com os usuários de role `pai_responsavel` vinculados via `responsaveis_estudantes`.

### PUT /api/estudantes/:id — responsavelIds

Aceita campo opcional `responsavelIds: string[]` (UUIDs). Quando presente:
- Remove todos os vínculos existentes em `responsaveis_estudantes` para o estudante
- Insere os novos vínculos (`ON CONFLICT DO NOTHING`)
- Um array vazio `[]` limpa todos os vínculos

### Perfil completo — Ver Perfil / Editar Perfil (`detail.tsx`)

Acessado via Carômetro → Estudante → Ver Perfil Completo → Editar Perfil.

**Modo visualização:** exibe seção "Pai / Responsável" com nome, código e email de cada responsável vinculado (quando `responsaveis.length > 0`).

**Modo edição:** exibe componente `ResponsaveisSelector` com:
- Busca debounced (300ms) → `GET /api/usuarios/responsaveis?q=`
- Checkboxes por responsável encontrado
- Pills dos selecionados com botão X para remover
- Mesmas regras do campo homônimo na criação de usuário

Campo `dataNascimento`:
- Campo `type="date"` no formulário de edição com texto auxiliar de idade calculada
- Exibição com idade no modo somente-leitura: "DD de mês de AAAA (X anos)"

### DELETE /api/estudantes/:id

Soft delete: seta `deletadoEm`. Foto permanece no banco (auditoria LGPD).  
**Requer:** `estudantes:manage`

## Armazenamento de Foto

### Novo padrão — tabela `fotos` (canônico)

| Campo | Tipo | Conteúdo |
|-------|------|----------|
| `id` | uuid PK | |
| `entidade_tipo` | varchar(20) | `'estudante'` |
| `entidade_id` | uuid | `estudantes.id` |
| `mime_type` | varchar(20) | ex: `image/jpeg` |
| `tamanho_bytes` | integer | tamanho original (antes de cifrar) |
| `iv` | char(24) | IV em base64 (16 bytes → 24 chars) |
| `hash_integridade` | char(64) | SHA-256 hex dos bytes originais |
| `dados` | bytea | AES-256-CBC dos bytes da imagem |

`UNIQUE (entidade_tipo, entidade_id)` — uma foto por entidade.

`estudantes.foto_id` (uuid FK → fotos, ON DELETE SET NULL) aponta para o registro canônico.

`fotoUrl` retornado pela API: `/api/fotos/:id` quando `foto_id` preenchido; `/api/estudantes/:id/foto` como fallback para dados legados.

### Colunas inline (legado — manter até migração completa)

| Campo | Tipo |
|-------|------|
| `foto_storage_key` | varchar(200) |
| `foto_dados` | bytea |
| `foto_iv` | char(24) |
| `foto_mime_type` | varchar(20) |
| `foto_tamanho_bytes` | integer |
| `foto_hash_integridade` | char(64) |

Após `scripts/migrate-fotos.sql` ser executado e todos os `foto_id` preenchidos, rodar o bloco `DROP COLUMN` comentado no script para liberar espaço.

## Script de Teste

`scripts/teste-perfil-estudante.sh` — valida o fluxo completo:

1. Login como admin
2. Busca IDs dos roles `estudante` e `pai_responsavel`
3. Cria usuário Filho (estudante)
4. Cria usuário Pai (pai_responsavel)
5. Localiza registro de estudante (por `usuarioId` ou `nome`)
6. Vincula Pai → Filho via `PUT /api/estudantes/:id`
7. Localiza turma por sigla/descrição (interativo se múltiplos turnos)
8. Enturma Filho com registro único por execução (últimos 8 dígitos do timestamp)
9. Verifica perfil final com `responsaveis`

```bash
BASE=http://localhost:8080 bash scripts/teste-perfil-estudante.sh
```

## Casos de Teste

- [ ] POST sem `turmaId` → 400
- [ ] POST com `turmaId` inexistente → 400 (FK)
- [ ] POST com `registro` duplicado → 400 (unique constraint)
- [ ] POST com foto → `foto_id` preenchido, `fotoUrl = /api/fotos/:id`
- [ ] GET `/:id/foto` com `foto_id` → 302 redirect para `/api/fotos/:id`
- [ ] GET `/:id/foto` sem foto → 404
- [ ] GET `/api/fotos/:id` com foto corrompida → 500
- [ ] GET listing não retorna `fotoDados` no payload
- [ ] `fotoUrl: null` para estudantes sem foto
