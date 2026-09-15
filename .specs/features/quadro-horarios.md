# Spec: Quadro de Horários

**Status:** Implementado

---

## Objetivo

Gerenciar o quadro semanal de aulas de cada turma: dia da semana, horário de início/fim, disciplina e sala. Serve de base para a agenda de aulas exibida no dashboard do estudante e responsável.

---

## Regras de Negócio

- Cada entrada vincula uma `turma` a uma `disciplina_oferta` em um dia e horário fixo semanal
- Um mesmo slot (turma + dia + hora início) não pode ter duas disciplinas — constraint `uq_slot_turma`
- O quadro varia por semestre (`ano` + `semestre`)
- Turma pode ter múltiplos turnos; os slots de horário são derivados do turno selecionado
- Sala é opcional
- Disciplinas disponíveis filtradas pelo curso da turma (e opcionalmente pelo turno)

### Slots de horário por turno

Horários oficiais — Centro de Educação Profissional Escola Técnica de Santa Maria (SEEDF/CRE Santa Maria).
Cada período tem ~50 min, com intervalo entre o 2º e o 3º horário.

**Matutino** (nome contém "mat"):

| Horário | Início | Fim |
|---|---|---|
| 1º | 08:00 | 08:50 |
| 2º | 08:50 | 09:40 |
| *Intervalo* | *09:40* | *10:10* |
| 3º | 10:10 | 11:05 |
| 4º | 11:05 | 12:00 |

**Vespertino** (nome contém "ves" ou "tar"):

| Horário | Início | Fim |
|---|---|---|
| 1º | 13:30 | 14:20 |
| 2º | 14:20 | 15:10 |
| *Intervalo* | *15:10* | *15:40* |
| 3º | 15:40 | 16:35 |
| 4º | 16:35 | 17:30 |

**Noturno** (nome contém "not" ou "notur"):

| Horário | Início | Fim |
|---|---|---|
| 1º | 19:00 | 19:45 |
| 2º | 19:45 | 20:30 |
| *Intervalo* | *20:30* | *21:00* |
| 3º | 21:00 | 21:45 |
| 4º | 21:45 | 22:30 |

- O intervalo não aparece como linha na grade (não é uma aula)
- Slots personalizados (fora do template) são exibidos como linhas extras na grade
- O usuário pode personalizar horário manualmente no modal (link "Personalizar")

---

## Banco de Dados

### Tabela `horarios_aulas`

```sql
CREATE TABLE horarios_aulas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id              uuid NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  disciplina_oferta_id  uuid REFERENCES disciplina_ofertas(id) ON DELETE SET NULL,
  dia_semana            smallint NOT NULL CHECK (dia_semana BETWEEN 1 AND 5),
  hora_inicio           time NOT NULL,
  hora_fim              time NOT NULL,
  sala                  varchar(50),
  ano                   integer NOT NULL,
  semestre              smallint NOT NULL CHECK (semestre IN (1, 2)),
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_horario_valido CHECK (hora_fim > hora_inicio),
  CONSTRAINT uq_slot_turma UNIQUE (turma_id, dia_semana, hora_inicio, ano, semestre)
);
CREATE INDEX idx_horarios_turma ON horarios_aulas (turma_id, ano, semestre);
```

---

## Endpoints

### `GET /api/horarios?turmaId=&ano=&semestre=`
Retorna o quadro semanal.

### `GET /api/horarios/turma-info?turmaId=`
Retorna dados da turma + lista de turnos vinculados.

```typescript
{ id, sigla, cursoNome, turnos: [{ id, nome }] }
```

### `GET /api/horarios/disciplinas-oferta?turmaId=&turnoId=`
Lista disciplinas disponíveis para a turma/turno.

### `POST /api/horarios` — criar slot
### `PUT /api/horarios/:id` — editar slot
### `DELETE /api/horarios/:id` — remover slot

### `POST /api/horarios/importar-urania` — importação em lote

```typescript
// request
{
  turmaId: string;
  ano: number;
  semestre: 1 | 2;
  horarios: Array<{
    diaSemana: number;   // 1=seg … 5=sex
    horaInicio: string;  // "HH:MM"
    horaFim:    string;
    disciplina?: string; // nome tentativo para match fuzzy
    sala?:       string;
  }>;
}

// response
{
  total: number;
  criados: number;
  atualizados: number;    // slots existentes foram atualizados
  semDisciplina: number;  // slots criados sem disciplina por falha no match
  naoCorrespondidos: string[];  // nomes que não foram encontrados
}
```

**Estratégia de match de disciplina:**
1. Busca exata pelo nome completo (case-insensitive)
2. Busca por substring bidirecional (se nome Urania estiver contido no nome do sistema ou vice-versa)
3. Se não encontrar → slot criado sem disciplina; nome vai para `naoCorrespondidos`
4. Conflito de slot existente (23505) → atualiza disciplina e sala

---

## Design — Página `/horarios`

### Grade (tabela HTML)

```
Horário   | Segunda  | Terça   | Quarta  | Quinta  | Sexta
----------+----------+---------+---------+---------+--------
08:00–09:00 | [disc]  |  [+]   |  [+]   | [disc]  | [disc]
09:00–10:00 | [disc]  |  [+]   | [disc] | [disc]  | [disc]
10:00–11:00 |  [+]    | [disc] | [disc] | [disc]  |  [+]
11:00–12:00 |  [+]    | [disc] | [disc] | [disc]  |  [+]
```

- Linhas = time slots derivados do turno selecionado + slots fora do template
- Colunas = dias da semana (Seg–Sex)
- Célula vazia → `[+]` clicável → SlotModal pré-preenchido com dia + hora
- Célula preenchida → clicável → SlotModal em modo edição

### Filtros

| Campo | Comportamento |
|---|---|
| Turma | Select obrigatório; ao mudar turma, carrega turnos automaticamente |
| Turno | Select automático (turnos da turma); determina os slots de horário na grade |
| Ano | Input numérico |
| Semestre | Select 1/2 |

### SlotModal

- **Seleção de horário**: botões dos slots do turno (ex: "08:00 – 09:00"); link "Personalizar" → mostra inputs livres
- **Disciplina**: select das ofertas do curso (filtradas por turnoId se disponível)
- **Sala**: input de texto opcional
- Dia da semana pré-selecionado via botões (Seg…Sex)

### ImportacaoModal (Urania JSON)

- Textarea para colar o JSON
- Preview do resultado após importação: cards com totais + lista de não correspondidos
- Slots não correspondidos ficam sem disciplina — admin atribui manualmente

---

## Acesso e Permissões

| Operação | Permissão |
|---|---|
| Visualizar e editar quadro | `horarios:manage` |
| Importar do Urania | `horarios:manage` |
| Visualizar (estudante) | via `GET /api/portal/dashboard` — agenda do próprio estudante |
| Visualizar (pai/responsável) | via `GET /api/portal/dashboard` — agenda de todos os filhos/dependentes vinculados em `responsaveis_estudantes` |

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/horarios.ts` | Schema `horarios_aulas` |
| `artifacts/api-server/src/routes/horarios.ts` | CRUD + turma-info + importar-urania |
| `artifacts/api-server/src/routes/portal-estudante.ts` | `GET /api/portal/dashboard` — resolve estudantes próprios ou via `responsaveis_estudantes` |
| `artifacts/seshat/src/pages/horarios/index.tsx` | UI grade + modals |
| `artifacts/seshat/src/pages/dashboard.tsx` | `QuadroHorariosWidget` — renderiza grade no dashboard |
| `scripts/migrate-horarios.sql` | DDL da tabela |
