import { Router, Request, Response } from "express";
import { z } from "zod";
import { db, estudantesTable, turmasTable, cursosTable, eq, isNull } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

// Shape dos dados vindos do frontend: { rows: [{ data: { nome, ..., } }] }
const rowSchema = z.object({ data: z.record(z.unknown()) });

function norm(val: unknown): string {
  return String(val ?? "").trim();
}

// POST /api/import/cursos — importar cursos via rows[]
router.post("/cursos", requirePermissao("import:execute"), async (req: Request, res: Response) => {
  try {
    const { rows } = z.object({ rows: z.array(rowSchema) }).parse(req.body);
    let imported = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const nome = norm(row.data["nome"] ?? row.data["Curso"] ?? row.data["curso"]);
      if (!nome) { errors.push("Nome do curso é obrigatório"); continue; }
      try {
        await db.insert(cursosTable).values({ nome }).onConflictDoNothing();
        imported++;
      } catch (err) {
        errors.push(`"${nome}": ${err instanceof Error ? err.message : "erro"}`);
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

    const { turmasTable: t2, turnosTable } = await import("@workspace/db");
    const turnos = await db.select({ id: turnosTable.id, nome: turnosTable.nome }).from(turnosTable);
    const turnoMap = new Map(turnos.map((t) => [t.nome.toLowerCase(), t.id]));

    for (const row of rows) {
      const sigla  = norm(row.data["sigla"] ?? row.data["Sigla"] ?? row.data["Turma"]);
      const desc   = norm(row.data["descricao"] ?? row.data["Descrição"] ?? row.data["Descricao"] ?? sigla);
      const curso  = norm(row.data["curso"] ?? row.data["Curso"]);
      const turno  = norm(row.data["turno"] ?? row.data["Turno"]);

      if (!sigla) { errors.push("Sigla é obrigatória"); continue; }

      const cursoId = cursoMap.get(curso.toLowerCase());
      const turnoId = turnoMap.get(turno.toLowerCase());

      if (!cursoId) { errors.push(`Sigla "${sigla}": curso "${curso}" não encontrado`); continue; }
      if (!turnoId) { errors.push(`Sigla "${sigla}": turno "${turno}" não encontrado`); continue; }

      try {
        await db.insert(t2).values({ sigla, descricao: desc, cursoId, turnoId }).onConflictDoNothing();
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

    for (const row of rows) {
      const nome     = norm(row.data["nome"] ?? row.data["Nome"]);
      const registro = norm(row.data["registro"] ?? row.data["Registro"] ?? row.data["Matrícula"] ?? row.data["Matricula"]);
      const turma    = norm(row.data["turma"] ?? row.data["Turma"]);
      const observacao = norm(row.data["observacao"] ?? row.data["Observação"] ?? row.data["Observacao"]) || null;

      if (!nome || !registro) { errors.push(`Linha inválida: nome e registro são obrigatórios`); continue; }

      const turmaId = turmaMap.get(turma.toLowerCase());
      if (!turmaId) { errors.push(`Registro "${registro}": turma "${turma}" não encontrada`); continue; }

      try {
        const [existente] = await db
          .select({ id: estudantesTable.id })
          .from(estudantesTable)
          .where(eq(estudantesTable.registro, registro));

        if (existente) {
          await db.update(estudantesTable)
            .set({ nome, turmaId, observacao, atualizadoEm: new Date() })
            .where(eq(estudantesTable.id, existente.id));
        } else {
          await db.insert(estudantesTable).values({ nome, registro, turmaId, observacao });
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
