# Skill: Calendário Pedagógico

## Status: Implementado

## Conceito

### Arquivos implementados

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/calendario.ts` | Schema Drizzle: `calendarioSemestresTable` + `calendarioDiasTable` |
| `artifacts/api-server/src/lib/calendario-categorias.ts` | `getCor()`, `getIcone()`, `CATEGORIAS_CONFIG` |
| `artifacts/api-server/src/lib/seedf-2026.ts` | `CALENDARIO_SEEDF_2026` + `SEMESTRES_SEEDF_2026` |
| `artifacts/api-server/src/routes/calendario.ts` | CRUD completo + `POST /importar-seedf` |
| `artifacts/api-server/src/index.ts` | Registra `/api/calendario` |
| `artifacts/seshat/src/pages/calendario/index.tsx` | Grade anual 12 meses, seleção múltipla, modais |
| `artifacts/seshat/src/App.tsx` | Rota `/calendario` |
| `artifacts/seshat/src/components/layout.tsx` | Menu "Calendário Escolar" no grupo "Calendário" |
| `scripts/migrate-calendario.sql` | DDL das duas tabelas |

### Menu

```
Grupo: "Modulação"  (canManageGeral — turmas:manage | cursos:manage | turnos:manage)
└── "Calendário Escolar" → /calendario   (visível só se canManageCalendario = hasAny("calendario:manage"))
```

O item está dentro do grupo Modulação — não existe grupo separado "Calendário".

### UI implementada

- **Grade anual**: 12 meses em grid 4 colunas, célula por dia com ícones de evento
- **Navegação de ano**: botões ◀ ▶ + label central
- **SemestreBar**: exibe início/fim dos semestres; botão "Configurar" abre inputs inline para edição
- **Legenda**: todas as 9 categorias com cor e ícone
- **Seleção de dias**:
  - Clique simples → abre `EventoModal` diretamente
  - Ctrl+Clique → toggle de seleção múltipla
  - Shift+Clique → seleciona range de datas
  - Barra flutuante no rodapé quando múltiplos dias selecionados
- **EventoModal**: seleção de categoria, título, descrição; suporta criar (N datas) ou editar (1 evento)
  - Ao trocar categoria: emoji reverte para o padrão da nova categoria (`handleCategoriaChange`)
  - Emoji personalizado: somente visível após marcar checkbox "Personalizar ícone emoji"
  - `iconeOverride` (valor bruto do banco) determina se o checkbox inicia marcado
  - Salvar envia `icone: null` quando sem personalização → backend usa `getIcone(categoria, null)`
- **GET `/api/calendario`**: retorna `icone` (resolvido) e `iconeOverride` (bruto, null = sem override)
- **ImportarModal**: preview + confirmação antes de importar SEEDF 2026
- Dias fora dos semestres: fundo opaco e opacidade reduzida
- Dia atual: borda indigo + ponto indicador
- Dias selecionados: fundo indigo claro com ring

Calendário escolar anual com dois semestres, categorias por dia (feriado, letivo, recesso, evento…), seleção múltipla de dias e importação do Calendário SEEDF pré-definido. Baseado no Calendário Escolar 2026 e Agenda Pedagógica 2º Semestre 2026 da SEEDF.

---

## Schema — Drizzle ORM

```typescript
// lib/db/src/schema/calendario.ts
import { pgTable, uuid, integer, smallint, date, varchar, text, boolean, timestamp, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { usuariosTable } from "./usuarios";

export const calendarioSemestresTable = pgTable("calendario_semestres", {
  id:       uuid("id").primaryKey().defaultRandom(),
  ano:      integer("ano").notNull(),
  semestre: smallint("semestre").notNull(),
  inicio:   date("inicio").notNull(),
  fim:      date("fim").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow(),
}, (t) => ({
  uqAnoSem: uniqueIndex("uq_calendario_ano_semestre").on(t.ano, t.semestre),
}));

const CATEGORIAS = ['letivo','feriado_nacional','feriado_distrital','recesso',
  'evento','formacao','atividade_pedagogica','nao_letivo','semana_pedagogica'] as const;
export type CategoriaCalendario = typeof CATEGORIAS[number];

export const calendarioDiasTable = pgTable("calendario_dias", {
  id:           uuid("id").primaryKey().defaultRandom(),
  data:         date("data").notNull(),
  categoria:    varchar("categoria", { length: 30 }).notNull().default("letivo"),
  titulo:       varchar("titulo", { length: 200 }),
  descricao:    text("descricao"),
  corOverride:  varchar("cor_override", { length: 7 }),
  icone:        varchar("icone", { length: 10 }),
  criadoPor:    uuid("criado_por").references(() => usuariosTable.id),
  criadoEm:     timestamp("criado_em", { withTimezone: true }).defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow(),
}, (t) => ({
  idxData: index("idx_calendario_dias_data").on(t.data),
}));
```

---

## Cores e Ícones por Categoria

```typescript
// artifacts/api-server/src/lib/calendario-categorias.ts
export const CATEGORIAS_CONFIG: Record<string, { cor: string; icone: string; label: string }> = {
  letivo:               { cor: "#4ade80", icone: "📗", label: "Dia letivo" },
  feriado_nacional:     { cor: "#f87171", icone: "🇧🇷", label: "Feriado nacional" },
  feriado_distrital:    { cor: "#fb923c", icone: "🏛️", label: "Feriado distrital" },
  recesso:              { cor: "#fbbf24", icone: "☀️", label: "Recesso / Férias" },
  evento:               { cor: "#60a5fa", icone: "📅", label: "Evento escolar" },
  formacao:             { cor: "#a78bfa", icone: "📚", label: "Formação de professores" },
  atividade_pedagogica: { cor: "#f472b6", icone: "🎓", label: "Atividade pedagógica" },
  nao_letivo:           { cor: "#94a3b8", icone: "🚫", label: "Dia não letivo" },
  semana_pedagogica:    { cor: "#c084fc", icone: "🗓️", label: "Semana pedagógica" },
};

export function getCor(categoria: string, override?: string | null): string {
  return override ?? CATEGORIAS_CONFIG[categoria]?.cor ?? "#e5e7eb";
}
```

---

## Dados SEEDF 2026 (constante embutida)

```typescript
// artifacts/api-server/src/lib/seedf-2026.ts
export type EntradaCalendario = {
  data: string;           // "YYYY-MM-DD"
  categoria: string;
  titulo: string;
  descricao?: string;
};

export const CALENDARIO_SEEDF_2026: EntradaCalendario[] = [
  // ── Semana Pedagógica 1º Semestre ──────────────────────────────────
  { data: "2026-01-26", categoria: "semana_pedagogica", titulo: "Semana Pedagógica", descricao: "Planejamento 1º Semestre" },
  { data: "2026-01-27", categoria: "semana_pedagogica", titulo: "Semana Pedagógica", descricao: "Planejamento 1º Semestre" },
  { data: "2026-01-28", categoria: "semana_pedagogica", titulo: "Semana Pedagógica", descricao: "Planejamento 1º Semestre" },
  { data: "2026-01-29", categoria: "semana_pedagogica", titulo: "Semana Pedagógica", descricao: "Planejamento 1º Semestre" },
  { data: "2026-01-30", categoria: "semana_pedagogica", titulo: "Semana Pedagógica + São Sebastião", descricao: "Feriado Distrital" },

  // ── Feriados Nacionais fixos 2026 ──────────────────────────────────
  { data: "2026-01-01", categoria: "feriado_nacional",  titulo: "Confraternização Universal" },
  { data: "2026-01-30", categoria: "feriado_distrital", titulo: "São Sebastião (DF)" },
  { data: "2026-02-16", categoria: "recesso",           titulo: "Carnaval", descricao: "Recesso Carnaval" },
  { data: "2026-02-17", categoria: "recesso",           titulo: "Carnaval", descricao: "Recesso Carnaval" },
  { data: "2026-02-18", categoria: "feriado_nacional",  titulo: "Quarta de Cinzas" },
  { data: "2026-04-02", categoria: "recesso",           titulo: "Pré-Páscoa", descricao: "Recesso escolar" },
  { data: "2026-04-03", categoria: "feriado_nacional",  titulo: "Sexta-Feira Santa" },
  { data: "2026-04-04", categoria: "recesso",           titulo: "Recesso Páscoa" },
  { data: "2026-04-05", categoria: "recesso",           titulo: "Recesso Páscoa" },
  { data: "2026-04-06", categoria: "recesso",           titulo: "Recesso Páscoa" },
  { data: "2026-04-21", categoria: "feriado_nacional",  titulo: "Tiradentes" },
  { data: "2026-05-01", categoria: "feriado_nacional",  titulo: "Dia do Trabalhador" },
  { data: "2026-06-04", categoria: "feriado_nacional",  titulo: "Corpus Christi" },
  { data: "2026-07-12", categoria: "recesso",           titulo: "Início Recesso Julho", descricao: "Recesso escolar 1º semestre" },
  { data: "2026-07-13", categoria: "recesso",           titulo: "Recesso Julho" },
  { data: "2026-07-14", categoria: "recesso",           titulo: "Recesso Julho" },
  { data: "2026-07-15", categoria: "recesso",           titulo: "Recesso Julho" },
  { data: "2026-07-16", categoria: "recesso",           titulo: "Recesso Julho" },
  { data: "2026-07-17", categoria: "recesso",           titulo: "Recesso Julho" },
  { data: "2026-07-18", categoria: "recesso",           titulo: "Recesso Julho" },
  { data: "2026-07-19", categoria: "recesso",           titulo: "Recesso Julho" },
  { data: "2026-07-20", categoria: "recesso",           titulo: "Recesso Julho" },
  { data: "2026-07-21", categoria: "recesso",           titulo: "Recesso Julho" },
  { data: "2026-07-22", categoria: "recesso",           titulo: "Recesso Julho" },
  { data: "2026-07-23", categoria: "recesso",           titulo: "Recesso Julho" },
  { data: "2026-07-24", categoria: "recesso",           titulo: "Recesso Julho" },
  { data: "2026-07-25", categoria: "recesso",           titulo: "Recesso Julho" },
  { data: "2026-07-26", categoria: "recesso",           titulo: "Recesso Julho" },
  { data: "2026-07-27", categoria: "recesso",           titulo: "Recesso Julho" },
  { data: "2026-07-28", categoria: "recesso",           titulo: "Recesso Julho" },
  { data: "2026-07-29", categoria: "recesso",           titulo: "Recesso Julho" },
  { data: "2026-07-30", categoria: "recesso",           titulo: "Recesso Julho" },
  { data: "2026-07-31", categoria: "recesso",           titulo: "Recesso Julho" },

  // ── Semana Pedagógica 2º Semestre ──────────────────────────────────
  { data: "2026-08-03", categoria: "semana_pedagogica", titulo: "Semana Pedagógica 2º Sem.", descricao: "Planejamento e formação" },
  { data: "2026-08-04", categoria: "semana_pedagogica", titulo: "Semana Pedagógica 2º Sem." },
  { data: "2026-08-05", categoria: "semana_pedagogica", titulo: "Semana Pedagógica 2º Sem." },
  { data: "2026-08-06", categoria: "semana_pedagogica", titulo: "Semana Pedagógica 2º Sem." },
  { data: "2026-08-07", categoria: "semana_pedagogica", titulo: "Semana Pedagógica 2º Sem." },

  // ── Agenda Pedagógica 2º Semestre 2026 ────────────────────────────
  { data: "2026-08-10", categoria: "atividade_pedagogica", titulo: "Acolhimento de estudantes", descricao: "Retomada das atividades — 1ª semana" },
  { data: "2026-08-17", categoria: "atividade_pedagogica", titulo: "Diagnóstico inicial", descricao: "Sondagem de aprendizagem — 2ª semana" },

  // ── Feriados 2º Semestre ───────────────────────────────────────────
  { data: "2026-09-07", categoria: "feriado_nacional",  titulo: "Independência do Brasil" },
  { data: "2026-10-12", categoria: "feriado_nacional",  titulo: "Nossa Senhora Aparecida" },
  { data: "2026-10-19", categoria: "recesso",           titulo: "Início Recesso Outubro" },
  { data: "2026-10-20", categoria: "recesso",           titulo: "Recesso Outubro" },
  { data: "2026-10-21", categoria: "recesso",           titulo: "Recesso Outubro" },
  { data: "2026-10-22", categoria: "recesso",           titulo: "Recesso Outubro" },
  { data: "2026-10-23", categoria: "recesso",           titulo: "Fim Recesso Outubro" },
  { data: "2026-11-02", categoria: "feriado_nacional",  titulo: "Finados" },
  { data: "2026-11-15", categoria: "feriado_nacional",  titulo: "Proclamação da República" },
  { data: "2026-11-20", categoria: "feriado_nacional",  titulo: "Consciência Negra" },
  { data: "2026-11-30", categoria: "feriado_distrital", titulo: "Dia do Evangélico (DF)" },
  { data: "2026-12-08", categoria: "nao_letivo",        titulo: "Ponto facultativo" },
  { data: "2026-12-19", categoria: "atividade_pedagogica", titulo: "Último dia letivo 2º Semestre", descricao: "Encerramento do ano letivo 2026" },
  { data: "2026-12-21", categoria: "recesso",           titulo: "Início Recesso Final" },
  { data: "2026-12-25", categoria: "feriado_nacional",  titulo: "Natal" },
  { data: "2026-12-31", categoria: "recesso",           titulo: "Recesso Final" },
];

export const SEMESTRES_SEEDF_2026 = [
  { semestre: 1 as const, inicio: "2026-02-02", fim: "2026-07-11" },
  { semestre: 2 as const, inicio: "2026-08-10", fim: "2026-12-19" },
];
```

---

## Backend — Endpoint de Importação

```typescript
// POST /api/calendario/importar-seedf
router.post("/importar-seedf", requirePermissao("calendario:manage"), async (req, res) => {
  const { ano } = z.object({ ano: z.number().int().min(2024).max(2030) }).parse(req.body);
  
  if (ano !== 2026) return res.status(400).json({ error: "Apenas 2026 disponível para importação automática." });

  const dados = CALENDARIO_SEEDF_2026;
  let importados = 0, atualizados = 0;

  for (const d of dados) {
    const result = await db.insert(calendarioDiasTable)
      .values({ data: d.data, categoria: d.categoria, titulo: d.titulo, descricao: d.descricao })
      .onConflictDoUpdate({
        // Sem UNIQUE em (data, categoria) — usar insert sem conflito ou verificar antes
        target: [calendarioDiasTable.id],
        set: { titulo: d.titulo, descricao: d.descricao, atualizadoEm: new Date() },
      })
      .returning({ id: calendarioDiasTable.id });
    importados++;
  }

  // Semestres
  for (const s of SEMESTRES_SEEDF_2026) {
    await db.insert(calendarioSemestresTable)
      .values({ ano, semestre: s.semestre, inicio: s.inicio, fim: s.fim })
      .onConflictDoUpdate({
        target: [calendarioSemestresTable.id],
        set: { inicio: s.inicio, fim: s.fim, atualizadoEm: new Date() },
      });
  }

  res.json({ ok: true, importados, message: `${importados} eventos importados para ${ano}` });
});
```

---

## Frontend — CalendarioMes

```tsx
// artifacts/seshat/src/components/calendario/CalendarioMes.tsx

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
               "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function CalendarioMes({ ano, mes, dias, selecionados, onSelect, onDblClick }: Props) {
  const primeiroDia = new Date(ano, mes - 1, 1).getDay(); // 0=dom
  const totalDias = new Date(ano, mes, 0).getDate();

  return (
    <div className="rounded-xl border border-border/50 bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 border-b font-semibold text-sm text-slate-700">
        {MESES[mes - 1]}
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] text-slate-400 py-1 border-b">
        {["D","S","T","Q","Q","S","S"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-px p-1">
        {Array.from({ length: primeiroDia }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: totalDias }, (_, i) => i + 1).map((dia) => {
          const dataStr = `${ano}-${String(mes).padStart(2,"0")}-${String(dia).padStart(2,"0")}`;
          const eventos = dias[dataStr] ?? [];
          const dSemana = new Date(dataStr + "T12:00:00").getDay();
          const fds = dSemana === 0 || dSemana === 6;
          const sel = selecionados.includes(dataStr);

          return (
            <CalendarioDia key={dia} dia={dia} dataStr={dataStr} eventos={eventos}
              fimDeSemana={fds} selecionado={sel}
              onClick={() => onSelect(dataStr)}
              onDoubleClick={() => onDblClick(dataStr)} />
          );
        })}
      </div>
    </div>
  );
}
```

---

## Frontend — CalendarioDia

```tsx
function CalendarioDia({ dia, dataStr, eventos, fimDeSemana, selecionado, onClick, onDoubleClick }) {
  const hoje = new Date().toISOString().substring(0, 10);
  const isHoje = dataStr === hoje;

  // Prioridade: evento de maior relevância define o fundo
  const corFundo = eventos[0]
    ? getCor(eventos[0].categoria, eventos[0].corOverride) + "33"  // 20% opacidade
    : fimDeSemana ? "#f1f5f9" : "white";

  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={eventos.map(e => e.titulo).join(" | ")}
      className="relative flex flex-col items-center rounded p-0.5 transition-all hover:scale-105"
      style={{
        background: corFundo,
        outline: isHoje ? "2px solid #6366f1" : selecionado ? "2px dashed #6366f1" : undefined,
        outlineOffset: "-1px",
      }}
    >
      <span className={cn(
        "text-[11px] font-semibold",
        fimDeSemana ? "text-slate-400" : "text-slate-700",
        eventos.length > 0 && "font-bold",
      )}>
        {dia}
      </span>
      <div className="flex gap-0.5 flex-wrap justify-center">
        {eventos.slice(0, 3).map((e, i) => (
          <span key={i} className="text-[10px] leading-none">{e.icone ?? "📅"}</span>
        ))}
        {eventos.length > 3 && <span className="text-[8px] text-slate-400">+{eventos.length - 3}</span>}
      </div>
    </button>
  );
}
```

---

## Frontend — Barra de Seleção Múltipla

```tsx
// Aparece na base da tela quando há seleção ativa
function BarraSelecionados({ count, onClear, onAdicionar }: { count: number; onClear(): void; onAdicionar(): void }) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-full border bg-white shadow-lg px-5 py-2.5 z-50">
      <span className="text-sm font-medium">{count} dia{count !== 1 ? "s" : ""} selecionado{count !== 1 ? "s" : ""}</span>
      <Button size="sm" variant="ghost" onClick={onClear}>Limpar</Button>
      <Button size="sm" onClick={onAdicionar}>Adicionar evento</Button>
    </div>
  );
}
```

---

## Anti-padrões

- ❌ Calcular feriados móveis (Carnaval, Páscoa, Corpus Christi) no frontend — usar os dados do banco
- ❌ UNIQUE em `(data)` — uma data pode ter múltiplos eventos de categorias diferentes
- ❌ Importar sem confirmação prévia (preview) — sempre mostrar resumo antes de importar
- ❌ Marcar sábado/domingo como letivo sem aviso — mostrar `AlertDialog` de confirmação
- ❌ Omitir `cor_override` — coordenadores podem precisar de cor personalizada por evento

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/calendario.ts` | Schema Drizzle ORM |
| `artifacts/api-server/src/lib/seedf-2026.ts` | `CALENDARIO_SEEDF_2026` + `SEMESTRES_SEEDF_2026` |
| `artifacts/api-server/src/lib/calendario-categorias.ts` | `CATEGORIAS_CONFIG`, `getCor()` |
| `artifacts/api-server/src/routes/calendario.ts` | CRUD + `POST /importar-seedf` |
| `artifacts/seshat/src/pages/calendario/index.tsx` | Página principal com seletor de ano |
| `artifacts/seshat/src/components/calendario/CalendarioMes.tsx` | Grade mensal |
| `artifacts/seshat/src/components/calendario/CalendarioDia.tsx` | Célula de dia |
| `artifacts/seshat/src/components/calendario/EventoModal.tsx` | Modal criação/edição |
| `artifacts/seshat/src/components/calendario/ImportacaoModal.tsx` | Preview + confirmação SEEDF |
| `scripts/migrate-calendario.sql` | DDL |
| `.specs/features/calendario-pedagogico.md` | Spec completa |
