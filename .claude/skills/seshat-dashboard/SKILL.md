# Skill: Dashboard — Estudante e Pai/Responsável

## Conceito

O dashboard é a **tela inicial** renderizada em `artifacts/seshat/src/pages/dashboard.tsx`.
O componente `Dashboard` (export default) roteia por role:

| Role | Componente | Endpoint |
|---|---|---|
| `estudante` | `DashboardEstudante` | `GET /api/portal/dashboard` |
| `pai_responsavel` | `DashboardResponsavel` | `GET /api/portal-responsavel/dashboard` |
| outros (admin, etc.) | `DashboardAdmin` | `GET /api/stats` |

O dia/data atual vem **sempre do servidor** (`hoje: string`), nunca de `new Date()` no cliente.

---

## Shape dos Dados

### GET /api/portal/dashboard (estudante)

```typescript
{
  hoje: string;       // "YYYY-MM-DD" — usar para destacar dia
  diaSemana: number;  // 1=seg … 5=sex (0=dom/6=sab → sem aula)
  agendaDisponivel: boolean;
  agenda: Array<{
    dia: number; diaNome: string;
    aulas: Array<{ horaInicio: string; horaFim: string; disciplinaNome: string; sala: string | null }>;
  }>;
  ocorrencias: {
    resumo: Array<{ tipoId: string; tipoDescricao: string; total: number; semCiencia: number; ids: string[] }>;
    totalGeral: number;
  };
  cardapioDisponivel: boolean;
  cardapio: Array<{ dia: number; diaNome: string; data: string; itens: Array<{ refeicao: string; descricao: string }> }>;
}
```

### GET /api/portal-responsavel/dashboard (pai/responsável)

```typescript
{
  hoje: string; diaSemana: number;
  estudantes: Array<{
    id: string; nome: string; fotoUrl: string | null;
    turmaSigla: string; cursoNome: string;
    agendaDisponivel: boolean;
    agenda: Array<{ dia: number; diaNome: string; aulas: AulaItem[] }>;
    ocorrencias: { resumo: OcorrenciaResumo[]; totalGeral: number };
  }>;
  cardapioDisponivel: boolean;
  cardapio: Array<{ dia: number; diaNome: string; data: string; itens: ItemCardapio[] }>;
}
```

**Regras do endpoint do responsável:**
- Estudantes via `responsaveis_estudantes → estudantes` com **LEFT JOIN** turmas/cursos (estudantes sem turmaId ainda aparecem)
- Ocorrências em lote: `inArray(ocorrenciasTable.estudanteId, estudanteIds)`
- Agenda em lote: query direta em `horariosAulasTable` por `turmaId` (ver armadilha abaixo)
- Cardápio compartilhado (único — cardápio da escola)
- Se nenhum dependente vinculado: retorna `estudantes: []`

---

## Backend — Query de Agenda (CORRETO)

```typescript
// JOIN correto: matriculas → horarios_aulas → disciplina_ofertas → disciplinas
const aulas = await db
  .select({
    dia:            horariosAulasTable.diaSemana,
    horaInicio:     horariosAulasTable.horaInicio,
    horaFim:        horariosAulasTable.horaFim,
    disciplinaNome: disciplinasTable.nome,
    sala:           horariosAulasTable.sala,
  })
  .from(matriculasTable)
  .innerJoin(
    horariosAulasTable,
    and(
      eq(horariosAulasTable.turmaId, matriculasTable.turmaId),
      eq(horariosAulasTable.ano, anoAtual),
      eq(horariosAulasTable.semestre, semestreAtual),
    ),
  )
  .leftJoin(disciplinaOfertasTable, eq(disciplinaOfertasTable.id, horariosAulasTable.disciplinaOfertaId))
  .leftJoin(disciplinasTable, eq(disciplinasTable.id, disciplinaOfertasTable.disciplinaId))
  .where(and(
    eq(matriculasTable.usuarioId, estudanteUsuarioId),  // ou inArray para múltiplos
    eq(matriculasTable.ativo, true),
    isNull(matriculasTable.deletadoEm),
  ));
```

**ATENÇÃO — colunas que NÃO existem em `horarios_aulas`:**
- ❌ `disciplinaId` → usar `disciplinaOfertaId → disciplinaOfertasTable → disciplinasTable`
- ❌ `laboratorio` → não existe no schema atual
- ❌ `deletadoEm` → não existe no schema atual

---

## Backend — Resolução do Estudante para pai_responsavel

```typescript
// Em GET /api/portal/dashboard e GET /api/portal-responsavel/dashboard:
// pai_responsavel não tem registro próprio em estudantes — buscar via responsaveis_estudantes
const vinculados = await db
  .select({ id: estudantesTable.id, usuarioId: estudantesTable.usuarioId, ... })
  .from(responsaveisEstudantesTable)
  .innerJoin(estudantesTable, eq(estudantesTable.id, responsaveisEstudantesTable.estudanteId))
  .where(and(eq(responsaveisEstudantesTable.usuarioId, usuarioId), isNull(estudantesTable.deletadoEm)));
```

---

## Frontend — Componentes em `dashboard.tsx`

### `DashboardResponsavel`

- Saudação com nome do responsável
- Para cada estudante: `EstudanteCard` com:
  - Foto circular + nome + turmaSigla + cursoNome
  - Badge de ocorrências pendentes
  - `QuadroHorariosWidget` (tabela grade horária)
  - `OcorrenciasWidget` (com botão de ciência — pai sempre pode)
- `CardapioWidget` compartilhado ao final
- `CalendarioMesWidget` ao final
- Estado vazio: card orientando a contatar a coordenação

### `DashboardEstudante`

- Saudação com nome do estudante
- `QuadroHorariosWidget` (largura total)
- Grid 2 cols: `OcorrenciasWidget` + `CardapioWidget`
- `CalendarioMesWidget`
- Atalho "Meu Perfil"

### `QuadroHorariosWidget`

Tabela HTML: linhas = horários únicos; colunas = dias (Seg–Sex).
- Chave do mapa: `"${dia}-${horaInicio.slice(0,5)}"`
- Dia atual destacado com `ring` no header + `bg-indigo-50/60` nas células
- Célula preenchida: pill colorido com disciplinaNome + sala
- Célula vazia: `—`
- Estado indisponível: mensagem "Em breve"

### `OcorrenciasWidget`

```tsx
function OcorrenciasWidget({ resumo, podeDarCiencia, onDarCiencia }) { ... }
```

- `podeDarCiencia = true` sempre para pai_responsavel; para estudante depende de `isMaior`
- Botão "Ciência (N)" chama `onDarCiencia(r.ids)` → Dialog de confirmação

---

## Regras de Acesso — Ciência

| Perfil | Pode dar ciência |
|---|---|
| Estudante < 18 (`isMaior = false`) | ❌ |
| Estudante ≥ 18 (`isMaior = true`) | ✅ |
| Pai/Responsável | ✅ sempre |

---

## Calendário do Mês — `CalendarioMesWidget`

```tsx
function CalendarioMesWidget({ hoje }: { hoje: string }) {
  const [ano, mes] = hoje.split("-").map(Number);
  const { data } = useQuery({ queryKey: ["calendario-dash", ano], queryFn: () => fetchJson(`/api/calendario?ano=${ano}`) });
  const mesData = data?.meses.find((m) => m.mes === mes);
  // grade 7 colunas, tooltip de eventos, link "Ver completo"
}
```

- `DashboardEstudante` e `DashboardResponsavel`: usam `data.hoje` do endpoint
- `DashboardAdmin`: chama `GET /api/hoje` para obter `hojeServer`

---

## Armadilha — Agenda do Responsável

Estudantes importados via CSV podem ter `estudantes.usuario_id = NULL`. Usar `matriculasTable.usuarioId` os exclui silenciosamente. A agenda do responsável deve ser buscada diretamente por `turmaId`:

```typescript
// CORRETO — não depende de usuarioId
const turmaIds = vinculados.map((e) => e.turmaId);
const aulas = await db.select({ turmaId: horariosAulasTable.turmaId, ... })
  .from(horariosAulasTable)
  .where(and(inArray(horariosAulasTable.turmaId, turmaIds), eq(...ano), eq(...semestre)));
// agendaMap keyed by estudanteId (não usuarioId)

// ERRADO — estudantes sem usuarioId somem da agenda
const ids = vinculados.map((e) => e.usuarioId).filter(Boolean);
await db.from(matriculasTable).where(inArray(matriculasTable.usuarioId, ids));
```

---

## Anti-padrões

- ❌ Usar `new Date()` no frontend para determinar o dia da semana — usar `dashboard.diaSemana`
- ❌ Buscar agenda do responsável via `matriculasTable.usuarioId` — estudantes importados têm `usuarioId = null`; usar `turmaId` de `estudantes` diretamente
- ❌ `horariosAulasTable.disciplinaId` — coluna inexistente; path correto: `disciplinaOfertaId → disciplinaOfertasTable → disciplinasTable`
- ❌ `horariosAulasTable.laboratorio` / `horariosAulasTable.deletadoEm` — colunas inexistentes
- ❌ Endpoint de ciência do responsável em `/api/portal/ocorrencias/:id/ciencia` (rota do estudante) — correto: `/api/portal-responsavel/ocorrencias/:id/ciencia`
- ❌ INNER JOIN em turmasTable/cursosTable no endpoint do responsável — usar LEFT JOIN (estudantes sem turma somem)
- ❌ `turmaTurnosTable` para exibir turno do estudante — retorna todos os turnos da turma; usar `matriculasTable.turnoId`
- ❌ Misturar ocorrências de estudantes distintos no portal do responsável
- ❌ Mostrar cardápio não publicado (`publicado = false`)
- ❌ Exibir botão de ciência para estudante com `isMaior = false`

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `artifacts/seshat/src/pages/dashboard.tsx` | `DashboardEstudante`, `DashboardResponsavel`, `DashboardAdmin`, todos os widgets |
| `artifacts/api-server/src/routes/portal-estudante.ts` | `GET /api/portal/dashboard` |
| `artifacts/api-server/src/routes/portal-responsavel.ts` | `GET /api/portal-responsavel/dashboard` |
| `lib/db/src/schema/horarios.ts` | Schema `horarios_aulas` (com `disciplinaOfertaId`, sem `disciplinaId`) |
| `lib/db/src/schema/cardapios.ts` | Schema `cardapios` |
| `.specs/features/dashboard-estudante-responsavel.md` | Spec completa |
