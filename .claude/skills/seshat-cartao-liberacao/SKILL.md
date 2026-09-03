# Skill: Cartão de Liberação

## Conceito

O Cartão de Liberação autoriza saída antecipada do estudante. Dois tipos com fluxos e visuais distintos, exibidos na aba "Cartão de Liberação" do Portal do Estudante (`/portal`).

---

## Tipos

| Tipo | Tabela | Emissão | Validade |
|---|---|---|---|
| **Semestral** | `carteiras` (tipo=`cartao-semestral`) | Coordenador após pedido formal | Semestre inteiro |
| **Diário** | `cartoes_saida` (status=`aprovado`) | Coordenador/supervisor/direção após requerimento | Janela ±5 min do horário |

---

## Regras de Exibição

### Semestral
- Exibido se `cartao-semestral` com `status = 'ativa'` no período atual
- Requer requerimento presencial/digital aprovado por coordenação, supervisão ou direção
- Emitido via `POST /api/carteiras/emitir-liberacao/:usuarioId { ano, semestre }`

### Diário
- **Menor de idade**: requerimento preenchido pelo pai/responsável no Portal do Responsável → aprovação da coordenação/supervisão/direção
- **Maior de idade**: requerimento próprio → aprovação da coordenação/supervisão/direção
- Visível **somente** na janela `horario_saida − 5min` até `horario_saida + 5min`, no dia `data_saida`
- Fora da janela: exibe informação do próximo cartão aprovado, mas **não exibe o cartão** — nova solicitação necessária
- QR Code lido pelo app Seshat → registra ocorrência de saída antecipada automaticamente

> **CRÍTICO:** O frontend revalida a query `portal-cartoes-saida` a cada **30 segundos** (`refetchInterval: 30_000`) para detectar entrada/saída da janela sem reload.

---

## Fluxos de Requerimento

```
# Semestral:
Requerimento "Pedido de Saída Antecipada (Semestral)" → aprovado pela Secretaria/Supervisão
  → processarDeferimento() insere carteira (tipo='cartao-semestral')
  OU: coordenador emite manualmente via POST /api/carteiras/emitir-liberacao/:usuarioId { ano, semestre }

# Diário (menor de idade):
Responsável: preenche Requerimento "Pedido de Saída Antecipada (Eventual)" em /requerimentos
  → Secretaria/Supervisão defere → processarDeferimento() insere cartoes_saida (status='aprovado')

# Diário (maior de idade):
Estudante: preenche Requerimento "Pedido de Saída Antecipada (Eventual)" em /requerimentos
  → Secretaria/Supervisão defere → processarDeferimento() insere cartoes_saida (status='aprovado')
```

> **REGRA:** A aba "Cartão de Saída" no Portal do Responsável **não** tem formulário de "Nova Solicitação". O requerimento substitui essa funcionalidade. O portal do responsável exibe os cartões gerados a partir de requerimentos deferidos, no mesmo modelo visual do Portal do Estudante.

---

## Layout Visual — Padrão CIE

Componente `CartaoLiberacaoCard` — idêntico à `CarteiraEstudante` (560×320px horizontal), exceto pela paleta de cores.

### Paleta Semestral
```
bg: "#dcfce7"  strip: "#166534"  curves: verde
text: "#14532d"  label: "Semestral"
```

### Paleta Diário — por dia da semana (`data_saida`)

```typescript
const COR_DIA: Record<number, Paleta> = {
  1: { bg:"#dbeafe", strip:"#1d4ed8", label:"Segunda-feira" }, // Lua — azul-claro
  2: { bg:"#fee2e2", strip:"#991b1b", label:"Terça-feira"   }, // Marte — vermelho
  3: { bg:"#fefce8", strip:"#a16207", label:"Quarta-feira"  }, // Mercúrio — amarelo
  4: { bg:"#ede9fe", strip:"#3730a3", label:"Quinta-feira"  }, // Júpiter — roxo
  5: { bg:"#fdf2f8", strip:"#9d174d", label:"Sexta-feira"   }, // Vênus — rosa
};
// 0=Dom e 6=Sab usam fallback do índice 1 (azul-claro)
```

### Logos
- `LOGO_GDF` e `LOGO_CEP` — constantes base64 declaradas no topo de cada arquivo de página (`portal/index.tsx` e `portal-responsavel/index.tsx`)
- **Nunca usar URL externa** — a carteira/cartão deve renderizar offline e em impressão
- O `CartaoLiberacaoCard` em **ambos os portais** exibe LOGO_GDF (esquerda) + título central + LOGO_CEP (direita) no cabeçalho — idêntico à `CarteiraEstudante`

---

## Lógica de Janela Horária

```typescript
function dentroJanelaHorario(dataSaida: string, horarioSaida: string | null): boolean {
  if (!horarioSaida) return false;
  const [hh, mm] = horarioSaida.split(":").map(Number);
  const agora = new Date();
  const hoje = agora.toISOString().substring(0, 10);
  if (dataSaida !== hoje) return false;          // dia diferente → fora
  const totalMin = agora.getHours() * 60 + agora.getMinutes();
  const alvoMin  = hh * 60 + mm;
  return Math.abs(totalMin - alvoMin) <= 5;      // ±5 min
}

function horarioJaPassou(dataSaida: string, horarioSaida: string | null): boolean {
  if (!horarioSaida || dataSaida !== hoje) return false;
  const [hh, mm] = horarioSaida.split(":").map(Number);
  const agora = new Date();
  const totalMin = agora.getHours() * 60 + agora.getMinutes();
  return totalMin > hh * 60 + mm + 5; // passou a janela +5 min
}
```

### Comportamento do componente `CartaoLiberacao`

```
cartaoDiarioAtivo = cartoesDiarios.find(dentroJanelaHorario)

SE cartaoDiarioAtivo:
  → exibe CartaoLiberacaoCard + botão imprimir
  → exibe aviso verde "Cartão válido agora"

SENÃO:
  cartoesFuturos = cartoesDiarios onde dataSaida > hoje
                   OU (dataSaida == hoje E NÃO horarioJaPassou)
  proximoCartao = cartoesFuturos ordenado por data [0]

  SE proximoCartao:
    → exibe aviso com data/hora do próximo aprovado
    → NÃO exibe o cartão

  SENÃO cartaoExpiradoHoje (tem cartão de hoje com horário já ultrapassado):
    → mesma mensagem do estado "sem cartão" — cartão expirou/foi utilizado
    → NÃO exibe o cartão

  SENÃO:
    → mensagem "Nenhum cartão de liberação diário aprovado"
    → NÃO exibe o cartão
```

> **REGRA:** Cartões de hoje cujo horário já ultrapassou os +5 min de tolerância são tratados como **expirados** — excluídos de `cartoesFuturos`, não exibem aviso de "próximo cartão". O estudante deve fazer novo requerimento.

---

## Endpoints

### Portal do Estudante (autenticado — sem permissão extra)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/portal/carteiras` | Todas as carteiras do estudante (inclui semestral) |
| GET | `/api/portal/cartoes-saida` | Cartões diários `aprovados` do estudante logado |

### Gestão (requer `estudantes:manage`)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/carteiras/emitir-liberacao/:usuarioId` | Emite cartão semestral `{ ano, semestre }` |
| POST | `/api/cartoes-saida/:id/aprovar` | Aprova + gera token `{ observacao? }` |
| POST | `/api/cartoes-saida/:id/recusar` | Recusa `{ observacao? }` |
| GET  | `/api/cartoes-saida` | Lista todas as solicitações (filtros: estudanteId, status) |

### Portal do Responsável

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/portal-responsavel/cartao-saida` | Solicitar cartão diário `{ estudanteId, dataSaida, horarioSaida, motivo }` |
| GET  | `/api/portal-responsavel/cartoes-saida/:estudanteId` | Listar solicitações do responsável |

---

## Schema Rápido

### `carteiras` — semestral
```
tipo = 'cartao-semestral' | status: 'ativa'|'cancelada'|'revogada'
token: HMAC-SHA256  |  ano + semestre
```

### `cartoes_saida` — diário
```
estudante_id | responsavel_id | data_saida (date) | horario_saida (time)
motivo | status: 'pendente'|'aprovado'|'recusado'
aprovado_por_id | aprovado_em | observacao_aprovador | token (varchar 400)
```

---

## Regra: Carteira de Estudante usa modelo CIE em todos os perfis

O componente de Carteira de Estudante **sempre** usa o modelo CIE (560×320px, fundo `#eaecf8`, faixa `#1a2f7a`, curvas SVG roxas, LOGO_GDF + LOGO_CEP):

- **Portal do Estudante** (`portal/index.tsx`): componente `CarteiraEstudante({ me, carteira })` — usa `me.matriculas[0]` para dados do curso/turma/turno
- **Portal do Responsável** (`portal-responsavel/index.tsx`): componente `CarteiraEstudanteCIE({ est, carteira })` — usa campos de `EstudanteInfo` (nome, fotoUrl, registro, turmaSigla, cursoNome, turnos[0].nome)

> **NUNCA** usar cartão azul simples (`bg-gradient-to-br from-blue-700 to-blue-900`) para carteira de estudante. Este modelo foi substituído pelo CIE em todos os perfis.

Logos LOGO_GDF e LOGO_CEP são constantes base64 declaradas no topo de cada arquivo de página — **nunca usar URL externa**.

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/carteiras.ts` | Schema carteiras |
| `lib/db/src/schema/cartoes-saida.ts` | Schema cartoes_saida |
| `artifacts/api-server/src/routes/portal-estudante.ts` | GET /portal/carteiras + GET /portal/cartoes-saida |
| `artifacts/api-server/src/routes/carteiras.ts` | emitirCarteirasParaMatricula + emitir-liberacao |
| `artifacts/api-server/src/routes/gestao-responsaveis.ts` | aprovar/recusar cartões de saída |
| `artifacts/api-server/src/routes/portal-responsavel.ts` | solicitar cartão de saída |
| `artifacts/seshat/src/pages/portal/index.tsx` | CartaoLiberacao + CartaoLiberacaoCard + COR_DIA + dentroJanelaHorario (perfil estudante) |
| `artifacts/seshat/src/pages/portal-responsavel/index.tsx` | CartaoLiberacaoTab + CartaoLiberacaoCard + CarteiraEstudanteCIE (adaptado para EstudanteInfo) — mesmo modelo visual, sem formulário de solicitação |
| `.specs/features/carteiras-e-cartoes.md` | Spec completa |
