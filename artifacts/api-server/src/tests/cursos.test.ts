/**
 * Tests for /api/cursos — verifica CRUD básico e soft-delete.
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
  cursosTable: { id: "id", nome: "nome", descricao: "descricao", ativo: "ativo", deletadoEm: "deletadoEm", criadoEm: "criadoEm", atualizadoEm: "atualizadoEm" },
  usuariosRolesTable:   { usuarioId: "usuarioId", roleId: "roleId" },
  rolesPermissoesTable: { roleId: "roleId", permissaoId: "permissaoId" },
  permissoesTable:      { id: "id", recurso: "recurso", acao: "acao" },
  isNull:  vi.fn(() => "isNull"),
  eq:      vi.fn((_a, _b) => "eq"),
  and:     vi.fn((..._args) => "and"),
  inArray: vi.fn(() => "inArray"),
  desc:    vi.fn((c) => c),
  asc:     vi.fn((c) => c),
}));

vi.mock("@workspace/db/schema", () => ({
  insertCursoSchema: {
    parse: (body: unknown) => {
      const b = body as Record<string, unknown>;
      if (!b?.nome) throw new Error("nome obrigatório");
      return { nome: b.nome, descricao: b.descricao ?? null, ativo: b.ativo ?? true };
    },
  },
}));

vi.mock("../lib/audit.js", () => ({ registrarAuditoria: vi.fn() }));
vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const PERM_CURSOS = [{ recurso: "cursos", acao: "manage" }];
const CURSO = {
  id: "curso-uuid-1",
  nome: "Técnico em Informática",
  descricao: null,
  ativo: true,
  deletadoEm: null,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

async function buildApp() {
  const { default: cursosRouter } = await import("../routes/cursos.js");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/cursos", cursosRouter);
  return app;
}

async function authCookie(roles = ["admin"]) {
  const { signToken } = await import("../lib/auth.js");
  return `token=${signToken("user-1", roles)}`;
}

describe("GET /api/cursos", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna 401 sem auth", async () => {
    const res = await request(app).get("/api/cursos");
    expect(res.status).toBe(401);
  });

  it("retorna 200 com lista de cursos ativos", async () => {
    const cookie = await authCookie();
    mockDb.select.mockReturnValueOnce(makeQuery(PERM_CURSOS)); // requirePermissao
    mockDb.select.mockReturnValueOnce(makeQuery([CURSO]));     // handler

    const res = await request(app).get("/api/cursos").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].nome).toBe("Técnico em Informática");
  });
});

describe("GET /api/cursos/:id", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna 404 quando curso não existe ou foi excluído", async () => {
    const cookie = await authCookie();
    mockDb.select.mockReturnValueOnce(makeQuery(PERM_CURSOS));
    // select retorna curso com deletadoEm preenchido
    const deletado = { ...CURSO, deletadoEm: new Date() };
    mockDb.select.mockReturnValueOnce(makeQuery([deletado]));

    const res = await request(app).get(`/api/cursos/${CURSO.id}`).set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("retorna 200 com o curso", async () => {
    const cookie = await authCookie();
    mockDb.select.mockReturnValueOnce(makeQuery(PERM_CURSOS));
    mockDb.select.mockReturnValueOnce(makeQuery([CURSO]));

    const res = await request(app).get(`/api/cursos/${CURSO.id}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(CURSO.id);
  });
});

describe("POST /api/cursos", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna 400 sem nome", async () => {
    const cookie = await authCookie();
    mockDb.select.mockReturnValueOnce(makeQuery(PERM_CURSOS));

    const res = await request(app).post("/api/cursos").set("Cookie", cookie).send({});
    expect(res.status).toBe(400);
  });

  it("retorna 201 com curso criado", async () => {
    const cookie = await authCookie();
    mockDb.select.mockReturnValueOnce(makeQuery(PERM_CURSOS));
    mockDb.insert.mockReturnValueOnce(makeQuery([CURSO]));

    const res = await request(app)
      .post("/api/cursos")
      .set("Cookie", cookie)
      .send({ nome: "Técnico em Informática" });

    expect(res.status).toBe(201);
    expect(res.body.nome).toBe("Técnico em Informática");
  });
});

describe("DELETE /api/cursos/:id (soft delete)", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna 404 quando curso não existe", async () => {
    const cookie = await authCookie();
    mockDb.select.mockReturnValueOnce(makeQuery(PERM_CURSOS));
    mockDb.update.mockReturnValueOnce(makeQuery([]));

    const res = await request(app).delete("/api/cursos/nao-existe").set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("retorna 200 ao excluir curso (soft delete)", async () => {
    const cookie = await authCookie();
    mockDb.select.mockReturnValueOnce(makeQuery(PERM_CURSOS));
    mockDb.update.mockReturnValueOnce(makeQuery([{ ...CURSO, deletadoEm: new Date() }]));

    const res = await request(app).delete(`/api/cursos/${CURSO.id}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
