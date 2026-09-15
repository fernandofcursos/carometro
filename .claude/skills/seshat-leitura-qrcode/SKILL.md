# Skill: Leitura de QR Code — Carteira e Cartão de Liberação

## Spec de referência
`.specs/features/leitura-qrcode.md`

---

## Visão Geral

Dois fluxos de leitura de QR Code com propósitos distintos:

| Documento | Canal | Auth | Efeito |
|---|---|---|---|
| **Carteira de Estudante** | Câmera (externo) + UI interna | Externo: não · Interno: autenticado | Apenas validação |
| **Cartão de Liberação** | UI interna | Obrigatória | Ocorrência + e-mail automático |

**Permissão de acesso interno:** `carteiras:verificar`
**Perfis:** `portaria`, `coordenacao`, `gestao`, `secretaria`

---

## Migração SQL (`scripts/migrate-leitura-qrcode.sql`)

```sql
-- Colunas de leitura
ALTER TABLE carteiras    ADD COLUMN IF NOT EXISTS lido_em      timestamptz;
ALTER TABLE carteiras    ADD COLUMN IF NOT EXISTS lido_por_id  uuid REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE cartoes_saida ADD COLUMN IF NOT EXISTS lido_em     timestamptz;
ALTER TABLE cartoes_saida ADD COLUMN IF NOT EXISTS lido_por_id uuid REFERENCES usuarios(id) ON DELETE SET NULL;

-- Slug em tipos_ocorrencias (idempotente)
ALTER TABLE tipos_ocorrencias ADD COLUMN IF NOT EXISTS slug varchar(60);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tipo_ocorrencia_slug ON tipos_ocorrencias(slug) WHERE slug IS NOT NULL;

-- Seed tipo ocorrência
INSERT INTO tipos_ocorrencias (id, descricao, status, slug)
VALUES (gen_random_uuid(), 'Saída Antecipada', 'ativo', 'saida-antecipada')
ON CONFLICT ON CONSTRAINT uq_tipo_ocorrencia_slug DO NOTHING;

-- Permissão
INSERT INTO permissoes (recurso, acao) VALUES ('carteiras', 'verificar')
ON CONFLICT (recurso, acao) DO NOTHING;

-- Role portaria (caso não exista)
INSERT INTO roles (id, nome, descricao)
VALUES (gen_random_uuid(), 'portaria', 'Portaria — leitura de QR Code')
ON CONFLICT (nome) DO NOTHING;

-- Atribuir permissão aos roles
INSERT INTO roles_permissoes (role_id, permissao_id)
SELECT r.id, p.id FROM roles r, permissoes p
WHERE r.nome IN ('portaria', 'coordenacao', 'gestao', 'secretaria')
  AND p.recurso = 'carteiras' AND p.acao = 'verificar'
ON CONFLICT DO NOTHING;
```

---

## Schema Drizzle

### `carteiras.ts` — acrescentar campos:
```typescript
lidoEm:      timestamp("lido_em", { withTimezone: true }),
lidoPorId:   uuid("lido_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
```

### `cartoes-saida.ts` — acrescentar campos:
```typescript
lidoEm:      timestamp("lido_em", { withTimezone: true }),
lidoPorId:   uuid("lido_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
```

### `tipos-ocorrencias.ts` — acrescentar campo:
```typescript
slug: varchar("slug", { length: 60 }),
```

---

## API — `artifacts/api-server/src/routes/leitura-qr.ts`

```typescript
import { Router } from "express";
import { db, carteirasTable, cartoesSaidaTable, ocorrenciasTable, tiposOcorrenciasTable,
         estudantesTable, usuariosTable, matriculasTable, eq, and, isNull } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { verificarTokenHMAC } from "../lib/token.js";
import { registrarOcorrenciaComEmail } from "../lib/ocorrencia-helper.js";

const router = Router();
router.use(requireAuth);
router.use(requirePermissao("carteiras:verificar"));

// POST /api/leitura-qr/carteira
router.post("/carteira", async (req, res) => {
  const { token } = req.body;
  const payload = verificarTokenHMAC(token);
  if (!payload) return res.status(400).json({ valido: false, erro: "Token inválido." });

  const carteira = await db.select().from(carteirasTable)
    .where(eq(carteirasTable.token, token)).limit(1);
  if (!carteira[0]) return res.status(404).json({ valido: false, erro: "Carteira não encontrada." });
  if (carteira[0].status !== "ativa")
    return res.status(403).json({ valido: false, status: carteira[0].status, erro: "Carteira inativa." });

  // auditoria
  await registrarAuditoria({ operacao: "leitura-qr", tabela: "carteiras",
    registroId: carteira[0].id, ipOrigem: req.ip! });

  return res.json({ valido: true, tipo: carteira[0].tipo, auditoriaId: null });
});

// POST /api/leitura-qr/cartao-liberacao
router.post("/cartao-liberacao", async (req, res) => {
  const { token } = req.body;
  const payload = verificarTokenHMAC(token);
  if (!payload) return res.status(400).json({ valido: false, erro: "Token inválido." });

  // Determinar tipo pelo payload.tipo
  const tipo: "cartao-semestral" | "diario" = payload.tipo === "cartao-semestral"
    ? "cartao-semestral" : "diario";

  let estudanteId: string;
  let horarioSaida: string | null;
  let dataSaida: string | null = null;
  let registroId: string;

  if (tipo === "cartao-semestral") {
    const [c] = await db.select().from(carteirasTable).where(eq(carteirasTable.token, token)).limit(1);
    if (!c) return res.status(404).json({ valido: false, erro: "Cartão não encontrado." });
    if (c.status !== "ativa") return res.status(403).json({ valido: false, erro: "Cartão revogado." });
    horarioSaida = c.horarioSaida;
    estudanteId  = await resolverEstudanteId(c.usuarioId);
    registroId   = c.id;
    // idempotência
    if (c.lidoEm) {
      const hoje = new Date().toISOString().substring(0, 10);
      const lidoHoje = c.lidoEm.toISOString().substring(0, 10) === hoje;
      if (lidoHoje) return res.json({ valido: true, jaRegistrado: true });
    }
  } else {
    const [c] = await db.select().from(cartoesSaidaTable).where(eq(cartoesSaidaTable.token, token)).limit(1);
    if (!c) return res.status(404).json({ valido: false, erro: "Cartão não encontrado." });
    if (c.status !== "aprovado") return res.status(403).json({ valido: false, erro: "Cartão não aprovado." });
    horarioSaida = c.horarioSaida;
    dataSaida    = c.dataSaida;
    estudanteId  = c.estudanteId;
    registroId   = c.id;
    if (c.lidoEm) return res.json({ valido: true, jaRegistrado: true });
  }

  // Validar janela ±5 min
  if (!dentroJanelaHorario(dataSaida, horarioSaida)) {
    return res.status(422).json({
      valido: false,
      erro: "Fora do horário de saída autorizado.",
      horarioSaida,
      janela: "±5 min",
    });
  }

  // Registrar ocorrência + e-mail
  const { ocorrenciaId, emailEnviado } = await registrarOcorrenciaComEmail({
    estudanteId,
    tipo: "saida-antecipada",
    registradoPorId: req.usuarioId!,
    horarioSaida: horarioSaida ?? "",
    tipoCartao: tipo,
    ip: req.ip!,
  });

  // Marcar como lido
  const agora = new Date();
  if (tipo === "cartao-semestral") {
    await db.update(carteirasTable).set({ lidoEm: agora, lidoPorId: req.usuarioId })
      .where(eq(carteirasTable.id, registroId));
  } else {
    await db.update(cartoesSaidaTable).set({ lidoEm: agora, lidoPorId: req.usuarioId })
      .where(eq(cartoesSaidaTable.id, registroId));
  }

  return res.json({ valido: true, tipo, ocorrenciaId, emailEnviado });
});

function dentroJanelaHorario(dataSaida: string | null, horarioSaida: string | null): boolean {
  if (!horarioSaida) return false;
  const [hh, mm] = horarioSaida.split(":").map(Number);
  const agora = new Date();
  const hoje = agora.toISOString().substring(0, 10);
  if (dataSaida && dataSaida !== hoje) return false;
  const totalMin = agora.getHours() * 60 + agora.getMinutes();
  return Math.abs(totalMin - (hh * 60 + mm)) <= 5;
}

export default router;
```

Registrar em `artifacts/api-server/src/index.ts`:
```typescript
import leituraQrRouter from "./routes/leitura-qr.js";
app.use("/api/leitura-qr", leituraQrRouter);
```

---

## Helper — `registrarOcorrenciaComEmail`

Crie em `artifacts/api-server/src/lib/ocorrencia-helper.ts`:

```typescript
export async function registrarOcorrenciaComEmail(opts: {
  estudanteId: string;
  tipo: "saida-antecipada";          // slug do tipo de ocorrência
  registradoPorId: string;
  horarioSaida: string;
  tipoCartao: "cartao-semestral" | "diario";
  ip: string;
}): Promise<{ ocorrenciaId: string; emailEnviado: boolean }> {
  // 1. Busca ou cria tipo de ocorrência pelo slug
  // 2. Insere em ocorrencias com observação padronizada
  // 3. Dispara e-mail via lógica de POST /api/ocorrencias (reutilizar função existente)
  // 4. Retorna ids
}
```

> Reutilize a função de disparo de e-mail que já existe em `routes/ocorrencias.ts` — extraia-a para `lib/ocorrencia-helper.ts` e use nos dois lugares.

---

## UI — `artifacts/seshat/src/pages/leitura-qr/index.tsx`

```typescript
// Estrutura
<LeituraQrPage>
  <Tabs defaultValue="carteira">
    <TabsTrigger value="carteira">Carteira de Estudante</TabsTrigger>
    <TabsTrigger value="cartao">Cartão de Saída</TabsTrigger>

    <TabsContent value="carteira">
      <QrScannerPanel onRead={handleLeituraCarteira} />
      <ResultadoCarteira resultado={resultado} />
    </TabsContent>

    <TabsContent value="cartao">
      <QrScannerPanel onRead={handleLeituraCartao} />
      <ResultadoCartaoLiberacao resultado={resultado} />
      {/* Se válido: exibe CartaoLiberacaoCard (componente importado do portal) */}
    </TabsContent>
  </Tabs>
</LeituraQrPage>
```

### `QrScannerPanel`

```typescript
// Instala: pnpm add @zxing/browser (workspace seshat)
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";

// Lê da câmera → dispara onRead(token)
// Alternativa: <Input> para colar token manualmente
// Após leitura bem-sucedida: pausa 3 s (evita dupla leitura)
```

### `ResultadoCartaoLiberacao`

Exibe (quando `valido: true`):
- Badge `"✅ Saída autorizada — Ocorrência registrada"`
- `CartaoLiberacaoCard` (componente do portal, importado de `pages/portal`)
- Horário da leitura + registrado por

Exibe (quando `valido: false`):
- Badge vermelho com `erro`

---

## Rota + Menu

### `artifacts/seshat/src/App.tsx`
```typescript
{ path: "/leitura-qr", element: <LeituraQrPage />, permission: "carteiras:verificar" }
```

### `artifacts/seshat/src/components/layout.tsx`

```typescript
// Adicionar item de menu para os perfis portaria, coordenacao, gestao, secretaria
// hasAny("carteiras:verificar")
{ label: "Leitura de QR", icon: QrCode, href: "/leitura-qr" }
```

---

## Segurança do Token — Resumo

| Fase | Algoritmo | Estado |
|---|---|---|
| Atual | HMAC-SHA256 | ✅ Implementado — `SESSION_SECRET` |
| Futura | Ed25519 | 📋 Spec documentada — `SIGNING_PRIVATE_KEY` + chave pública em `/api/verificar/pubkey` |

### Token HMAC-SHA256 (atual)
```
base64url(payload) + "." + HMAC-SHA256(base64url(payload), SESSION_SECRET)
payload = { usuarioId, tipo, ano, semestre, ts }
```

### `lib/token.ts` — função de verificação
```typescript
export function verificarTokenHMAC(token: string): TokenPayload | null {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  const expected = createHmac("sha256", process.env.SESSION_SECRET!)
    .update(b64).digest("hex");
  if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
  try { return JSON.parse(Buffer.from(b64, "base64url").toString()); }
  catch { return null; }
}
```

---

## Permissão

```
carteiras:verificar  →  portaria, coordenacao, gestao, secretaria
```

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `scripts/migrate-leitura-qrcode.sql` | DDL colunas + seed permissão + tipo ocorrência |
| `lib/db/src/schema/carteiras.ts` | + `lidoEm`, `lidoPorId` |
| `lib/db/src/schema/cartoes-saida.ts` | + `lidoEm`, `lidoPorId` |
| `lib/db/src/schema/tipos-ocorrencias.ts` | + `slug` |
| `artifacts/api-server/src/routes/leitura-qr.ts` | Endpoints de leitura |
| `artifacts/api-server/src/lib/ocorrencia-helper.ts` | Helper de ocorrência + e-mail |
| `artifacts/api-server/src/lib/token.ts` | `verificarTokenHMAC` |
| `artifacts/seshat/src/pages/leitura-qr/index.tsx` | UI scanner |
| `artifacts/seshat/src/App.tsx` | Rota `/leitura-qr` |
| `artifacts/seshat/src/components/layout.tsx` | Menu |
| `.specs/features/leitura-qrcode.md` | Spec completa |
