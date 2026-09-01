# Spec: Dashboard — Estudante e Pai/Responsável

**Status:** Implementado

---

## Objetivo

Oferecer uma visão consolidada e personalizada para estudantes e responsáveis ao acessar o portal. O dashboard é a **tela inicial** dos portais `/portal` e `/portal-responsavel`, exibida antes das abas específicas.

---

## Regras de Negócio

### Ocorrências

| Perfil | Exibição |
|---|---|
| Estudante **menor** de idade (`isMaior = false`) | Quantitativo por tipo, somente leitura |
| Estudante **maior** de idade (`isMaior = true`) | Quantitativo por tipo + botão "Dar ciência" nas pendentes |
| Pai/Responsável (`pai_responsavel`) | Igual ao estudante maior — sempre pode dar ciência |

- Agrupamento: `{ tipoDescricao: string; total: number; semCiencia: number }[]`
- Ciência: `POST /api/portal/ocorrencias/:id/ciencia` (estudante) ou `POST /api/portal-responsavel/estudantes/:estudanteId/ocorrencias/:id/ciencia`
- Pendente = `cienteEm IS NULL`

### Agenda de Aulas

- Exibir horário semanal da semana **corrente** (segunda a sexta)
- Dados: disciplina, hora início, hora fim, sala/laboratório, dia da semana
- Dia atual **destacado** — data/hora recuperada do servidor (campo `hoje: string` no response)
- Aulas ordenadas por hora início dentro de cada dia
- Fonte: matrícula ativa do estudante (turma + turno + disciplinas cursadas)
- Para responsável: exibir agenda de **cada estudante vinculado** (accordion por estudante)

### Cardápio da Semana

- Cardápio publicado para a semana corrente, por dia (segunda a sexta)
- Campos: `dia: string (YYYY-MM-DD)`, `refeicao: string`, `descricao: string`
- Dia atual **destacado** visualmente (mesmo critério que a agenda)
- Publicado por um administrador/coordenador; se não publicado, exibir "Cardápio não disponível"
- Fonte: `GET /api/cardapio/semana` (feature nova — sem autenticação necessária para leitura)

---

## Endpoints (novos)

### `GET /api/portal/dashboard`

Resposta consolidada para o estudante logado:

```typescript
{
  hoje: string;                      // "YYYY-MM-DD" do servidor
  diaSemana: number;                 // 1=segunda … 5=sexta (0=dom, 6=sab → não há aula)
  ocorrencias: {
    resumo: Array<{
      tipoId: string;
      tipoDescricao: string;
      total: number;
      semCiencia: number;
      ids: string[];                 // IDs das ocorrências sem ciência
    }>;
    totalGeral: number;
  };
  agenda: Array<{
    dia: number;                     // 1=seg … 5=sex
    diaNome: string;                 // "Segunda-feira" … "Sexta-feira"
    aulas: Array<{
      horaInicio: string;            // "HH:MM"
      horaFim: string;               // "HH:MM"
      disciplinaNome: string;
      sala: string | null;
      laboratorio: string | null;
    }>;
  }>;
  cardapio: Array<{
    dia: number;                     // 1=seg … 5=sex
    diaNome: string;
    data: string;                    // "YYYY-MM-DD"
    itens: Array<{
      refeicao: string;              // "Almoço", "Lanche", etc.
      descricao: string;
    }>;
  }>;
}
```

### `GET /api/portal-responsavel/dashboard`

Retorna um objeto com `estudantes[]` (um por dependente vinculado) + cardápio compartilhado:

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

**Fonte dos dados:**
- Estudantes: `responsaveis_estudantes` → `estudantes` → `turmas` → `cursos`
- Ocorrências: batch com `inArray(ocorrenciasTable.estudanteId, estudanteIds)`
- Agenda: `matriculas (usuarioId) → horarios_aulas (ano, semestre) → disciplina_ofertas → disciplinas`
- Cardápio: único para todos (cardápio da escola)

### `GET /api/cardapio/semana` (público)

```typescript
{
  semana: string;      // "YYYY-Www" (ISO week)
  cardapio: Array<{
    data: string;      // "YYYY-MM-DD"
    dia: number;       // 1=seg … 5=sex
    diaNome: string;
    itens: Array<{ refeicao: string; descricao: string }>;
  }>;
}
```

---

## Banco de Dados (features novas)

### Tabela `horarios_aulas`

```sql
CREATE TABLE horarios_aulas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id        uuid NOT NULL REFERENCES turmas(id),
  disciplina_id   uuid NOT NULL REFERENCES disciplinas(id),
  turno_id        uuid REFERENCES turnos(id),
  dia_semana      smallint NOT NULL CHECK (dia_semana BETWEEN 1 AND 5), -- 1=seg
  hora_inicio     time NOT NULL,
  hora_fim        time NOT NULL,
  sala            varchar(50),
  laboratorio     varchar(100),
  criado_em       timestamptz DEFAULT now(),
  atualizado_em   timestamptz DEFAULT now(),
  deletado_em     timestamptz
);
CREATE INDEX ON horarios_aulas (turma_id, dia_semana);
```

### Tabela `cardapios`

```sql
CREATE TABLE cardapios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data        date NOT NULL,
  refeicao    varchar(50) NOT NULL,  -- 'Almoço', 'Lanche da Manhã', etc.
  descricao   text NOT NULL,
  publicado   boolean NOT NULL DEFAULT false,
  criado_por  uuid REFERENCES usuarios(id),
  criado_em   timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX ON cardapios (data, refeicao);
CREATE INDEX ON cardapios (data, publicado);
```

---

## Design do Dashboard

### Layout Geral

```
┌─────────────────────────────────────────────────────┐
│  Bom dia, João 👋   Hoje é Terça-feira, 03/09/2026  │
├────────────────────┬────────────────────────────────┤
│  OCORRÊNCIAS       │  AGENDA DA SEMANA               │
│  ─────────────     │  ─────────────                 │
│  [Card tipo A: 2]  │  [Seg] [Ter★] [Qua] [Qui] [Sex]│
│  [Card tipo B: 1]  │  08h00 Matemática — Sala 12     │
│  [Dar ciência: 1]  │  09h45 Português — Lab. Inf.   │
├────────────────────┴────────────────────────────────┤
│  CARDÁPIO DA SEMANA                                  │
│  [Seg] [Ter★] [Qua] [Qui] [Sex]                     │
│  Almoço: Arroz, feijão, frango grelhado, salada     │
│  Lanche: Pão com manteiga, suco de laranja          │
└─────────────────────────────────────────────────────┘
```

### Paleta e Identidade Visual

| Elemento | Valor |
|---|---|
| Saudação — fundo | `#f0f9ff` (azul claro) |
| Card ocorrência — border | `#f87171` (vermelho suave) |
| Card ocorrência com ciência | `#4ade80` (verde) |
| Dia atual — pill | `#6366f1` (índigo) + texto branco |
| Dias outros — pill | `#f3f4f6` + texto `#6b7280` |
| Aula — card | `#ffffff` border `#e0e7ff` shadow suave |
| Cardápio — card | `#fffbeb` border `#fde68a` |
| Sem dados | `#f9fafb` texto `#9ca3af` italic |

### Componentes

**`SaudacaoHeader`**
- Saudação dinâmica: "Bom dia" / "Boa tarde" / "Boa noite" + nome
- Exibe `hoje` formatado em pt-BR
- Avatar do estudante (pequeno, circular, 40px)

**`OcorrenciasWidget`**
- Um `<Card>` por tipo de ocorrência
- Ícone representativo + nome do tipo + contador total em badge
- Se `semCiencia > 0` e o perfil permite ciência: badge vermelho + botão "Dar ciência (N)"
- Clicar abre um `<Dialog>` listando as ocorrências sem ciência com botão por item
- Se nenhuma ocorrência: ilustração + "Nenhuma ocorrência registrada 🎉"

**`AgendaSemanaWidget`**
- Tabs horizontais: Seg / Ter / Qua / Qui / Sex
- Tab do dia atual pré-selecionada e destacada com pill `#6366f1`
- Cada tab mostra lista de aulas em ordem cronológica
- Aula card: horário em negrito + disciplina + badge sala/lab
- Se sem aulas no dia: "Sem aulas programadas"
- Se agenda não cadastrada: "Horário não disponível"

**`CardapioSemanaWidget`**
- Mesmo sistema de tabs por dia da semana
- Cada item de refeição em linha separada: rótulo bold + descrição
- Badge "Publicado" ou "Não disponível" no header da tab
- Fundo âmbar suave `#fffbeb`

### Responsividade

- Mobile: widgets empilhados em coluna única
- Tablet: agenda + ocorrências lado a lado, cardápio abaixo
- Desktop: grid 3 colunas (ocorrências | agenda | cardápio)

---

## Regras de Acesso

| Perfil | URL | Componente | Endpoint |
|---|---|---|---|
| `estudante` | `/` | `DashboardEstudante` | `GET /api/portal/dashboard` |
| `pai_responsavel` | `/` | `DashboardResponsavel` | `GET /api/portal-responsavel/dashboard` |
| Admin / outros | `/` | `DashboardAdmin` | `GET /api/stats` |

**Regras do dashboard do responsável:**
- Exibir relação de todos os estudantes vinculados com foto, nome e turma
- Para cada estudante: quadro de horários semanal + ocorrências com opção de ciência
- Cardápio da semana compartilhado ao final (único para todos os dependentes)
- Se nenhum dependente vinculado: mensagem orientando a contatar a coordenação

---

## Anti-padrões

- ❌ Usar hora do cliente para determinar "hoje" — sempre usar `hoje` retornado pelo servidor
- ❌ Mostrar opção de ciência para estudante menor de idade
- ❌ Exibir agenda de outro estudante que não seja o vinculado (responsável)
- ❌ Mostrar cardápio não publicado para estudantes/responsáveis
- ❌ Calcular "semana corrente" no frontend — o backend retorna `hoje` e os itens da semana

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/horarios-aulas.ts` | Schema `horarios_aulas` |
| `lib/db/src/schema/cardapios.ts` | Schema `cardapios` |
| `artifacts/api-server/src/routes/portal-estudante.ts` | `GET /api/portal/dashboard` |
| `artifacts/api-server/src/routes/portal-responsavel.ts` | `GET /api/portal-responsavel/dashboard` |
| `artifacts/api-server/src/routes/cardapio.ts` | `GET /api/cardapio/semana` (público) |
| `artifacts/api-server/src/routes/horarios-aulas.ts` | CRUD admin de horários |
| `artifacts/seshat/src/pages/dashboard.tsx` | `DashboardEstudante`, `DashboardResponsavel`, `DashboardAdmin`, `QuadroHorariosWidget`, `OcorrenciasWidget`, `CardapioWidget`, `CalendarioMesWidget` |
| `scripts/migrate-dashboard.sql` | DDL horarios_aulas + cardapios |
| `.specs/features/dashboard-estudante-responsavel.md` | Esta spec |
