# Spec: Calendário Pedagógico — Agenda Escolar

**Status:** Spec aprovada — implementação pendente

---

## Objetivo

Gerenciar o calendário escolar anual da instituição: datas letivas, feriados, eventos, atividades pedagógicas e início/fim de semestres. Serve como fonte de referência para estudantes, responsáveis e equipe pedagógica. Baseado no Calendário Escolar SEEDF 2026 e na Agenda Pedagógica 2º Semestre 2026.

---

## Regras de Negócio

### Estrutura do Ano Letivo

- **Seleção de ano:** o sistema permite selecionar o ano desejado (criação, consulta, edição, exclusão)
- **Dois semestres por ano:** cada ano letivo é dividido em 1º e 2º semestre, com datas de início e fim configuráveis
- **Cada dia pode ter zero ou mais eventos** — a mesma data pode conter múltiplas entradas (feriado + atividade, por exemplo)

### Tipos de Dia / Categoria

| Código | Nome | Cor de apresentação | Ícone |
|---|---|---|---|
| `letivo` | Dia letivo normal | `#4ade80` (verde) | 📗 |
| `feriado_nacional` | Feriado nacional | `#f87171` (vermelho) | 🇧🇷 |
| `feriado_distrital` | Feriado distrital/regional | `#fb923c` (laranja-avermelhado) | 🏛️ |
| `recesso` | Recesso / Férias | `#fbbf24` (amarelo) | ☀️ |
| `evento` | Evento escolar | `#60a5fa` (azul) | 📅 |
| `formacao` | Formação de professores | `#a78bfa` (roxo) | 📚 |
| `atividade_pedagogica` | Atividade pedagógica especial | `#f472b6` (rosa) | 🎓 |
| `nao_letivo` | Dia não letivo administrativo | `#94a3b8` (cinza-azul) | 🚫 |
| `semana_pedagogica` | Semana pedagógica / Planejamento | `#c084fc` (violeta) | 🗓️ |

### Seleção de Dias

- **Seleção simples:** clicar em um dia abre o modal de edição
- **Seleção múltipla:** arrastar sobre o calendário ou Ctrl+clique seleciona múltiplos dias
- **Range de datas:** selecionar início e fim preenche todos os dias intermediários (exceto fins de semana, configurável)
- Ao confirmar, a mesma informação é aplicada a todos os dias selecionados

### Início e Fim de Semestre

- Cada semestre registra: `inicioSemestre (date)`, `fimSemestre (date)`, `ano (int)`, `semestre (1|2)`
- Dias fora do período letivo são automaticamente marcados como não letivos (UI mostra em cinza claro)
- A data de início/fim é configurável separadamente dos eventos de cada dia

### Importação do Calendário SEEDF

- Endpoint `POST /api/calendario/importar-seedf` recebe `{ ano: number }` e popula o banco com os dados pré-definidos do Calendário SEEDF para aquele ano
- Os dados SEEDF 2026 estão embutidos no código como constante `CALENDARIO_SEEDF_2026`
- A importação usa `ON CONFLICT DO UPDATE` (idempotente — pode ser re-executada)
- Antes da importação, exibe preview com contagem por categoria para confirmação

### Feriados Nacionais (fixos — automáticos)

| Data | Nome |
|---|---|
| 01/01 | Confraternização Universal |
| 21/04 | Tiradentes |
| 01/05 | Dia do Trabalhador |
| 07/09 | Independência do Brasil |
| 12/10 | Nossa Senhora Aparecida |
| 02/11 | Finados |
| 15/11 | Proclamação da República |
| 25/12 | Natal |
| Variável | Carnaval (segunda e terça) |
| Variável | Sexta-feira Santa |
| Variável | Corpus Christi |

### Feriados Distritais — DF (fixos)

| Data | Nome |
|---|---|
| 30/01 | Dia de São Sebastião (padroeiro do DF) |
| 07/04 | Fundação de Brasília — **não é feriado oficial** (ponto facultativo) |
| 30/11 | Dia do Evangélico |

---

## Calendário SEEDF 2026 (dados embutidos)

### Datas-chave 2026

| Período | Datas |
|---|---|
| Semana Pedagógica 1º Sem. | 26/01 a 30/01/2026 |
| Início 1º Semestre | 02/02/2026 |
| Carnaval (recesso) | 16/02 a 20/02/2026 |
| Recesso Páscoa | 02/04 a 06/04/2026 |
| Fim 1º Semestre | 11/07/2026 |
| Recesso Julho | 13/07 a 31/07/2026 |
| Semana Pedagógica 2º Sem. | 03/08 a 07/08/2026 |
| Início 2º Semestre | 10/08/2026 |
| Recesso Outubro | 19/10 a 23/10/2026 |
| Fim 2º Semestre | 19/12/2026 |
| Recesso Final | 21/12/2026 a 31/12/2026 |

### Eventos Agenda Pedagógica 2º Semestre 2026 (modelo)

| Semana | Período | Atividade |
|---|---|---|
| 1ª | 10/08 a 14/08 | Acolhimento de estudantes — retomada das atividades |
| 2ª | 17/08 a 21/08 | Diagnóstico inicial — sondagem de aprendizagem |
| 3ª | 24/08 a 28/08 | Atividades curriculares regulares |
| … | … | … |
| — | 07/09 | Feriado — Independência do Brasil |
| — | 12/10 | Feriado — Nossa Senhora Aparecida |
| — | 19/10 a 23/10 | Recesso escolar |
| — | 02/11 | Feriado — Finados |
| — | 15/11 | Feriado — Proclamação da República |
| — | 30/11 | Feriado Distrital — Dia do Evangélico |
| — | 19/12 | Último dia letivo 2º semestre |

---

## Banco de Dados

### Tabela `calendario_semestres`

```sql
CREATE TABLE calendario_semestres (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano           integer NOT NULL,
  semestre      smallint NOT NULL CHECK (semestre IN (1, 2)),
  inicio        date NOT NULL,
  fim           date NOT NULL,
  criado_em     timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  UNIQUE (ano, semestre)
);
```

### Tabela `calendario_dias`

```sql
CREATE TABLE calendario_dias (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data          date NOT NULL,
  categoria     varchar(30) NOT NULL DEFAULT 'letivo',
  titulo        varchar(200),
  descricao     text,
  cor_override  varchar(7),   -- hex personalizado, sobrescreve a cor da categoria
  icone         varchar(10),  -- emoji personalizado
  criado_por    uuid REFERENCES usuarios(id),
  criado_em     timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  CONSTRAINT fk_categoria CHECK (categoria IN (
    'letivo','feriado_nacional','feriado_distrital','recesso',
    'evento','formacao','atividade_pedagogica','nao_letivo','semana_pedagogica'
  ))
);
-- Uma data pode ter múltiplos registros (categorias diferentes)
CREATE INDEX idx_calendario_dias_data ON calendario_dias (data);
CREATE INDEX idx_calendario_dias_ano ON calendario_dias (EXTRACT(year FROM data));
```

---

## Endpoints

### `GET /api/calendario?ano=2026`
Retorna todos os dias registrados para o ano, agrupados por mês, com semestres.

```typescript
{
  ano: number;
  semestres: Array<{ semestre: 1|2; inicio: string; fim: string }>;
  meses: Array<{
    mes: number;           // 1–12
    mesNome: string;       // "Janeiro", "Fevereiro", …
    dias: Array<{
      data: string;        // "YYYY-MM-DD"
      diaSemana: number;   // 0=dom … 6=sab
      eventos: Array<{
        id: string; categoria: string; titulo: string | null;
        descricao: string | null; cor: string; icone: string;
      }>;
    }>;
  }>;
}
```

### `POST /api/calendario/dias` — criar/atualizar evento(s)
```typescript
// body
{
  datas: string[];         // ["2026-09-07", "2026-09-08"]
  categoria: string;
  titulo?: string;
  descricao?: string;
  corOverride?: string;
}
```

### `PUT /api/calendario/dias/:id` — editar evento
### `DELETE /api/calendario/dias/:id` — excluir evento

### `GET /api/calendario/semestres?ano=2026` — datas de início/fim dos semestres
### `PUT /api/calendario/semestres` — salvar início/fim dos semestres

### `POST /api/calendario/importar-seedf` — importar calendário pré-definido
```typescript
// body: { ano: 2026 }
// response: { importados: number; atualizados: number; preview: [...] }
```

---

## Design do Calendário

### Layout Geral

```
┌─────────────────────────────────────────────────────────────┐
│  Calendário Escolar   [◀ 2025] [ 2026 ▼] [2027 ▶]  [Importar SEEDF] │
├─────────────────────────────────────────────────────────────┤
│  1º Semestre: 02/02 ─────────────── 11/07                  │
│  2º Semestre: 10/08 ─────────────── 19/12                  │
├──────────────┬──────────────┬──────────────┬───────────────┤
│  JANEIRO     │  FEVEREIRO   │  MARÇO       │  ABRIL        │
│  Dom…Sáb     │  Dom…Sáb     │  Dom…Sáb     │  Dom…Sáb      │
│  [1][2][3]   │  …           │  …           │  …            │
├──────────────┴──────────────┴──────────────┴───────────────┤
│  … (3 linhas × 4 meses = 12 meses, ou scroll vertical)     │
└─────────────────────────────────────────────────────────────┘
```

### Legenda de Cores (embutida no topo/rodapé do calendário)

```
🟢 Letivo  🔴 Feriado Nacional  🟠 Feriado Distrital  🟡 Recesso
🔵 Evento  🟣 Formação  🩷 Atividade Pedagógica  ⚫ Fim de semana
```

### Célula de Dia

```
┌────────┐
│  7     │  ← número do dia (negrito se feriado/evento)
│  🇧🇷   │  ← ícone da categoria (até 3 ícones empilhados se múltiplos eventos)
│  Indep │  ← título truncado (tooltip no hover com descricão completa)
└────────┘
```

- Fim de semana: fundo `#f1f5f9` (cinza frio)
- Dia fora do semestre letivo: fundo `#f8fafc`, texto `#cbd5e1`
- Dia atual: borda `2px solid #6366f1`
- Selecionado (multi-select): borda `2px dashed #6366f1` + fundo `#eef2ff`

### Interação — Seleção Múltipla

```
1. Clique simples → abre modal de evento único
2. Ctrl+Clique → adiciona/remove da seleção
3. Shift+Clique → seleciona range (primeiro ao atual)
4. Botão "Selecionar período" → date pickers início/fim
→ Seleção ativa: barra flutuante no rodapé:
  "3 dias selecionados  [Limpar]  [Adicionar evento ▶]"
```

### Modal de Criação/Edição

```
┌─────────────────────────────────┐
│ Adicionar ao calendário         │
│ Datas: 07/09, 08/09, 09/09     │
│                                 │
│ Categoria: [Feriado Nacional ▼] │
│ Título: [Independência do Brasil│
│ Descrição: [___________________]│
│ Ícone (emoji): [🇧🇷]           │
│                                 │
│         [Cancelar] [Salvar]     │
└─────────────────────────────────┘
```

### Preview de Importação SEEDF

```
┌─────────────────────────────────┐
│ Importar Calendário SEEDF 2026  │
│                                 │
│ Serão importados:               │
│ • 180 dias letivos              │
│ • 12 feriados nacionais         │
│ • 3 feriados distritais         │
│ • 24 dias de recesso            │
│ • 10 dias de formação docente   │
│ • 2 semanas pedagógicas         │
│                                 │
│ ⚠ Dados existentes serão        │
│   atualizados.                  │
│                                 │
│     [Cancelar] [Importar]       │
└─────────────────────────────────┘
```

---

## Acesso e Permissões

| Operação | Permissão |
|---|---|
| Visualizar calendário | `usuarios:manage` ou `estudantes:view` (leitura para equipe) |
| Criar/editar/excluir eventos | `calendario:manage` (nova permissão) |
| Importar SEEDF | `calendario:manage` |
| Configurar semestres | `calendario:manage` |
| Visualizar (estudante/responsável) | Somente leitura — integrado ao dashboard |

---

## Anti-padrões

- ❌ Calcular feriados no frontend — feriados devem estar no banco (cadastrados ou importados)
- ❌ Usar apenas uma cor por dia — uma data pode ter múltiplas categorias (evento + feriado)
- ❌ Sobrescrever dados existentes sem ON CONFLICT — importação deve ser idempotente
- ❌ Fim de semana como dia letivo — o sistema deve alertar ao tentar marcar sáb/dom como letivo
- ❌ Calendário sem distinção visual de semestre — início e fim de semestre devem ser visualmente marcados

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/calendario.ts` | Schema: `calendario_semestres` + `calendario_dias` |
| `artifacts/api-server/src/routes/calendario.ts` | CRUD + importação SEEDF |
| `artifacts/api-server/src/lib/seedf-2026.ts` | Constante `CALENDARIO_SEEDF_2026` com todos os dados |
| `artifacts/seshat/src/pages/calendario/index.tsx` | Página de gestão do calendário |
| `artifacts/seshat/src/components/calendario/` | `CalendarioMes`, `CalendarioDia`, `EventoModal`, `ImportacaoModal` |
| `scripts/migrate-calendario.sql` | DDL das duas tabelas |
| `.specs/features/calendario-pedagogico.md` | Esta spec |
