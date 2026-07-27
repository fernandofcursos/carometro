/**
 * Tests for the RBAC permission guard (requirePermissao middleware).
 * Verifies that protected routes return 403 when the user lacks the required
 * permission and 200 when they have it.
 *
 * Uses GET /api/roles as the test endpoint (requires "roles:manage").
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { makeQuery } from "./helpers/db-mock.js";

// ── DB mock ───────────────────────────────────────────────────────────────────
const mockDb = {
  select: vi.fn(() => makeQuery()),
  insert: vi.fn(() => makeQuery()),
  update: vi.fn(() => makeQuery()),
  delete: vi.fn(() => makeQuery()),
};

vi.mock("@workspace/db", () => ({
  db: mockDb,
  usuariosTable:        {},
  rolesTable:           { id: "id", nome: "nome", descricao: "descricao", ativo: "ativo", criadoEm: "criadoEm", atualizadoEm: "atualizadoEm" },
  usuariosRolesTable:   { usuarioId: "usuarioId", roleId: "roleId" },
  rolesPermissoesTable: { roleId: "roleId", permissaoId: "permissaoId" },
  permissoesTable:      { id: "id", recurso: "recurso", acao: "acao", descricao: "descricao" },
  eq:      vi.fn((_a, _b) => "eq"),
  and:     vi.fn((..._args) => "and"),
  isNull:  vi.fn((_col) => "isNull"),
  inArray: vi.fn((_col, _vals) => "inArray"),
  ilike:   vi.fn((_col, _val) => "ilike"),
  or:      vi.fn((..._args) => "or"),
  desc:    vi.fn((col) => col),
  asc:     vi.fn((col) => col),
  sql:     vi.fn(),
}));

vi.mock("../lib/audit.js", () => ({ registrarAuditoria: vi.fn() }));

vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ── App setup ─────────────────────────────────────────────────────────────────
async function buildApp() {
  const { default: rolesRouter } = await import("../routes/roles.js");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/roles", rolesRouter);
  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function makeAuthCookie(userId = "user-uuid-1", roles = ["viewer"]) {
  const { signToken } = await import("../lib/auth.js");
  return `token=${signToken(userId, roles)}`;
}

describe("Guard de permissões — GET /api/roles", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { limparCachePermissoes } = await import("../lib/permissions.js");
    limparCachePermissoes();
    app = await buildApp();
  });

  it("retorna 401 sem cookie de autenticação", async () => {
    const res = await request(app).get("/api/roles");
    expect(res.status).toBe(401);
  });

  it("retorna 403 quando usuário não tem a permissão roles:manage", async () => {
    const cookie = await makeAuthCookie("user-uuid-2", ["viewer"]);

    // requirePermissao buscará permissões do usuário → vazio (sem roles:manage)
    mockDb.select.mockReturnValueOnce(makeQuery([]));

    const res = await request(app)
      .get("/api/roles")
      .set("Cookie", cookie);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/permissão/i);
  });

  it("retorna 200 quando usuário tem roles:manage", async () => {
    const cookie = await makeAuthCookie("user-uuid-1", ["admin"]);

    // 1. requirePermissao → select permissões → [{ recurso: "roles", acao: "manage" }]
    mockDb.select.mockReturnValueOnce(
      makeQuery([{ recurso: "roles", acao: "manage" }])
    );
    // 2. GET / handler → select roles
    mockDb.select.mockReturnValueOnce(makeQuery([]));

    const res = await request(app)
      .get("/api/roles")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("retorna 403 quando permissão existe mas não é roles:manage", async () => {
    const cookie = await makeAuthCookie("user-uuid-3", ["teacher"]);

    // Usuário tem apenas estudantes:listar — não satisfaz roles:manage
    mockDb.select.mockReturnValueOnce(
      makeQuery([{ recurso: "estudantes", acao: "listar" }])
    );

    const res = await request(app)
      .get("/api/roles")
      .set("Cookie", cookie);

    expect(res.status).toBe(403);
  });
});
