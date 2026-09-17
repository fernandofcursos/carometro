# Skill: Workflow de Encaminhamentos Inter-módulos

## Módulos envolvidos

SOE ↔ EEAA ↔ SR — qualquer direção, qualquer combinação.

## Tabela

`encaminhamentosEventosTable` (em `lib/db/src/schema/sala-recursos.ts`)

## Campos novos (além da estrutura original)

| Campo | Tipo | Descrição |
|---|---|---|
| `tipoDemanda` | varchar(100), nullable | Tipo clínico/pedagógico |
| `cids` | text[], nullable | CIDs múltiplos (ex: `["F90.0","F81.0"]`) |
| `resolucao` | text, nullable | Texto de resolução ou devolução |
| `paiId` | uuid, FK auto-ref, nullable | Encaminhamento pai (cadeia) |

## Status cycle

```
pendente → aceito → em_andamento → resolvido | devolvido
                  ↘ re-encaminhar → cria filho com paiId, pai vira em_andamento
```

## API Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/encaminhamentos?caixa=recebidos\|enviados&modulo=sr\|eeaa\|soe` | Lista |
| POST | `/api/encaminhamentos` | Criar (sem escolaId no body — usa JWT) |
| PUT | `/api/encaminhamentos/:id/aceitar` | Aceitar (destino) |
| PUT | `/api/encaminhamentos/:id/resolver` | Resolver `{ resolucao }` |
| PUT | `/api/encaminhamentos/:id/devolver` | Devolver `{ resolucao }` |
| PUT | `/api/encaminhamentos/:id/reencaminhar` | Re-encaminhar `{ destinoModulo, mensagem }` |

## Guard

`encGuard`: usuário com manage em QUALQUER dos 3 módulos passa; ações específicas verificam permissão no módulo origem/destino.

## MODULO_PERMS

```typescript
const MODULO_PERMS = {
  sr:   ["sala_recursos:manage"],
  eeaa: ["eeaa:manage"],
  soe:  ["soe:manage"],
};
```

## Componente UI

`EncaminhamentosTab` em `artifacts/seshat/src/components/encaminhamentos-tab.tsx`

Prop: `modulo: "sr" | "eeaa" | "soe"` — sem escolaId (servidor usa JWT).

Sub-tabs: Recebidos | Enviados. Modais: NovoEnc, AcaoModal (aceitar/resolver/devolver/reencaminhar).

## Integração nas páginas de gestão

Aba "Inter-módulos" adicionada às 3 páginas:
- `artifacts/seshat/src/pages/sala-recursos/gestao.tsx` — `<EncaminhamentosTab modulo="sr" />`
- `artifacts/seshat/src/pages/eeaa/gestao.tsx` — `<EncaminhamentosTab modulo="eeaa" />`
- `artifacts/seshat/src/pages/soe/gestao.tsx` — `<EncaminhamentosTab modulo="soe" />`

## Padrões obrigatórios

- `withTenant(escolaId, async (tx) => await tx.select()...)` — async+await obrigatórios
- `buscarRoles(req.usuarioId!)` de `"../lib/permissions.js"` — roles não estão no JWT
- `sql` de `"drizzle-orm"` não de `"drizzle-orm/pg-core"`
- Vitest: `vi.hoisted()` antes dos `vi.mock()` factories

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/sala-recursos.ts` | `encaminhamentosEventosTable` + novos campos |
| `scripts/migrate-encaminhamentos-workflow.sql` | DDL dos novos campos + índice pai_id |
| `artifacts/api-server/src/routes/encaminhamentos.ts` | Router compartilhado |
| `artifacts/api-server/src/tests/encaminhamentos.test.ts` | 12 testes |
| `artifacts/seshat/src/components/encaminhamentos-tab.tsx` | Componente React compartilhado |
| `docs/superpowers/specs/2026-09-17-eeaa-e-workflow-encaminhamentos-design.md` | Spec completa |
