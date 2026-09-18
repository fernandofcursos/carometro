# Skill: Portal do Responsável

## Conceito

Portal de autoatendimento para pais/responsáveis legais. Role `pai_responsavel` garante acesso. Vínculo com estudante via tabela `responsaveis_estudantes`.

## Menu

```
Grupo: "Portal do Responsável"
└── "Meus Filhos" → /portal-responsavel

Visível para:
  - roles.includes("pai_responsavel")   ← responsável real
  - isAdmin (hasAny("usuarios:manage","roles:manage"))  ← admin vê para ajuste/teste
```

## Regras de Negócio

| Regra | Detalhe |
|-------|---------|
| **Vínculo obrigatório** | Responsável só vê estudantes em `responsaveis_estudantes` |
| **Ciência sem restrição** | Responsável sempre pode dar ciência (diferente de estudante menor) |
| **Atestado criptografado** | AES-256-CBC, IV único, hash de integridade — LGPD art. 11 |
| **Token cartão de saída** | HMAC-SHA256 gerado ao aprovar, armazenado no DB |
| **Status cartão** | `pendente` → `aprovado`/`recusado` por coordenador |

## Padrão de Criptografia de Arquivos

```typescript
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

function criptografarArquivo(dados: Buffer): { iv: string; dados: Buffer; hash: string } {
  const chave = getChaveEncriptacao();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", chave, iv);
  const criptografado = Buffer.concat([cipher.update(dados), cipher.final()]);
  const hash = createHash("sha256").update(dados).digest("hex");
  return { iv: iv.toString("base64"), dados: criptografado, hash };
}

function descriptografarArquivo(iv: string, dados: Buffer): Buffer {
  const chave = getChaveEncriptacao();
  const ivBuf = Buffer.from(iv, "base64");
  const decipher = createDecipheriv("aes-256-cbc", chave, ivBuf);
  return Buffer.concat([decipher.update(dados), decipher.final()]);
}
```

## Token do Cartão de Saída

```typescript
// HMAC_KEY = process.env.SESSION_SECRET ?? "carometro-secret"
function gerarTokenCartaoSaida(cartaoId: string, estudanteId: string, dataSaida: string): string {
  const payload = JSON.stringify({ cartaoId, estudanteId, dataSaida, ts: Date.now() });
  const encoded = Buffer.from(payload).toString("base64url");
  const sig     = createHmac("sha256", HMAC_KEY).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}
// Formato: "<base64url-payload>.<base64url-assinatura>"
```

## Upload de Atestado (Frontend)

```typescript
// Converter arquivo para base64 via FileReader
const reader = new FileReader();
reader.onload = (e) => {
  const base64 = e.target?.result as string; // data URL completa (mantém prefixo data:...;base64,)
  arquivo = { nome: file.name, base64 };     // o backend extrai o dado via regex
};
reader.readAsDataURL(file);

// Payload enviado (campos flat — não nested):
postJson(`${BASE}/api/portal-responsavel/atestado`, {
  estudanteId,
  dataInicio,
  dataFim: dataFim || undefined,
  nomeArquivo: arquivo.nome,
  arquivoBase64: arquivo.base64,   // data URL completa; backend tolera ambos os formatos
});
```

## Estrutura da Página

```
PortalResponsavelPage  (/portal-responsavel — "Meus Filhos")
├── Cabeçalho: foto + nome do responsável + contagem de filhos
├── Accordion (type="multiple") — todos os filhos visíveis simultaneamente:
│   └── [AccordionItem por estudante]
│       ├── Header: foto + nome + turma + curso
│       └── Tabs:
│           ├── DadosEstudanteTab — matrícula + carteira de estudante com QR
│           ├── OcorrenciasTab — lista + dar ciência (sem restrição de idade)
│           ├── CartaoLiberacaoTab — duas sub-abas (Semestral / Diário);
│           │   cartão diário solicitado via Requerimentos (não há form inline)
│           └── AtestadosTab — upload + lista + download
├── AvisosWidget (perfil="pai_responsavel", limite=5)
└── CardapioWidget
```

- **Não há Select de seleção** — todos os filhos aparecem ao mesmo tempo
- Primeiro filho aberto por padrão (`openItems = [estudantes[0].id]`)
- Estudantes não enturmados (`turmaId = null`) aparecem com "Não enturmado"
- `CartaoLiberacaoTab` exibe cartões semestral e diário no mesmo modelo visual CIE do portal do estudante; o endpoint `POST /api/portal-responsavel/cartao-saida` existe no backend mas **não é chamado pelo frontend** — o fluxo de solicitação passou para Requerimentos

## Armadilhas

### Turno efetivo: matriculasTable, NÃO turmaTurnosTable

O campo `turnos[]` de cada estudante em `GET /me` deve vir de `matriculasTable.turnoId`, não de `turmaTurnosTable`. A tabela `turmaTurnosTable` lista **todos** os turnos associados à turma; a matrícula registra o turno **específico** em que o estudante está enturmado.

```typescript
// CORRETO — turno real do estudante
.from(matriculasTable)
.innerJoin(turnosTable, eq(turnosTable.id, matriculasTable.turnoId))
.where(and(inArray(matriculasTable.usuarioId, usuarioIds), isNull(matriculasTable.deletadoEm)))
// Map keyed by estudanteId

// ERRADO — todos os turnos da turma aparecem para todos os estudantes
.from(turmaTurnosTable).innerJoin(turnosTable, ...)
.where(inArray(turmaTurnosTable.turmaId, turmaIds))
```

### LEFT JOIN obrigatório em GET /me e GET /dashboard

Estudantes vinculados sem enturmação têm `estudantesTable.turmaId = null`. INNER JOIN os exclui:

```typescript
// CORRETO
.leftJoin(turmasTable, eq(turmasTable.id, estudantesTable.turmaId))
.leftJoin(cursosTable, eq(cursosTable.id, turmasTable.cursoId))
// + isNull(estudantesTable.deletadoEm) no where

// ERRADO — estudantes sem turma somem da lista
.innerJoin(turmasTable, ...).innerJoin(cursosTable, ...)
```

### Endpoint de ciência no DashboardResponsavel (dashboard.tsx)

```typescript
// CORRETO — rota do portal responsável
fetch(`${BASE}/api/portal-responsavel/ocorrencias/${id}/ciencia`, ...)

// ERRADO — rota do portal estudante
fetch(`${BASE}/api/portal/ocorrencias/${id}/ciencia`, ...)
```

## Queries Principais

```typescript
// Buscar estudantes vinculados ao responsável
const vinculados = await db
  .select({ estudanteId: responsaveisEstudantesTable.estudanteId, ... })
  .from(responsaveisEstudantesTable)
  .where(eq(responsaveisEstudantesTable.usuarioId, responsavelId));

// Envio de atestado — validar que responsável está vinculado ao estudante
const vinculo = await db
  .select()
  .from(responsaveisEstudantesTable)
  .where(and(
    eq(responsaveisEstudantesTable.usuarioId, responsavelId),
    eq(responsaveisEstudantesTable.estudanteId, estudanteId),
  ));
// Desestruturação de item único — não usa .length
const [vinculo] = await db.select()...
if (!vinculo) return res.status(403).json({ error: "Acesso negado." });
// POST /cartao-saida e GET /ocorrencias/:estudanteId usam "Acesso negado a este estudante."
```

## GET /api/portal-responsavel/dashboard

Retorna `{ hoje, diaSemana, estudantes[] }` onde cada estudante inclui:
- `agenda[]` — horários da semana atual (da tabela `horarios_aulas`; `agendaDisponivel: false` se a tabela não existir)
- `ocorrencias.resumo[]` — ocorrências agrupadas por `tipoDescricao` com contagem
- `ocorrencias.totalGeral` — total de ocorrências do estudante

Usado pelo `DashboardResponsavel` (`/dashboard`) — não é o portal `/portal-responsavel`, mas o componente compartilha a mesma rota de API.

## Arquivos-chave

| Arquivo | Responsabilidade |
|---------|-----------------|
| `lib/db/src/schema/responsaveis-estudantes.ts` | Junction table |
| `lib/db/src/schema/cartoes-saida.ts` | Cartões de saída |
| `lib/db/src/schema/atestados-medicos.ts` | Atestados (criptografados) |
| `artifacts/api-server/src/routes/portal-responsavel.ts` | API do portal |
| `artifacts/api-server/src/routes/gestao-responsaveis.ts` | API de gestão |
| `artifacts/seshat/src/pages/portal-responsavel/index.tsx` | UI do portal |
| `scripts/migrate-responsaveis.sql` | DDL |
| `.specs/features/portal-responsavel.md` | Spec completa |
