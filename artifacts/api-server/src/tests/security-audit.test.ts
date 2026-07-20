/**
 * Security audit: verifies that all protected API endpoints return 401 when
 * called without an authentication cookie.
 *
 * This catches regressions where a developer removes requireAuth from a route.
 * Every endpoint in the table below MUST return 401 without auth.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
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
  db:                   mockDb,
  turnosTable:          {},
  cursosTable:          {},
  disciplinasTable:     {},
  turmasTable:          {},
  tiposOcorrenciasTable:{},
  ocorrenciasTable:     {},
  rolesTable:           {},
  permissoesTable:      { id:"id", recurso:"recurso", acao:"acao" },
  usuariosTable:        {},
  estudantesTable:      {},
  auditoriaLogsTable:   {},
  consentimentosLgpdTable: {},
  solicitacoesLgpdTable: {},
  usuariosRolesTable:   { usuarioId:"usuarioId", roleId:"roleId" },
  rolesPermissoesTable: { roleId:"roleId", permissaoId:"permissaoId" },
  eq:      vi.fn(() => "eq"),
  and:     vi.fn(() => "and"),
  or:      vi.fn(() => "or"),
  isNull:  vi.fn(() => "isNull"),
  isNotNull: vi.fn(() => "isNotNull"),
  inArray: vi.fn(() => "inArray"),
  ilike:   vi.fn(() => "ilike"),
  desc:    vi.fn((c) => c),
  asc:     vi.fn((c) => c),
  sql:     vi.fn(),
  gt:      vi.fn(() => "gt"),
  gte:     vi.fn(() => "gte"),
  lt:      vi.fn(() => "lt"),
  count:   vi.fn(() => "count"),
}));

vi.mock("@workspace/db/schema", () => ({
  insertTurnoSchema:         { parse: () => ({}) },
  insertCursoSchema:         { parse: () => ({}) },
  insertDisciplinaSchema:    { parse: () => ({}) },
  insertTurmaSchema:         { parse: () => ({}) },
  insertTipoOcorrenciaSchema:{ parse: () => ({}) },
  insertOcorrenciaSchema:    { parse: () => ({}) },
}));

vi.mock("../lib/audit.js",  () => ({ registrarAuditoria: vi.fn() }));
vi.mock("../lib/crypto.js", () => ({
  criptografarEmail:    vi.fn(() => Buffer.from("enc")),
  descriptografarEmail: vi.fn(() => "test@example.com"),
  criptografarFoto:     vi.fn(() => Buffer.from("photo")),
  descriptografarFoto:  vi.fn(() => Buffer.from("photo")),
}));
vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(async () => "$2b$12$x"), compare: vi.fn(async () => false) },
}));

// ── Routes under test ─────────────────────────────────────────────────────────
const PROTECTED_ROUTES: Array<{ method: "GET"|"POST"|"PUT"|"DELETE"; path: string }> = [
  // turnos
  { method: "GET",    path: "/api/turnos" },
  { method: "POST",   path: "/api/turnos" },
  { method: "GET",    path: "/api/turnos/some-id" },
  { method: "PUT",    path: "/api/turnos/some-id" },
  { method: "DELETE", path: "/api/turnos/some-id" },
  // cursos
  { method: "GET",    path: "/api/cursos" },
  { method: "POST",   path: "/api/cursos" },
  // disciplinas
  { method: "GET",    path: "/api/disciplinas" },
  { method: "POST",   path: "/api/disciplinas" },
  // tipos-ocorrencias
  { method: "GET",    path: "/api/tipos-ocorrencias" },
  { method: "POST",   path: "/api/tipos-ocorrencias" },
  // roles
  { method: "GET",    path: "/api/roles" },
  { method: "POST",   path: "/api/roles" },
  // usuarios
  { method: "GET",    path: "/api/usuarios" },
  { method: "POST",   path: "/api/usuarios" },
  // estudantes
  { method: "GET",    path: "/api/estudantes" },
  { method: "POST",   path: "/api/estudantes" },
  // carometro
  { method: "GET",    path: "/api/carometro" },
  // auditoria
  { method: "GET",    path: "/api/auditoria" },
];

let app: express.Express;

beforeAll(async () => {
  const [
    { default: turnosRouter },
    { default: cursosRouter },
    { default: disciplinasRouter },
    { default: tiposOcorrenciasRouter },
    { default: rolesRouter },
    { default: usuariosRouter },
    { default: estudantesRouter },
    { default: carometroRouter },
    { default: auditoriaRouter },
  ] = await Promise.all([
    import("../routes/turnos.js"),
    import("../routes/cursos.js"),
    import("../routes/disciplinas.js"),
    import("../routes/tipos-ocorrencias.js"),
    import("../routes/roles.js"),
    import("../routes/usuarios.js"),
    import("../routes/estudantes.js"),
    import("../routes/carometro.js"),
    import("../routes/auditoria.js"),
  ]);

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/turnos",             turnosRouter);
  app.use("/api/cursos",             cursosRouter);
  app.use("/api/disciplinas",        disciplinasRouter);
  app.use("/api/tipos-ocorrencias",  tiposOcorrenciasRouter);
  app.use("/api/roles",              rolesRouter);
  app.use("/api/usuarios",           usuariosRouter);
  app.use("/api/estudantes",         estudantesRouter);
  app.use("/api/carometro",          carometroRouter);
  app.use("/api/auditoria",          auditoriaRouter);
});

describe("Auditoria de segurança — todas as rotas protegidas retornam 401 sem auth", () => {
  for (const { method, path } of PROTECTED_ROUTES) {
    it(`${method} ${path} → 401`, async () => {
      const res = await (request(app) as Record<string, (p: string) => request.Test>)[method.toLowerCase()](path)
        .send({});
      expect(res.status, `${method} ${path} deveria retornar 401 mas retornou ${res.status}`).toBe(401);
    });
  }
});
