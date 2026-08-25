# Skill: Textos Padrão de Tipos de Ocorrências

## Schema (Drizzle)

```typescript
// lib/db/src/schema/textos-padrao-ocorrencias.ts
export const textosPadraoOcorrenciasTable = pgTable("textos_padrao_ocorrencias", {
  id: uuid("id").primaryKey().defaultRandom(),
  tipoOcorrenciaId: uuid("tipo_ocorrencia_id").notNull()
    .references(() => tiposOcorrenciasTable.id, { onDelete: "cascade" }),
  titulo: varchar("titulo", { length: 200 }).notNull(),
  corpo: text("corpo").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
  deletadoEm: timestamp("deletado_em", { withTimezone: true }),
});
```

## Índice Parcial (1 ativo por tipo)

```sql
CREATE UNIQUE INDEX uq_texto_padrao_ativo_por_tipo
ON textos_padrao_ocorrencias (tipo_ocorrencia_id)
WHERE ativo = true AND deletado_em IS NULL;
```

## Placeholders

| Marcador | Dado |
|---|---|
| `{{NOME_ESTUDANTE}}` | nome do estudante |
| `{{DATA_REGISTRO}}` | criadoEm formatado |
| `{{DATA_OCORRENCIA}}` | dataOcorrencia formatado |
| `{{TIPO_OCORRENCIA}}` | descricao do tipo |
| `{{DESCRICAO}}` | observacao |

## renderizarTexto (API)

```typescript
function renderizarTexto(corpo: string, dados: {
  nomeEstudante?: string;
  dataRegistro?: string;
  dataOcorrencia?: string;
  tipoOcorrencia?: string;
  descricao?: string;
}): string {
  return corpo
    .replace(/\{\{NOME_ESTUDANTE\}\}/g, dados.nomeEstudante ?? "{{NOME_ESTUDANTE}}")
    .replace(/\{\{DATA_REGISTRO\}\}/g, dados.dataRegistro ?? "{{DATA_REGISTRO}}")
    // ... etc
}
```

## Busca de texto ativo por tipo

```typescript
const [texto] = await db
  .select()
  .from(textosPadraoOcorrenciasTable)
  .where(and(
    eq(textosPadraoOcorrenciasTable.tipoOcorrenciaId, tipoId),
    eq(textosPadraoOcorrenciasTable.ativo, true),
    isNull(textosPadraoOcorrenciasTable.deletadoEm),
  ))
  .limit(1);
```

## Soft delete

```typescript
await db.update(textosPadraoOcorrenciasTable)
  .set({ deletadoEm: new Date(), ativo: false, atualizadoEm: new Date() })
  .where(eq(textosPadraoOcorrenciasTable.id, id));
```

## Validação de conflito (POST e reativação via PUT)

```typescript
const [existente] = await db.select({ id: textosPadraoOcorrenciasTable.id })
  .from(textosPadraoOcorrenciasTable)
  .where(and(
    eq(textosPadraoOcorrenciasTable.tipoOcorrenciaId, tipoId),
    eq(textosPadraoOcorrenciasTable.ativo, true),
    isNull(textosPadraoOcorrenciasTable.deletadoEm),
  ))
  .limit(1);
if (existente) return res.status(409).json({ error: "Já existe um texto padrão ativo..." });
```

## Regra Indiscutível — Caixa "Orientações ao Responsável"

**Todo texto padrão para ocorrências DEVE conter** uma seção de orientações estilizada como caixa com duas áreas:

| Elemento | Cor | Descrição |
|---|---|---|
| Título | `#1e40af` (azul médio) | "Orientações ao Responsável" — texto branco, negrito |
| Corpo | `#eff6ff` (azul claro) | Texto de orientação, borda `#bfdbfe`, texto `#1e3a5f` |

Paleta idêntica ao texto padrão "Advertência Verbal" — padrão obrigatório para todos os textos de ocorrência.

**HTML de referência (colar no editor TipTap via modo HTML ou template):**

```html
<div style="border:1px solid #bfdbfe;border-radius:8px;overflow:hidden;margin:16px 0">
  <div style="background:#1e40af;color:#fff;font-weight:bold;padding:8px 16px;font-size:0.9em">
    Orientações ao Responsável
  </div>
  <div style="background:#eff6ff;padding:12px 16px;color:#1e3a5f;font-size:0.9em;line-height:1.6">
    [texto de orientação]
  </div>
</div>
```

> O editor TipTap não impõe esse bloco automaticamente — é responsabilidade do administrador incluí-lo ao criar/editar o texto padrão.

## Permissão

Toda a gestão de textos padrão reusa `tipos-ocorrencias:manage`.  
`GET /placeholders` e `GET /tipo/:id` requerem apenas `requireAuth`.

## Editor de Texto Rico (TipTap)

O painel de edição usa **TipTap** (`@tiptap/react` + `@tiptap/starter-kit`) — editor WYSIWYG estilo Word.

### Pacotes instalados em `@workspace/seshat`

```
@tiptap/react
@tiptap/starter-kit
@tiptap/extension-underline
@tiptap/extension-text-align
@tiptap/extension-placeholder
@tiptap/extension-character-count
```

### Componente `RichTextEditor` (`src/components/ui/rich-text-editor.tsx`)

```typescript
<RichTextEditor
  value={corpo}          // HTML string
  onChange={setCorpo}    // recebe HTML atualizado
  maxLength={10000}
  placeholder="…"
/>
```

**Toolbar:** Desfazer/Refazer · H1/H2/H3 · Negrito · Itálico · Sublinhado · Lista · Lista numerada · Alinhamento (E/C/D/Justificado) · Linha horizontal · 📎 Documento Anexado · Contador de caracteres.

**Drag-and-drop de marcadores:** o componente expõe `onDrop` e `onInsertRef` — ao soltar um placeholder sobre o editor, chama `editor.chain().focus().insertContent(text).run()`. A prop `onInsertRef` recebe uma `MutableRefObject` que o pai usa para chamar `insertText(text)` externamente (clique nos chips de placeholder).

**Documento Anexado:** botão 📎 na toolbar insere o bloco `<p><strong>📎 Documento Anexado:</strong> ___…___</p>` na posição do cursor, indicando onde um anexo deve ser referenciado no texto.

### Armazenamento

O campo `corpo` armazena **HTML** gerado pelo TipTap. O mailer detecta se o conteúdo é HTML (começa com `<`) e renderiza diretamente no e-mail (sem escapar); texto plano legado é escapado e exibido com `white-space:pre-wrap`.

### Marcadores — clique e drag-and-drop

Chips `draggable` — `onDragStart` seta `dataTransfer.setData("text/plain", ph.placeholder)`.  
O `RichTextEditor` captura o drop e chama `editor.commands.insertContent(text)`.  
Clique chama `insertRef.current(ph.placeholder)` → `editor.chain().focus().insertContent(ph).run()`.

### Upload de arquivo (Importar)

Botão "Importar arquivo" abre `<input type="file" accept=".md,.txt,.docx,.pdf" hidden>`.

| Formato | Processamento |
|---|---|
| `.md` / `.txt` | `file.text()` no browser → conversão básica markdown→HTML |
| `.docx` | `POST /api/textos-padrao/extrair-texto` (multer + mammoth) → HTML simples |
| `.pdf` | `POST /api/textos-padrao/extrair-texto` (multer + pdf-parse v2) → HTML simples |

Texto extraído substitui o `corpo` inteiro (máx 10 000 chars).

### Endpoint de extração (API)

```typescript
// POST /api/textos-padrao/extrair-texto — multipart/form-data, campo "arquivo"
// mammoth.extractRawText({ buffer }) para .docx
// new PDFParse().loadPDF(buffer) para .pdf — resultado: pages[].content
// Requer tipos-ocorrencias:manage; limite 5 MB
```

Dependências em `artifacts/api-server`: `mammoth`, `pdf-parse`, `multer`.

## Integração com formulário de ocorrência

```typescript
// Quando tipo é selecionado, buscar texto ativo:
const { data: textoPadrao } = useQuery({
  queryKey: ["texto-padrao-tipo", tipoId],
  queryFn: () => apiClient.get(`/api/textos-padrao/tipo/${tipoId}`).then(r => r.data),
  enabled: !!tipoId,
  retry: false,
});

// Se encontrado, oferecer botão:
{textoPadrao && (
  <Button type="button" variant="outline" size="sm"
    onClick={() => setObservacao(textoPadrao.corpo)}>
    Usar texto padrão: {textoPadrao.titulo}
  </Button>
)}
```

## Migration

```bash
psql $DATABASE_URL -f scripts/migrate-textos-padrao.sql
pnpm --filter @workspace/db run push-force
```
