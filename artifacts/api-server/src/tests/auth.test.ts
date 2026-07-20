import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { makeQuery } from "./helpers/db-mock.js";

// ── DB mock ──────────────────────────────────────────────────────────────────
const mockDb = {
  select: vi.fn(() => makeQuery()),
  insert: vi.fn(() => makeQuery()),
  update: vi.fn(() => makeQuery()),
  delete: vi.fn(() => makeQuery()),
};

vi.mock("@workspace/db", () => ({
  db: mockDb,
  usuariosTable:      { id: "id", emailHash: "emailHash", codigoAcesso: "codigoAcesso", deletadoEm: "deletadoEm", senhaHash: "senhaHash", bloqueadoAte: "bloqueadoAte", tentativasLoginFalhas: "tentativasLoginFalhas", ultimoLoginEm: "ultimoLoginEm", nome: "nome", emailEncrypted: "emailEncrypted", primeiroAcesso: "primeiroAcesso", atualizadoEm: "atualizadoEm", recuperacaoTokenHash: "recuperacaoTokenHash", recuperacaoExpiresAt: "recuperacaoExpiresAt" },
  rolesTable:         { id: "id", nome: "nome" },
  usuariosRolesTable: { usuarioId: "usuarioId", roleId: "roleId" },
  rolesPermissoesTable: { roleId: "roleId", permissaoId: "permissaoId" },
  permissoesTable:    { id: "id", recurso: "recurso", acao: "acao" },
  eq:     vi.fn((_a, _b) => "eq"),
  and:    vi.fn((..._args) => "and"),
  isNull: vi.fn((_col) => "isNull"),
  inArray: vi.fn((_col, _vals) => "inArray"),
  ilike:  vi.fn((_col, _val) => "ilike"),
  or:     vi.fn((..._args) => "or"),
  desc:   vi.fn((col) => col),
  asc:    vi.fn((col) => col),
  sql:    vi.fn(),
}));

// ── bcrypt mock ───────────────────────────────────────────────────────────────
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash:    vi.fn(async (_p: string, _r: number) => "$2b$12$hashedpassword"),
  },
}));

// ── crypto mock (descriptografarEmail) ───────────────────────────────────────
vi.mock("../lib/crypto.js", () => ({
  descriptografarEmail: vi.fn(() => "test@example.com"),
  criptografarEmail:    vi.fn(() => Buffer.from("encrypted")),
}));

// ── audit mock ────────────────────────────────────────────────────────────────
vi.mock("../lib/audit.js", () => ({
  registrarAuditoria: vi.fn(),
}));

// ── pino-http mock (avoid logs in tests) ─────────────────────────────────────
vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ── App setup ─────────────────────────────────────────────────────────────────
async function buildApp() {
  const { default: authRouter } = await import("../routes/auth.js");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  return app;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const USUARIO_FIXTURE = {
  id:                    "user-uuid-1",
  nome:                  "Admin Teste",
  emailHash:             "abc123",
  emailEncrypted:        Buffer.from("encrypted"),
  codigoAcesso:          "ADM001",
  senhaHash:             "$2b$12$realhashedpassword",
  bloqueadoAte:          null,
  tentativasLoginFalhas: 0,
  ultimoLoginEm:         null,
  primeiroAcesso:        false,
  deletadoEm:            null,
};

const ROLE_FIXTURE   = { id: "role-uuid-1", nome: "admin" };
const PERMS_FIXTURE  = [{ recurso: "roles", acao: "manage" }];

describe("POST /api/auth/login", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("retorna 400 quando body está vazio", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 401 quando usuário não existe", async () => {
    // select().from().where() → usuario not found
    mockDb.select.mockReturnValueOnce(makeQuery([]));

    const res = await request(app)
      .post("/api/auth/login")
      .send({ identificador: "naoexiste@test.com", senha: "qualquercoisa" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/inválidos/i);
  });

  it("retorna 429 quando conta está bloqueada", async () => {
    const bloqueado = { ...USUARIO_FIXTURE, bloqueadoAte: new Date(Date.now() + 10 * 60 * 1000) };
    mockDb.select.mockReturnValueOnce(makeQuery([bloqueado]));

    const res = await request(app)
      .post("/api/auth/login")
      .send({ identificador: "admin@test.com", senha: "qualquercoisa" });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/bloqueada/i);
  });

  it("retorna 401 quando senha está incorreta e incrementa tentativas", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);

    mockDb.select.mockReturnValueOnce(makeQuery([USUARIO_FIXTURE]));
    mockDb.update.mockReturnValueOnce(makeQuery([]));

    const res = await request(app)
      .post("/api/auth/login")
      .send({ identificador: "admin@test.com", senha: "senhaerrada" });

    expect(res.status).toBe(401);
    expect(mockDb.update).toHaveBeenCalledOnce();
  });

  it("retorna 200 com cookie session em login bem-sucedido", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);

    // 1. select usuario
    mockDb.select.mockReturnValueOnce(makeQuery([USUARIO_FIXTURE]));
    // 2. select roles (buscarRolesEPermissoes)
    mockDb.select.mockReturnValueOnce(makeQuery([ROLE_FIXTURE]));
    // 3. select perms
    mockDb.select.mockReturnValueOnce(makeQuery(PERMS_FIXTURE));
    // 4. update (reset tentativas + ultimoLoginEm)
    mockDb.update.mockReturnValueOnce(makeQuery([]));

    const res = await request(app)
      .post("/api/auth/login")
      .send({ identificador: "admin@test.com", senha: "senhaCorreta123" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id:   USUARIO_FIXTURE.id,
      nome: USUARIO_FIXTURE.nome,
      roles: ["admin"],
      permissions: ["roles:manage"],
    });
    // JWT cookie deve estar presente
    expect(res.headers["set-cookie"]).toBeDefined();
    const cookies = res.headers["set-cookie"] as string[];
    expect(cookies.some((c: string) => c.startsWith("token="))).toBe(true);
  });
});

describe("GET /api/auth/me", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("retorna 401 sem cookie", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("retorna 200 com dados do usuário quando autenticado", async () => {
    const { signToken } = await import("../lib/auth.js");
    const token = signToken(USUARIO_FIXTURE.id, ["admin"]);

    // select usuario
    mockDb.select.mockReturnValueOnce(makeQuery([USUARIO_FIXTURE]));
    // select roles
    mockDb.select.mockReturnValueOnce(makeQuery([ROLE_FIXTURE]));
    // select perms
    mockDb.select.mockReturnValueOnce(makeQuery(PERMS_FIXTURE));

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id:   USUARIO_FIXTURE.id,
      nome: USUARIO_FIXTURE.nome,
      permissions: ["roles:manage"],
    });
  });
});

describe("POST /api/auth/solicitar-recuperacao", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("retorna 400 para e-mail inválido", async () => {
    const res = await request(app)
      .post("/api/auth/solicitar-recuperacao")
      .send({ email: "nao-e-email" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 200 mesmo quando e-mail não existe (não revela existência)", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([]));

    const res = await request(app)
      .post("/api/auth/solicitar-recuperacao")
      .send({ email: "naoexiste@test.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("retorna 200 e gera token quando e-mail existe", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([{ id: USUARIO_FIXTURE.id }]));
    mockDb.update.mockReturnValueOnce(makeQuery([]));

    const res = await request(app)
      .post("/api/auth/solicitar-recuperacao")
      .send({ email: "admin@test.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockDb.update).toHaveBeenCalledOnce();
  });
});

describe("POST /api/auth/redefinir-senha", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("retorna 400 quando nova senha tem menos de 8 caracteres", async () => {
    const res = await request(app)
      .post("/api/auth/redefinir-senha")
      .send({ token: "qualquer-token", novaSenha: "curta" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 caracteres/i);
  });

  it("retorna 400 quando token não existe no banco", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([]));

    const res = await request(app)
      .post("/api/auth/redefinir-senha")
      .send({ token: "token-invalido", novaSenha: "novaSenha123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválido/i);
  });

  it("retorna 400 quando token está expirado", async () => {
    const expirado = {
      ...USUARIO_FIXTURE,
      recuperacaoTokenHash: "hash",
      recuperacaoExpiresAt: new Date(Date.now() - 1000), // já expirou
    };
    mockDb.select.mockReturnValueOnce(makeQuery([expirado]));

    const res = await request(app)
      .post("/api/auth/redefinir-senha")
      .send({ token: "token-expirado", novaSenha: "novaSenha123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expirado/i);
  });

  it("retorna 200 e invalida o token após redefinição bem-sucedida", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    vi.mocked(bcrypt.hash).mockResolvedValueOnce("$2b$12$newhash" as never);

    const valido = {
      ...USUARIO_FIXTURE,
      recuperacaoTokenHash: "hash",
      recuperacaoExpiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min no futuro
    };
    mockDb.select.mockReturnValueOnce(makeQuery([valido]));
    mockDb.update.mockReturnValueOnce(makeQuery([]));

    const res = await request(app)
      .post("/api/auth/redefinir-senha")
      .send({ token: "token-valido", novaSenha: "novaSenha123" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockDb.update).toHaveBeenCalledOnce();
  });
});

describe("POST /api/auth/logout", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("limpa cookie e retorna 200", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
    // Cookie deve ser limpo (Max-Age=0 ou Expires passado)
    const cookies = res.headers["set-cookie"] as string[] | undefined;
    if (cookies) {
      expect(cookies.some((c: string) => c.includes("token=;") || c.includes("Max-Age=0"))).toBe(true);
    }
  });
});
