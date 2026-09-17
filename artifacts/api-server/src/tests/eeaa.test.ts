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
  eeaaEstudantesTable:       { id:"id", escolaId:"escolaId", usuarioId:"usuarioId", necessidades:"necessidades", cid10:"cid10", profissionalId:"profissionalId", ativo:"ativo", deletadoEm:"deletadoEm", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  eeaaPlanosTable:           { id:"id", escolaId:"escolaId", estudanteEeaaId:"estudanteEeaaId", numero:"numero", versao:"versao", status:"status", periodoInicio:"periodoInicio", periodoFim:"periodoFim", objetivosGerais:"objetivosGerais", criadoPorId:"criadoPorId", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm", deletadoEm:"deletadoEm" },
  eeaaPlanoAssinaturasTable: { id:"id", planoId:"planoId", usuarioId:"usuarioId", papel:"papel", metodo:"metodo", tokenHash:"tokenHash", assinadoEm:"assinadoEm", ipOrigem:"ipOrigem" },
  eeaaPlanoAdaptacoesTable:  { id:"id", planoId:"planoId", descricao:"descricao", area:"area", criadoEm:"criadoEm" },
  eeaaMetasTable:            { id:"id", planoId:"planoId", descricao:"descricao", indicador:"indicador", prazo:"prazo", status:"status", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  eeaaEvolucoesTable:        { id:"id", metaId:"metaId", profissionalId:"profissionalId", periodoRef:"periodoRef", observacao:"observacao", percentual:"percentual", registradoEm:"registradoEm" },
  eeaaSessoesTable:          { id:"id", escolaId:"escolaId", estudanteEeaaId:"estudanteEeaaId", profissionalId:"profissionalId", dataSessao:"dataSessao", duracaoMin:"duracaoMin", local:"local", observacoes:"observacoes", criadoEm:"criadoEm", deletadoEm:"deletadoEm" },
  eeaaLaudosTable:           { id:"id", escolaId:"escolaId", estudanteEeaaId:"estudanteEeaaId", tipo:"tipo", titulo:"titulo", conteudoEnc:"conteudoEnc", chaveRef:"chaveRef", profissionalExt:"profissionalExt", dataLaudo:"dataLaudo", criadoPorId:"criadoPorId", criadoEm:"criadoEm", deletadoEm:"deletadoEm" },
  eeaaLiberacoesTable:       { id:"id", escolaId:"escolaId", estudanteEeaaId:"estudanteEeaaId", professorId:"professorId", verAdaptacoes:"verAdaptacoes", verMetas:"verMetas", verResumoIa:"verResumoIa", concedidoPorId:"concedidoPorId", concedidoEm:"concedidoEm", revogadoEm:"revogadoEm" },
  eeaaAuditoriaTable:        { id:"id", escolaId:"escolaId", acao:"acao", usuarioId:"usuarioId", estudanteId:"estudanteId", recursoId:"recursoId", ipOrigem:"ipOrigem", userAgent:"userAgent", criadoEm:"criadoEm" },
  usuariosTable:            { id:"id", nome:"nome", senhaHash:"senhaHash" },
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

vi.mock("../lib/eeaa-crypto.js", () => ({
  cifrarLaudo:    vi.fn(() => "iv_hex:enc_hex"),
  decifrarLaudo:  vi.fn(() => "Texto do laudo descriptografado"),
  gerarChaveRef:  vi.fn(() => "chaveref123"),
}));

vi.mock("../lib/eeaa-audit.js", () => ({
  registrarAuditoriaEeaa: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../middleware/tenant.js", () => ({
  withTenant: vi.fn(async (_id: string, fn: (tx: any) => Promise<any>) => fn(mockDb)),
}));

vi.mock("../lib/permissions.js", () => ({
  buscarRoles: vi.fn().mockResolvedValue(["professor_aee"]),
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
  const { default: eeaaRouter } = await import("../routes/eeaa.js");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: any, _res: any, next: any) => {
    req.usuarioId = "user-uuid-1";
    req.escolaId  = "escola-uuid-1";
    next();
  });
  app.use("/api/eeaa", eeaaRouter);
  return app;
}

const ESTUDANTE_FIXTURE = {
  id: "est-eeaa-uuid-1", escolaId: "escola-uuid-1", usuarioId: "usuario-uuid-1",
  necessidades: "Dislexia", cid10: "F81.0", ativo: true, deletadoEm: null,
};

const PLANO_FIXTURE = {
  id: "plano-uuid-1", escolaId: "escola-uuid-1", estudanteEeaaId: "est-eeaa-uuid-1",
  numero: "PAI-2026-0001", versao: 1, status: "rascunho",
};

describe("GET /api/eeaa/estudantes", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna lista de estudantes EEAA", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([ESTUDANTE_FIXTURE]));
    const res = await request(app).get("/api/eeaa/estudantes");
    expect(res.status).toBe(200);
    expect(res.body.estudantes).toHaveLength(1);
  });
});

describe("POST /api/eeaa/estudantes", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna 400 sem usuarioId", async () => {
    const res = await request(app).post("/api/eeaa/estudantes").send({});
    expect(res.status).toBe(400);
  });

  it("cria estudante EEAA com dados válidos", async () => {
    mockDb.insert.mockReturnValueOnce(makeQuery([ESTUDANTE_FIXTURE]));
    const res = await request(app).post("/api/eeaa/estudantes")
      .send({ usuarioId: "00000000-0000-0000-0000-000000000001", necessidades: "Dislexia" });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/eeaa/laudos/:id — auditoria obrigatória", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("descriptografa laudo e registra auditoria", async () => {
    const { registrarAuditoriaEeaa } = await import("../lib/eeaa-audit.js");
    mockDb.select.mockReturnValueOnce(makeQuery([{
      id: "laudo-uuid-1", estudanteEeaaId: "est-eeaa-uuid-1",
      conteudoEnc: "iv_hex:enc_hex", escolaId: "escola-uuid-1", deletadoEm: null,
    }]));

    const res = await request(app).get("/api/eeaa/laudos/laudo-uuid-1");
    expect(res.status).toBe(200);
    expect(res.body.conteudo).toBe("Texto do laudo descriptografado");
    expect(res.body.conteudoEnc).toBeUndefined();
    expect(registrarAuditoriaEeaa).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "READ_LAUDO" })
    );
  });

  it("retorna 404 quando laudo não existe", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([]));
    const res = await request(app).get("/api/eeaa/laudos/inexistente");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/eeaa/laudos — criptografia", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("salva laudo criptografado sem conteúdo em texto puro", async () => {
    const { cifrarLaudo } = await import("../lib/eeaa-crypto.js");
    mockDb.insert.mockReturnValueOnce(makeQuery([{ id: "laudo-uuid-1", tipo: "psicologico", titulo: "Avaliação" }]));

    const res = await request(app).post("/api/eeaa/laudos").send({
      estudanteAeeId: "00000000-0000-0000-0000-000000000002",
      tipo: "psicologico",
      titulo: "Avaliação Psicológica",
      conteudo: "Texto confidencial do laudo",
    });
    expect(res.status).toBe(201);
    expect(cifrarLaudo).toHaveBeenCalledWith("Texto confidencial do laudo", "escola-uuid-1");
    expect(res.body.conteudoEnc).toBeUndefined();
  });
});

describe("POST /api/eeaa/planos/:id/assinar", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("ativa PAI após professor_aee e responsavel assinarem", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([PLANO_FIXTURE]));
    mockDb.select.mockReturnValueOnce(makeQuery([{ senhaHash: "$2b$12$hash" }]));
    mockDb.insert.mockReturnValueOnce(makeQuery([]));
    mockDb.select.mockReturnValueOnce(makeQuery([
      { papel: "professor_aee" }, { papel: "responsavel" },
    ]));
    mockDb.update.mockReturnValueOnce(makeQuery([]));

    const res = await request(app).post("/api/eeaa/planos/plano-uuid-1/assinar")
      .send({ senha: "senha123", papel: "professor_aee" });
    expect(res.status).toBe(200);
    expect(res.body.vigente).toBe(true);
  });

  it("não ativa PAI com apenas uma assinatura", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([PLANO_FIXTURE]));
    mockDb.select.mockReturnValueOnce(makeQuery([{ senhaHash: "$2b$12$hash" }]));
    mockDb.insert.mockReturnValueOnce(makeQuery([]));
    mockDb.select.mockReturnValueOnce(makeQuery([{ papel: "professor_aee" }]));
    mockDb.update.mockReturnValueOnce(makeQuery([]));

    const res = await request(app).post("/api/eeaa/planos/plano-uuid-1/assinar")
      .send({ senha: "senha123", papel: "professor_aee" });
    expect(res.status).toBe(200);
    expect(res.body.vigente).toBe(false);
  });
});

describe("GET /api/eeaa/portal-professor/:estudanteEeaaId", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna liberado: false quando professor não tem liberação", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([]));
    const res = await request(app).get("/api/eeaa/portal-professor/est-eeaa-uuid-1");
    expect(res.status).toBe(200);
    expect(res.body.liberado).toBe(false);
  });

  it("retorna adaptações quando professor tem verAdaptacoes=true", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([{
      id: "lib-uuid-1", verAdaptacoes: true, verMetas: false, verResumoIa: false,
    }]));
    mockDb.select.mockReturnValueOnce(makeQuery([{ id: "plano-uuid-1" }]));
    mockDb.select.mockReturnValueOnce(makeQuery([
      { id: "adapt-1", descricao: "Usar recursos visuais", area: "metodologia" },
    ]));

    const res = await request(app).get("/api/eeaa/portal-professor/est-eeaa-uuid-1");
    expect(res.status).toBe(200);
    expect(res.body.liberado).toBe(true);
    expect(res.body.adaptacoes).toHaveLength(1);
    expect(res.body.metas).toBeUndefined();
  });
});
