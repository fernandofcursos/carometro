import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  db, estudantesTable, turmasTable, cursosTable, eq, isNull, and,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";
import { createHash, createCipheriv, randomBytes } from "crypto";
import bcrypt from "bcryptjs";

const router = Router();
router.use(requireAuth);

// Shape dos dados vindos do frontend: { rows: [{ data: { nome, ..., } }] }
const rowSchema = z.object({ data: z.record(z.unknown()) });

function norm(val: unknown): string {
  return String(val ?? "").trim();
}

function normBool(val: unknown): boolean {
  const s = norm(val).toLowerCase();
  return s === "true" || s === "1" || s === "sim" || s === "yes";
}

function normInt(val: unknown): number | null {
  const n = parseInt(norm(val), 10);
  return isNaN(n) ? null : n;
}

// Helpers de criptografia para e-mail (igual ao seed-admin / auth)
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
    return createHash("sha256").update(raw).digest();
  }
  const secret = process.env.SESSION_SECRET ?? "default-dev-secret-change-in-production";
  return createHash("sha256").update(secret).digest();
}

function encryptEmail(plaintext: string): string {
  const key = getKey();
  const iv  = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + enc.toString("hex");
}

function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex");
}

function generateCodigoAcesso(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = "";
  for (let i = 0; i < 8; i++) r += charset[Math.floor(Math.random() * charset.length)];
  return r;
}

// POST /api/import/cursos — importar cursos via rows[]
router.post("/cursos", requirePermissao("import:execute"), async (req: Request, res: Response) => {
  try {
    const { rows } = z.object({ rows: z.array(rowSchema) }).parse(req.body);
    let imported = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const sigla   = norm(row.data["sigla"] ?? row.data["Sigla"])?.toUpperCase().slice(0, 4);
      const nome    = norm(row.data["nome"] ?? row.data["Curso"] ?? row.data["curso"]);
      const descricao = norm(row.data["descricao"] ?? row.data["Descricao"] ?? row.data["Descrição"]) || undefined;
      const ativo   = row.data["ativo"] !== undefined ? normBool(row.data["ativo"]) : true;
      // turnoNome é informativo — não persiste em cursos (cursos não têm turnoId)
      if (!sigla) { errors.push(`"${nome || "?"}": sigla é obrigatória`); continue; }
      if (!nome)  { errors.push(`Sigla "${sigla}": nome do curso é obrigatório`); continue; }
      try {
        await db.insert(cursosTable).values({ sigla, nome, descricao, ativo }).onConflictDoNothing();
        imported++;
      } catch (err) {
        errors.push(`"${sigla}/${nome}": ${err instanceof Error ? err.message : "erro"}`);
      }
    }

    await registrarAuditoria({
      tabela: "cursos", operacao: "INSERT",
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/import/cursos", metodoHttp: "POST", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.json({ imported, errors });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// POST /api/import/turmas — importar turmas via rows[]
router.post("/turmas", requirePermissao("import:execute"), async (req: Request, res: Response) => {
  try {
    const { rows } = z.object({ rows: z.array(rowSchema) }).parse(req.body);
    let imported = 0;
    const errors: string[] = [];

    // Carregar cursos e turnos para lookup por nome
    const cursos = await db.select({ id: cursosTable.id, nome: cursosTable.nome }).from(cursosTable).where(isNull(cursosTable.deletadoEm));
    const cursoMap = new Map(cursos.map((c) => [c.nome.toLowerCase(), c.id]));

    const { turmasTable: t2, turmaTurnosTable, turnosTable } = await import("@workspace/db");
    const turnos = await db.select({ id: turnosTable.id, nome: turnosTable.nome }).from(turnosTable);
    const turnoMap = new Map(turnos.map((t) => [t.nome.toLowerCase(), t.id]));

    for (const row of rows) {
      const sigla  = norm(row.data["sigla"] ?? row.data["Sigla"] ?? row.data["Turma"]);
      const desc   = norm(row.data["descricao"] ?? row.data["Descrição"] ?? row.data["Descricao"] ?? sigla);
      const curso  = norm(row.data["cursoNome"] ?? row.data["curso"] ?? row.data["Curso"]);
      // turnoNomes aceita múltiplos separados por | ou ,
      const turnoNomesRaw = norm(row.data["turnoNomes"] ?? row.data["turnoNome"] ?? row.data["turno"] ?? row.data["Turno"]);
      const turnoNomes = turnoNomesRaw.split(/[|,]/).map((s) => s.trim()).filter(Boolean);
      const ano      = normInt(row.data["ano"] ?? row.data["Ano"]);
      const semestre = normInt(row.data["semestre"] ?? row.data["Semestre"]);

      if (!sigla) { errors.push("Sigla é obrigatória"); continue; }
      if (turnoNomes.length === 0) { errors.push(`"${sigla}": ao menos um turno é obrigatório`); continue; }

      const cursoId = cursoMap.get(curso.toLowerCase());
      if (!cursoId) { errors.push(`Sigla "${sigla}": curso "${curso}" não encontrado`); continue; }

      const turnoIds: string[] = [];
      for (const nome of turnoNomes) {
        const tid = turnoMap.get(nome.toLowerCase());
        if (!tid) { errors.push(`Sigla "${sigla}": turno "${nome}" não encontrado`); }
        else turnoIds.push(tid);
      }
      if (turnoIds.length === 0) continue;

      try {
        const [turma] = await db.insert(t2).values({ sigla, descricao: desc, cursoId, ano, semestre }).onConflictDoNothing().returning();
        if (turma) {
          await db.insert(turmaTurnosTable).values(turnoIds.map((turnoId) => ({ turmaId: turma.id, turnoId }))).onConflictDoNothing();
        }
        imported++;
      } catch (err) {
        errors.push(`"${sigla}": ${err instanceof Error ? err.message : "erro"}`);
      }
    }

    await registrarAuditoria({
      tabela: "turmas", operacao: "INSERT",
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/import/turmas", metodoHttp: "POST", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.json({ imported, errors });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// POST /api/import/disciplinas — importar disciplinas e suas ofertas via rows[]
router.post("/disciplinas", requirePermissao("import:execute"), async (req: Request, res: Response) => {
  try {
    const { rows } = z.object({ rows: z.array(rowSchema) }).parse(req.body);
    let imported = 0;
    const errors: string[] = [];

    const { disciplinasTable, disciplinaOfertasTable, turnosTable } = await import("@workspace/db");

    const cursos = await db.select({ id: cursosTable.id, nome: cursosTable.nome }).from(cursosTable).where(isNull(cursosTable.deletadoEm));
    const cursoMap = new Map(cursos.map((c) => [c.nome.toLowerCase(), c.id]));

    const turnos = await db.select({ id: turnosTable.id, nome: turnosTable.nome }).from(turnosTable);
    const turnoMap = new Map(turnos.map((t) => [t.nome.toLowerCase(), t.id]));

    for (const row of rows) {
      const nome      = norm(row.data["nome"] ?? row.data["Nome"]);
      const cursoNome = norm(row.data["cursoNome"] ?? row.data["curso"] ?? row.data["Curso"]);
      const turnoNome = norm(row.data["turnoNome"] ?? row.data["turno"] ?? row.data["Turno"]);
      const ativo     = row.data["ativo"] !== undefined ? normBool(row.data["ativo"]) : true;

      if (!nome) { errors.push("Nome da disciplina é obrigatório"); continue; }

      const cursoId = cursoMap.get(cursoNome.toLowerCase());
      const turnoId = turnoMap.get(turnoNome.toLowerCase());

      if (!cursoId) { errors.push(`"${nome}": curso "${cursoNome}" não encontrado`); continue; }
      if (!turnoId) { errors.push(`"${nome}": turno "${turnoNome}" não encontrado`); continue; }

      try {
        // 1. Upsert disciplina por nome
        await db.insert(disciplinasTable).values({ nome }).onConflictDoNothing();
        const [disciplina] = await db
          .select({ id: disciplinasTable.id })
          .from(disciplinasTable)
          .where(eq(disciplinasTable.nome, nome));

        if (!disciplina) { errors.push(`"${nome}": falha ao encontrar disciplina após insert`); continue; }

        // 2. Upsert em disciplina_ofertas por (disciplinaId, cursoId, turnoId)
        await db.insert(disciplinaOfertasTable)
          .values({ disciplinaId: disciplina.id, cursoId, turnoId, ativo })
          .onConflictDoNothing();

        imported++;
      } catch (err) {
        errors.push(`"${nome}": ${err instanceof Error ? err.message : "erro"}`);
      }
    }

    await registrarAuditoria({
      tabela: "disciplinas", operacao: "INSERT",
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/import/disciplinas", metodoHttp: "POST", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.json({ imported, errors });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// POST /api/import/professores — importar professores e vínculos via rows[]
router.post("/professores", requirePermissao("import:execute"), async (req: Request, res: Response) => {
  try {
    const { rows } = z.object({ rows: z.array(rowSchema) }).parse(req.body);
    let imported = 0;
    const errors: string[] = [];

    const {
      disciplinasTable, disciplinaOfertasTable, turnosTable,
      usuariosTable, rolesTable, usuariosRolesTable, usuarioDisciplinasTable,
    } = await import("@workspace/db");

    const cursos = await db.select({ id: cursosTable.id, nome: cursosTable.nome }).from(cursosTable).where(isNull(cursosTable.deletadoEm));
    const cursoMap = new Map(cursos.map((c) => [c.nome.toLowerCase(), c.id]));

    const turnos = await db.select({ id: turnosTable.id, nome: turnosTable.nome }).from(turnosTable);
    const turnoMap = new Map(turnos.map((t) => [t.nome.toLowerCase(), t.id]));

    // Lookup role professor uma vez
    const [professorRole] = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(eq(rolesTable.nome, "professor"));

    if (!professorRole) {
      return res.status(500).json({ error: "Role 'professor' não encontrada — execute seed-admin primeiro" });
    }

    for (const row of rows) {
      const nome           = norm(row.data["nome"] ?? row.data["Nome"]);
      const email          = norm(row.data["email"] ?? row.data["Email"]).toLowerCase();
      const disciplinaNome = norm(row.data["disciplinaNome"] ?? row.data["disciplina"] ?? row.data["Disciplina"]);
      const cursoNome      = norm(row.data["cursoNome"] ?? row.data["curso"] ?? row.data["Curso"]);
      const turnoNome      = norm(row.data["turnoNome"] ?? row.data["turno"] ?? row.data["Turno"]);

      if (!nome || !email) { errors.push("Nome e email são obrigatórios"); continue; }

      const cursoId = cursoMap.get(cursoNome.toLowerCase());
      const turnoId = turnoMap.get(turnoNome.toLowerCase());

      if (!cursoId) { errors.push(`"${email}": curso "${cursoNome}" não encontrado`); continue; }
      if (!turnoId) { errors.push(`"${email}": turno "${turnoNome}" não encontrado`); continue; }

      try {
        // 1. Lookup disciplinaOfertaId
        const [disciplina] = await db
          .select({ id: disciplinasTable.id })
          .from(disciplinasTable)
          .where(eq(disciplinasTable.nome, disciplinaNome));

        if (!disciplina) { errors.push(`"${email}": disciplina "${disciplinaNome}" não encontrada`); continue; }

        const [oferta] = await db
          .select({ id: disciplinaOfertasTable.id })
          .from(disciplinaOfertasTable)
          .where(and(
            eq(disciplinaOfertasTable.disciplinaId, disciplina.id),
            eq(disciplinaOfertasTable.cursoId, cursoId),
            eq(disciplinaOfertasTable.turnoId, turnoId),
          ));

        if (!oferta) { errors.push(`"${email}": oferta de "${disciplinaNome}" para curso+turno não encontrada`); continue; }

        // 2. Verificar se usuário existe pelo emailHash
        const eHash = hashEmail(email);
        const [usuarioExistente] = await db
          .select({ id: usuariosTable.id })
          .from(usuariosTable)
          .where(eq(usuariosTable.emailHash, eHash));

        let usuarioId: string;

        if (usuarioExistente) {
          usuarioId = usuarioExistente.id;
          // Garantir role professor
          await db.insert(usuariosRolesTable)
            .values({ usuarioId, roleId: professorRole.id })
            .onConflictDoNothing();
        } else {
          // Criar usuário professor
          const codigoAcesso = generateCodigoAcesso();
          const senhaTemp    = generateCodigoAcesso(); // senha temporária
          const senhaHash    = await bcrypt.hash(senhaTemp, 10);

          const [novoUsuario] = await db.insert(usuariosTable).values({
            nome,
            emailEncrypted: encryptEmail(email),
            emailHash: eHash,
            codigoAcesso,
            senhaHash,
            primeiroAcesso: true,
          }).returning({ id: usuariosTable.id });

          usuarioId = novoUsuario.id;

          await db.insert(usuariosRolesTable)
            .values({ usuarioId, roleId: professorRole.id })
            .onConflictDoNothing();
        }

        // 3. Upsert em usuario_disciplinas
        await db.insert(usuarioDisciplinasTable)
          .values({ usuarioId, disciplinaOfertaId: oferta.id })
          .onConflictDoNothing();

        imported++;
      } catch (err) {
        errors.push(`"${email}": ${err instanceof Error ? err.message : "erro"}`);
      }
    }

    await registrarAuditoria({
      tabela: "usuarios", operacao: "INSERT",
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/import/professores", metodoHttp: "POST", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.json({ imported, errors });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// POST /api/import/estudantes — importar estudantes via rows[]
router.post("/estudantes", requirePermissao("import:execute"), async (req: Request, res: Response) => {
  try {
    const { rows } = z.object({ rows: z.array(rowSchema) }).parse(req.body);
    let imported = 0;
    const errors: string[] = [];

    // Carregar turmas para lookup por sigla
    const turmas = await db
      .select({ id: turmasTable.id, sigla: turmasTable.sigla })
      .from(turmasTable)
      .where(isNull(turmasTable.deletadoEm));
    const turmaMap = new Map(turmas.map((t) => [t.sigla.toLowerCase(), t.id]));

    const { estudantesTable: est } = await import("@workspace/db");

    for (const row of rows) {
      const nome     = norm(row.data["nome"] ?? row.data["Nome"]);
      const registro = norm(row.data["registro"] ?? row.data["Registro"] ?? row.data["Matrícula"] ?? row.data["Matricula"]);
      const turma    = norm(row.data["turma"] ?? row.data["turmaSigla"] ?? row.data["Turma"]);
      const observacao = norm(row.data["observacao"] ?? row.data["Observação"] ?? row.data["Observacao"]) || null;

      if (!nome || !registro) { errors.push(`Linha inválida: nome e registro são obrigatórios`); continue; }

      const turmaId = turmaMap.get(turma.toLowerCase());
      if (!turmaId) { errors.push(`Registro "${registro}": turma "${turma}" não encontrada`); continue; }

      try {
        const [existente] = await db
          .select({ id: est.id })
          .from(est)
          .where(eq(est.registro, registro));

        if (existente) {
          await db.update(est)
            .set({ nome, turmaId, observacao, atualizadoEm: new Date() })
            .where(eq(est.id, existente.id));
        } else {
          await db.insert(est).values({ nome, registro, turmaId, observacao });
        }
        imported++;
      } catch (err) {
        errors.push(`Registro "${registro}": ${err instanceof Error ? err.message : "erro"}`);
      }
    }

    await registrarAuditoria({
      tabela: "estudantes", operacao: "INSERT",
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/import/estudantes", metodoHttp: "POST", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.json({ imported, errors });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

export default router;
