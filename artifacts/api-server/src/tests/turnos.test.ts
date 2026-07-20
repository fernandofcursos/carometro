/**
 * Tests for GET/POST/PUT/DELETE /api/turnos
 * Verifies authentication, permission guard, and CRUD responses.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { makeQuery } from "./helpers/db-mock.js";

const mockDb = {
  select: vi.fn(() => makeQuery()),
  insert: vi.fn(() => makeQuery()),
  update: vi.fn(() => makeQuery()),
  delete: vi.fn(() => makeQuery()),
};

vi.mock("@workspace/db", () => ({
  db:          mockDb,
  turnosTable: { id: "id", nome: "nome", criadoEm: "criadoEm", atualizadoEm: "atualizadoEm" },
  usuariosRolesTable:   { usuarioId: "usuarioId", roleId: "roleId" },
  rolesPermissoesTable: { roleId: "roleId", permissaoId: "permissaoId" },
  permissoesTable:      { id: "id", recurso: "recurso", acao: "acao" },
  eq:      vi.fn((_a, _b) => "eq"),
  and:     vi.fn((..._args) => "and"),
  isNull:  vi.fn((_col) => "isNull"),
  inArray: vi.fn((_col, _vals) => "inArray"),
  desc:    vi.fn((col) => col),
  asc:     vi.fn((col) => col),
}));

// Schema mock — insertTurnoSchema is from @workspace/db/schema
vi.mock("@workspace/db/schema", () => ({
  insertTurnoSchema: {
    parse: (body: unknown) => {
      const b = body as Record<string, unknown>;
      if (!b?.nome) throw new Error("nome obrigatório");
      return { nome: b.nome };
    },
  },
}));

vi.mock("../lib/audit.js", () => ({ registrarAuditoria: vi.fn() }));
vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const TURNO = { id: "turno-uuid-1", nome: "Matutino", criadoEm: new Date(), atualizadoEm: new Date() };
const PERM_TURNOS = [{ recurso: "turnos", acao: "manage" }];

async function buildApp() {
  const { default: turnosRouter } = await import("../routes/turnos.js");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/turnos", turnosRouter);
  return app;
}

async function makeAuthCookie(userId = "user-uuid-1", roles = ["admin"]) {
  const { signToken } = await import("../lib/auth.js");
  return `token=${signToken(userId, roles)}`;
}

describe("GET /api/turnos", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("retorna 401 sem cookie", async () => {
    const res = await request(app).get("/api/turnos");
    expect(res.status).toBe(401);
  });

  it("retorna 403 sem permissão turnos:manage", async () => {
    const cookie = await makeAuthCookie("u1", ["viewer"]);
    mockDb.select.mockReturnValueOnce(makeQuery([])); // requirePermissao → sem perms

    const res = await request(app).get("/api/turnos").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  it("retorna 200 com array de turnos", async () => {
    const cookie = await makeAuthCookie();
    mockDb.select.mockReturnValueOnce(makeQuery(PERM_TURNOS)); // requirePermissao
    mockDb.select.mockReturnValueOnce(makeQuery([TURNO]));     // GET / handler

    const res = await request(app).get("/api/turnos").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({ nome: "Matutino" });
  });
});

describe("POST /api/turnos", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("retorna 400 sem campo nome", async () => {
    const cookie = await makeAuthCookie();
    mockDb.select.mockReturnValueOnce(makeQuery(PERM_TURNOS)); // requirePermissao

    const res = await request(app)
      .post("/api/turnos")
      .set("Cookie", cookie)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 201 com turno criado", async () => {
    const cookie = await makeAuthCookie();
    mockDb.select.mockReturnValueOnce(makeQuery(PERM_TURNOS)); // requirePermissao
    mockDb.insert.mockReturnValueOnce(makeQuery([TURNO]));     // insert().returning()

    const res = await request(app)
      .post("/api/turnos")
      .set("Cookie", cookie)
      .send({ nome: "Matutino" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "turno-uuid-1", nome: "Matutino" });
  });
});

describe("DELETE /api/turnos/:id", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("retorna 404 quando turno não existe", async () => {
    const cookie = await makeAuthCookie();
    mockDb.select.mockReturnValueOnce(makeQuery(PERM_TURNOS)); // requirePermissao
    mockDb.delete.mockReturnValueOnce(makeQuery([]));           // delete → nenhum registro

    const res = await request(app)
      .delete("/api/turnos/nao-existe")
      .set("Cookie", cookie);

    expect(res.status).toBe(404);
  });

  it("retorna 200 quando turno é excluído", async () => {
    const cookie = await makeAuthCookie();
    mockDb.select.mockReturnValueOnce(makeQuery(PERM_TURNOS)); // requirePermissao
    mockDb.delete.mockReturnValueOnce(makeQuery([TURNO]));     // delete → registro excluído

    const res = await request(app)
      .delete(`/api/turnos/${TURNO.id}`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
