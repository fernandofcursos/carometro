# Spec: Enturmação

**Agente responsável:** Hermes + Hefesto
**Status:** Implementado ✅

## Conceito

Enturmação é o vínculo entre um estudante (usuário com role `estudante`) e uma **turma** (curso + período + módulo). Cada vínculo é uma **matrícula** na tabela `matriculas`.

O menu lateral exibe o grupo **"Enturmação"** com o item **"Estudantes"** apontando para `/enturmacao`. Visível somente para usuários com `estudantes:manage`.

---

## Regra Central de Enturmação Dupla

> **Um estudante pode estar enturmado em no máximo 2 turmas do mesmo curso, desde que estejam em módulos diferentes e turnos diferentes.**
> A segunda enturmação deve obrigatoriamente ser em módulo numericamente inferior ao módulo da turma já ativa.
> No módulo inferior, o estudante pode cursar no máximo 3 disciplinas.

**Exemplo válido:**
- Turma 1: TDS-II-2026 (Módulo II) — Turno Matutino — módulo principal
- Turma 2: TDS-I-2026 (Módulo I) — Turno Vespertino — módulo inferior, máx. 3 disciplinas

**Exemplos inválidos:**
- Turma 1 e 2 no Módulo II → mesmo módulo → bloqueado
- Turma 1 Módulo I, Turma 2 Módulo II → novo módulo é MAIOR → bloqueado
- Turma 1 Matutino, Turma 2 Matutino → mesmo turno → bloqueado

---

## Regras de Negócio (completo)

| # | Regra | Validação |
|---|---|---|
| 1 | **Mesmo curso obrigatório** | Todas as matrículas ativas devem pertencer ao mesmo curso. → 422 se curso diferente. |
| 2 | **Máximo 2 matrículas ativas** | Limite absoluto de 2 enturmações simultâneas no mesmo curso. → 422 se já tem 2. |
| 3 | **Segunda enturmação em módulo inferior** | O módulo da nova turma deve ser numericamente inferior ao módulo da turma já ativa. Comparação via `moduloNumerico()` (converte romano → inteiro). → 422 se módulo novo ≥ existente. Se algum dos módulos não estiver definido (`null`), a regra não é aplicada. |
| 4 | **Turno diferente do módulo principal** | O `turnoId` armazenado na matrícula nova deve ser diferente do `turnoId` da matrícula existente. Verificação direta por UUID. → 422 se turnoId igual. |
| 5 | **Turno obrigatório quando turma tem múltiplos turnos** | Se a turma tem > 1 turno associado, `turnoId` deve ser informado no body. → 400 se ausente. Se turma tem exatamente 1 turno, `turnoId` é preenchido automaticamente pela API. |
| 6 | **Módulo inferior — máx. 3 disciplinas** | Na segunda enturmação (módulo inferior), o estudante pode cursar no máximo 3 disciplinas desse módulo. Validado na UI (checkbox com limite) e pela regra de `moduloMenor` na API de disciplinas se aplicável. |
| 7 | **Módulo maior (flag de curso) — 1 ou todas** | Cursos com `moduloMenor = false` exigem que o estudante curse **uma única disciplina ou todas** do turno. Seleção parcial → 422 na API de `usuario-disciplinas`. |
| 8 | **Módulo menor (flag de curso) — máx. 3** | Cursos com `moduloMenor = true` limitam a seleção a 3 disciplinas por turno. |
| 9 | **Registro numérico** | varchar(20), somente dígitos, obrigatório, fornecido externamente. |
| 10 | **Visibilidade** | A página lista **todos os estudantes** — com ou sem enturmação ativa. |

---

## Seleção de Módulo no Formulário

O seletor de módulo é **obrigatório** na cascata do formulário e é a peça que viabiliza a enturmação dupla com segurança:

```
Curso → Módulo → Turma → Turno → Disciplinas
```

- **Módulo** é derivado das turmas do curso selecionado (campo `turmas.modulo`, romanos ordenados numericamente)
- Ao selecionar o módulo, a lista de turmas é filtrada para mostrar apenas turmas daquele módulo
- O seletor de módulo só aparece quando as turmas do curso têm módulo definido
- Ao selecionar turma de **módulo inferior** (sendo que já existe matrícula em módulo superior), a UI:
  - Filtra os turnos disponíveis removendo o turno já ocupado na matrícula existente
  - Exibe aviso se nenhum turno estiver disponível
  - Força o seletor de disciplinas para modo "módulo inferior — máx. 3" (checkboxes)

---

## Modelo de Dados

```
usuarios (role estudante) (1) ──< matriculas >── (1) turmas → cursos
                                      │
                                      └── turnoId FK → turnos (turno específico do aluno)
```

### Tabela `matriculas`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `usuarioId` | uuid FK | → usuarios (restrict delete) |
| `turmaId` | uuid FK | → turmas (restrict delete) |
| `turnoId` | uuid FK | → turnos (set null on delete) — turno **específico** do estudante nesta matrícula |
| `registro` | varchar(20) | NOT NULL, somente dígitos |
| `ano` | integer | NOT NULL |
| `semestre` | smallint | NOT NULL, CHECK IN (1, 2) |
| `ativo` | boolean | default true |
| `criadoEm` | timestamptz | default now() |
| `atualizadoEm` | timestamptz | default now() |
| `deletadoEm` | timestamptz | soft delete |
| UNIQUE parcial | — | (usuarioId, turmaId) WHERE deletadoEm IS NULL — "uq_matricula_usuario_turma" |

> **Por que `turnoId` na matrícula?** Uma turma pode ter múltiplos turnos. Sem armazenar o turno escolhido pelo aluno, a API exibia todos os turnos da turma em vez do turno real — tornando impossível saber o turno do estudante e bloquear corretamente a segunda enturmação.

### Migrations

```
scripts/migrate-matriculas.sql        — criação inicial da tabela
scripts/migrate-matriculas-turno.sql  — adiciona coluna turno_id
```

---

## Endpoints

### GET /api/matriculas
**Requer:** `estudantes:manage`

Retorna todos os estudantes (role `estudante` ou com matrícula ativa), cada um com:
- `matriculas[]` — matrículas ativas com `turnoId`, `turnoNome`, `turmaModulo`, `turnos[]` (todos da turma)
- `disciplinas[]` — disciplinas cursadas via `usuario_disciplinas`

```typescript
matriculas: Array<{
  id, usuarioId, turmaId, turmaSigla, turmaModulo,
  cursoId, cursoNome, registro, ano, semestre, ativo, criadoEm,
  turnoId: string | null,   // turno específico do estudante
  turnoNome: string | null, // nome do turno (ou null se não definido)
  turnos: Array<{ id, nome }>,  // todos os turnos da turma (para o formulário)
}>
```

### POST /api/matriculas
**Requer:** `estudantes:manage`

```typescript
{
  usuarioId?: string;   // UUID do usuário existente
  email?: string;       // alternativa ao usuarioId (cria usuário se necessário)
  nome?: string;
  turmaId: string;
  turnoId?: string;     // obrigatório se turma tem múltiplos turnos
  registro: string;
  ano: number;
  semestre: 1 | 2;
}
```

Fluxo: valida → resolve/cria usuário → atribui role estudante → verifica regras de enturmação dupla → INSERT → sincroniza `estudantes` → emite carteiras.

### PATCH /api/matriculas/:id
**Requer:** `estudantes:manage`

```typescript
{ turmaId?: string; turnoId?: string; registro?: string; ano?: number; semestre?: 1 | 2 }
```

> **Atenção:** o frontend deve sempre enviar `turnoId: effectiveTurnoId` no body do PATCH para que o turno específico do aluno seja persistido. Omitir `turnoId` mantém o valor anterior no banco.

Se `turmaId` mudar, re-valida todas as regras de enturmação dupla (excluindo a matrícula atual).

### DELETE /api/matriculas/:id
**Requer:** `estudantes:manage`

Soft delete: seta `deletadoEm` e `ativo = false`.

---

## Erros e Mensagens

| Situação | Status | Mensagem |
|---|---|---|
| `registro` não numérico | 400 | "Registro inválido — deve ser numérico e ter no máximo 20 dígitos." |
| Turno ausente (múltiplos na turma) | 400 | "Selecione o turno para esta turma (a turma possui múltiplos turnos)." |
| Turma não encontrada | 400 | "Turma não encontrada." |
| Curso diferente do atual | 422 | "Este estudante já está enturmado no curso '&lt;curso&gt;'. Não é possível enturmar em cursos diferentes." |
| Limite de 2 matrículas ativas | 422 | "Este estudante já possui 2 enturmações ativas no curso '&lt;curso&gt;' (limite máximo)." |
| Módulo novo ≥ módulo existente | 422 | "A segunda enturmação deve ser em módulo inferior ao atual (turma &lt;sigla&gt;, módulo &lt;X&gt;)." |
| Mesmo turno nas duas matrículas | 422 | "O estudante já está enturmado neste turno (turma &lt;sigla&gt;). A segunda enturmação deve ser em turno diferente." |
| Conflito DB (uq_matricula_usuario_turma) | 409 | "Este estudante já está matriculado nesta turma." |
| Módulo menor — mais de 3 disciplinas | 422 | "Módulo menor: máximo 3 disciplinas por turno." |
| Módulo maior — seleção parcial | 422 | "Módulo maior: selecione uma ou todas as disciplinas do turno." |
| FK inválida (23503) | 400 | "Turma ou estudante inválidos." |
| Schema desatualizado (42703) | 500 | "Erro de schema no banco de dados. Execute as migrações pendentes." |

---

## Frontend (`/enturmacao`)

### Cascata do Formulário

```
Curso → Módulo → Turma → Turno → Disciplinas → Registro | Ano | Semestre
```

| Passo | Comportamento |
|---|---|
| **Curso** | Lista todos os cursos |
| **Módulo** | Deriva módulos únicos das turmas do curso selecionado, ordenados (I, II, III…). Oculto se turmas não têm módulo definido. |
| **Turma** | Filtrada por curso + módulo. Desabilitada até módulo selecionado (quando há módulos). Exibe sigla e descrição. |
| **Turno** | Auto-preenchido se turma tem 1 turno. Select se múltiplos. Em enturmação de módulo inferior: turnos já ocupados na matrícula principal são removidos da lista. |
| **Disciplinas** | Modo checkbox/máx.3 para módulo inferior secundário ou cursos moduloMenor. Modo "Todas/Uma" para módulo maior. |

### Tabela de Enturmações (por estudante)

Colunas: **Curso | Módulo | Turno | Turma | Registro | Semestre | Ações**

- **Módulo**: exibe `turmaModulo` (ex.: "I", "II") — identifica o módulo da turma naquela matrícula
- **Turno**: exibe `turnoNome` (turno específico do aluno) ou "—" quando não definido — nunca todos os turnos da turma

### DisciplinasSeletor — Modos

| Contexto | Label | Comportamento |
|---|---|---|
| Curso `moduloMenor = true` | "Disciplinas (módulo menor)" | Checkboxes, contador selCount/3 |
| Segunda enturmação em módulo inferior | "Disciplinas (módulo inferior — máx. 3)" | Checkboxes, limite 3 |
| Módulo maior (único enrollment ou principal) | "Disciplinas (módulo maior)" | Botões Todas/Selecionar uma + radio |

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/matriculas.ts` | Schema + insertMatriculaSchema (inclui turnoId) |
| `artifacts/api-server/src/routes/matriculas.ts` | GET, POST, PATCH, DELETE + validações |
| `artifacts/seshat/src/pages/enturmacao/index.tsx` | UI accordion + cascata de formulário |
| `artifacts/seshat/src/components/layout.tsx` | Grupo "Enturmação" |
| `artifacts/seshat/src/App.tsx` | Rota `/enturmacao` |
| `scripts/migrate-matriculas.sql` | DDL inicial |
| `scripts/migrate-matriculas-turno.sql` | Adiciona turno_id |
