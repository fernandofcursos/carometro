# ADR-006: Análise Arquitetural — Clean Architecture + CQRS + Código Limpo

**Data:** 2026-07-27  
**Status:** Proposta — aguarda aprovação da Athena  
**Autor:** Análise solicitada pelo usuário

---

## Contexto

O sistema está funcional, mas a arquitetura atual mistura responsabilidades dentro das rotas Express. Com o crescimento do projeto, a manutenção se torna mais difícil. Esta análise propõe uma reorganização baseada em três princípios:

1. **Clean Architecture** — separação de camadas por responsabilidade
2. **CQRS** — separar leitura de escrita
3. **Código Limpo** — legível por humanos e processável por ferramentas

---

## Diagnóstico: Estado Atual

### O que está bem

| Aspecto | Avaliação |
|---------|-----------|
| Separação de pacotes (monorepo) | ✅ Boa — `lib/db`, `api-server`, `carometro` bem delimitados |
| Schemas Drizzle centralizados | ✅ Boa — `lib/db/src/schema/` como fonte única de verdade |
| Segurança por design | ✅ Boa — AES-256, bcrypt 12 rounds, httpOnly cookie |
| Auditoria fire-and-forget | ✅ Correto — falha no log não derruba a requisição |
| Soft delete consistente | ✅ Consistente em todas as entidades |
| Contratos via OpenAPI + codegen | ✅ `lib/api-spec/openapi.yaml` → orval → hooks tipados |

### Problemas Identificados

#### 1. Rotas com responsabilidade múltipla (violação SRP)

```typescript
// routes/estudantes.ts — hoje mistura tudo numa função:
router.post("/", requireAuth, requirePermissao("estudantes:manage"), async (req, res) => {
  // 1. Valida entrada (Zod)
  // 2. Busca turma no banco (query)
  // 3. Criptografa foto (lógica de domínio)
  // 4. Insere estudante (persistência)
  // 5. Insere emails (persistência)
  // 6. Registra auditoria (efeito colateral)
  // 7. Monta e retorna resposta (apresentação)
});
```

Uma rota de 80+ linhas não é rota — é um serviço embutido. Dificulta teste unitário, reutilização e raciocínio.

#### 2. Sem separação Command/Query (violação CQRS)

O mesmo arquivo `estudantes.ts` tem GETs e POSTs/PUTs/DELETEs misturados. Leituras e escritas têm preocupações diferentes:

- Leituras: otimização de query, JOIN, paginação, cache
- Escritas: validação de negócio, transações, auditoria, eventos

#### 3. Permissões consultam banco a cada request (sem cache)

```typescript
// permissions.ts — 3 JOINs por requisição, sem cache
const result = await db
  .select(...)
  .from(usuariosRolesTable)
  .innerJoin(rolesPermissoesTable, ...)
  .innerJoin(permissoesTable, ...)
  .where(eq(usuariosRolesTable.usuarioId, usuarioId));
```

#### 4. Chave de criptografia derivada do SESSION_SECRET

```typescript
// crypto.ts — mesma chave para JWT e para AES-256
const chave = createHash("sha256").update(process.env.SESSION_SECRET!).digest();
```

Rotacionar o secret JWT invalida todos os emails e fotos criptografados no banco.

#### 5. Busca textual em memória

```typescript
// estudantes.ts — filtra em JS após carregar todos do banco
const filtrados = todos.filter(e =>
  e.nome.toLowerCase().includes(busca.toLowerCase())
);
```

Não escala para bases com milhares de estudantes.

#### 6. `tokens_sessao` existe mas não é usada

A tabela foi criada mas o middleware `requireAuth` é stateless (JWT). Logout não invalida o token — apenas remove o cookie.

---

## Proposta: Arquitetura em Camadas

### Visão da Estrutura Alvo

```
artifacts/api-server/src/
├── routes/          # Camada de apresentação — HTTP apenas (parse, auth, resposta)
│   ├── estudantes.ts
│   └── ...
│
├── commands/        # CQRS Write — uma função por operação de escrita
│   ├── estudantes/
│   │   ├── criar-estudante.ts
│   │   ├── atualizar-estudante.ts
│   │   └── deletar-estudante.ts
│   └── ...
│
├── queries/         # CQRS Read — uma função por consulta
│   ├── estudantes/
│   │   ├── listar-estudantes.ts
│   │   └── buscar-estudante-por-id.ts
│   └── ...
│
├── domain/          # Regras de negócio puras (sem I/O)
│   ├── estudante.ts     # validações, cálculos, transformações
│   ├── usuario.ts       # lockout, primeiroAcesso, permissões
│   └── ...
│
└── lib/             # Infraestrutura transversal (auth, crypto, audit, mailer)
    ├── auth.ts
    ├── crypto.ts
    ├── permissions.ts   # + cache em memória (Map com TTL)
    ├── audit.ts
    └── mailer.ts
```

### Fluxo de uma Requisição (Write)

```
HTTP POST /api/estudantes
    │
    ▼
routes/estudantes.ts          ← parse body, auth, permissão, resposta HTTP
    │
    ▼
commands/estudantes/criar-estudante.ts   ← orquestra a operação
    │
    ├─▶ domain/estudante.ts              ← valida regras de negócio (puro, testável)
    │
    ├─▶ lib/crypto.ts                    ← criptografa foto
    │
    ├─▶ db (INSERT via Drizzle)          ← persistência
    │
    └─▶ lib/audit.ts                     ← auditoria (fire-and-forget)
```

### Fluxo de uma Requisição (Read)

```
HTTP GET /api/estudantes?turmaId=X
    │
    ▼
routes/estudantes.ts          ← parse query, auth, permissão, resposta HTTP
    │
    ▼
queries/estudantes/listar-estudantes.ts   ← query otimizada, JOIN, paginação
    │
    ▼
db (SELECT via Drizzle)
```

---

## Mudanças Específicas Propostas

### 1. Separar Command de Query nas rotas

```typescript
// routes/estudantes.ts — rota limpa (apresentação apenas)
import { listarEstudantes } from "../queries/estudantes/listar-estudantes.js";
import { criarEstudante } from "../commands/estudantes/criar-estudante.js";

router.get("/", requireAuth, requirePermissao("estudantes:view"), async (req, res) => {
  const resultado = await listarEstudantes({
    turmaId: req.query.turmaId as string | undefined,
    busca: req.query.busca as string | undefined,
  });
  res.json(resultado);
});

router.post("/", requireAuth, requirePermissao("estudantes:manage"), async (req, res) => {
  const parsed = criarEstudanteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const estudante = await criarEstudante(parsed.data, req.usuarioId!, req.ip);
  res.status(201).json(estudante);
});
```

### 2. Command com responsabilidade única

```typescript
// commands/estudantes/criar-estudante.ts
export async function criarEstudante(
  dados: CriarEstudanteInput,
  usuarioId: string,
  ip: string,
): Promise<EstudanteOutput> {
  validarDadosEstudante(dados);               // domínio — lança AppError se inválido

  const fotoEncrypted = dados.foto
    ? criptografarFoto(dados.foto)
    : undefined;

  const [estudante] = await db
    .insert(estudantesTable)
    .values({ ...dados, fotoDados: fotoEncrypted, criadoPorId: usuarioId })
    .returning();

  if (dados.emails?.length) {
    await db.insert(estudanteEmailsTable).values(
      dados.emails.map(e => ({ estudanteId: estudante.id, ...e }))
    );
  }

  registrarAuditoria({ tabela: "estudantes", operacao: "INSERT",
    registroId: estudante.id, usuarioId, ip });

  return estudante;
}
```

### 3. Query com busca no banco (não em memória)

```typescript
// queries/estudantes/listar-estudantes.ts
export async function listarEstudantes(filtros: FiltrosListagem) {
  return db
    .select({ /* campos explícitos */ })
    .from(estudantesTable)
    .leftJoin(turmasTable, eq(estudantesTable.turmaId, turmasTable.id))
    .leftJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
    .where(
      and(
        isNull(estudantesTable.deletadoEm),
        filtros.turmaId ? eq(estudantesTable.turmaId, filtros.turmaId) : undefined,
        filtros.busca ? ilike(estudantesTable.nome, `%${filtros.busca}%`) : undefined,
        // ILIKE no banco — não em memória
      )
    );
}
```

### 4. Cache de permissões (TTL 60s)

```typescript
// lib/permissions.ts — cache por usuarioId
const cache = new Map<string, { permissoes: string[]; expiraEm: number }>();
const TTL_MS = 60_000;

export async function buscarPermissoes(usuarioId: string): Promise<string[]> {
  const cached = cache.get(usuarioId);
  if (cached && Date.now() < cached.expiraEm) return cached.permissoes;

  const permissoes = await consultarPermissoesNoBanco(usuarioId);
  cache.set(usuarioId, { permissoes, expiraEm: Date.now() + TTL_MS });
  return permissoes;
}

// Invalidar cache no logout ou troca de role
export function invalidarCachePermissoes(usuarioId: string): void {
  cache.delete(usuarioId);
}
```

### 5. Chave de criptografia separada do SESSION_SECRET

Adicionar `ENCRYPTION_KEY` dedicada (já existe no `.env.example`!). Usar `ENCRYPTION_KEY` para AES e `SESSION_SECRET` para JWT — nunca a mesma.

```typescript
// crypto.ts — usar ENCRYPTION_KEY, não SESSION_SECRET
const chave = Buffer.from(process.env.ENCRYPTION_KEY!, "hex"); // 32 bytes = 256 bits
```

### 6. AppError para erros de domínio

```typescript
// domain/errors.ts
export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 400,
    public readonly code?: string,
  ) {
    super(message);
  }
}

// Handler global em app.ts
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }
  console.error(err);
  res.status(500).json({ error: "Erro interno" });
});
```

---

## Prioridade de Implementação

| # | Mudança | Impacto | Esforço | Prioridade |
|---|---------|---------|---------|------------|
| 1 | Separar `ENCRYPTION_KEY` de `SESSION_SECRET` | 🔴 Segurança crítica | Baixo | **Imediata** |
| 2 | Busca textual com `ILIKE` no banco | 🟡 Escalabilidade | Baixo | **Alta** |
| 3 | Cache de permissões (TTL 60s) | 🟡 Performance | Baixo | **Alta** |
| 4 | Extrair commands e queries das rotas | 🟢 Manutenibilidade | Alto | **Médio prazo** |
| 5 | AppError para erros de domínio | 🟢 Consistência | Baixo | **Alta** |
| 6 | Ativar `tokens_sessao` para logout real | 🟡 Segurança | Médio | **Médio prazo** |

---

## O que NÃO mudar agora

- **Stack técnica** — Express, Drizzle, React, TanStack Query estão corretos
- **Segurança** — AES-256, bcrypt 12 rounds, httpOnly cookie são padrão de mercado
- **Monorepo** — estrutura de pacotes bem dividida
- **Drizzle como ORM** — schemas como fonte de verdade é a abordagem certa
- **OpenAPI + codegen** — contratos explícitos são arquitetura correta

---

## Consequências

**Se implementado:**
- Cada função terá uma responsabilidade única — testável de forma isolada
- Commands e Queries separados permitem otimizações independentes
- Rotas ficam com < 20 linhas — legíveis por qualquer desenvolvedor
- Erros de domínio tratados uniformemente via `AppError`

**Custo:**
- Refatoração gradual — não requer reescrita total
- Pode ser feita feature por feature (começar por estudantes, que é a mais complexa)
- Testes existentes continuam válidos durante a migração

---

## Referências

- Clean Architecture — Robert C. Martin (Uncle Bob)
- CQRS Pattern — Martin Fowler (`martinfowler.com/bliki/CQRS.html`)
- Single Responsibility Principle — SOLID
- Constituição do Seshat (`.specs/constitution.md`)
