# Skill: AEE — Sala de Recursos

## Visão Geral

Módulo de gestão da Sala de Recursos Multifuncional (SRM) para estudantes ENEE (Estudantes com Necessidades Educacionais Especiais). Distinto do módulo AEE geral — este foca na sala de recursos com entidades próprias.

## Permissões RBAC

| Permissão | Quem | O que pode fazer |
|---|---|---|
| `sala_recursos:manage` | Coordenador SR, gestores | CRUD completo em todos os recursos |
| `sala_recursos:view` | Supervisores, equipe pedagógica | Leitura de todos os dados |
| `sala_recursos:professor` | Professor regente | Ver apenas adequações dos seus alunos ENEEs |
| `sala_recursos:self` | Família (pai/responsável, estudante maior) | Ver plano AEE do próprio filho/estudante |

### Hierarquia `srGuard`

```typescript
type SrNivel = "manage" | "view" | "professor" | "self";
const hierarquia: Record<SrNivel, string[]> = {
  manage:    ["sala_recursos:manage"],
  view:      ["sala_recursos:manage", "sala_recursos:view"],
  professor: ["sala_recursos:manage", "sala_recursos:view", "sala_recursos:professor"],
  self:      ["sala_recursos:manage", "sala_recursos:view", "sala_recursos:professor", "sala_recursos:self"],
};
```

> **OBRIGATÓRIO:** Usar `buscarRoles(req.usuarioId)` de `../lib/permissions.js` — roles NÃO estão no JWT.

## Tabelas

| Tabela Drizzle | Tabela SQL | Descrição |
|---|---|---|
| `srEstudantesEneeTable` | `sr_estudantes_enee` | Registro de ENEE (laudo, tipo atend., ativo) |
| `srAtendimentosTable` | `sr_atendimentos` | Sessões individuais de atendimento |
| `srPlanosAeeTable` | `sr_planos_aee` | Plano AEE estruturado (objetivos, estratégias, avaliação) |
| `srEsvTable` | `sr_esv` | Estudos de Situação de Vida |
| `srEstudosCasoTable` | `sr_estudos_caso` | Estudos de caso aprofundados |
| `srEncaminhamentosTable` | `sr_encaminhamentos` | Encaminhamentos internos/externos |
| `encaminhamentosEventosTable` | `encaminhamentos_eventos` | Roteamento inter-módulo (SR ↔ SOE ↔ AEE) |

### Laudos válidos

```typescript
type Laudo = "DI" | "DF" | "DOWN" | "TEA" | "AH_SD";
```

### Status de Plano AEE

```typescript
type StatusPlano = "rascunho" | "ativo" | "encerrado";
```

## API Endpoints

| Método | Rota | Guard | Descrição |
|---|---|---|---|
| GET | `/api/sala-recursos/estudantes-enee` | view | Lista ENEEs |
| POST | `/api/sala-recursos/estudantes-enee` | manage | Registra ENEE |
| GET | `/api/sala-recursos/atendimentos` | view | Lista atendimentos |
| POST | `/api/sala-recursos/atendimentos` | manage | Registra atendimento |
| GET | `/api/sala-recursos/planos-aee` | view | Lista planos |
| POST | `/api/sala-recursos/planos-aee` | manage | Cria plano |
| GET | `/api/sala-recursos/planos-aee/:id` | professor | Ver plano (campos limitados para professor) |
| PUT | `/api/sala-recursos/planos-aee/:id` | manage | Atualiza plano |
| GET | `/api/sala-recursos/portal/professor/adequacoes` | professor | Adequações dos alunos ENEEs do professor |
| GET | `/api/sala-recursos/portal/plano` | self | Plano AEE do estudante logado (família) |
| POST | `/api/sala-recursos/encaminhamentos/inter-modulo` | manage | Routing inter-módulo |

## Restrição de Professor

Quando usuário tem APENAS `sala_recursos:professor`, `GET /planos-aee/:id` retorna somente:
```typescript
{ id, estudanteId, objetivos, estrategias, avaliacao, prazo, status }
// SEM: observacoes, narrativa, dados clínicos
```

## Encaminhamento Inter-Módulo

```typescript
// POST /api/sala-recursos/encaminhamentos/inter-modulo
// Insere em encaminhamentosEventosTable com:
{
  origemModulo: "sala_recursos",
  destinoModulo: "soe" | "aee",
  encaminhamentoId: uuid,
  evento: "encaminhado",
  payload: { ... }
}
```

## Padrões obrigatórios

- **Multi-tenant**: `withTenant(escolaId, async (tx) => await tx.select()...)`  — `async` e `await` obrigatórios
- **Roles**: `await buscarRoles(req.usuarioId)` — nunca `req.user?.roles`
- **SQL imports**: `sql` vem de `drizzle-orm`, não de `drizzle-orm/pg-core`
- **Vitest mocks**: usar `vi.hoisted()` para definir `mockDb` antes dos factories de `vi.mock()`
- **Portal família**: query de plano em dois passos — busca ENEE por `usuarioId`, depois plano por `eneeId`

## Migração

```bash
psql $DATABASE_URL -f scripts/migrate-sala-recursos.sql
```

Idempotente. Insere as 4 permissões na tabela `permissoes`.

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/sala-recursos.ts` | 7 tabelas Drizzle |
| `scripts/migrate-sala-recursos.sql` | DDL + seed de permissões |
| `artifacts/api-server/src/routes/sala-recursos.ts` | Router + srGuard + 23 endpoints |
| `artifacts/api-server/src/tests/sala-recursos.test.ts` | 12 testes |
| `artifacts/seshat/src/pages/sala-recursos/gestao.tsx` | UI de gestão (split panel + 5 tabs) |
| `artifacts/seshat/src/pages/sala-recursos/professores.tsx` | Vista de adequações para professor |
| `artifacts/seshat/src/pages/sala-recursos/analise.tsx` | KPIs e tabela gerencial |
| `.specs/features/sala-recursos.md` | Spec completa |
