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
