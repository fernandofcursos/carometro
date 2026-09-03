# Skill: seshat-avisos-informes

Módulo de Avisos e Informes do Seshat.

## Rotas de API

- `GET /api/avisos-informes/tipos` — tipos ativos
- `GET /api/avisos-informes/avisos?mes=YYYY-MM[&excluirCardapio=true]` — avisos do mês; com `excluirCardapio=true` omite os do tipo Cardápio. Retorna `tipoNome` e `tipoEhCardapio` via LEFT JOIN com tipos.
- `GET /api/avisos-informes/cardapio?de=YYYY-MM-DD&ate=YYYY-MM-DD` — cardápio por intervalo de datas (apenas `requireAuth`, sem `avisos:manage`). Aceita também `?mes=YYYY-MM` como fallback. **Sempre usar range de datas**, nunca mês isolado, para não perder semanas que cruzam meses.
- `GET /api/avisos-informes/informes?mes=YYYY-MM` — informes do mês
- `POST/PUT /api/avisos-informes/avisos` / `informes` — criar/editar
- `DELETE /api/avisos-informes/avisos/:id` / `informes/:id` — excluir
- `GET /api/avisos-informes/feed?perfil=ROLE&limite=N` — feed para dashboards (exclui `ehCardapio=true`); inclui `anexos[]` por item
- `POST/PUT/DELETE /api/avisos-informes/tipos/:id` — CRUD de tipos

## Regras de apresentação nos dashboards

- **Feed (AvisosWidget)** — nunca exibe avisos do tipo Cardápio (`ehCardapio=true`). O `/feed` já os filtra na API.
- **Filtragem por perfil** — `GET /feed?perfil=ROLE` usa `EXISTS` em `avisos_publicos_alvo` para retornar apenas avisos cujo público seja `'todos'` ou `ROLE`. Avisos dirigidos a outros perfis não aparecem.
- **CardapioWidget** — exibe somente avisos do tipo Cardápio, em grade Seg–Sex. **Obrigatório** em todos os dashboards.
- **Bloco "Comunicados & Cardápio"** — AvisosWidget + CardapioWidget juntos sob separador rotulado. Padrão idêntico em todos os perfis: Estudante (`perfil="estudante"`), Pai/Responsável (`perfil="pai_responsavel"`), Professor (`perfil="professor"`), Coordenador/Admin (`perfil="todos"`).
- Os dois widgets são complementares e nunca duplicam conteúdo.
- O CardapioWidget busca por intervalo de datas (`?de=seg&ate=sex`) — semanas que cruzam meses são cobertas corretamente.

## Regras da página Avisos (gestão)

- **"Avisos do mês"** — lista apenas avisos com `ehCardapio=false`; a requisição passa `excluirCardapio=true`.
- **CardapioWidget (editavel)** — exibe e permite editar o cardápio semanal. Único local onde cardápio é gerenciado.
- As duas seções são complementares; cardápio nunca aparece na lista de avisos normais.

## Componentes reutilizáveis

- `artifacts/seshat/src/components/avisos-widget.tsx` — feed de avisos (sem cardápio); renderiza `conteudo` como HTML via `prose prose-sm`; exibe chips de anexo por item — imagem/PDF abre `AnexoViewer` inline, doc/xlsx abre nova aba (`window.open`).
- `artifacts/seshat/src/components/cardapio-widget.tsx` — grade semanal Seg–Sex
- `artifacts/seshat/src/components/rich-text-editor.tsx` — editor Tiptap estilo Word. Usado no `AvisoDialog` para tipos não-cardápio.
- `artifacts/seshat/src/components/anexo-uploader.tsx` — lista/delete de anexos **já salvos** (`avisoId` obrigatório). Usado no modo edição para exibir anexos existentes.
- `artifacts/seshat/src/components/anexo-viewer.tsx` — modal de visualização: `<img>` para imagens, `<iframe>` para PDF, link de download para doc/docx/xlsx.

## Anexos (avisos/informes não-cardápio)

- Tabela: `avisos_anexos` — `id`, `aviso_id` (CASCADE), `nome_original`, `nome_arquivo` (uuid.ext), `mime_type`, `tamanho`, `criado_em`
- Tipos permitidos: doc, docx, xlsx, pdf, jpg, jpeg, png — max 2 MB
- Armazenamento: `artifacts/api-server/uploads/avisos/` — NUNCA público; servido apenas via endpoint autenticado (LGPD/ISO27001)
- Nomenclatura no disco: `{uuid}.{ext}` (sem nome original, evita path traversal)
- **Upload antes de salvar**: o modal exibe `PendingFilesZone` (drag-and-drop, lista com remoção) desde a criação.
  Fluxo ao salvar: POST/PUT aviso → upload sequencial dos arquivos pendentes usando o `id` retornado.
  Em modo edição: `AnexoUploader` (arquivos já salvos) + `PendingFilesZone` (novos) aparecem juntos.
- Rotas:
  - `POST /avisos/:id/anexos` — upload (multer, memoryStorage → writeFileSync)
  - `GET /avisos/:id/anexos` — listar
  - `GET /anexos/:id/arquivo` — servir inline (requireAuth)
  - `DELETE /anexos/:id` — excluir DB + arquivo físico
- Migration: `psql "$DATABASE_URL" -f scripts/migrate-avisos-anexos.sql`
- **Visualização no feed**: `GET /feed` retorna `anexos[]` (id, nomeOriginal, mimeType) por item.
  `AvisosWidget` renderiza chips clicáveis: imagem/PDF → `AnexoViewer` modal; doc/xlsx → `window.open(url, '_blank')`.

## Arquivos principais

- `artifacts/seshat/src/components/avisos-widget.tsx`
- `artifacts/seshat/src/components/cardapio-widget.tsx`
- `artifacts/seshat/src/pages/avisos/index.tsx`
- `artifacts/seshat/src/pages/informes/index.tsx`
- `artifacts/seshat/src/pages/tipos-avisos/index.tsx`
- `artifacts/api-server/src/routes/avisos-informes.ts`

## Spec completa

`.specs/features/avisos-informes.md`

## Permissão

`avisos:manage` — gestão; feed e cardapio-widget são lidos por todos os usuários autenticados.

## Tipos especiais

`ehCardapio: true` — avisos exibidos exclusivamente no CardapioWidget (grade semanal Seg–Sex baseada em `dataInicio`). Nunca aparecem no feed nem na lista de avisos normais.

## Público-alvo (multi-seleção — 2FN)

- Múltiplos perfis armazenados na tabela de junção `avisos_publicos_alvo(aviso_id, perfil)` com PK composta — não viola 2FN.
- A coluna `publico_alvo varchar(30)` em `avisos` é mantida para compatibilidade retroativa.
- Valores: `todos`, `estudantes`, `responsaveis`, `professores`, `coordenadores`, `equipe_gestora`
- `todos` é mutuamente exclusivo com os demais: ao marcar "Todos os perfis", os outros são desmarcados e vice-versa.
- UI: `PublicoAlvoSelector` — grid de checkboxes com estilo de card selecionável.
- API: `syncPublicosAlvo(avisoId, perfis[])` sincroniza POST/PUT; `getPublicosAlvo(ids[])` enriquece listagens com `publicosAlvo[]`.
- Migration: `psql "$DATABASE_URL" -f scripts/migrate-avisos-publico-alvo-array.sql`

## Perfis válidos para feed

`estudante`, `professor`, `coordenador`, `pai_responsavel`, `equipe_gestora`, `todos`
