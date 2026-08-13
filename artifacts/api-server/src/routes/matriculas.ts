import { Router, Request, Response } from "express";
import { ZodError } from "zod";
import {
  db, matriculasTable, turmasTable, cursosTable, turnosTable, turmaTurnosTable,
  rolesTable, usuariosRolesTable, usuariosTable,
  eq, isNull, inArray, and,
} from "@workspace/db";
import { insertMatriculaSchema } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

function matriculaErrorMessage(err: unknown): { status: number; error: string } {
  if (err instanceof ZodError) {
    const first = err.errors[0];
    if (first?.path[0] === "registro")  return { status: 400, error: "Registro inválido — deve ser numérico e ter no máximo 20 dígitos." };
    if (first?.path[0] === "ano")       return { status: 400, error: "Ano inválido." };
    if (first?.path[0] === "semestre")  return { status: 400, error: "Semestre deve ser 1 ou 2." };
    if (first?.path[0] === "turmaId")   return { status: 400, error: "Selecione uma turma válida." };
    if (first?.path[0] === "usuarioId") return { status: 400, error: "Estudante inválido." };
    return { status: 400, error: first?.message ?? "Dados inválidos." };
  }
  const msg = err instanceof Error ? err.message : "";
  if (msg.includes("uq_matricula") || msg.includes("23505")) {
    return { status: 409, error: "Este estudante já está matriculado nesta turma neste semestre." };
  }
  if (msg.includes("23503")) {
    if (msg.includes("turma")) return { status: 400, error: "Turma não encontrada. Atualize a página e tente novamente." };
    return { status: 400, error: "Estudante ou turma inválidos." };
  }
  if (msg.includes("ck_semestre")) {
    return { status: 400, error: "Semestre deve ser 1 ou 2." };
  }
  return { status: 500, error: "Erro interno ao salvar a matrícula. Tente novamente." };
}

// Buscar IDs dos estudantes (usuarios com role "estudante")
async function getEstudanteRoleId(): Promise<string | null> {
  const [r] = await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.nome, "estudante")).limit(1);
  return r?.id ?? null;
}

// GET /api/matriculas — listar estudantes (usuarios com role estudante) com suas matrículas
router.get("/", requirePermissao("estudantes:manage"), async (_req: Request, res: Response) => {
  try {
    const roleId = await getEstudanteRoleId();
    if (!roleId) return res.json([]);

    const usuariosEstudante = await db
      .select({ id: usuariosTable.id, nome: usuariosTable.nome, criadoEm: usuariosTable.criadoEm })
      .from(usuariosRolesTable)
      .innerJoin(usuariosTable, eq(usuariosRolesTable.usuarioId, usuariosTable.id))
      .where(and(eq(usuariosRolesTable.roleId, roleId), isNull(usuariosTable.deletadoEm)))
      .orderBy(usuariosTable.nome);

    if (!usuariosEstudante.length) return res.json([]);

    const usuarioIds = usuariosEstudante.map((u) => u.id);

    const matriculas = await db
      .select({
        id:          matriculasTable.id,
        usuarioId:   matriculasTable.usuarioId,
        turmaId:     matriculasTable.turmaId,
        turmaSigla:  turmasTable.sigla,
        cursoId:     cursosTable.id,
        cursoNome:   cursosTable.nome,
        registro:    matriculasTable.registro,
        ano:         matriculasTable.ano,
        semestre:    matriculasTable.semestre,
        principal:   matriculasTable.principal,
        ativo:       matriculasTable.ativo,
        criadoEm:    matriculasTable.criadoEm,
      })
      .from(matriculasTable)
      .innerJoin(turmasTable, eq(matriculasTable.turmaId, turmasTable.id))
      .innerJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
      .where(and(inArray(matriculasTable.usuarioId, usuarioIds), isNull(matriculasTable.deletadoEm)))
      .orderBy(matriculasTable.ano, matriculasTable.semestre);

    const matriculasByUsuario = matriculas.reduce((acc, m) => {
      if (!acc[m.usuarioId]) acc[m.usuarioId] = [];
      acc[m.usuarioId].push(m);
      return acc;
    }, {} as Record<string, typeof matriculas>);

    res.json(usuariosEstudante.map((u) => ({
      ...u,
      matriculas: matriculasByUsuario[u.id] ?? [],
    })));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar matrículas" });
  }
});

// POST /api/matriculas — enturmar estudante
router.post("/", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const data = insertMatriculaSchema.parse(req.body);

    // Validar: um estudante só pode estar em um curso por período
    const matriculasNoSemestre = await db
      .select({
        turmaId:  matriculasTable.turmaId,
        cursoId:  cursosTable.id,
        principal: matriculasTable.principal,
      })
      .from(matriculasTable)
      .innerJoin(turmasTable, eq(matriculasTable.turmaId, turmasTable.id))
      .innerJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
      .where(and(
        eq(matriculasTable.usuarioId, data.usuarioId),
        eq(matriculasTable.ano, data.ano),
        eq(matriculasTable.semestre, data.semestre),
        isNull(matriculasTable.deletadoEm),
      ));

    // Verificar curso do turma alvo
    const [turmaAlvo] = await db
      .select({ cursoId: cursosTable.id, cursoCome: cursosTable.nome })
      .from(turmasTable)
      .innerJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
      .where(eq(turmasTable.id, data.turmaId));

    if (!turmaAlvo) return res.status(400).json({ error: "Turma não encontrada." });

    const cursosNoSemestre = [...new Set(matriculasNoSemestre.map((m) => m.cursoId))];

    // Regra: só um curso por período
    if (cursosNoSemestre.length > 0 && !cursosNoSemestre.includes(turmaAlvo.cursoId)) {
      return res.status(422).json({
        error: `Este estudante já está matriculado em outro curso neste semestre. Um estudante só pode cursar um curso por período.`,
      });
    }

    // Regra: máximo 2 turnos no mesmo curso (1 principal + 1 complementar)
    if (cursosNoSemestre.includes(turmaAlvo.cursoId) && matriculasNoSemestre.length >= 2) {
      return res.status(422).json({
        error: "Limite de 2 turmas por semestre atingido. O estudante pode estar em no máximo 2 turnos do mesmo curso por período (1 principal + 1 complementar).",
      });
    }

    // Se já tem 1 matrícula no mesmo curso, a nova é complementar
    const jaPrincipal = matriculasNoSemestre.some((m) => m.cursoId === turmaAlvo.cursoId && m.principal);
    const novaPrincipal = !jaPrincipal;

    const [matricula] = await db
      .insert(matriculasTable)
      .values({ ...data, principal: novaPrincipal })
      .returning();

    await registrarAuditoria({
      tabela: "matriculas", operacao: "INSERT", registroId: matricula.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/matriculas", metodoHttp: "POST", statusHttp: 201,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.status(201).json(matricula);
  } catch (err) {
    const { status, error } = matriculaErrorMessage(err);
    res.status(status).json({ error });
  }
});

// DELETE /api/matriculas/:id — soft delete (desfazer enturmação)
router.delete("/:id", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const [m] = await db
      .update(matriculasTable)
      .set({ deletadoEm: new Date(), ativo: false, atualizadoEm: new Date() })
      .where(and(eq(matriculasTable.id, String(req.params.id)), isNull(matriculasTable.deletadoEm)))
      .returning();

    if (!m) return res.status(404).json({ error: "Matrícula não encontrada." });

    await registrarAuditoria({
      tabela: "matriculas", operacao: "DELETE", registroId: m.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: `DELETE /api/matriculas/${String(req.params.id)}`, metodoHttp: "DELETE", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao desfazer matrícula." });
  }
});

export default router;
