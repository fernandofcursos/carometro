# Skill: Módulo de Requerimento Geral

## Visão Geral

Permite ao estudante adulto (≥18 anos) ou ao Pai/Responsável solicitar serviços da Secretaria Escolar via formulário eletrônico com assinatura digital, fiel ao modelo físico institucional (Santa Maria – DF).

## Regras de Negócio

| Perfil | Acesso | Condição |
|---|---|---|
| `estudante` | ✅ | Obrigatório: ≥ 18 anos (`estudantes.dataNascimento`) |
| `pai_responsavel` | ✅ | Sem restrição — seleciona qual filho |
| `estudante` menor | ❌ | Bloqueado |
| Outros | ❌ | Sem acesso |

- Pai/Responsável seleciona filho via `responsaveis_estudantes`
- Sem limite de requerimentos por estudante
- Status: `pendente → em_analise → deferido | indeferido`
- Análise exclusiva: `secretaria` e `supervisao_pedagogica`
- Indeferido: parecer obrigatório (máx 1000 palavras)

## Tabelas (4NF — 3NF garantida)

```
requerimento_tipos       → tipos de formulário
requerimento_assuntos    → assuntos por tipo (requer_motivos, requer_data_hora, slug)
requerimentos            → cada pedido (+ data_solicitacao, hora_solicitacao)
requerimento_assinaturas → assinaturas (UNIQUE requerimento_id, usuario_id, papel)
```

## Assuntos (seed — modelo físico)

| # | Assunto | Slug | Requer Motivos | Requer Data/Hora | Efeito ao Deferir |
|---|---|---|---|---|---|
| 1 | Cancelamento de Matrícula | — | Não | Não | — |
| 2 | Trancamento de Curso | — | Não | Não | — |
| 3 | Troca de Curso | — | Sim | Não | — |
| 4 | Aproveitamento de Estudos | — | Sim | Não | — |
| 5 | Pedido de Saída Antecipada (Semestral) | `saida-semestral` | Sim | Não | Gera Cartão de Saída Semestral |
| 6 | Pedido de Saída Antecipada (Eventual) | `saida-eventual` | Sim | **Sim** | Gera Cartão de Saída Diário |
| 7 | Outros | — | Sim | Não | — |

## Data e Hora nos Requerimentos

- `requerimento_assuntos.requer_data_hora = true` → formulário exige data + hora
- `requerimentos.data_solicitacao` (date) — data desejada
- `requerimentos.hora_solicitacao` (time) — horário (obrigatório se data informada)
- Regra UI: se o assunto exige data, campo data é obrigatório; ao preencher data, hora é obrigatória

## Efeitos do Deferimento

```typescript
// Função processarDeferimento() em requerimentos.ts
// Chamada automaticamente após status = 'deferido'

slug === 'saida-semestral':
  → INSERT carteiras (tipo='cartao-semestral', ano/semestre da matrícula ativa)
  → Idempotente: não duplica se já existir ativa no período

slug === 'saida-eventual':
  → INSERT cartoes_saida (status='aprovado', dataSaida, horarioSaida do requerimento)
  → Válido ±5 min do horário (regra já existente no portal do estudante)
  → Cancelamento automático: detectado pelo frontend (refetchInterval: 30s)
```

> **CRÍTICO:** A função `processarDeferimento` é envolvida em try/catch — erro na geração do cartão NÃO falha a análise. Cartão pode ser emitido manualmente via `/api/carteiras/emitir-liberacao/:usuarioId`.

## API Endpoints

| Método | Endpoint | Verificação de Acesso |
|---|---|---|
| GET | `/api/requerimentos/tipos` | autenticado |
| GET | `/api/requerimentos/elegibilidade` | autenticado + `buscarRoles` |
| GET | `/api/requerimentos` | autenticado + `buscarRoles` (analisador vê tudo; requerente vê só os seus) |
| POST | `/api/requerimentos` | autenticado + `buscarRoles` (`estudante` ≥18 ou `pai_responsavel`) |
| GET | `/api/requerimentos/:id` | autenticado + `buscarRoles` |
| POST | `/api/requerimentos/:id/assinar` | autenticado + `buscarRoles` |
| PUT | `/api/requerimentos/:id/analisar` | autenticado + `buscarRoles` (`secretaria` ou `supervisao_pedagogica`) |
| POST | `/api/requerimentos/:id/assinar-analise` | autenticado + `buscarRoles` (`secretaria` ou `supervisao_pedagogica`) |

> **IMPORTANTE:** Nenhum endpoint usa `requirePermissao` — todos usam `requireAuth` + `buscarRoles` (cache 60s).
> `requirePermissao` depende de seed na tabela `roles_permissoes` que pode não existir.
> `buscarRoles` consulta `usuarios_roles JOIN roles` — independente de seed de permissões.

## Numeração

```
REQ-AAAA-NNNN  ex: REQ-2026-0001
```
Gerada via `COUNT(*) WHERE EXTRACT(year FROM criado_em) = anoAtual` + lpad.

## Assinatura Digital

### Token
```typescript
SHA256(`${requerimentoId}:${usuarioId}:${Date.now()}:${senha}`)
```
Armazenado em `requerimento_assinaturas.token_hash` (SHA-256, 64 chars).

### Papéis
| Papel | Quem | Quando |
|---|---|---|
| `requerente` | Estudante adulto ou Pai/Responsável | Após criar |
| `analisador` | Secretaria ou Supervisor | Após deferir/indeferir |

### Métodos
| Método | Status |
|---|---|
| `senha` | ✅ Ativo — `bcrypt.compare` + SHA-256 |
| `gov_br` | 🔜 Placeholder |
| `certificado_digital` | 🔜 Placeholder |

## Contagem de Palavras

```typescript
function contarPalavras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}
// Validação no backend E contador em tempo real na UI
// Limite: 1000 palavras (exposicao_motivos e parecer)
```

## Elegibilidade — `/api/requerimentos/elegibilidade`

```typescript
// Estudante: verifica dataNascimento em estudantes (calcularIdade)
// Pai/Responsável: lista filhos via responsaveis_estudantes JOIN estudantes
// Retorna: { elegivel: boolean, motivo?: string, estudantes?: [] }
```

> **ATENÇÃO:** roles NÃO estão no JWT (`req.user?.roles` não existe).
> Usar `buscarRoles` exportada de `lib/permissions.ts` — tem cache de 60s:
> ```typescript
> import { requirePermissao, buscarRoles } from "../lib/permissions.js";
> const roles = await buscarRoles(req.usuarioId!);
> ```

## Cache de roles e permissões

`artifacts/api-server/src/lib/permissions.ts` mantém dois caches em memória com TTL de 60s:
- `permCache` — `Map<usuarioId, string[]>` de `"recurso:acao"`
- `roleCache` — `Map<usuarioId, string[]>` de nomes de role

Ambos são invalidados juntos por `invalidarCachePermissoes(usuarioId)` (chamada no logout e troca de role).

## UI — tratamento de elegibilidade

`/elegibilidade` retorna HTTP 403 com body `{ elegivel: false, motivo: "..." }` quando inelegível — isso é resposta legítima, não erro. A UI trata explicitamente:

```typescript
queryFn: async () => {
  const r = await fetch(url, { credentials: "include" });
  const body = await r.json().catch(() => ({}));
  if (r.status === 403) return body; // inelegível = dado válido
  if (!r.ok) throw body;             // outros erros = exceção
  return body;
},
```

```typescript
function calcularIdade(dataNasc: Date | null): number {
  if (!dataNasc) return 99; // assume adulto se sem data
  const hoje = new Date();
  let idade = hoje.getFullYear() - dataNasc.getFullYear();
  const m = hoje.getMonth() - dataNasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < dataNasc.getDate())) idade--;
  return idade;
}
```

## Estudantes no modal — sem duplicatas por turno

`/elegibilidade` retorna **um objeto por estudante** com `turnos: string[]` (apenas os turnos das matrículas ativas). Nunca usar JOIN direto em `turma_turnos` — gera linhas duplicadas.

```typescript
// Padrão correto: buscar matriculas separado e agrupar em JS
const mat = await buscarMatriculasAtivas(usuarioIds); // Map<usuarioId, {cursoNome, turnos[]}>
const estudantes = estRows.map(e => ({ ...e, ...mat.get(e.usuarioId) }));
```

Na UI: `est.turnos.join(" / ")` → "Matutino / Noturno"

## UI — Fluxo de Criação (3 steps)

```
Step 1 → Selecionar estudante (responsável com múltiplos filhos: radio list)
Step 2 → Selecionar assunto (radio list com descrição)
Step 3 → Exposição de motivos (textarea + contador de palavras em tempo real)
```

## UI — Detalhe do Requerimento

Fiel ao formulário físico:
- Dados do aluno: Nome, Curso, Turno
- Assunto selecionado + exposição de motivos
- Aviso legal: "prazo máximo de 05 dias"
- Local/Data: "Santa Maria – DF"
- Campo assinatura: "Assinatura e RG do responsável legal"
- Resultado: Deferido / Indeferido + parecer

## UI — Análise (`/requerimentos/analise`)

- KPIs: Pendentes / Deferidos / Indeferidos / Total
- Busca por número, estudante, assunto
- Tabs: Pendentes | Deferidos | Indeferidos | Todos
- Card de requerimento: badge "Assinar" aparece em deferidos/indeferidos sem assinatura do analisador
- Modal de análise: visualização completa + botões decisão + parecer
- Campos de assinatura lado a lado: Supervisor Pedagógico | Chefe de Secretaria (mostram assinatura real do DB)
- Após salvar deferido/indeferido: abre automaticamente modal de assinatura
- Botão "Assinar" no footer do modal também disponível para requerimentos já com decisão final
- **Arquitetura:** `analisando` e `assinando` são estados separados na página pai — sem Dialog aninhado

### Fluxo de Assinatura do Analisador

```
1. Analisador abre o modal e salva decisão (Deferido | Indeferido)
   → handleSalvar() chama PUT /analisar
   → Em caso de sucesso: fecha AnalisarModal, abre AssinarModal (via onSalvoComDecisao)

2. Se o modal de assinatura não abrir automaticamente (ex: sessão reiniciada):
   → Badge "Assinar" no card do requerimento → clique abre AssinarModal diretamente
   → Botão "Assinar" no footer do AnalisarModal

3. Cada analisador (Supervisor E Secretaria) deve assinar individualmente:
   → UNIQUE (requerimento_id, usuario_id, papel) — cada um registra uma linha
   → Modal exibe quais já assinaram e quais faltam
```

> **IMPORTANTE — sem Dialog aninhado:** `AssinarModal` é renderizado pelo componente pai
> `RequerimentoAnalisePage`, não dentro de `AnalisarModal`. Isso evita conflito de portais
> do shadcn/ui. O fluxo usa `setTimeout(..., 50)` para garantir desmontagem do Dialog anterior.

## Permissões

| Permissão | Roles |
|---|---|
| `requerimentos:create` | `estudante`, `pai_responsavel` |
| `requerimentos:view` | `estudante`, `pai_responsavel`, `secretaria`, `supervisao_pedagogica` |
| `requerimentos:manage` | `secretaria`, `supervisao_pedagogica` |

## Menu

| Perfil | Grupo | Link |
|---|---|---|
| `estudante` adulto | "Meu Portal" | `/requerimentos` |
| `pai_responsavel` | "Portal do Responsável" | `/requerimentos` |
| `secretaria` / `supervisao_pedagogica` | "Requerimentos" | `/requerimentos/analise` |

## Migração

```bash
psql $DATABASE_URL -f scripts/migrate-requerimentos.sql
```

Idempotente: usa `CREATE TABLE IF NOT EXISTS` + seed em bloco `DO $$ ... $$`.

## Autorização — padrão buscarRoles

Todos os endpoints de requerimentos usam `requireAuth` + `buscarRoles` internamente.
**Nunca usar `requirePermissao`** nos endpoints de requerimentos — depende de seed externo.

```typescript
// Padrão correto para endpoints de análise (secretaria/supervisão):
router.put("/:id/analisar", requireAuth, async (req, res) => {
  const roles = await buscarRoles(req.usuarioId!);
  const podeAnalisar = roles.some(r => ["secretaria", "supervisao_pedagogica"].includes(r));
  if (!podeAnalisar) return res.status(403).json({ error: "Permissão negada." });
  // ...handler
});
```

### Troubleshooting: "Permissão Negada" ao analisar

Causas e soluções:

| Causa | Solução |
|---|---|
| Servidor rodando código anterior ao fix | Fazer `git pull` e reiniciar o servidor |
| Cache de roles com TTL (60s) desatualizado | Aguardar 60s ou reiniciar servidor (limpa cache em memória) |
| Usuário não tem a role atribuída no banco | Verificar `usuarios_roles` para o `usuarioId` do analisador |
| Servidor em produção sem rebuild | Rodar `pnpm build` em `artifacts/api-server` antes de reiniciar |

### Assinaturas — campo roleNome

Ambos `GET /api/requerimentos` (lista) e `GET /api/requerimentos/:id` (detalhe) retornam `roleNome` em cada assinatura com `papel === "analisador"`. Valores possíveis: `"secretaria"` | `"supervisao_pedagogica"` | `null`.

Usado no modal de análise para exibir a caixa de assinatura correta (Supervisor Pedagógico vs Chefe de Secretaria).

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/requerimentos.ts` | Schema Drizzle + Zod |
| `scripts/migrate-requerimentos.sql` | DDL + seed de assuntos |
| `artifacts/api-server/src/routes/requerimentos.ts` | 8 endpoints + lógica |
| `artifacts/seshat/src/pages/requerimentos/index.tsx` | UI do requerente |
| `artifacts/seshat/src/pages/requerimentos/analise.tsx` | UI da análise |
| `.specs/features/requerimento-geral.md` | Spec completa |
