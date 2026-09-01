---
description: Spec do carômetro de Usuários (pais, responsáveis e estudantes) — removido do menu
---

# Usuários

> **Status:** endpoint e página existem mas a opção foi **removida do menu** do Carômetro. Não recriar sem aprovação explícita.

## Spec

Retorna pais/responsáveis e estudantes da instituição. Os dados são exibidos em formato de carômetro (grade de fotos com nome). Responsáveis e estudantes são exibidos em seções separadas. Estudantes são agrupados por turno/curso; responsáveis são exibidos com os estudantes aos quais estão vinculados.

## Endpoint

`GET /api/carometro/usuarios`

## Response Shape

```json
{
  "responsaveis": {
    "titulo": "Pais e Responsáveis",
    "membros": [
      {
        "id": 9,
        "nome": "Marcos Almeida",
        "foto_url": "https://example.com/fotos/marcos-almeida.jpg",
        "role": "pai_responsavel",
        "vinculados": [
          {
            "id": 10,
            "nome": "Gabriel Almeida",
            "turno": "Manhã",
            "curso": "Ensino Médio - 1º Ano"
          }
        ]
      }
    ]
  },
  "estudantes": {
    "titulo": "Estudantes",
    "grupos": [
      {
        "turno": "Manhã",
        "curso": "Ensino Médio - 1º Ano",
        "membros": [
          {
            "id": 10,
            "nome": "Gabriel Almeida",
            "foto_url": "https://example.com/fotos/gabriel-almeida.jpg",
            "role": "estudante",
            "turno": "Manhã",
            "curso": "Ensino Médio - 1º Ano"
          }
        ]
      }
    ]
  }
}
```

## Regras de Negócio

- Roles incluídas: `pai_responsavel`, `estudante`
- Responsáveis e estudantes aparecem em seções separadas na resposta
- Responsáveis (`pai_responsavel`): exibe nome, foto e lista de estudantes vinculados (com turno/curso de cada um)
- Estudantes (`estudante`): exibe nome e foto; agrupados por turno/curso
- Um responsável pode estar vinculado a mais de um estudante
- Um estudante pode ter mais de um responsável vinculado
- Apenas usuários ativos devem ser retornados

## Padrão Visual dos Cards

Ver skill `seshat-carometro-estudantes` — seção "Padrão Visual — Cards Fotográficos (3×4)".

Cards usam proporção 3:4 (retrato), tamanhos `w-16 h-[85px]` (small) / `w-20 h-[107px]` (normal), grade `flex flex-wrap gap-2`. Nunca usar `w-24`/`w-28` nos cards de carômetro.

---

## Modal de Seleção de Disciplinas — Usuário Estudante

Ao criar ou editar um usuário com role `estudante` na página de administração de Usuários (`/usuarios`), o formulário exibe um painel/modal de disciplinas com as seguintes regras:

### Agrupamento
Disciplinas exibidas em dois níveis de agrupamento:
1. **Curso** (ex.: "Técnico em Informática")
2. **Turno** dentro do curso (ex.: "Manhã", "Tarde", "Noite")

### Opção "Todas as disciplinas"
- Exibida como **primeira opção** dentro de cada grupo Curso/Turno
- **Marcada por padrão** ao abrir o modal sem seleção prévia
- Comportamento toggle:
  - Marcar → seleciona todos os checkboxes do grupo
  - Desmarcar → remove toda a seleção do grupo
  - Grupo com seleção parcial → "Todas" em estado **indeterminate**

### Seleção Individual
- Checkbox por disciplina dentro do agrupamento Curso/Turno
- Pode selecionar qualquer subconjunto de disciplinas de um curso
- Selecionar todas individualmente → "Todas" fica marcado automaticamente

### Persistência
- Campo `disciplinaOfertaIds: string[]` no corpo do POST/PATCH
- Ou `PUT /api/usuario-disciplinas` para atualização isolada (bulk replace)
- Backend salva em `usuario_disciplinas` (um registro por `disciplina_oferta_id`)

### Estrutura visual de referência

```
[ Modal: Selecionar Disciplinas ]

▸ Técnico em Informática
  ▸ Manhã
    [✓] Todas as disciplinas
    [✓] Programação Web
    [✓] Banco de Dados
  ▸ Tarde
    [~] Todas as disciplinas    ← indeterminate (parcial)
    [✓] Redes de Computadores
    [ ] Segurança da Informação

▸ Técnico em Administração
  ▸ Noite
    [ ] Todas as disciplinas
    [ ] Contabilidade
    [ ] Marketing
```

> "Todas as disciplinas" é um atalho de UI — não é salvo como entidade própria. Resulta em múltiplos registros em `usuario_disciplinas`, um por oferta do grupo.

---

## Gestão de Usuários — CRUD (`/usuarios`)

### Campos do usuário

| Campo | Tipo | Editável | Observação |
|---|---|---|---|
| `nome` | text | ✅ criação + edição | Opcional |
| `email` | criptografado | ✅ criação | Indexado por hash SHA-256 |
| `dataNascimento` | date (`YYYY-MM-DD`) | ✅ criação + edição | Obrigatório para role `estudante` |
| `codigoAcesso` | texto | ❌ gerado | Imutável |
| `primeiroAcesso` | boolean | ✅ edição | Toggle no modal de edição |

### PUT /api/usuarios/:id

Aceita qualquer combinação de `nome` e/ou `dataNascimento`. Campos omitidos **não são alterados**.

```typescript
// body (todos opcionais)
{
  nome?: string;           // min 2 chars
  dataNascimento?: string | null;  // "YYYY-MM-DD" ou null para limpar
}
// resposta
{ id: string; nome: string | null; dataNascimento: string | null }
```

### GET /api/usuarios (lista) e GET /api/usuarios/:id

Ambos incluem `dataNascimento: string | null` na resposta.

### Modal de edição (EditarUsuarioModal)

Campos:
1. Nome
2. E-mail *(obrigatório)*
3. **Data de nascimento** — input `type="date"`; exibe idade calculada em texto auxiliar
4. Código de acesso *(read-only)*
5. Toggle "Primeiro acesso"
6. Resetar senha

### Card de listagem (UsuarioRow)

Exibe a idade calculada (`calcIdadeStr(dataNascimento)`) em texto auxiliar ao lado do e-mail quando `dataNascimento` estiver preenchido.

### calcIdadeStr

```typescript
function calcIdadeStr(d: string | null): number | null {
  if (!d) return null;
  const hoje = new Date();
  const nasc = new Date(d);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}
```

Função declarada fora dos componentes (reutilizada em `EditarUsuarioModal` e `UsuarioRow`).

---

## Vínculo Pai/Responsável ao Criar Estudante

### Endpoint de busca

`GET /api/usuarios/responsaveis?q=`

- Retorna usuários com role `pai_responsavel`, ativos (não excluídos)
- Parâmetro `?q=` opcional — filtra por nome, `codigoAcesso` ou email (case-insensitive, `ilike`)
- Resposta: `[{ id, nome, codigoAcesso, email }]`
- Permissão: `usuarios:manage`
- **Deve ser registrado ANTES de `GET /api/usuarios/:id`** para não ser capturado como `:id = "responsaveis"`

```typescript
router.get("/responsaveis", requirePermissao("usuarios:manage"), async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const [rolePai] = await db.select({ id: rolesTable.id }).from(rolesTable)
    .where(and(eq(rolesTable.nome, "pai_responsavel"), isNull(rolesTable.deletadoEm)));
  if (!rolePai) return res.json([]);

  const usersWithRole = await db.select({ usuarioId: usuariosRolesTable.usuarioId })
    .from(usuariosRolesTable)
    .where(eq(usuariosRolesTable.roleId, rolePai.id));
  const ids = usersWithRole.map((r) => r.usuarioId);
  if (ids.length === 0) return res.json([]);

  const rows = await db.select({ id: usuariosTable.id, nome: usuariosTable.nome,
      codigoAcesso: usuariosTable.codigoAcesso, emailEncrypted: usuariosTable.emailEncrypted })
    .from(usuariosTable)
    .where(and(inArray(usuariosTable.id, ids), isNull(usuariosTable.deletadoEm)));

  const result = rows
    .map((u) => ({ id: u.id, nome: u.nome, codigoAcesso: u.codigoAcesso,
        email: decryptEmail(u.emailEncrypted) }))
    .filter((u) => !q || [u.nome, u.codigoAcesso, u.email]
        .some((v) => v?.toLowerCase().includes(q.toLowerCase())));
  res.json(result);
});
```

### POST /api/usuarios — campo responsavelIds

Schema atualizado:

```typescript
const createUsuarioSchema = z.object({
  // ... campos existentes ...
  responsavelIds: z.array(z.string().uuid()).optional().default([]),
});
```

Fluxo após criar o usuário:

```typescript
if (responsavelIds.length > 0 && roleIds.length > 0) {
  const [roleEstudante] = await db.select({ id: rolesTable.id }).from(rolesTable)
    .where(eq(rolesTable.nome, "estudante"));
  const temEstudanteRole = roleEstudante && roleIds.includes(roleEstudante.id);
  if (temEstudanteRole) {
    const [estudante] = await db.select({ id: estudantesTable.id })
      .from(estudantesTable)
      .where(and(eq(estudantesTable.usuarioId, u.id), isNull(estudantesTable.deletadoEm)));
    if (estudante) {
      await db.insert(responsaveisEstudantesTable).values(
        responsavelIds.map((responsavelId) => ({
          usuarioId: responsavelId, estudanteId: estudante.id, criadoPorId: req.usuarioId,
        }))
      ).onConflictDoNothing();
    }
  }
}
```

> **Atenção:** `responsaveis_estudantes` NÃO tem coluna `atualizado_em` — apenas `id, usuario_id, estudante_id, criado_em, criado_por_id`.

### Componente ResponsaveisSelector (UI)

Exibido no `NovoUsuarioModal` quando `temEstudante` (alguma role selecionada é `estudante`):

```
[ Pai / Responsável (opcional) ]
🔍 [Buscar por nome, código ou e-mail...]
  ☐ João da Silva   (JD1234)   joao@email.com
  ☐ Maria Oliveira  (MO5678)   maria@email.com

Selecionados:
  [João da Silva ×]  [Maria Oliveira ×]
```

**Comportamento:**
- Debounce 300ms → `GET /api/usuarios/responsaveis?q=`
- Checkbox para cada resultado; permite múltipla seleção
- Pills de selecionados com botão X para remover
- Campo `responsavelIds` enviado apenas quando `temEstudante = true`
- Vínculo criado automaticamente em `responsaveis_estudantes` no POST

**Estado no modal:**

```typescript
const [responsaveisSelecionados, setResponsaveisSelecionados] = useState<ResponsavelSummary[]>([]);
// Tipo:
type ResponsavelSummary = { id: string; nome: string | null; codigoAcesso: string; email: string };
```

---

## Perfil do Estudante — Ver Perfil Completo / Editar Perfil

Página: `artifacts/seshat/src/pages/estudantes/detail.tsx` (rota `/estudantes/:id`)

### Modo Visualização

Após a seção "Data de Cadastro", exibe seção "Pai / Responsável" quando `estudante.responsaveis.length > 0`:

```tsx
{responsaveis.map((r) => (
  <div key={r.id} className="flex items-center gap-2 text-sm">
    <span className="font-medium">{r.nome ?? "—"}</span>
    <span className="text-xs text-muted-foreground font-mono">({r.codigoAcesso})</span>
    <span className="text-xs text-muted-foreground">{r.email}</span>
  </div>
))}
```

### Modo Edição

Após o campo Observação, exibe o mesmo `ResponsaveisSelector` da criação de usuário. Ao salvar, envia `responsavelIds: string[]` via `PUT /api/estudantes/:id`.

- `resetForm()` preenche `responsaveisSelecionados` a partir de `estudante.responsaveis`
- Array vazio = remover todos os vínculos

### API

`GET /api/estudantes/:id` retorna `responsaveis: Array<{ id, nome, codigoAcesso, email }>`.

`PUT /api/estudantes/:id` aceita `responsavelIds?: string[]`:
- Presente → delete todos + insert novos em `responsaveis_estudantes` (`ON CONFLICT DO NOTHING`)
- Ausente → não toca nos vínculos existentes

> **Atenção:** `responsaveis_estudantes` NÃO tem coluna `atualizado_em`.
