import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { makeQuery } from "./helpers/db-mock.js";

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return { mockDb };
});

vi.mock("@workspace/db", () => ({
  db: mockDb,
  srEstudantesEneeTable:    { id:"id", escolaId:"escolaId", usuarioId:"usuarioId", laudo:"laudo", dataLaudo:"dataLaudo", instituicaoLaudo:"instituicaoLaudo", observacoes:"observacoes", ativo:"ativo", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm", deletadoEm:"deletadoEm" },
  srAtendimentosTable:      { id:"id", escolaId:"escolaId", estudanteId:"estudanteId", dataAtendimento:"dataAtendimento", duracaoMin:"duracaoMin", tipo:"tipo", narrativa:"narrativa", registradoPorId:"registradoPorId", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm", deletadoEm:"deletadoEm" },
  srPlanosAeeTable:         { id:"id", escolaId:"escolaId", estudanteId:"estudanteId", objetivos:"objetivos", estrategias:"estrategias", avaliacao:"avaliacao", prazo:"prazo", observacoes:"observacoes", status:"status", elaboradoPorId:"elaboradoPorId", ano:"ano", semestre:"semestre", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  srEsvTable:               { id:"id", escolaId:"escolaId", estudanteId:"estudanteId", nome:"nome", contato:"contato", periodoInicio:"periodoInicio", periodoFim:"periodoFim", observacoes:"observacoes", ativo:"ativo", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  srEstudosCasoTable:       { id:"id", escolaId:"escolaId", estudanteId:"estudanteId", dataRealizacao:"dataRealizacao", participantes:"participantes", sintese:"sintese", encaminhamentosResultantes:"encaminhamentosResultantes", status:"status", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  srEncaminhamentosTable:   { id:"id", escolaId:"escolaId", estudanteId:"estudanteId", descricao:"descricao", destinatarioId:"destinatarioId", status:"status", prazo:"prazo", resposta:"resposta", criadoPorId:"criadoPorId", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  encaminhamentosEventosTable: { id:"id", escolaId:"escolaId", origemModulo:"origemModulo", destinoModulo:"destinoModulo", estudanteId:"estudanteId", referenciaId:"referenciaId", referenciaTipo:"referenciaTipo", mensagem:"mensagem", status:"status", criadoPorId:"criadoPorId", recebidoPorId:"recebidoPorId", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  eq:      vi.fn(() => "eq"),
  and:     vi.fn((..._a: any[]) => "and"),
  isNull:  vi.fn(() => "isNull"),
  desc:    vi.fn((c: any) => c),
  asc:     vi.fn((c: any) => c),
}));

vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../middleware/tenant.js", () => ({
  requireTenant: (_req: any, _res: any, next: () => void) => next(),
  withTenant: vi.fn(async (_id: string, fn: (tx: any) => Promise<any>) => fn(mockDb)),
}));

vi.mock("../lib/permissions.js", () => ({
  buscarRoles: vi.fn().mockResolvedValue(["sala_recursos:manage"]),
  requirePermissao: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  invalidarCachePermissoes: vi.fn(),
}));

vi.mock("../lib/auth.js", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => {
    (_req as any).usuarioId = "user-uuid-1";
    (_req as any).escolaId  = "escola-uuid-1";
    next();
  },
}));

import salaRecursosRouter from "../routes/sala-recursos.js";
import { buscarRoles } from "../lib/permissions.js";
import { withTenant } from "../middleware/tenant.js";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/sala-recursos", salaRecursosRouter);
  return app;
}

beforeEach(() => {
  mockDb.select.mockReturnValue(makeQuery([]));
  mockDb.insert.mockReturnValue(makeQuery([]));
  mockDb.update.mockReturnValue(makeQuery([]));
  mockDb.delete.mockReturnValue(makeQuery([]));
});

describe("srGuard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna 403 quando sem permissão", async () => {
    vi.mocked(buscarRoles).mockResolvedValueOnce([]);
    const app = makeApp();
    const res = await request(app).get("/api/sala-recursos/estudantes-enee");
    expect(res.status).toBe(403);
  });

  it("permite acesso com sala_recursos:manage", async () => {
    vi.mocked(buscarRoles).mockResolvedValueOnce(["sala_recursos:manage"]);
    vi.mocked(withTenant).mockImplementationOnce(async (_id, fn) => fn(mockDb));
    mockDb.select.mockReturnValueOnce(makeQuery([]));
    const app = makeApp();
    const res = await request(app).get("/api/sala-recursos/estudantes-enee");
    expect(res.status).toBe(200);
  });

  it("permite view acessar estudantes-enee", async () => {
    vi.mocked(buscarRoles).mockResolvedValueOnce(["sala_recursos:view"]);
    vi.mocked(withTenant).mockImplementationOnce(async (_id, fn) => fn(mockDb));
    mockDb.select.mockReturnValueOnce(makeQuery([]));
    const app = makeApp();
    const res = await request(app).get("/api/sala-recursos/estudantes-enee");
    expect(res.status).toBe(200);
  });

  it("retorna 403 para professor tentando acessar manage-only endpoint", async () => {
    vi.mocked(buscarRoles).mockResolvedValueOnce(["sala_recursos:professor"]);
    const app = makeApp();
    const res = await request(app).post("/api/sala-recursos/estudantes-enee").send({
      usuarioId: "11111111-1111-1111-1111-111111111111",
      laudo: "DI",
    });
    expect(res.status).toBe(403);
  });
});

describe("GET /estudantes-enee", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna lista de ENEEs", async () => {
    vi.mocked(buscarRoles).mockResolvedValueOnce(["sala_recursos:manage"]);
    const enees = [{ id: "e1", laudo: "DI" }];
    vi.mocked(withTenant).mockImplementationOnce(async (_id, fn) => fn(mockDb));
    mockDb.select.mockReturnValueOnce(makeQuery(enees));
    const res = await request(makeApp()).get("/api/sala-recursos/estudantes-enee");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("estudantes");
  });
});

describe("POST /estudantes-enee", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cria ENEE com laudo válido", async () => {
    vi.mocked(buscarRoles).mockResolvedValueOnce(["sala_recursos:manage"]);
    const novo = { id: "e1", laudo: "TEA" };
    vi.mocked(withTenant).mockImplementationOnce(async (_id, fn) => fn(mockDb));
    mockDb.insert.mockReturnValueOnce(makeQuery([novo]));
    const res = await request(makeApp()).post("/api/sala-recursos/estudantes-enee").send({
      usuarioId: "11111111-1111-1111-1111-111111111111",
      laudo: "TEA",
    });
    expect(res.status).toBe(201);
  });

  it("rejeita laudo inválido com 400", async () => {
    vi.mocked(buscarRoles).mockResolvedValueOnce(["sala_recursos:manage"]);
    const res = await request(makeApp()).post("/api/sala-recursos/estudantes-enee").send({
      usuarioId: "11111111-1111-1111-1111-111111111111",
      laudo: "INVALIDO",
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /planos-aee/:id — restrição professor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("professor recebe apenas campos de adequação", async () => {
    vi.mocked(buscarRoles)
      .mockResolvedValueOnce(["sala_recursos:professor"])  // guard
      .mockResolvedValueOnce(["sala_recursos:professor"]); // filtro interno
    const plano = {
      id: "p1", estudanteId: "e1",
      objetivos: "obj", estrategias: "est", avaliacao: "aval", prazo: "2026-12-31",
      status: "ativo", observacoes: "segredo", elaboradoPorId: "u1",
      ano: 2026, semestre: 1,
    };
    vi.mocked(withTenant).mockImplementationOnce(async (_id, fn) => fn(mockDb));
    mockDb.select.mockReturnValueOnce(makeQuery([plano]));
    const res = await request(makeApp()).get("/api/sala-recursos/planos-aee/p1");
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("observacoes");
    expect(res.body).toHaveProperty("objetivos");
  });

  it("manage recebe plano completo", async () => {
    vi.mocked(buscarRoles)
      .mockResolvedValueOnce(["sala_recursos:manage"])  // guard
      .mockResolvedValueOnce(["sala_recursos:manage"]); // filtro interno
    const plano = {
      id: "p1", estudanteId: "e1",
      objetivos: "obj", estrategias: "est", avaliacao: "aval", prazo: "2026-12-31",
      status: "ativo", observacoes: "dados extras",
      ano: 2026, semestre: 1,
    };
    vi.mocked(withTenant).mockImplementationOnce(async (_id, fn) => fn(mockDb));
    mockDb.select.mockReturnValueOnce(makeQuery([plano]));
    const res = await request(makeApp()).get("/api/sala-recursos/planos-aee/p1");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("observacoes");
  });
});

describe("GET /portal/plano — família", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna plano sem narrativa quando ENEE existe", async () => {
    vi.mocked(buscarRoles).mockResolvedValueOnce(["sala_recursos:self"]);
    const enee = { id: "e1" };
    const plano = {
      id: "p1", objetivos: "obj", estrategias: "est",
      avaliacao: "aval", prazo: "2026-12-31", status: "ativo",
      ano: 2026, semestre: 1,
    };
    vi.mocked(withTenant)
      .mockImplementationOnce(async (_id, fn) => fn(mockDb))
      .mockImplementationOnce(async (_id, fn) => fn(mockDb));
    mockDb.select
      .mockReturnValueOnce(makeQuery([enee]))
      .mockReturnValueOnce(makeQuery([plano]));
    const res = await request(makeApp()).get("/api/sala-recursos/portal/plano");
    expect(res.status).toBe(200);
    expect(res.body.plano).toHaveProperty("objetivos");
    expect(res.body.plano).not.toHaveProperty("elaboradoPorId");
  });

  it("retorna plano null quando ENEE não existe", async () => {
    vi.mocked(buscarRoles).mockResolvedValueOnce(["sala_recursos:self"]);
    vi.mocked(withTenant).mockImplementationOnce(async (_id, fn) => fn(mockDb));
    mockDb.select.mockReturnValueOnce(makeQuery([]));
    const res = await request(makeApp()).get("/api/sala-recursos/portal/plano");
    expect(res.status).toBe(200);
    expect(res.body.plano).toBeNull();
  });
});

describe("POST /encaminhamentos/inter-modulo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cria evento inter-módulo com origem=sala_recursos", async () => {
    vi.mocked(buscarRoles).mockResolvedValueOnce(["sala_recursos:manage"]);
    const evento = { id: "ev1", origemModulo: "sala_recursos", destinoModulo: "soe", status: "pendente" };
    vi.mocked(withTenant).mockImplementationOnce(async (_id, fn) => fn(mockDb));
    mockDb.insert.mockReturnValueOnce(makeQuery([evento]));
    const res = await request(makeApp())
      .post("/api/sala-recursos/encaminhamentos/inter-modulo")
      .send({
        destinoModulo: "soe",
        estudanteId: "11111111-1111-1111-1111-111111111111",
        mensagem: "Encaminhar para SOE",
      });
    expect(res.status).toBe(201);
    expect(res.body.origemModulo).toBe("sala_recursos");
  });
});
