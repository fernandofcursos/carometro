# Carômetro — Sequência Estratégica de Solução

> Documento técnico baseado na análise do repositório `fernandofcursos/carometro`.
> Cada fase é um bloco autônomo que o projeto pode validar antes de avançar.
> Conformidade com **LGPD (Lei 13.709/2018)** e **ISO/IEC 27001:2022** é transversal a todas as fases.

---

## Visão geral das fases

| # | Fase | Entregável | Pré-requisito |
|---|------|-----------|---------------|
| 1 | Backend `api-server` | Express 5 + todos os 48 endpoints funcionando | — |
| 2 | Armazenamento de fotos | Estratégia consolidada e aplicada | <!--
Fase 1 |
-->

| 3 | LGPD — sincronização real | Consentimentos gravados no banco | Fase 1 |
| 4 | Offline — fila conectada | Mutações survivem a quedas de rede | Fase 1 |
| 5 | Schema Drizzle — alinhamento | Um único source of truth entre DB, Drizzle e API | Fases 1+2 |
| 6 | HTTPS + câmera em produção | TLS obrigatório, câmera funciona | Fase 1 |
| 7 | Docker + docker-compose | Containerização completa | Fases 1–6 |
| 8 | PWA — manifest limpo | Manifest único e correto | Fase 7 |
| 9 | Auditoria e ISO 27001 real | Logs reais no banco, UI funcionando | Fases 1+3 |

---

## Fase 1 — Criar o `artifacts/api-server`

**Por que é o passo zero:** sem o backend, nenhuma outra parte funciona. O frontend está 100% pronto e aguarda respostas da API. O `openapi.yaml` de 1.873 linhas já descreve os 48 endpoints com todos os schemas — é o contrato a implementar.

### 1.1 Estrutura de diretórios

Criar `artifacts/api-server/` com a seguinte estrutura:

```
artifacts/api-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # entrypoint — cria app Express, registra middlewares, inicia servidor
│   ├── app.ts                # factory da aplicação (separado para testes)
│   ├── lib/
│   │   ├── auth.ts           # JWT sign/verify, cookie helpers
│   │   ├── crypto.ts         # AES-256-CBC encrypt/decrypt para e-mails
│   │   ├── audit.ts          # helper para gravar em auditoria_logs
│   │   └── permissions.ts    # middleware de verificação de permissões
│   └── routes/
│       ├── auth.ts
│       ├── turnos.ts
│       ├── cursos.ts
│       ├── turmas.ts
│       ├── estudantes.ts
│       ├── carometro.ts
│       ├── import.ts
│       ├── ocorrencias.ts
│       ├── roles.ts
│       ├── usuarios.ts
│       └── disciplinas.ts
```

### 1.2 `package.json` do api-server

```json
{
  "name": "@workspace/api-server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "esbuild src/index.ts --bundle --platform=node --format=cjs --outfile=dist/server.cjs --external:pg-native",
    "start": "node dist/server.cjs",
    "seed-admin": "tsx src/scripts/seed-admin.ts"
  },
  "dependencies": {
    "@workspace/db": "workspace:*",
    "bcryptjs": "^2.4.3",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.5",
    "express": "^5.0.1",
    "helmet": "^8.0.0",
    "jsonwebtoken": "^9.0.2",
    "pino": "^9.6.0",
    "pino-http": "^10.4.0",
    "zod": "catalog:",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cookie-parser": "^1.4.8",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/jsonwebtoken": "^9.0.8",
    "@types/node": "catalog:",
    "esbuild": "0.27.3",
    "tsx": "catalog:"
  }
}
```

### 1.3 Middlewares obrigatórios em `src/app.ts`

```typescript
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";

export function createApp() {
  const app = express();

  // ISO 27001 — A.8.26: segurança em aplicações (headers de segurança)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
  }));

  app.use(cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5000",
    credentials: true,   // necessário para cookies httpOnly
  }));

  app.use(cookieParser());
  app.use(express.json({ limit: "10mb" }));  // fotos base64 precisam de limite maior

  // Logging estruturado — ISO 27001 A.8.15 (logging de eventos)
  app.use(pinoHttp({ level: process.env.LOG_LEVEL ?? "info" }));

  return app;
}
```

### 1.4 Implementar autenticação em `src/routes/auth.ts`

Este é o ponto mais crítico do backend. Cada sub-rota tem detalhes obrigatórios:

**POST /api/auth/login**

```typescript
// Validação com Zod (inline, sem controller separado — padrão do projeto)
const loginSchema = z.object({
  codigoAcesso: z.string().min(1),
  senha: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos" });

  const { codigoAcesso, senha } = parsed.data;

  // Buscar usuário por codigoAcesso
  const [usuario] = await db
    .select()
    .from(usuariosTable)
    .where(eq(usuariosTable.codigoAcesso, codigoAcesso.toUpperCase()));

  // LGPD + ISO 27001 A.8.3: não revelar se usuário existe ou não
  if (!usuario) {
    return res.status(401).json({ error: "Código de acesso ou senha inválidos" });
  }

  // ISO 27001 A.8.5: bloqueio após tentativas falhas
  if (usuario.bloqueadoAte && usuario.bloqueadoAte > new Date()) {
    return res.status(429).json({ error: "Conta temporariamente bloqueada. Tente mais tarde." });
  }

  const senhaOk = await bcrypt.compare(senha, usuario.senhaHash);

  if (!senhaOk) {
    // Incrementar tentativas falhas e bloquear após 5
    const novasTentativas = (usuario.tentativasLoginFalhas ?? 0) + 1;
    const bloqueio = novasTentativas >= 5
      ? new Date(Date.now() + 15 * 60 * 1000)  // 15 minutos
      : null;

    await db.update(usuariosTable)
      .set({ tentativasLoginFalhas: novasTentativas, bloqueadoAte: bloqueio })
      .where(eq(usuariosTable.id, usuario.id));

    // Auditoria — ISO 27001 A.8.15
    await registrarAuditoria({
      tabela: "usuarios",
      operacao: "SELECT",
      registroId: usuario.id,
      usuarioId: null,
      ipOrigem: req.ip,
      userAgent: req.headers["user-agent"],
      endpoint: "POST /api/auth/login",
      statusHttp: 401,
    });

    return res.status(401).json({ error: "Código de acesso ou senha inválidos" });
  }

  // Resetar tentativas falhas após login bem-sucedido
  await db.update(usuariosTable)
    .set({ tentativasLoginFalhas: 0, bloqueadoAte: null, ultimoLoginEm: new Date() })
    .where(eq(usuariosTable.id, usuario.id));

  // Buscar roles e permissões
  const roles = await buscarRolesDoUsuario(usuario.id);
  const permissoes = await buscarPermissoesDoUsuario(usuario.id);

  // Gerar JWT — 8 horas de validade
  const token = jwt.sign(
    { sub: usuario.id, roles: roles.map(r => r.nome) },
    process.env.SESSION_SECRET!,
    { expiresIn: "8h", issuer: "carometro" }
  );

  // Cookie httpOnly — LGPD + ISO 27001 A.8.20 (segurança de rede)
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  });

  // Descriptografar e-mail para retornar na resposta
  const email = decrypt(usuario.emailEncrypted);

  res.json(montarAuthMe(usuario, email, roles, permissoes, disciplinas));
});
```

**Middleware de autenticação reutilizável:**

```typescript
// src/lib/auth.ts
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "Não autenticado" });

  try {
    const payload = jwt.verify(token, process.env.SESSION_SECRET!, {
      issuer: "carometro",
    }) as { sub: string };
    req.usuarioId = payload.sub;
    next();
  } catch {
    res.clearCookie("token");
    return res.status(401).json({ error: "Sessão expirada" });
  }
}
```

### 1.5 Implementar todas as rotas CRUD

Cada arquivo de rota segue o mesmo padrão. Exemplo completo para `src/routes/turnos.ts`:

```typescript
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { turnosTable } from "@workspace/db/schema";
import { eq, isNull } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";

const router = Router();

// Todas as rotas exigem autenticação
router.use(requireAuth);

const turnoSchema = z.object({ nome: z.string().min(1).max(50) });

// GET /api/turnos
router.get("/", async (req, res) => {
  const turnos = await db
    .select()
    .from(turnosTable)
    .where(isNull(turnosTable.deletadoEm))
    .orderBy(turnosTable.nome);
  res.json(turnos);
});

// POST /api/turnos — exige permissão turnos:manage
router.post("/", requirePermissao("turnos:manage"), async (req, res) => {
  const parsed = turnoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos", issues: parsed.error.issues });

  const [turno] = await db.insert(turnosTable).values(parsed.data).returning();
  res.status(201).json(turno);
});

// PUT /api/turnos/:id
router.put("/:id", requirePermissao("turnos:manage"), async (req, res) => {
  const parsed = turnoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos" });

  const [turno] = await db
    .update(turnosTable)
    .set({ ...parsed.data, atualizadoEm: new Date() })
    .where(eq(turnosTable.id, req.params.id))
    .returning();

  if (!turno) return res.status(404).json({ error: "Não encontrado" });
  res.json(turno);
});

// DELETE /api/turnos/:id — soft delete
router.delete("/:id", requirePermissao("turnos:manage"), async (req, res) => {
  await db
    .update(turnosTable)
    .set({ deletadoEm: new Date() })
    .where(eq(turnosTable.id, req.params.id));
  res.status(204).end();
});

export default router;
```

Repetir esse padrão para `cursos`, `turmas`, `disciplinas`, `tipos-ocorrencias`.

### 1.6 Rota de estudantes — atenção especial (LGPD)

```typescript
// GET /api/estudantes — os e-mails dos estudantes são dados pessoais
// LGPD Art. 7º — só retornar ao usuário com permissão correta
router.get("/", requireAuth, async (req, res) => {
  const { turmaId, turnoId, cursoId, search } = req.query;

  // Montar query com joins necessários
  const estudantes = await db
    .select({
      id: estudantesTable.id,
      nome: estudantesTable.nome,
      registro: estudantesTable.registro,
      fotoUrl: estudantesTable.fotoUrl,
      observacao: estudantesTable.observacao,
      turmaId: estudantesTable.turmaId,
      turmaSigla: turmasTable.sigla,
      turmaDescricao: turmasTable.descricao,
      turnoNome: turnosTable.nome,
      cursoNome: cursosTable.nome,
      criadoEm: estudantesTable.criadoEm,
    })
    .from(estudantesTable)
    .innerJoin(turmasTable, eq(estudantesTable.turmaId, turmasTable.id))
    .innerJoin(turnosTable, eq(turmasTable.turnoId, turnosTable.id))
    .innerJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
    .where(and(
      isNull(estudantesTable.deletadoEm),
      turmaId ? eq(estudantesTable.turmaId, turmaId as string) : undefined,
      // aplicar filtros de turnoId, cursoId, search...
    ))
    .orderBy(estudantesTable.nome);

  // Buscar e-mails separadamente (dado sensível — LGPD)
  const emails = await db
    .select()
    .from(estudanteEmailsTable)
    .where(inArray(estudanteEmailsTable.estudanteId, estudantes.map(e => e.id)));

  // Compor resposta
  const resultado = estudantes.map(e => ({
    ...e,
    emails: emails.filter(em => em.estudanteId === e.id),
  }));

  // Auditoria de acesso a dados pessoais — LGPD Art. 37 + ISO 27001 A.8.15
  await registrarAuditoria({
    tabela: "estudantes",
    operacao: "SELECT",
    usuarioId: req.usuarioId,
    ipOrigem: req.ip,
    endpoint: "GET /api/estudantes",
    statusHttp: 200,
    metodoHttp: "GET",
  });

  res.json(resultado);
});
```

### 1.7 Registrar todas as rotas em `src/index.ts`

```typescript
import { createApp } from "./app.js";
import authRouter from "./routes/auth.js";
import turnosRouter from "./routes/turnos.js";
// ... demais imports

const app = createApp();

app.get("/api/healthz", (_, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRouter);
app.use("/api/turnos", turnosRouter);
app.use("/api/cursos", cursosRouter);
app.use("/api/turmas", turmasRouter);
app.use("/api/estudantes", estudantesRouter);
app.use("/api/carometro", carometroRouter);
app.use("/api/import", importRouter);
app.use("/api/ocorrencias", ocorrenciasRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/usuarios", usuariosRouter);
app.use("/api/disciplinas", disciplinasRouter);

// Handler de erro global — nunca vazar stack trace em produção
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  req.log?.error(err);
  const isProd = process.env.NODE_ENV === "production";
  res.status(500).json({
    error: isProd ? "Erro interno" : err.message,
  });
});

const PORT = Number(process.env.PORT ?? 8080);
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});
```

### 1.8 Verificação da Fase 1

Antes de avançar, confirmar:

- `pnpm --filter @workspace/api-server run dev` sobe sem erros
- `curl http://localhost:8080/api/healthz` retorna `{"status":"ok"}`
- Login com `seed-admin` funciona e retorna cookie
- Frontend em `:5000` consegue autenticar e carregar o dashboard

---

## Fase 2 — Armazenamento de fotos

**Decisão técnica necessária:** o projeto tem três abordagens incompatíveis convivendo. Esta fase resolve isso com uma única estratégia coerente.

### 2.1 Estratégia recomendada: base64 criptografado no PostgreSQL

Para escolas de porte médio (até ~5.000 estudantes), armazenar fotos como `bytea` criptografado no banco é a solução mais simples, sem dependências externas, e plenamente funcional em Docker.

**Vantagens para este projeto:**
- Sem volume Docker adicional para fotos
- Backup do banco = backup das fotos (atomicidade)
- Sem serviço externo (S3, MinIO) para configurar
- Criptografia já planejada no schema Drizzle atual

**Limite prático:** fotos JPEG de rosto, comprimidas no frontend para 150KB antes do upload, permitem ~5.000 estudantes com ~750MB em fotos. Adequado para escolas públicas.

### 2.2 Atualizar schema Drizzle

O schema atual já tem os campos corretos. Confirmar que estão no `estudantesTable`:

```typescript
// lib/db/src/schema/estudantes.ts — campos já existentes, confirmar
fotoStorageKey: varchar("foto_storage_key", { length: 200 }),  // UUID do arquivo interno
fotoIv: char("foto_iv", { length: 24 }),                       // IV do AES-256
fotoMimeType: varchar("foto_mime_type", { length: 20 }),        // "image/jpeg"
fotoTamanhoBytes: integer("foto_tamanho_bytes"),
fotoHashIntegridade: char("foto_hash_integridade", { length: 64 }), // SHA-256
```

E adicionar a coluna de bytes real (ainda ausente no schema):

```typescript
// Adicionar ao estudantesTable:
fotoDados: customType<{ data: Buffer }>({
  dataType() { return "bytea"; },
  toDriver(v: Buffer) { return v; },
  fromDriver(v) { return v as Buffer; },
})("foto_dados"),
```

Após editar: `pnpm --filter @workspace/db run push`

### 2.3 Implementar `POST /api/estudantes/:id/foto`

```typescript
// src/routes/estudantes.ts
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";

function getChave(): Buffer {
  return createHash("sha256").update(process.env.SESSION_SECRET!).digest();
}

function criptografarFoto(dadosBase64: string): {
  dadosCriptografados: Buffer;
  iv: string;
  hash: string;
  mimeType: string;
  tamanhoBytes: number;
} {
  // Extrair mime type e dados puros do data URL
  // "data:image/jpeg;base64,/9j/4AAQ..." → { mimeType: "image/jpeg", dados: Buffer }
  const match = dadosBase64.match(/^data:(.+);base64,(.+)$/);
  if (!match) throw new Error("Formato de foto inválido");

  const mimeType = match[1];
  const dadosBrutos = Buffer.from(match[2], "base64");

  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", getChave(), iv);
  const dadosCriptografados = Buffer.concat([cipher.update(dadosBrutos), cipher.final()]);
  const hash = createHash("sha256").update(dadosBrutos).digest("hex");

  return {
    dadosCriptografados,
    iv: iv.toString("base64"),  // 24 chars em base64
    hash,
    mimeType,
    tamanhoBytes: dadosBrutos.length,
  };
}

router.post("/:id/foto", requireAuth, requirePermissao("estudantes:manage"), async (req, res) => {
  const { fotoBase64 } = req.body;
  if (!fotoBase64) return res.status(400).json({ error: "fotoBase64 obrigatório" });

  // Validar tamanho — LGPD: minimização de dados
  const tamanhoBase64 = fotoBase64.length;
  if (tamanhoBase64 > 5_000_000) {  // ~3.7MB em binário
    return res.status(413).json({ error: "Foto muito grande. Máximo: 3MB" });
  }

  const foto = criptografarFoto(fotoBase64);
  const storageKey = randomUUID();

  await db.update(estudantesTable)
    .set({
      fotoStorageKey: storageKey,
      fotoDados: foto.dadosCriptografados,
      fotoIv: foto.iv,
      fotoMimeType: foto.mimeType,
      fotoTamanhoBytes: foto.tamanhoBytes,
      fotoHashIntegridade: foto.hash,
      atualizadoEm: new Date(),
    })
    .where(eq(estudantesTable.id, req.params.id));

  // Auditoria de foto — dado biométrico (LGPD Art. 11)
  await registrarAuditoria({
    tabela: "estudantes",
    operacao: "UPDATE",
    registroId: req.params.id,
    usuarioId: req.usuarioId,
    ipOrigem: req.ip,
    endpoint: `POST /api/estudantes/${req.params.id}/foto`,
    statusHttp: 200,
  });

  const estudante = await buscarEstudanteComFotoUrl(req.params.id);
  res.json(estudante);
});
```

### 2.4 Endpoint para servir a foto descriptografada

O campo `fotoUrl` retornado pelo API deve ser uma URL relativa: `/api/estudantes/:id/foto`.

```typescript
// GET /api/estudantes/:id/foto
router.get("/:id/foto", requireAuth, async (req, res) => {
  const [estudante] = await db
    .select({
      fotoDados: estudantesTable.fotoDados,
      fotoIv: estudantesTable.fotoIv,
      fotoMimeType: estudantesTable.fotoMimeType,
      fotoHashIntegridade: estudantesTable.fotoHashIntegridade,
    })
    .from(estudantesTable)
    .where(eq(estudantesTable.id, req.params.id));

  if (!estudante?.fotoDados) {
    return res.status(404).end();
  }

  // Descriptografar
  const iv = Buffer.from(estudante.fotoIv!, "base64");
  const decipher = createDecipheriv("aes-256-cbc", getChave(), iv);
  const dadosBrutos = Buffer.concat([
    decipher.update(estudante.fotoDados!),
    decipher.final(),
  ]);

  // Verificar integridade — ISO 27001 A.8.20
  const hashAtual = createHash("sha256").update(dadosBrutos).digest("hex");
  if (hashAtual !== estudante.fotoHashIntegridade) {
    // Log de alerta de integridade
    req.log.error({ estudanteId: req.params.id }, "ALERTA: integridade da foto comprometida");
    return res.status(500).json({ error: "Erro de integridade" });
  }

  // Cache agressivo — a foto só muda com novo upload
  res.set("Cache-Control", "private, max-age=604800");  // 7 dias
  res.set("Content-Type", estudante.fotoMimeType ?? "image/jpeg");
  res.send(dadosBrutos);
});
```

### 2.5 Compressão no frontend antes do upload

Em `artifacts/carometro/src/components/camera-capture.tsx`, antes de chamar `onCapture`:

```typescript
async function comprimirImagem(base64: string, maxKB = 150): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // Redimensionar mantendo proporção, máx 600px de largura
      const maxW = 600;
      const ratio = Math.min(1, maxW / img.width);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;

      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Tentar qualidades decrescentes até atingir o limite
      let quality = 0.8;
      let result = canvas.toDataURL("image/jpeg", quality);
      while (result.length > maxKB * 1024 * 1.37 && quality > 0.3) {
        quality -= 0.1;
        result = canvas.toDataURL("image/jpeg", quality);
      }
      resolve(result);
    };
    img.src = base64;
  });
}
```

### 2.6 Verificação da Fase 2

- Upload de foto funciona e retorna HTTP 200
- Foto aparece no carômetro
- `GET /api/estudantes/:id/foto` retorna a imagem corretamente
- Foto ocupa espaço razoável no banco (< 200KB por estudante)

---

## Fase 3 — LGPD: sincronização real de consentimentos

**Problema atual:** `syncConsentToAPI()` em `use-lgpd.ts` contém apenas um `console.log`. Os consentimentos nunca chegam ao banco.

### 3.1 Adicionar endpoints LGPD ao `openapi.yaml`

Inserir antes da seção `components:`:

```yaml
  /consentimentos:
    post:
      operationId: registrarConsentimento
      tags: [lgpd]
      summary: Registrar ou atualizar consentimento LGPD
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ConsentimentoInput"
      responses:
        "201":
          description: Consentimento registrado

  /solicitacoes-lgpd:
    post:
      operationId: criarSolicitacaoLgpd
      tags: [lgpd]
      summary: Criar solicitação de direito do titular
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/SolicitacaoLgpdInput"
      responses:
        "201":
          description: Solicitação criada

  /auditoria:
    get:
      operationId: listAuditoria
      tags: [auditoria]
      summary: Listar logs de auditoria
      parameters:
        - name: limite
          in: query
          schema:
            type: integer
            default: 50
      responses:
        "200":
          description: Logs de auditoria
```

Após editar o yaml: `pnpm --filter @workspace/api-spec run codegen`

### 3.2 Implementar `src/routes/lgpd.ts` no api-server

```typescript
// POST /api/consentimentos
router.post("/consentimentos", requireAuth, async (req, res) => {
  const schema = z.object({
    finalidade: z.string().min(1),
    consentido: z.boolean(),
    versaoPolitica: z.string().default("1.0"),
    baseLegal: z.enum([
      "consentimento", "obrigacao_legal", "contrato",
      "interesse_legitimo", "obrigacao_legal",
    ]),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos" });

  // Revogar consentimento anterior para a mesma finalidade
  await db.update(consentimentosLgpdTable)
    .set({ revogadoEm: new Date(), revogadoMotivo: "substituído por novo registro" })
    .where(and(
      eq(consentimentosLgpdTable.usuarioId, req.usuarioId),
      eq(consentimentosLgpdTable.finalidade, parsed.data.finalidade),
      isNull(consentimentosLgpdTable.revogadoEm),
    ));

  const [consentimento] = await db.insert(consentimentosLgpdTable).values({
    usuarioId: req.usuarioId,
    finalidade: parsed.data.finalidade,
    versaoPolitica: parsed.data.versaoPolitica,
    consentido: parsed.data.consentido,
    ipOrigem: req.ip,
    userAgent: req.headers["user-agent"],
    baseLegal: parsed.data.baseLegal,
  }).returning();

  res.status(201).json(consentimento);
});
```

### 3.3 Conectar o frontend

Em `artifacts/carometro/src/hooks/use-lgpd.ts`, substituir o `console.log` por:

```typescript
async function syncConsentToAPI({
  purposeId, granted, userId,
}: { purposeId: string; granted: boolean; userId: string | null }) {
  if (!userId) return;  // usuário não autenticado ainda

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  try {
    await fetch(`${BASE}/api/consentimentos`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        finalidade: purposeId,
        consentido: granted,
        versaoPolitica: "1.0",
        baseLegal: purposeId === "biometric" ? "consentimento" : "interesse_legitimo",
      }),
    });
  } catch (err) {
    // Falha silenciosa — consentimento já foi salvo em localStorage
    // Será sincronizado quando a conexão for restaurada
    console.warn("[LGPD] Falha ao sincronizar consentimento:", err);
  }
}
```

### 3.4 Implementar endpoint de solicitações de direitos (LGPD Art. 18)

```typescript
// POST /api/solicitacoes-lgpd
router.post("/solicitacoes-lgpd", requireAuth, async (req, res) => {
  const schema = z.object({
    tipo: z.enum([
      "acesso", "correcao", "exclusao", "portabilidade",
      "oposicao", "anonimizacao", "revogacao_consentimento",
    ]),
    motivo: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos" });

  // LGPD Art. 18 §5 — prazo de 15 dias para resposta
  const prazoLegal = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

  const [solicitacao] = await db.insert(solicitacoesLgpdTable).values({
    usuarioId: req.usuarioId,
    tipo: parsed.data.tipo,
    motivo: parsed.data.motivo,
    prazoLegal,
    status: "pendente",
  }).returning();

  res.status(201).json(solicitacao);
});
```

### 3.5 Verificação da Fase 3

- Abrir modal LGPD no frontend, aceitar/rejeitar consentimentos
- Verificar no banco: `SELECT * FROM consentimentos_lgpd ORDER BY consentido_em DESC LIMIT 10;`
- Os registros devem aparecer com `usuario_id`, `finalidade` e `ip_origem` preenchidos

---

## Fase 4 — Offline: conectar a fila às mutações reais

**Problema atual:** `enqueueOfflineMutation()` existe mas nunca é chamada. Mutações offline falham silenciosamente.

### 4.1 Interceptar o `customFetch` quando offline

Em `lib/api-client-react/src/custom-fetch.ts`, modificar a função `customFetch`:

```typescript
// Importar ao topo do arquivo
import { enqueueOfflineMutation } from "./offline-queue.js";

// Adicionar dentro de customFetch, antes do fetch():
if (!navigator.onLine) {
  const method = resolveMethod(input, init.method);
  const url = resolveUrl(input);

  // Só enfileirar mutações (não GETs)
  if (method !== "GET" && method !== "HEAD") {
    enqueueOfflineMutation(
      url,
      method,
      typeof init.body === "string" ? JSON.parse(init.body) : init.body,
    );
    // Retornar resposta otimista para não quebrar a UI
    throw new OfflineQueuedError(`${method} ${url} enfileirado para sincronização offline`);
  }
  // GET offline — deixar o Service Worker responder do cache
}
```

### 4.2 Criar `lib/api-client-react/src/offline-queue.ts`

Mover a lógica que está em `use-network-status.ts` para um módulo independente (sem React), para poder ser importado pelo `customFetch`:

```typescript
// lib/api-client-react/src/offline-queue.ts
export type OfflineMutation = {
  id: string;
  url: string;
  method: string;
  body?: string;
  contentType?: string;
  enqueuedAt: number;
  retries: number;
};

const QUEUE_KEY = "carometro:offline-queue";

export function enqueueOfflineMutation(
  url: string,
  method: string,
  body?: unknown,
  contentType = "application/json",
) {
  const queue = loadQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url,
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    contentType,
    enqueuedAt: Date.now(),
    retries: 0,
  });
  saveQueue(queue);
}

export function loadQueue(): OfflineMutation[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch { return []; }
}

export function saveQueue(q: OfflineMutation[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export class OfflineQueuedError extends Error {
  readonly name = "OfflineQueuedError";
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```

### 4.3 Tratar `OfflineQueuedError` nas páginas

Nas páginas que usam mutações (ex: `ocorrencias/index.tsx`), adicionar tratamento:

```typescript
import { OfflineQueuedError } from "@workspace/api-client-react";

createOcorrencia.mutate({ data: formData }, {
  onSuccess: () => {
    toast({ title: "Ocorrência registrada" });
    queryClient.invalidateQueries({ queryKey: getListOcorrenciasQueryKey() });
  },
  onError: (err) => {
    if (err instanceof OfflineQueuedError) {
      // Feedback positivo — será sincronizado depois
      toast({
        title: "Sem conexão — ocorrência salva",
        description: "Será sincronizada automaticamente ao reconectar.",
      });
    } else {
      toast({ title: "Erro ao registrar ocorrência", variant: "destructive" });
    }
  },
});
```

### 4.4 Páginas prioritárias para tratamento offline

Ordem por impacto operacional:

1. `ocorrencias/index.tsx` — registrar ocorrências (uso diário por coordenadores)
2. `estudantes/new.tsx` — cadastrar estudante
3. `estudantes/detail.tsx` — atualizar dados do estudante

As demais páginas (configurações, importação) podem exigir conexão sem problema.

### 4.5 Verificação da Fase 4

- Abrir o app, desativar o Wi-Fi/rede nas DevTools (Network → Offline)
- Criar uma ocorrência — deve aparecer toast "salva offline"
- Reativar a rede — deve aparecer toast "sincronizada"
- Verificar no banco que a ocorrência foi gravada

---

## Fase 5 — Alinhar schema Drizzle, banco e API

**Problema:** três representações diferentes de `foto_url` / `fotoStorageKey` / `fotoBase64` convivem. Esta fase consolida tudo.

### 5.1 Mapa de ações

| Tabela | Campo atual no DB | Campo no Drizzle atual | Ação |
|--------|-------------------|----------------------|------|
| `estudantes` | `foto_url varchar(500)` | `fotoStorageKey`, `fotoIv`, etc. | Remover `foto_url`, `db push` |
| `usuarios` | `foto_url text` | `fotoStorageKey`, `fotoIv`, etc. | Remover `foto_url`, `db push` |

### 5.2 Migração

Como o projeto usa `drizzle-kit push` (sem migrações versionadas), o processo é:

```bash
# 1. Garantir que nenhum dado em foto_url precisa ser preservado
#    (Se houver dados reais, exportar antes)

# 2. Editar lib/db/src/schema/estudantes.ts
#    Remover qualquer referência a foto_url (que foi gerado pelo introspect, não deve estar no Drizzle atual)
#    Adicionar fotoDados: bytea (conforme Fase 2)

# 3. Aplicar
pnpm --filter @workspace/db run push-force

# 4. Regenerar código
pnpm --filter @workspace/api-spec run codegen
```

### 5.3 Verificação da Fase 5

```sql
-- Confirmar estrutura final
\d estudantes
-- Deve mostrar: foto_storage_key, foto_iv, foto_mime_type, foto_tamanho_bytes,
--               foto_hash_integridade, foto_dados — SEM foto_url
```

---

## Fase 6 — HTTPS e câmera em produção

**Crítico:** `navigator.mediaDevices.getUserMedia` exige HTTPS fora de localhost. Sem isso, a câmera não funciona em nenhum deploy.

### 6.1 Configurar nginx com TLS no docker-compose

O nginx fará TLS termination e encaminhará para o frontend e o backend via proxy reverso.

Criar `nginx/nginx.conf`:

```nginx
events { worker_connections 1024; }

http {
  # Redirecionar HTTP para HTTPS
  server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
  }

  server {
    listen 443 ssl;
    server_name _;

    ssl_certificate     /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Headers de segurança — ISO 27001 A.8.26
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Frontend (estáticos)
    location / {
      root /usr/share/nginx/html;
      try_files $uri $uri/ /index.html;
      
      # Cache para assets com hash no nome
      location ~* \.(js|css|png|jpg|svg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
      }
    }

    # Proxy para a API
    location /api/ {
      proxy_pass http://api-server:8080;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      
      # Necessário para cookies httpOnly funcionarem corretamente
      proxy_cookie_flags ~ httponly samesite=lax;
      
      # Limite de body para suportar fotos base64
      client_max_body_size 10m;
    }
  }
}
```

### 6.2 Certificado auto-assinado para desenvolvimento local

```bash
mkdir -p nginx/ssl

# Gerar certificado auto-assinado (desenvolvimento)
openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem \
  -subj "/C=BR/ST=GO/O=Escola/CN=localhost"
```

Para produção real, substituir pelos certificados reais (Let's Encrypt via Certbot, ou certificado institucional).

### 6.3 Verificação da Fase 6

- Acessar `https://localhost` (aceitar aviso do certificado auto-assinado)
- Navegar para cadastro de estudante → câmera deve funcionar
- Headers de segurança devem aparecer nas DevTools → Network → Response Headers

---

## Fase 7 — Docker e docker-compose

### 7.1 `.env.example` — criar na raiz do projeto

```bash
# Banco de dados
DATABASE_URL=postgresql://carometro:senha_aqui@db:5432/carometro

# Segurança — SESSION_SECRET deve ser uma string aleatória de 64 chars mínimo
# Gerar com: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
SESSION_SECRET=troque_por_string_aleatoria_64_chars_minimo

# Ambiente
NODE_ENV=production
LOG_LEVEL=info

# URL do frontend (para CORS no api-server)
FRONTEND_URL=https://localhost

# Postgres (usado pelo serviço db no docker-compose)
POSTGRES_USER=carometro
POSTGRES_PASSWORD=senha_aqui
POSTGRES_DB=carometro
```

Criar `.env` copiando de `.env.example` e preenchendo os valores reais. Adicionar `.env` ao `.gitignore`.

### 7.2 `Dockerfile` do frontend

```dockerfile
# artifacts/carometro/Dockerfile

# Etapa 1: build
FROM node:24-alpine AS builder
WORKDIR /app

# Copiar arquivos de workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY lib/ ./lib/
COPY artifacts/carometro/ ./artifacts/carometro/

# Instalar pnpm e dependências
RUN npm install -g pnpm@10 && pnpm install --frozen-lockfile

# Build do frontend
ENV NODE_ENV=production
ENV BASE_PATH=/
RUN pnpm --filter @workspace/carometro run build

# Etapa 2: servir com nginx
FROM nginx:alpine AS runtime
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/artifacts/carometro/dist/public /usr/share/nginx/html
COPY nginx/ssl/ /etc/nginx/ssl/

EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
```

### 7.3 `Dockerfile` do api-server

```dockerfile
# artifacts/api-server/Dockerfile

# Etapa 1: build
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY lib/db/ ./lib/db/
COPY artifacts/api-server/ ./artifacts/api-server/

RUN npm install -g pnpm@10 && pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

# Etapa 2: runtime mínimo
FROM node:24-alpine AS runtime
WORKDIR /app

# Apenas o bundle final (sem node_modules de dev)
COPY --from=builder /app/artifacts/api-server/dist/ ./dist/

# Instalar apenas dependências de produção
COPY artifacts/api-server/package.json ./
RUN npm install --omit=dev

# Usuário sem privilégios — ISO 27001 A.8.2 (privilégio mínimo)
RUN addgroup -S carometro && adduser -S carometro -G carometro
USER carometro

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/healthz || exit 1

CMD ["node", "dist/server.cjs"]
```

### 7.4 `docker-compose.yml` — raiz do projeto

```yaml
name: carometro

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    # Não expor porta do banco externamente em produção
    # ports:
    #   - "5432:5432"

  api-server:
    build:
      context: .
      dockerfile: artifacts/api-server/Dockerfile
    restart: unless-stopped
    environment:
      DATABASE_URL: ${DATABASE_URL}
      SESSION_SECRET: ${SESSION_SECRET}
      NODE_ENV: ${NODE_ENV:-production}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      FRONTEND_URL: ${FRONTEND_URL}
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/api/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: .
      dockerfile: artifacts/carometro/Dockerfile
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      api-server:
        condition: service_healthy
    volumes:
      # Em produção com Let's Encrypt, montar certificados reais aqui:
      # - ./nginx/ssl/cert.pem:/etc/nginx/ssl/cert.pem:ro
      # - ./nginx/ssl/key.pem:/etc/nginx/ssl/key.pem:ro

volumes:
  postgres_data:
    driver: local
```

### 7.5 `.dockerignore` — raiz do projeto

```
node_modules
**/node_modules
.git
.env
**/.env
**/dist
**/.tmp-introspect
*.log
.replit
replit.md
.agents
```

### 7.6 Script de primeiro deploy

Criar `scripts/deploy-inicial.sh`:

```bash
#!/bin/bash
set -e

echo "🚀 Deploy inicial do Carômetro"
echo "================================"

# Verificar se .env existe
if [ ! -f .env ]; then
  echo "❌ Arquivo .env não encontrado."
  echo "   Copie .env.example para .env e preencha os valores."
  exit 1
fi

# Build e subir containers
echo "📦 Construindo containers..."
docker compose build --no-cache

echo "⬆️  Subindo serviços..."
docker compose up -d db

echo "⏳ Aguardando banco de dados..."
sleep 5

echo "🗄️  Aplicando schema do banco..."
docker compose run --rm api-server node -e "
  const { db } = require('./dist/server.cjs');
  // Drizzle push é feito separadamente com tsx
"
# Alternativa: rodar db push fora do container antes de subir
# DATABASE_URL="postgresql://..." pnpm --filter @workspace/db run push

echo "⬆️  Subindo todos os serviços..."
docker compose up -d

echo "👤 Criando administrador inicial..."
docker compose exec api-server node dist/seed-admin.cjs admin@escola.edu.br

echo ""
echo "✅ Deploy concluído!"
echo "   Acesse: https://localhost"
echo "   (Aceite o aviso de certificado auto-assinado)"
```

### 7.7 Verificação da Fase 7

```bash
# Subir tudo
docker compose up --build -d

# Verificar status
docker compose ps

# Ver logs
docker compose logs -f api-server

# Testar health
curl -k https://localhost/api/healthz
# Deve retornar: {"status":"ok"}

# Testar frontend
# Abrir https://localhost no browser
```

---

## Fase 8 — PWA: limpar manifest duplicado

Rápida mas necessária — dois manifests com configurações diferentes causam comportamento imprevisível.

### 8.1 Remover `public/manifest.json`

```bash
rm artifacts/carometro/public/manifest.json
```

O `vite-plugin-pwa` já gera o manifest automaticamente durante o build com as configurações em `vite.config.ts`.

### 8.2 Atualizar `index.html`

Remover a tag manual de manifest do `artifacts/carometro/index.html` se existir:

```html
<!-- Remover esta linha se existir: -->
<link rel="manifest" href="/manifest.json">
<!-- O vite-plugin-pwa injeta o link automaticamente -->
```

### 8.3 Habilitar Service Worker em dev (opcional)

No `vite.config.ts`, para testar o comportamento offline em desenvolvimento:

```typescript
VitePWA({
  // ...
  devOptions: {
    enabled: true,           // Mudar de false para true temporariamente
    type: "module",
    navigateFallback: "index.html",
  },
})
```

Lembrar de voltar para `enabled: false` após os testes — o SW em dev pode causar comportamento estranho com HMR.

### 8.4 Verificação da Fase 8

- Chrome DevTools → Application → Service Workers → deve mostrar o SW ativo
- DevTools → Application → Manifest → deve mostrar um único manifest com `theme_color: #FF3C00`
- Lighthouse → PWA → deve passar em todos os critérios

---

## Fase 9 — Auditoria e ISO 27001 real

**Problema atual:** a página de auditoria exibe dados hardcoded ("Admin atualizou dados há 2 minutos"). O helper `registrarAuditoria()` foi referenciado nas fases anteriores — esta fase conecta tudo.

### 9.1 Implementar `src/lib/audit.ts` no api-server

```typescript
// src/lib/audit.ts
import { db } from "@workspace/db";
import { auditoriaLogsTable } from "@workspace/db/schema";

type RegistrarAuditoriaParams = {
  tabela: string;
  operacao: "INSERT" | "UPDATE" | "DELETE" | "SELECT" | "SELECT_SENSITIVE";
  registroId?: string;
  usuarioId?: string | null;
  dadosAntes?: Record<string, unknown>;
  dadosDepois?: Record<string, unknown>;
  ipOrigem?: string;
  userAgent?: string;
  endpoint?: string;
  metodoHttp?: string;
  statusHttp?: number;
  duracaoMs?: number;
};

export async function registrarAuditoria(params: RegistrarAuditoriaParams) {
  // Não lançar erro se auditoria falhar — não pode derrubar a operação principal
  try {
    await db.insert(auditoriaLogsTable).values({
      tabela: params.tabela,
      operacao: params.operacao,
      registroId: params.registroId,
      usuarioId: params.usuarioId ?? null,
      dadosAntes: params.dadosAntes ? params.dadosAntes : null,
      dadosDepois: params.dadosDepois ? params.dadosDepois : null,
      ipOrigem: params.ipOrigem,
      userAgent: params.userAgent,
      endpoint: params.endpoint,
      metodoHttp: params.metodoHttp,
      statusHttp: params.statusHttp,
      duracaoMs: params.duracaoMs,
      ambiente: process.env.NODE_ENV ?? "development",
      versaoApp: process.env.npm_package_version ?? "0.0.0",
    });
  } catch (err) {
    // Log do erro de auditoria sem travar a requisição
    console.error("[AUDIT] Falha ao registrar auditoria:", err);
  }
}
```

### 9.2 Middleware automático de auditoria para dados sensíveis

Adicionar em `src/app.ts`, após o router de estudantes:

```typescript
// Middleware para medir duração das requisições (alimenta duracaoMs na auditoria)
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.startTime = Date.now();
  next();
});
```

### 9.3 Implementar `GET /api/auditoria` no api-server

```typescript
// src/routes/auditoria.ts
router.get("/", requireAuth, requirePermissao("auditoria:view"), async (req, res) => {
  const limite = Math.min(Number(req.query.limite ?? 50), 200);

  const logs = await db
    .select({
      id: auditoriaLogsTable.id,
      tabela: auditoriaLogsTable.tabela,
      operacao: auditoriaLogsTable.operacao,
      registroId: auditoriaLogsTable.registroId,
      usuarioId: auditoriaLogsTable.usuarioId,
      endpoint: auditoriaLogsTable.endpoint,
      metodoHttp: auditoriaLogsTable.metodoHttp,
      statusHttp: auditoriaLogsTable.statusHttp,
      ipOrigem: auditoriaLogsTable.ipOrigem,
      criadoEm: auditoriaLogsTable.criadoEm,
    })
    .from(auditoriaLogsTable)
    .orderBy(desc(auditoriaLogsTable.criadoEm))
    .limit(limite);

  res.json(logs);
});
```

### 9.4 Atualizar `artifacts/carometro/src/pages/auditoria.tsx`

Substituir os dados hardcoded por uma query real usando o hook gerado pelo Orval após o codegen.

### 9.5 Operações que devem obrigatoriamente gerar auditoria

Conforme LGPD Art. 37 e ISO 27001 A.8.15:

| Operação | Nível | Motivo |
|----------|-------|--------|
| Login bem-sucedido | INFO | Rastreabilidade de acesso |
| Tentativa de login falha | WARNING | Detecção de força bruta |
| Upload de foto | INFO | Dado biométrico (LGPD Art. 11) |
| Leitura de lista de estudantes | SELECT | Dados pessoais |
| Exclusão de estudante | DELETE | Irreversível |
| Exportação XLSX de ocorrências | SELECT_SENSITIVE | Dado sensível em massa |
| Mudança de permissões | UPDATE | Controle de acesso |
| Reset de senha | UPDATE | Segurança |
| Consentimento LGPD | INSERT | Compliance legal |

### 9.6 Verificação da Fase 9

- Fazer login → `SELECT * FROM auditoria_logs WHERE endpoint LIKE '%login%' LIMIT 5;` deve mostrar registros
- Acessar `/auditoria` no frontend → logs reais devem aparecer (não os hardcoded)

---

## Checklist final de conformidade

### LGPD (Lei 13.709/2018)

- [ ] Art. 7º — Base legal documentada para cada tipo de dado (consentimentos no banco)
- [ ] Art. 11 — Foto (dado biométrico) com consentimento específico e auditoria
- [ ] Art. 18 — Direitos do titular: acesso, correção, exclusão, portabilidade implementados
- [ ] Art. 18 §5 — Prazo de 15 dias para resposta às solicitações (prazo_legal no banco)
- [ ] Art. 37 — Registro de operações de tratamento (auditoria_logs com IP e usuário)
- [ ] Art. 46 — Medidas de segurança: AES-256 para fotos, bcrypt para senhas, JWT httpOnly
- [ ] E-mails armazenados criptografados (AES-256-CBC + hash SHA-256 para busca)

### ISO/IEC 27001:2022

- [ ] A.5.15 — Controle de acesso: RBAC com roles e permissões granulares
- [ ] A.5.17 — Informações de autenticação: bcrypt rounds=12, bloqueio após 5 tentativas
- [ ] A.8.2 — Privilégio mínimo: container roda como usuário sem root
- [ ] A.8.3 — Proteção contra erros: respostas de erro não revelam detalhes internos
- [ ] A.8.5 — Autenticação segura: JWT em cookie httpOnly, SameSite=Lax, Secure em produção
- [ ] A.8.15 — Logging: todos os acessos a dados pessoais registrados com IP e timestamp
- [ ] A.8.20 — Segurança de rede: HTTPS obrigatório, HSTS, headers de segurança via nginx
- [ ] A.8.24 — Criptografia: AES-256-CBC para dados em repouso, TLS 1.2+ em trânsito
- [ ] A.8.26 — Segurança em aplicações: Helmet.js, CSP, validação Zod em todas as entradas

---

## Ordem de commits recomendada

```
feat: criar estrutura base do api-server (Fase 1a)
feat: implementar autenticação JWT com bloqueio por tentativas (Fase 1b)
feat: implementar rotas CRUD — turnos, cursos, turmas, disciplinas (Fase 1c)
feat: implementar rotas — estudantes com auditoria LGPD (Fase 1d)
feat: implementar rotas — ocorrencias, usuarios, roles, import (Fase 1e)
feat: armazenamento de fotos criptografado AES-256 no PostgreSQL (Fase 2)
feat: sincronizar consentimentos LGPD com banco de dados (Fase 3)
feat: conectar fila offline às mutações reais (Fase 4)
fix: alinhar schema Drizzle com banco — remover foto_url legado (Fase 5)
feat: configurar nginx com TLS para câmera em produção (Fase 6)
feat: dockerizar frontend, api-server e nginx (Fase 7)
fix: remover manifest.json duplicado do public/ (Fase 8)
feat: implementar auditoria real no banco e UI (Fase 9)
```

---

*Documento gerado com base na análise do repositório `fernandofcursos/carometro` em 31/05/2026.*
*Stack: Node 24 · TypeScript 5.9 · Express 5 · Drizzle ORM · PostgreSQL 16 · React 19 · Vite 7 · pnpm workspaces*
