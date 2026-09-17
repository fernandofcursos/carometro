import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const { mockDb } = vi.hoisted(() => {
  const chain = { where: vi.fn(), orderBy: vi.fn(), returning: vi.fn(), set: vi.fn(), values: vi.fn() };
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.set.mockReturnValue(chain);
  chain.values.mockReturnValue(chain);
  chain.returning.mockResolvedValue([]);

  const mockDb = {
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue(chain) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue(chain) }),
    update: vi.fn().mockReturnValue(chain),
  };
  return { mockDb };
});

vi.mock("@workspace/db", () => ({
  db: mockDb,
  encaminhamentosEventosTable: {
    id: "id", escolaId: "escola_id", origemModulo: "origem_modulo",
    destinoModulo: "destino_modulo", estudanteId: "estudante_id",
    mensagem: "mensagem", tipoDemanda: "tipo_demanda", cids: "cids",
    resolucao: "resolucao", status: "status", criadoPorId: "criado_por_id",
    recebidoPorId: "recebido_por_id", paiId: "pai_id",
    criadoEm: "criado_em", atualizadoEm: "atualizado_em",
  },
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
  and: vi.fn((...args) => ({ and: args })),
  or: vi.fn((...args) => ({ or: args })),
  sql: vi.fn(s => s),
}));

vi.mock("../lib/auth.js", () => ({
  requireAuth: (req: any, _: any, next: any) => {
    req.usuarioId = "user-1";
    req.escolaId = "escola-1";
    next();
  },
}));

vi.mock("../lib/permissions.js", () => ({
  buscarRoles: vi.fn(),
}));

vi.mock("../middleware/tenant.js", () => ({
  withTenant: vi.fn(async (escolaId: string, fn: any) => {
    const mockTx = {
      select: mockDb.select,
      insert: mockDb.insert,
      update: mockDb.update,
    };
    return fn(mockTx);
  }),
}));

import encaminhamentosRouter from "../routes/encaminhamentos.js";
import { buscarRoles } from "../lib/permissions.js";

const app = express();
app.use(express.json());
app.use("/api/encaminhamentos", encaminhamentosRouter);

const mockBuscarRoles = buscarRoles as ReturnType<typeof vi.fn>;

function makeEnc(overrides: Record<string, any> = {}) {
  return {
    id: "enc-1", escolaId: "escola-1", origemModulo: "sr", destinoModulo: "eeaa",
    mensagem: "teste", status: "pendente", estudanteId: "est-1",
    criadoPorId: "user-1", tipoDemanda: null, cids: null, resolucao: null, paiId: null,
    ...overrides,
  };
}

function resetChain(overrides: Record<string, any> = {}) {
  const chain = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([]),
    returning: vi.fn().mockResolvedValue([]),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    ...overrides,
  };
  mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });
  mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue(chain) });
  mockDb.update.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetChain();
});

describe("GET /api/encaminhamentos", () => {
  it("retorna 403 sem permissão", async () => {
    mockBuscarRoles.mockResolvedValue([]);
    const res = await request(app).get("/api/encaminhamentos?caixa=recebidos&modulo=sr");
    expect(res.status).toBe(403);
  });

  it("retorna 400 para modulo inválido", async () => {
    mockBuscarRoles.mockResolvedValue(["sala_recursos:manage"]);
    resetChain({ orderBy: vi.fn().mockResolvedValue([]) });
    const res = await request(app).get("/api/encaminhamentos?caixa=recebidos&modulo=xxx");
    expect(res.status).toBe(400);
  });

  it("retorna lista de recebidos", async () => {
    mockBuscarRoles.mockResolvedValue(["sala_recursos:manage"]);
    resetChain({ where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([makeEnc()]) });
    const res = await request(app).get("/api/encaminhamentos?caixa=recebidos&modulo=sr");
    expect(res.status).toBe(200);
    expect(res.body.encaminhamentos).toHaveLength(1);
  });
});

describe("POST /api/encaminhamentos", () => {
  it("retorna 422 se origemModulo === destinoModulo", async () => {
    mockBuscarRoles.mockResolvedValue(["sala_recursos:manage"]);
    const res = await request(app).post("/api/encaminhamentos").send({
      estudanteId: "00000000-0000-0000-0000-000000000001",
      origemModulo: "sr", destinoModulo: "sr", mensagem: "teste",
    });
    expect(res.status).toBe(422);
  });

  it("retorna 403 sem permissão no módulo de origem", async () => {
    mockBuscarRoles.mockResolvedValue(["eeaa:manage"]);
    const res = await request(app).post("/api/encaminhamentos").send({
      estudanteId: "00000000-0000-0000-0000-000000000001",
      origemModulo: "sr", destinoModulo: "eeaa", mensagem: "teste",
    });
    expect(res.status).toBe(403);
  });

  it("cria encaminhamento com sucesso", async () => {
    mockBuscarRoles.mockResolvedValue(["sala_recursos:manage"]);
    const chain = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([makeEnc()]) };
    mockDb.insert.mockReturnValue(chain);
    const res = await request(app).post("/api/encaminhamentos").send({
      estudanteId: "00000000-0000-0000-0000-000000000001",
      origemModulo: "sr", destinoModulo: "eeaa", mensagem: "Encaminhando",
      tipoDemanda: "TDAH", cids: ["F90.0"],
    });
    expect(res.status).toBe(201);
    expect(res.body.encaminhamento).toBeDefined();
  });
});

describe("PUT /api/encaminhamentos/:id/aceitar", () => {
  it("retorna 422 se status não é pendente", async () => {
    mockBuscarRoles.mockResolvedValue(["eeaa:manage"]);
    const selectChain = { where: vi.fn().mockResolvedValue([makeEnc({ status: "aceito", destinoModulo: "eeaa" })]) };
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue(selectChain) });
    const res = await request(app).put("/api/encaminhamentos/enc-1/aceitar");
    expect(res.status).toBe(422);
  });

  it("aceita encaminhamento pendente", async () => {
    mockBuscarRoles.mockResolvedValue(["eeaa:manage"]);
    const selectChain = { where: vi.fn().mockResolvedValue([makeEnc({ destinoModulo: "eeaa" })]) };
    const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([makeEnc({ status: "aceito", destinoModulo: "eeaa" })]) };
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue(selectChain) });
    mockDb.update.mockReturnValue(updateChain);
    const res = await request(app).put("/api/encaminhamentos/enc-1/aceitar");
    expect(res.status).toBe(200);
    expect(res.body.encaminhamento.status).toBe("aceito");
  });
});

describe("PUT /api/encaminhamentos/:id/resolver", () => {
  it("retorna 400 sem resolucao", async () => {
    mockBuscarRoles.mockResolvedValue(["eeaa:manage"]);
    const res = await request(app).put("/api/encaminhamentos/enc-1/resolver").send({});
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/encaminhamentos/:id/devolver", () => {
  it("retorna 400 sem motivo", async () => {
    mockBuscarRoles.mockResolvedValue(["eeaa:manage"]);
    const res = await request(app).put("/api/encaminhamentos/enc-1/devolver").send({});
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/encaminhamentos/:id/reencaminhar", () => {
  it("cria filho e marca pai em_andamento", async () => {
    mockBuscarRoles.mockResolvedValue(["eeaa:manage"]);
    const pai = makeEnc({ destinoModulo: "eeaa", status: "aceito" });
    const filho = makeEnc({ id: "enc-2", origemModulo: "eeaa", destinoModulo: "soe", paiId: "enc-1" });
    const selectChain = { where: vi.fn().mockResolvedValue([pai]) };
    const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
    const insertChain = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([filho]) };
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue(selectChain) });
    mockDb.update.mockReturnValue(updateChain);
    mockDb.insert.mockReturnValue(insertChain);
    const res = await request(app)
      .put("/api/encaminhamentos/enc-1/reencaminhar")
      .send({ destinoModulo: "soe", mensagem: "Necessita SOE" });
    expect(res.status).toBe(201);
    expect(res.body.encaminhamento.paiId).toBe("enc-1");
  });

  it("retorna 422 se destino igual ao módulo atual", async () => {
    mockBuscarRoles.mockResolvedValue(["eeaa:manage"]);
    const selectChain = { where: vi.fn().mockResolvedValue([makeEnc({ destinoModulo: "eeaa", status: "aceito" })]) };
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue(selectChain) });
    const res = await request(app)
      .put("/api/encaminhamentos/enc-1/reencaminhar")
      .send({ destinoModulo: "eeaa", mensagem: "teste" });
    expect(res.status).toBe(422);
  });
});
