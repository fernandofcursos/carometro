# Spec: Avisos e Informes

## Visão Geral

Módulo para criação, gestão e exibição de avisos e informes institucionais. Avisos têm caráter operacional/urgente (ex: cardápio, eventos); informes têm caráter informativo/comunicado.

## Rotas de API

Base: `/api/avisos-informes`

### GET /tipos
Lista todos os tipos ativos (ou todos, dependendo de permissão).

**Response:**
```typescript
Array<{
  id: string;
  nome: string;
  descricao: string | null;
  categoria: "aviso" | "informe";
  ehCardapio: boolean;
  perfisDestino: string[];  // ex: ["estudante", "professor"]
  ativo: boolean;
}>
```

### GET /avisos?mes=YYYY-MM
Lista avisos do mês (categoria='aviso').

### GET /informes?mes=YYYY-MM
Lista informes do mês (categoria='informe').

**Response (ambos):**
```typescript
Array<{
  id: string;
  titulo: string;
  conteudo: string;
  tipo: "aviso" | "informe";
  publicoAlvo: string;
  publicado: boolean;
  dataInicio: string | null;
  dataFim: string | null;
  tipoId: string | null;
  tipoNome: string | null;
  tipoEhCardapio: boolean;
  turmaId: string | null;
  turmaSigla: string | null;
  autorId: string | null;
  autorNome: string | null;
  criadoEm: string;
}>
```

### POST /avisos | POST /informes
Cria aviso ou informe.

### PUT /avisos/:id | PUT /informes/:id
Atualiza aviso ou informe.

### DELETE /avisos/:id | DELETE /informes/:id
Soft-delete (marca inativo).

**Body (POST/PUT):**
```typescript
{
  titulo: string;
  conteudo: string;
  tipo: "aviso" | "informe";
  publicoAlvo: string;
  turmaId?: string | null;
  tipoId?: string | null;
  publicado: boolean;
  dataInicio?: string | null;
  dataFim?: string | null;
}
```

### GET /avisos?mes=YYYY-MM[&excluirCardapio=true]
Retorna avisos do mês. Com `excluirCardapio=true` omite avisos cujo tipo tem `ehCardapio=true`.
Response inclui `tipoNome` e `tipoEhCardapio` via LEFT JOIN com `tipos_avisos_informes`.

### GET /cardapio?de=YYYY-MM-DD&ate=YYYY-MM-DD
Retorna apenas avisos `ehCardapio=true` no intervalo de datas informado. Requer apenas `requireAuth`.
Aceita também `?mes=YYYY-MM` como fallback. O CardapioWidget **sempre usa range de datas** (seg–sex) para cobrir semanas que cruzam meses. Disponível para todos os perfis autenticados, incluindo **estudante** e **pai_responsavel**.

### GET /feed?perfil=ROLE&limite=10
Feed para dashboards — retorna itens publicados filtrados pelo perfil.
**Exclui automaticamente avisos com `ehCardapio=true`** — cardápio é exibido exclusivamente pelo CardapioWidget.

**Response:**
```typescript
Array<{
  id: string;
  titulo: string;
  conteudo: string;
  tipo: "aviso" | "informe";
  publicoAlvo: string;
  publicado: boolean;
  dataInicio: string | null;
  dataFim: string | null;
  tipoNome: string | null;
  tipoEhCardapio: boolean;
  perfisDestino: string[];
  turmaSigla: string | null;
  criadoEm: string;
}>
```

### POST/PUT/DELETE /tipos/:id
CRUD de tipos de aviso/informe.

## Schema (banco de dados)

Tabelas: `avisos_informes_tipos`, `avisos_informes`

Campo `perfis_destino` é `text[]` no PostgreSQL — retorna como array JS no JSON.

## Regras de Negócio

### Cardápio
- Avisos com `tipoEhCardapio=true` são exibidos **exclusivamente** pelo `CardapioWidget` (grade Seg–Sex).
- O campo `dataInicio` determina o dia da semana do cardápio.
- Nunca aparecem no feed de avisos nem na lista "Avisos do mês".

### Feed (dashboards)
- `/feed` exclui automaticamente avisos com `ehCardapio=true`.
- Cada dashboard exibe AvisosWidget (feed) + CardapioWidget (grade) como seções complementares.
- CardapioWidget é **obrigatório** em todos os dashboards, incluindo os perfis **estudante** e **pai_responsavel**.
- O CardapioWidget busca por `?de=seg&ate=sex` (range de datas) para cobrir semanas que cruzam meses.

### Página de Avisos (gestão)
- A lista "Avisos do mês" usa `?excluirCardapio=true` — nunca lista cardápio.
- O CardapioWidget com `editavel=true` é a única interface de gestão do cardápio.

### Conteúdo rico (não-cardápio)
- Campo `conteudo` armazena HTML gerado pelo editor Tiptap.
- Editor estilo Word: Bold, Italic, Underline, Strikethrough, H1/H2/Para, listas, alinhamento, undo/redo.
- Cardápio usa `<textarea>` simples (sem formatação).
- Feed e lista renderizam `conteudo` como HTML via `prose prose-sm` (sanitizado via atributos do Tiptap).

### Anexos (não-cardápio)
- Tipos: doc, docx, xlsx, pdf, jpg, jpeg, png — max 2 MB por arquivo.
- Armazenamento: filesystem em `uploads/avisos/`, nunca exposto publicamente (LGPD/ISO27001).
- Nome no disco: `{uuid}.{ext}` — nome original preservado apenas no banco.
- Upload após salvar o aviso (`avisoId` obrigatório).
- Visualização: modal com `<img>` (imagens), `<iframe>` (PDF), download (Office).
- Exclusão: física (DB + arquivo em disco).
- Rotas: `POST/GET /avisos/:id/anexos`, `GET/DELETE /anexos/:id/arquivo`.

### Geral
- Feed filtra por `perfisDestino` e `publicado=true`.
- Público-alvo: `todos`, `estudantes`, `responsaveis`, `professores`, `coordenadores`, `equipe_gestora`.
- Permissão necessária: `avisos:manage` para CRUD; feed e cardápio-widget são públicos para usuários autenticados.

## Tipos Padrão (sugestão)

- **Aviso Geral** — categoria: aviso, perfis: todos
- **Cardápio** — categoria: aviso, ehCardapio: true, perfis: todos
- **Comunicado** — categoria: informe, perfis: todos
- **Circular** — categoria: informe, perfis: responsaveis
- **Informe Pedagógico** — categoria: informe, perfis: professores, coordenadores

## Componentes Criados

- `artifacts/seshat/src/components/avisos-widget.tsx` — Widget reutilizável para dashboards
- `artifacts/seshat/src/pages/avisos/index.tsx` — Página de gestão de avisos
- `artifacts/seshat/src/pages/informes/index.tsx` — Página de gestão de informes
- `artifacts/seshat/src/pages/tipos-avisos/index.tsx` — Página de CRUD de tipos

## Permissão

`avisos:manage` — controla visibilidade do grupo de menu e acesso às páginas de gestão.
