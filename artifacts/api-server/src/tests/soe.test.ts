import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { makeQuery } from "./helpers/db-mock.js";

const mockDb = {
  select:         vi.fn(() => makeQuery()),
  selectDistinct: vi.fn(() => makeQuery()),
  insert:         vi.fn(() => makeQuery()),
  update:         vi.fn(() => makeQuery()),
  delete:         vi.fn(() => makeQuery()),
};

vi.mock("@workspace/db", () => ({
  db: mockDb,
  soeAtendimentosTable:   { id:"id", escolaId:"escolaId", estudanteId:"estudanteId", orientadoraId:"orientadoraId", encaminhamentoId:"encaminhamentoId", dataAtendimento:"dataAtendimento", tipo:"tipo", motivo:"motivo", registroEnc:"registroEnc", chaveRef:"chaveRef", status:"status", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm", deletadoEm:"deletadoEm" },
  soeEncaminhamentosTable: { id:"id", escolaId:"escolaId", estudanteId:"estudanteId", encaminhadoPorId:"encaminhadoPorId", motivo:"motivo", prioridade:"prioridade", status:"status", observacaoEnc:"observacaoEnc", chaveRef:"chaveRef", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  soeAcoesTable:           { id:"id", escolaId:"escolaId", tipo:"tipo", titulo:"titulo", descricao:"descricao", responsavelId:"responsavelId", estudanteId:"estudanteId", atendimentoId:"atendimentoId", prazo:"prazo", status:"status", criadoPorId:"criadoPorId", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  soeEstudosDeCasoTable:   { id:"id", escolaId:"escolaId", estudanteId:"estudanteId", dataReuniao:"dataReuniao", participantes:"participantes", deliberacoes:"deliberacoes", proximosPassos:"proximosPassos", status:"status", criadoPorId:"criadoPorId", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  soeAuditoriaTable:       { id:"id", escolaId:"escolaId", acao:"acao", usuarioId:"usuarioId", estudanteId:"estudanteId", recursoId:"recursoId", ipOrigem:"ipOrigem", userAgent:"userAgent", criadoEm:"criadoEm" },
  eq:      vi.fn(() => "eq"),
  and:     vi.fn((..._a: any[]) => "and"),
  isNull:  vi.fn(() => "isNull"),
  inArray: vi.fn(() => "inArray"),
  desc:    vi.fn((c: any) => c),
  sql:     vi.fn(),
  count:   vi.fn(() => "count"),
}));

vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/soe-crypto.js", () => ({
  cifrarRegistro:  vi.fn(() => "iv_hex:enc_hex"),
  decifrarRegistro: vi.fn(() => "Texto do registro descriptografado"),
  gerarChaveRef:   vi.fn(() => "chaveref-soe-123"),
}));

vi.mock("../lib/soe-audit.js", () => ({
  registrarAuditoriaSoe: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../middleware/tenant.js", () => ({
  withTenant: vi.fn(async (_id: string, fn: (tx: any) => Promise<any>) => fn(mockDb)),
}));

vi.mock("../lib/permissions.js", () => ({
  buscarRoles: vi.fn().mockResolvedValue(["soe:manage"]),
  requirePermissao: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  invalidarCachePermissoes: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn().mockResolvedValue(true), hash: vi.fn() },
}));

vi.mock("../lib/auth.js", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
}));

async function buildApp() {
  const { default: soeRouter } = await import("../routes/soe.js");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: any, _res: any, next: any) => {
    req.usuarioId = "user-uuid-1";
    req.escolaId  = "escola-uuid-1";
    next();
  });
  app.use("/api/soe", soeRouter);
  return app;
}

const ATENDIMENTO_FIXTURE = {
  id: "00000000-0000-0000-0000-000000000001",
  escolaId: "00000000-0000-0000-0000-000000000010",
  estudanteId: "00000000-0000-0000-0000-000000000002",
  orientadoraId: "00000000-0000-0000-0000-000000000003",
  dataAtendimento: "2026-09-16",
  tipo: "individual",
  motivo: "Dificuldade de adaptação",
  status: "aberto",
  registroEnc: "iv_hex:enc_hex",
  chaveRef: "chaveref-soe-123",
  encaminhamentoId: null,
  criadoEm: new Date().toISOString(),
  atualizadoEm: new Date().toISOString(),
  deletadoEm: null,
};

const ENCAMINHAMENTO_FIXTURE = {
  id: "00000000-0000-0000-0000-000000000004",
  escolaId: "00000000-0000-0000-0000-000000000010",
  estudanteId: "00000000-0000-0000-0000-000000000002",
  encaminhadoPorId: "00000000-0000-0000-0000-000000000003",
  motivo: "Necessita acompanhamento",
  prioridade: "urgente",
  status: "pendente",
  criadoEm: new Date().toISOString(),
};

describe("GET /api/soe/atendimentos", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna lista de atendimentos sem registroEnc", async () => {
    // The route uses a field projection (no registroEnc), so we return safe rows
    const safeRow = {
      id: ATENDIMENTO_FIXTURE.id,
      estudanteId: ATENDIMENTO_FIXTURE.estudanteId,
      orientadoraId: ATENDIMENTO_FIXTURE.orientadoraId,
      dataAtendimento: ATENDIMENTO_FIXTURE.dataAtendimento,
      tipo: ATENDIMENTO_FIXTURE.tipo,
      motivo: ATENDIMENTO_FIXTURE.motivo,
      status: ATENDIMENTO_FIXTURE.status,
      encaminhamentoId: null,
      criadoEm: ATENDIMENTO_FIXTURE.criadoEm,
    };
    mockDb.select.mockReturnValueOnce(makeQuery([safeRow]));
    const res = await request(app).get("/api/soe/atendimentos");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("atendimentos");
    expect(Array.isArray(res.body.atendimentos)).toBe(true);
    expect(res.body.atendimentos[0]).not.toHaveProperty("registroEnc");
  });
});

describe("POST /api/soe/atendimentos", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna 400 sem estudanteId", async () => {
    const res = await request(app).post("/api/soe/atendimentos").send({
      dataAtendimento: "2026-09-16",
      tipo: "individual",
      motivo: "Teste",
    });
    expect(res.status).toBe(400);
  });

  it("cria atendimento com registro cifrado e retorna 201 sem registroEnc", async () => {
    const { cifrarRegistro } = await import("../lib/soe-crypto.js");
    const returnedRow = { ...ATENDIMENTO_FIXTURE };
    mockDb.insert.mockReturnValueOnce(makeQuery([returnedRow]));
    const res = await request(app).post("/api/soe/atendimentos").send({
      estudanteId: "00000000-0000-0000-0000-000000000002",
      dataAtendimento: "2026-09-16",
      tipo: "individual",
      motivo: "Dificuldade de adaptação",
      registro: "Texto do registro sigiloso",
    });
    expect(res.status).toBe(201);
    expect(cifrarRegistro).toHaveBeenCalled();
    expect(res.body).not.toHaveProperty("registroEnc");
    expect(res.body).not.toHaveProperty("chaveRef");
  });
});

describe("GET /api/soe/atendimentos/:id", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna atendimento com registro descriptografado e sem registroEnc", async () => {
    const { registrarAuditoriaSoe } = await import("../lib/soe-audit.js");
    mockDb.select.mockReturnValueOnce(makeQuery([ATENDIMENTO_FIXTURE]));
    const res = await request(app).get("/api/soe/atendimentos/atend-uuid-1");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("registro");
    expect(res.body).not.toHaveProperty("registroEnc");
    expect(registrarAuditoriaSoe).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "READ_REGISTRO" })
    );
  });

  it("retorna 404 quando não encontrado", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([]));
    const res = await request(app).get("/api/soe/atendimentos/nao-existe");
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/soe/atendimentos/:id", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("atualiza status e retorna 200 sem registroEnc", async () => {
    const updatedRow = { ...ATENDIMENTO_FIXTURE, status: "em_acompanhamento" };
    mockDb.update.mockReturnValueOnce(makeQuery([updatedRow]));
    const res = await request(app).put("/api/soe/atendimentos/atend-uuid-1").send({
      status: "em_acompanhamento",
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("em_acompanhamento");
    expect(res.body).not.toHaveProperty("registroEnc");
  });
});

describe("POST /api/soe/encaminhamentos", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("cria encaminhamento urgente e retorna 201", async () => {
    mockDb.insert.mockReturnValueOnce(makeQuery([ENCAMINHAMENTO_FIXTURE]));
    const res = await request(app).post("/api/soe/encaminhamentos").send({
      estudanteId: "00000000-0000-0000-0000-000000000002",
      motivo: "Necessita acompanhamento urgente",
      prioridade: "urgente",
    });
    expect(res.status).toBe(201);
    expect(res.body.prioridade).toBe("urgente");
  });
});

describe("GET /api/soe/portal/meus-atendimentos", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna atendimentos sem registroEnc", async () => {
    const portalRow = {
      id: ATENDIMENTO_FIXTURE.id,
      dataAtendimento: ATENDIMENTO_FIXTURE.dataAtendimento,
      tipo: ATENDIMENTO_FIXTURE.tipo,
      motivo: ATENDIMENTO_FIXTURE.motivo,
      status: ATENDIMENTO_FIXTURE.status,
    };
    mockDb.select.mockReturnValueOnce(makeQuery([portalRow]));
    const res = await request(app).get("/api/soe/portal/meus-atendimentos");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("atendimentos");
    expect(res.body.atendimentos[0]).not.toHaveProperty("registroEnc");
  });
});
