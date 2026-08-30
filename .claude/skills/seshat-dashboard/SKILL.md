# Skill: Dashboard — Estudante e Pai/Responsável

## Conceito

Dashboard é a **tela inicial** dos portais `/portal` (estudante) e `/portal-responsavel`. Consolida três widgets: ocorrências, agenda de aulas e cardápio da semana. O dia atual vem **sempre do servidor** (`hoje: string`).

---

## Shape dos Dados

### GET /api/portal/dashboard

```typescript
type DashboardEstudante = {
  hoje: string;         // "YYYY-MM-DD" — usar para destacar dia, nunca Date() do cliente
  diaSemana: number;    // 1=seg … 5=sex (0=dom/6=sab → nenhuma tab ativa)
  ocorrencias: {
    resumo: Array<{
      tipoId: string; tipoDescricao: string;
      total: number; semCiencia: number;
      ids: string[];    // IDs das ocorrências sem ciência (para o Dialog de ciência)
    }>;
    totalGeral: number;
  };
  agenda: Array<{       // sempre 5 itens: um por dia útil
    dia: number; diaNome: string;
    aulas: Array<{ horaInicio: string; horaFim: string; disciplinaNome: string; sala: string | null; laboratorio: string | null }>;
  }>;
  cardapio: Array<{     // dias com cardápio publicado (pode ser < 5)
    dia: number; diaNome: string; data: string;
    itens: Array<{ refeicao: string; descricao: string }>;
  }>;
};
```

### GET /api/portal-responsavel/dashboard

```typescript
type DashboardResponsavel = {
  hoje: string; diaSemana: number;
  estudantes: Array<{
    id: string; nome: string; fotoUrl: string | null;
    ocorrencias: DashboardEstudante["ocorrencias"];
    agenda: DashboardEstudante["agenda"];
    cardapio: DashboardEstudante["cardapio"];
  }>;
};
```

---

## Backend — Lógica de Construção

### Hoje e semana corrente

```typescript
const hoje = new Date();
const hojeStr = hoje.toISOString().substring(0, 10);   // "YYYY-MM-DD"
const diaSemana = hoje.getDay() === 0 ? 7 : hoje.getDay(); // ISO: 1=seg…7=dom

// Limites da semana (seg a sex)
const seg = new Date(hoje);
seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));  // segunda
const sex = new Date(seg);
sex.setDate(seg.getDate() + 4);                           // sexta
const semanaInicio = seg.toISOString().substring(0, 10);
const semanaFim    = sex.toISOString().substring(0, 10);
```

### Ocorrências agrupadas por tipo

```typescript
const ocrs = await db
  .select({ id: ocorrenciasTable.id, tipoId: ocorrenciasTable.tipoOcorrenciaId,
            tipoDesc: tiposOcorrenciasTable.descricao, cienteEm: ocorrenciasTable.cienteEm })
  .from(ocorrenciasTable)
  .innerJoin(tiposOcorrenciasTable, eq(ocorrenciasTable.tipoOcorrenciaId, tiposOcorrenciasTable.id))
  .where(and(eq(ocorrenciasTable.estudanteId, estudanteId), isNull(ocorrenciasTable.deletadoEm)));

const map = new Map<string, { tipoDescricao: string; total: number; semCiencia: number; ids: string[] }>();
for (const o of ocrs) {
  if (!map.has(o.tipoId)) map.set(o.tipoId, { tipoDescricao: o.tipoDesc ?? "", total: 0, semCiencia: 0, ids: [] });
  const g = map.get(o.tipoId)!;
  g.total++;
  if (!o.cienteEm) { g.semCiencia++; g.ids.push(o.id); }
}
const resumo = Array.from(map.entries()).map(([tipoId, v]) => ({ tipoId, ...v }));
```

### Agenda semanal (horarios_aulas)

```typescript
// JOIN: matriculas → turmas → horarios_aulas → disciplinas
const aulas = await db
  .select({
    dia: horariosAulasTable.diaSemana,
    horaInicio: horariosAulasTable.horaInicio,
    horaFim: horariosAulasTable.horaFim,
    disciplinaNome: disciplinasTable.nome,
    sala: horariosAulasTable.sala,
    laboratorio: horariosAulasTable.laboratorio,
  })
  .from(matriculasTable)
  .innerJoin(horariosAulasTable, eq(horariosAulasTable.turmaId, matriculasTable.turmaId))
  .innerJoin(disciplinasTable, eq(horariosAulasTable.disciplinaId, disciplinasTable.id))
  .where(and(eq(matriculasTable.usuarioId, usuarioId), eq(matriculasTable.ativo, true), isNull(matriculasTable.deletadoEm)));

// Agrupar por dia
const DIA_NOME = ["", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];
const agenda = [1, 2, 3, 4, 5].map((dia) => ({
  dia, diaNome: DIA_NOME[dia],
  aulas: aulas.filter(a => a.dia === dia).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio)),
}));
```

### Cardápio da semana

```typescript
const cardapioRows = await db
  .select()
  .from(cardapiosTable)
  .where(and(
    gte(cardapiosTable.data, semanaInicio),
    lte(cardapiosTable.data, semanaFim),
    eq(cardapiosTable.publicado, true),
  ))
  .orderBy(cardapiosTable.data, cardapiosTable.refeicao);

// Agrupar por dia
const cardapioMap = new Map<number, { data: string; itens: {refeicao:string; descricao:string}[] }>();
for (const c of cardapioRows) {
  const d = new Date(c.data + "T12:00:00");
  const dia = d.getDay() === 0 ? 7 : d.getDay();
  if (!cardapioMap.has(dia)) cardapioMap.set(dia, { data: c.data, itens: [] });
  cardapioMap.get(dia)!.itens.push({ refeicao: c.refeicao, descricao: c.descricao });
}
const cardapio = [1, 2, 3, 4, 5]
  .filter(d => cardapioMap.has(d))
  .map(d => ({ dia: d, diaNome: DIA_NOME[d], ...cardapioMap.get(d)! }));
```

---

## Frontend — Componentes

### `SaudacaoHeader`

```tsx
function SaudacaoHeader({ nome, fotoUrl, hoje }: { nome: string; fotoUrl: string | null; hoje: string }) {
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const dataFmt = new Date(hoje + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
  });
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-sky-50 to-indigo-50 p-4 border border-sky-100">
      {fotoUrl
        ? <img src={fotoUrl} className="w-10 h-10 rounded-full object-cover ring-2 ring-sky-200" />
        : <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500"><UserCircle size={24}/></div>}
      <div>
        <p className="text-sm text-slate-500">{saudacao},</p>
        <p className="font-semibold text-slate-800">{nome} · <span className="font-normal capitalize">{dataFmt}</span></p>
      </div>
    </div>
  );
}
```

### `OcorrenciasWidget`

```tsx
function OcorrenciasWidget({ resumo, isMaior, isPaiResponsavel, onDarCiencia }) {
  const podeDarCiencia = isMaior || isPaiResponsavel;
  if (resumo.length === 0)
    return <EmptyState icon="🎉" msg="Nenhuma ocorrência registrada" />;

  return (
    <div className="space-y-2">
      {resumo.map(r => (
        <div key={r.tipoId} className="flex items-center justify-between rounded-xl border px-4 py-3 bg-white shadow-sm">
          <div>
            <p className="font-medium text-slate-700">{r.tipoDescricao}</p>
            <p className="text-xs text-slate-400">{r.total} ocorrência{r.total !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={r.semCiencia > 0 ? "destructive" : "secondary"}>
              {r.total}
            </Badge>
            {podeDarCiencia && r.semCiencia > 0 && (
              <Button size="sm" variant="outline" onClick={() => onDarCiencia(r.ids)}>
                Ciência ({r.semCiencia})
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### `AgendaSemanaWidget` / `CardapioSemanaWidget`

```tsx
// Tabs de dias da semana — padrão compartilhado para agenda e cardápio
const DIAS = [
  { dia: 1, label: "Seg" }, { dia: 2, label: "Ter" }, { dia: 3, label: "Qua" },
  { dia: 4, label: "Qui" }, { dia: 5, label: "Sex" },
];

function DiaTabs({ diaSemana, children }) {
  const [aba, setAba] = useState<number>(diaSemana >= 1 && diaSemana <= 5 ? diaSemana : 1);
  return (
    <div>
      <div className="flex gap-1 mb-3">
        {DIAS.map(d => (
          <button key={d.dia} onClick={() => setAba(d.dia)}
            className={cn(
              "px-3 py-1 rounded-full text-sm font-medium transition-colors",
              aba === d.dia
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200",
              d.dia === diaSemana && aba !== d.dia && "ring-1 ring-indigo-300",
            )}>
            {d.label}{d.dia === diaSemana ? " ★" : ""}
          </button>
        ))}
      </div>
      {children(aba)}
    </div>
  );
}
```

> O `★` na aba indica o dia de hoje — mesmo que o usuário navegue para outro dia, o indicador permanece.

---

## Regras de Acesso — Ciência

```typescript
// OcorrenciasWidget — quem pode dar ciência
const podeDarCiencia = me.usuario.isMaior || perfil === "pai_responsavel";
```

| Perfil | `isMaior` | Pode dar ciência |
|---|---|---|
| Estudante < 18 | `false` | ❌ |
| Estudante ≥ 18 | `true` | ✅ |
| Pai/Responsável | (não se aplica) | ✅ sempre |

---

## Schema — Tabelas Novas

### `horarios_aulas`

```typescript
// lib/db/src/schema/horarios-aulas.ts
export const horariosAulasTable = pgTable("horarios_aulas", {
  id:           uuid("id").primaryKey().defaultRandom(),
  turmaId:      uuid("turma_id").notNull().references(() => turmasTable.id),
  disciplinaId: uuid("disciplina_id").notNull().references(() => disciplinasTable.id),
  turnoId:      uuid("turno_id").references(() => turnosTable.id),
  diaSemana:    smallint("dia_semana").notNull(),  // 1=seg … 5=sex
  horaInicio:   time("hora_inicio").notNull(),
  horaFim:      time("hora_fim").notNull(),
  sala:         varchar("sala", { length: 50 }),
  laboratorio:  varchar("laboratorio", { length: 100 }),
  criadoEm:     timestamp("criado_em", { withTimezone: true }).defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow(),
  deletadoEm:   timestamp("deletado_em", { withTimezone: true }),
});
```

### `cardapios`

```typescript
// lib/db/src/schema/cardapios.ts
export const cardapiosTable = pgTable("cardapios", {
  id:          uuid("id").primaryKey().defaultRandom(),
  data:        date("data").notNull(),
  refeicao:    varchar("refeicao", { length: 50 }).notNull(),  // "Almoço", "Lanche"
  descricao:   text("descricao").notNull(),
  publicado:   boolean("publicado").notNull().default(false),
  criadoPor:   uuid("criado_por").references(() => usuariosTable.id),
  criadoEm:    timestamp("criado_em", { withTimezone: true }).defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow(),
}, (t) => ({
  uqDataRefeicao: uniqueIndex("uq_cardapio_data_refeicao").on(t.data, t.refeicao),
}));
```

---

## Anti-padrões

- ❌ Usar `new Date()` no frontend para determinar o dia da semana — usar `dashboard.diaSemana`
- ❌ Mostrar botão de ciência para estudante com `isMaior = false`
- ❌ Exibir cardápio não publicado (`publicado = false`) nos portais
- ❌ Misturar ocorrências de estudantes distintos no portal do responsável
- ❌ Calcular semana corrente no frontend — o backend envia `hoje` + itens da semana filtrados

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/horarios-aulas.ts` | Schema `horarios_aulas` |
| `lib/db/src/schema/cardapios.ts` | Schema `cardapios` |
| `artifacts/api-server/src/routes/portal-estudante.ts` | `GET /api/portal/dashboard` |
| `artifacts/api-server/src/routes/portal-responsavel.ts` | `GET /api/portal-responsavel/dashboard` |
| `artifacts/api-server/src/routes/cardapio.ts` | CRUD + `GET /api/cardapio/semana` |
| `artifacts/api-server/src/routes/horarios-aulas.ts` | CRUD admin de horários |
| `artifacts/seshat/src/pages/portal/index.tsx` | `DashboardEstudante` |
| `artifacts/seshat/src/pages/portal-responsavel/index.tsx` | `DashboardResponsavel` |
| `artifacts/seshat/src/components/dashboard/` | `SaudacaoHeader`, `OcorrenciasWidget`, `DiaTabs`, `AgendaSemanaWidget`, `CardapioSemanaWidget` |
| `scripts/migrate-dashboard.sql` | DDL `horarios_aulas` + `cardapios` |
| `.specs/features/dashboard-estudante-responsavel.md` | Spec completa |
