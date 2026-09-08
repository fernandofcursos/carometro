# Spec: Textos Padrão de Tipos de Ocorrências

**Agente responsável:** Hermes + Hefesto  
**Status:** Implementado ✅

---

## Conceito

Textos Padrão são modelos de texto associados a cada tipo de ocorrência. Facilitam o registro de ocorrências recorrentes, garantindo padronização e conformidade com as políticas da instituição.

Cada tipo de ocorrência pode ter **no máximo um texto ativo** por vez. Textos inativos ou removidos são preservados para histórico.

---

## Regra Indiscutível — Caixa "Orientações ao Responsável"

**Todo texto padrão para ocorrências DEVE conter uma seção destinada a orientações aos pais e responsáveis**, exibida como uma caixa com borda e fundo colorido:

| Elemento | Estilo |
|---|---|
| **Título** | "Orientações ao Responsável" com fundo **azul médio** (`#1e40af`) e texto branco |
| **Corpo** | Área de texto com fundo **azul claro** (`#eff6ff`) e borda `#bfdbfe` |
| **Contêiner** | `border: 1px solid #bfdbfe`, `border-radius: 8px`, `overflow: hidden` |

Esta paleta é **idêntica ao texto padrão "Advertência Verbal"** e deve ser mantida como padrão em todos os textos de ocorrência. O editor TipTap não impõe esse HTML — é responsabilidade do administrador incluir o bloco no conteúdo do texto padrão.

### Estrutura HTML de referência para a caixa

```html
<div style="border:1px solid #bfdbfe;border-radius:8px;overflow:hidden;margin:16px 0">
  <div style="background:#1e40af;color:#fff;font-weight:bold;padding:8px 16px;font-size:0.9em">
    Orientações ao Responsável
  </div>
  <div style="background:#eff6ff;padding:12px 16px;color:#1e3a5f;font-size:0.9em;line-height:1.6">
    [texto de orientação ao responsável]
  </div>
</div>
```

### Bloco padrão institucional da ETSM (usar como base em todos os textos)

```html
<div style="border:1px solid #bfdbfe;border-radius:8px;overflow:hidden;margin:16px 0">
  <div style="background:#1e40af;color:#fff;font-weight:bold;padding:8px 16px;font-size:0.9em">
    Orientações ao Responsável
  </div>
  <div style="background:#eff6ff;padding:12px 16px;color:#1e3a5f;font-size:0.9em;line-height:1.6">
    <p style="margin:0 0 10px 0">Esta notificação tem caráter pedagógico e formativo. A Escola Técnica de Santa Maria reafirma seu compromisso com um ambiente escolar seguro, respeitoso e propício ao aprendizado, conforme os princípios da cultura de paz estabelecidos pela SEEDF.</p>
    <p style="margin:0">Orientamos que o(a) responsável compareça à Coordenação Pedagógica para acolhimento e esclarecimentos, no prazo de 3 (três) dias úteis a partir do recebimento desta notificação. Dúvidas poderão ser encaminhadas diretamente à Equipe Gestora.</p>
  </div>
</div>
```

---

## Regras de Negócio

| # | Regra |
|---|---|
| 1 | Apenas um texto ativo por tipo de ocorrência (índice parcial no banco) |
| 2 | Textos inativos ou com `deletadoEm` não contam para o limite |
| 3 | Soft delete: `deletadoEm` timestamp + `ativo = false` na remoção |
| 4 | Placeholders são substituídos pelo servidor em `/render` ou pelo front ao usar o texto |
| 5 | Permissão requerida: `tipos-ocorrencias:manage` (gestão + coordenação) |
| 6 | Corpo máximo: 10 000 caracteres (HTML); título máximo: 200 caracteres |
| 7 | O campo `corpo` armazena HTML gerado pelo editor rico (TipTap); o mailer detecta automaticamente se é HTML ou texto plano |
| 8 | Toolbar inclui alinhamento justificado e botão "Documento Anexado" (insere bloco `📎 Documento Anexado: ___`) |
| 9 | **Todo texto padrão deve conter a caixa "Orientações ao Responsável"** com fundo azul médio no título e azul claro no corpo (ver Regra Indiscutível acima) |

---

## Placeholders

| Marcador | Substitui por |
|---|---|
| `{{NOME_ESTUDANTE}}` | Nome do estudante |
| `{{DATA_REGISTRO}}` | Data de registro da ocorrência |
| `{{DATA_OCORRENCIA}}` | Data da ocorrência |
| `{{TIPO_OCORRENCIA}}` | Descrição do tipo de ocorrência |
| `{{DESCRICAO}}` | Observação/descrição livre |

Placeholders sem dados disponíveis mantêm o marcador original (ex.: `{{NOME_ESTUDANTE}}`).

---

## Modelo de Dados

### Tabela `textos_padrao_ocorrencias`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `tipo_ocorrencia_id` | uuid FK | → tipos_ocorrencias (cascade delete) |
| `titulo` | varchar(200) | NOT NULL |
| `corpo` | text | NOT NULL |
| `ativo` | boolean | NOT NULL, default true |
| `criado_em` | timestamptz | default now() |
| `atualizado_em` | timestamptz | default now() |
| `deletado_em` | timestamptz | soft delete |

### Índice parcial

```sql
CREATE UNIQUE INDEX uq_texto_padrao_ativo_por_tipo
ON textos_padrao_ocorrencias (tipo_ocorrencia_id)
WHERE ativo = true AND deletado_em IS NULL;
```

---

## Endpoints

### GET /api/textos-padrao
**Requer:** `tipos-ocorrencias:manage`  
Lista todos os textos não deletados (ativos e inativos), com JOIN em `tipos_ocorrencias`.

### GET /api/textos-padrao/placeholders
**Requer:** `requireAuth`  
Retorna lista de placeholders disponíveis.

### GET /api/textos-padrao/tipo/:tipoOcorrenciaId
**Requer:** `requireAuth`  
Retorna o texto ativo para o tipo informado. 404 se não houver.

### GET /api/textos-padrao/:id/render?ocorrenciaId=
**Requer:** `requireAuth`  
Renderiza o texto com dados reais se `ocorrenciaId` for fornecido.

### POST /api/textos-padrao
**Requer:** `tipos-ocorrencias:manage`  
Cria novo texto. Retorna 409 se já houver texto ativo para o tipo (e `ativo = true`).

### PUT /api/textos-padrao/:id
**Requer:** `tipos-ocorrencias:manage`  
Atualiza texto. Valida conflito ao reativar.

### DELETE /api/textos-padrao/:id
**Requer:** `tipos-ocorrencias:manage`  
Soft delete: seta `deletadoEm` e `ativo = false`.

---

## Erros e Mensagens

| Situação | Status | Mensagem |
|---|---|---|
| Dados inválidos | 400 | "Dados inválidos." + detalhes |
| Texto não encontrado | 404 | "Texto padrão não encontrado." |
| Conflito de texto ativo | 409 | "Já existe um texto padrão ativo para este tipo de ocorrência." |
| Erro interno | 500 | "Erro ao … texto padrão." |

---

## Frontend (`/textos-padrao-ocorrencias`)

- Listagem em cards com título, tipo (badge), status ativo/inativo
- Toggle ativo/inativo por switch inline
- Busca local por título, tipo e conteúdo
- Dialog de criação/edição com:
  - Select de tipo de ocorrência (filtrado: somente ativos)
  - Campo título (max 200)
  - **Toolbar de formatação** sobre a textarea: Negrito (`**texto**`), Itálico (`_texto_`), Lista com marcadores (`- item`), Lista numerada (`1. item`) — formata o texto selecionado ou insere exemplo
  - **Textarea** corpo (max 5000) com contador, aceita drop de marcadores
  - **Marcadores com drag-and-drop**: chips `draggable` que podem ser arrastados para a posição desejada na textarea; clique também insere no cursor
  - **Importar arquivo**: botão na toolbar que aceita `.md`, `.docx` e `.pdf`; arquivos `.md` são lidos no browser, `.docx` e `.pdf` são enviados para `POST /api/textos-padrao/extrair-texto` e o texto extraído substitui o corpo
  - Switch ativo
- AlertDialog de confirmação para remoção
- Sem preview de renderização no frontend (renderização acontece no formulário de ocorrência)

### Endpoint de Extração de Texto

**POST /api/textos-padrao/extrair-texto**  
**Requer:** `tipos-ocorrencias:manage`  
**Content-Type:** `multipart/form-data` (campo `arquivo`)  
**Formatos suportados:** `.md`, `.docx`, `.pdf` (máx. 5 MB)

```json
{ "texto": "Conteúdo extraído do arquivo..." }
```

Erros: 400 (formato não suportado), 500 (falha na extração).

---

## Integração com Formulário de Ocorrências

Quando o professor seleciona um tipo de ocorrência no formulário de registro, o frontend pode consultar `GET /api/textos-padrao/tipo/:tipoOcorrenciaId` e, se existir texto ativo, oferecer botão "Usar texto padrão" que preenche o campo de observação com o corpo do texto (com placeholders substituídos pelos dados já disponíveis no formulário).

---

## Menu (layout.tsx)

```
Grupo: "Ocorrências"  (tipos-ocorrencias:manage | ocorrencias:view | ocorrencias:create)
├── "Tipos de Ocorrência" → /tipos-ocorrencias   (tipos-ocorrencias:manage)
├── "Textos Padrão"       → /textos-padrao-ocorrencias  (tipos-ocorrencias:manage)
└── "Relatório de Ocorrências" → /ocorrencias   (ocorrencias:view | ocorrencias:create)
```

---

## Migration

```bash
psql $DATABASE_URL -f scripts/migrate-textos-padrao.sql
pnpm --filter @workspace/db run push-force
```

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/textos-padrao-ocorrencias.ts` | Tabela + `insertTextoPadraoSchema` |
| `scripts/migrate-textos-padrao.sql` | DDL idempotente |
| `artifacts/api-server/src/routes/textos-padrao.ts` | CRUD + /placeholders + /tipo/:id + /render + /extrair-texto |
| `artifacts/seshat/src/pages/textos-padrao/index.tsx` | UI de gerenciamento |
| `artifacts/seshat/src/components/layout.tsx` | Item "Textos Padrão" no grupo Ocorrências |
| `artifacts/seshat/src/App.tsx` | Rota `/textos-padrao-ocorrencias` |
