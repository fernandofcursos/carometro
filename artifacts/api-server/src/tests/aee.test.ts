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
  aeeEstudantesTable:       { id:"id", escolaId:"escolaId", usuarioId:"usuarioId", necessidades:"necessidades", cid10:"cid10", profissionalId:"profissionalId", ativo:"ativo", deletadoEm:"deletadoEm", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  aeePlanosTable:           { id:"id", escolaId:"escolaId", estudanteAeeId:"estudanteAeeId", numero:"numero", versao:"versao", status:"status", periodoInicio:"periodoInicio", periodoFim:"periodoFim", objetivosGerais:"objetivosGerais", criadoPorId:"criadoPorId", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm", deletadoEm:"deletadoEm" },
  aeePlanoAssinaturasTable: { id:"id", planoId:"planoId", usuarioId:"usuarioId", papel:"papel", metodo:"metodo", tokenHash:"tokenHash", assinadoEm:"assinadoEm", ipOrigem:"ipOrigem" },
  aeePlanoAdaptacoesTable:  { id:"id", planoId:"planoId", descricao:"descricao", area:"area", criadoEm:"criadoEm" },
  aeeMetasTable:            { id:"id", planoId:"planoId", descricao:"descricao", indicador:"indicador", prazo:"prazo", status:"status", criadoEm:"criadoEm", atualizadoEm:"atualizadoEm" },
  aeeEvolucoesTable:        { id:"id", metaId:"metaId", profissionalId:"profissionalId", periodoRef:"periodoRef", observacao:"observacao", percentual:"percentual", registradoEm:"registradoEm" },
  aeeSessoesTable:          { id:"id", escolaId:"escolaId", estudanteAeeId:"estudanteAeeId", profissionalId:"profissionalId", dataSessao:"dataSessao", duracaoMin:"duracaoMin", local:"local", observacoes:"observacoes", criadoEm:"criadoEm", deletadoEm:"deletadoEm" },
  aeeLaudosTable:           { id:"id", escolaId:"escolaId", estudanteAeeId:"estudanteAeeId", tipo:"tipo", titulo:"titulo", conteudoEnc:"conteudoEnc", chaveRef:"chaveRef", profissionalExt:"profissionalExt", dataLaudo:"dataLaudo", criadoPorId:"criadoPorId", criadoEm:"criadoEm", deletadoEm:"deletadoEm" },
  aeeLiberacoesTable:       { id:"id", escolaId:"escolaId", estudanteAeeId:"estudanteAeeId", professorId:"professorId", verAdaptacoes:"verAdaptacoes", verMetas:"verMetas", verResumoIa:"verResumoIa", concedidoPorId:"concedidoPorId", concedidoEm:"concedidoEm", revogadoEm:"revogadoEm" },
  aeeAuditoriaTable:        { id:"id", escolaId:"escolaId", acao:"acao", usuarioId:"usuarioId", estudanteId:"estudanteId", recursoId:"recursoId", ipOrigem:"ipOrigem", userAgent:"userAgent", criadoEm:"criadoEm" },
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

vi.mock("../lib/aee-crypto.js", () => ({
  cifrarLaudo:    vi.fn(() => "iv_hex:enc_hex"),
  decifrarLaudo:  vi.fn(() => "Texto do laudo descriptografado"),
  gerarChaveRef:  vi.fn(() => "chaveref123"),
}));

vi.mock("../lib/aee-audit.js", () => ({
  registrarAuditoriaAee: vi.fn().mockResolvedValue(undefined),
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
  const { default: aeeRouter } = await import("../routes/aee.js");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: any, _res: any, next: any) => {
    req.usuarioId = "user-uuid-1";
    req.escolaId  = "escola-uuid-1";
    next();
  });
  app.use("/api/aee", aeeRouter);
  return app;
}

const ESTUDANTE_FIXTURE = {
  id: "est-aee-uuid-1", escolaId: "escola-uuid-1", usuarioId: "usuario-uuid-1",
  necessidades: "Dislexia", cid10: "F81.0", ativo: true, deletadoEm: null,
};

const PLANO_FIXTURE = {
  id: "plano-uuid-1", escolaId: "escola-uuid-1", estudanteAeeId: "est-aee-uuid-1",
  numero: "PAI-2026-0001", versao: 1, status: "rascunho",
};

describe("GET /api/aee/estudantes", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna lista de estudantes AEE", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([ESTUDANTE_FIXTURE]));
    const res = await request(app).get("/api/aee/estudantes");
    expect(res.status).toBe(200);
    expect(res.body.estudantes).toHaveLength(1);
  });
});

describe("POST /api/aee/estudantes", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna 400 sem usuarioId", async () => {
    const res = await request(app).post("/api/aee/estudantes").send({});
    expect(res.status).toBe(400);
  });

  it("cria estudante AEE com dados válidos", async () => {
    mockDb.insert.mockReturnValueOnce(makeQuery([ESTUDANTE_FIXTURE]));
    const res = await request(app).post("/api/aee/estudantes")
      .send({ usuarioId: "00000000-0000-0000-0000-000000000001", necessidades: "Dislexia" });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/aee/laudos/:id — auditoria obrigatória", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("descriptografa laudo e registra auditoria", async () => {
    const { registrarAuditoriaAee } = await import("../lib/aee-audit.js");
    mockDb.select.mockReturnValueOnce(makeQuery([{
      id: "laudo-uuid-1", estudanteAeeId: "est-aee-uuid-1",
      conteudoEnc: "iv_hex:enc_hex", escolaId: "escola-uuid-1", deletadoEm: null,
    }]));

    const res = await request(app).get("/api/aee/laudos/laudo-uuid-1");
    expect(res.status).toBe(200);
    expect(res.body.conteudo).toBe("Texto do laudo descriptografado");
    expect(res.body.conteudoEnc).toBeUndefined();
    expect(registrarAuditoriaAee).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "READ_LAUDO" })
    );
  });

  it("retorna 404 quando laudo não existe", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([]));
    const res = await request(app).get("/api/aee/laudos/inexistente");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/aee/laudos — criptografia", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("salva laudo criptografado sem conteúdo em texto puro", async () => {
    const { cifrarLaudo } = await import("../lib/aee-crypto.js");
    mockDb.insert.mockReturnValueOnce(makeQuery([{ id: "laudo-uuid-1", tipo: "psicologico", titulo: "Avaliação" }]));

    const res = await request(app).post("/api/aee/laudos").send({
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

describe("POST /api/aee/planos/:id/assinar", () => {
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

    const res = await request(app).post("/api/aee/planos/plano-uuid-1/assinar")
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

    const res = await request(app).post("/api/aee/planos/plano-uuid-1/assinar")
      .send({ senha: "senha123", papel: "professor_aee" });
    expect(res.status).toBe(200);
    expect(res.body.vigente).toBe(false);
  });
});

describe("GET /api/aee/portal-professor/:estudanteAeeId", () => {
  let app: express.Express;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });

  it("retorna liberado: false quando professor não tem liberação", async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([]));
    const res = await request(app).get("/api/aee/portal-professor/est-aee-uuid-1");
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

    const res = await request(app).get("/api/aee/portal-professor/est-aee-uuid-1");
    expect(res.status).toBe(200);
    expect(res.body.liberado).toBe(true);
    expect(res.body.adaptacoes).toHaveLength(1);
    expect(res.body.metas).toBeUndefined();
  });
});
