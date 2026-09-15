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
function gerarTokenCartaoSaida(id: string, estudanteId: string, dataSaida: Date | string): string {
  const secret = process.env.SESSION_SECRET!;
  const payload = `cartao_saida:${id}:${estudanteId}:${dataSaida}:${Date.now()}`;
  const assinatura = createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(JSON.stringify({ payload, assinatura })).toString("base64url");
}
```

## Upload de Atestado (Frontend)

```typescript
// Converter arquivo para base64 via FileReader
const reader = new FileReader();
reader.onload = (e) => {
  const base64 = (e.target?.result as string).split(",")[1]; // remover prefixo data:...;base64,
  // enviar { estudanteId, dataInicio, dataFim?, arquivo: { nome, tipo, dados: base64 } }
};
reader.readAsDataURL(arquivo);
```

## Estrutura da Página

```
PortalResponsavelPage  (/portal-responsavel — "Meus Filhos")
├── Cabeçalho: foto + nome do responsável + contagem de filhos
└── Accordion (type="multiple") — todos os filhos visíveis simultaneamente:
    └── [AccordionItem por estudante]
        ├── Header: foto + nome + turma + curso
        └── Tabs:
            ├── DadosEstudanteTab — matrícula + carteira de estudante com QR
            ├── OcorrenciasTab — lista + dar ciência (sem restrição de idade)
            ├── CartaoSaidaTab — form de solicitação + lista com QR se aprovado
            └── AtestadosTab — upload + lista + download
```

- **Não há Select de seleção** — todos os filhos aparecem ao mesmo tempo
- Primeiro filho aberto por padrão (`openItems = [estudantes[0].id]`)
- Estudantes não enturmados (`turmaId = null`) aparecem com "Não enturmado"

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
if (!vinculo.length) return res.status(403).json({ error: "Sem vínculo com este estudante." });
```

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
