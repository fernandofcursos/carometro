import { Router, Request, Response } from "express";
import { ZodError, z } from "zod";
import { createHash, randomBytes, createCipheriv } from "crypto";
import bcrypt from "bcryptjs";
import {
  db, matriculasTable, turmasTable, cursosTable,
  rolesTable, usuariosRolesTable, usuariosTable,
  estudantesTable, turmaTurnosTable,
  usuarioDisciplinasTable, disciplinaOfertasTable, disciplinasTable, turnosTable,
  eq, isNull, and, sql, inArray, ne,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";
import { enviarEmailBoasVindas } from "../lib/mailer.js";
import { emitirCarteirasParaMatricula } from "./carteiras.js";

const router = Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

function encryptEmail(email: string, secret: string): string {
  const key = createHash("sha256").update(secret).digest();
  const iv  = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const enc = Buffer.concat([cipher.update(email, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + enc.toString("hex");
}

function emailHash(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex");
}

function gerarCodigoAcesso(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => charset[Math.floor(Math.random() * charset.length)]).join("");
}

function pgCode(err: unknown): string {
  // Drizzle encapsula o erro PG em err.cause; o código PG pode estar em err.cause.code
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code ?? "";
}

function matriculaErrorMessage(err: unknown): { status: number; error: string } {
  if (err instanceof ZodError) {
    const first = err.errors[0];
    const msgs: Record<string, string> = {
      registro:  "Registro inválido — deve ser numérico e ter no máximo 20 dígitos.",
      ano:       "Ano inválido.",
      semestre:  "Semestre deve ser 1 ou 2.",
      turmaId:   "Selecione uma turma válida.",
      email:     "Informe um e-mail válido.",
    };
    return { status: 400, error: msgs[String(first?.path[0])] ?? (first?.message ?? "Dados inválidos.") };
  }
  const msg = err instanceof Error ? err.message : String(err);
  const causeMsg = String((err as { cause?: unknown })?.cause ?? "");
  const code = pgCode(err);

  if (code === "23505" && (msg.includes("uq_matricula_usuario_turma") || causeMsg.includes("uq_matricula_usuario_turma"))) {
    return { status: 409, error: "Este estudante já está matriculado nesta turma." };
  }
  if (code === "23505") {
    return { status: 409, error: "Este estudante já está enturmado nesta turma neste período." };
  }
  if (code === "23503") {
    return { status: 400, error: "Turma ou estudante inválidos. Atualize a página e tente novamente." };
  }
  if (code === "23502") {
    return { status: 400, error: "Dados obrigatórios não informados. Verifique turma, registro, ano e semestre." };
  }
  if (code === "42703") {
    return { status: 500, error: "Erro de schema no banco de dados. Execute as migrações pendentes." };
  }
  const devDetail = process.env.NODE_ENV !== "production"
    ? ` [code=${code || "?"} ${msg}]`
    : "";
  return { status: 500, error: `Erro interno ao salvar a enturmação. Tente novamente.${devDetail}` };
}

async function getOrCreateEstudanteRoleId(): Promise<string> {
  const [r] = await db.select({ id: rolesTable.id }).from(rolesTable)
    .where(eq(rolesTable.nome, "estudante")).limit(1);
  if (r) return r.id;
  // Cria a role automaticamente se não existir
  const [nova] = await db.insert(rolesTable)
    .values({ nome: "estudante", descricao: "Estudante matriculado" })
    .returning({ id: rolesTable.id });
  return nova.id;
}

// ── Esquema de entrada do POST ────────────────────────────────────────────────

const enturmarSchema = z.object({
  // Identificação do estudante: usuarioId existente OU email para busca/criação
  usuarioId: z.string().uuid().optional(),
  email:     z.string().email().optional(),
  nome:      z.string().min(2).optional(),
  // Dados da matrícula
  turmaId:   z.string().uuid(),
  registro:  z.string().min(1).max(20).regex(/^\d+$/, "Registro deve ser numérico"),
  ano:       z.number().int().min(2000).max(2100),
  semestre:  z.number().int().refine((v) => v === 1 || v === 2, "Semestre deve ser 1 ou 2"),
}).refine((d) => d.usuarioId || d.email, {
  message: "Informe o usuário (usuarioId) ou o e-mail do estudante.",
  path: ["email"],
});

// ── GET /api/matriculas ───────────────────────────────────────────────────────
// Retorna TODOS os estudantes: usuários com role 'estudante' + usuários com
// matrícula ativa (UNION deduplicada). Inclui disciplinas cursadas por cada um.

router.get("/", requirePermissao("estudantes:manage"), async (_req: Request, res: Response) => {
  try {
    // 1. Usuários com role 'estudante' (mesmo sem matrícula)
    const comRole = await db
      .select({ id: usuariosTable.id, nome: usuariosTable.nome, criadoEm: usuariosTable.criadoEm })
      .from(usuariosTable)
      .innerJoin(usuariosRolesTable, eq(usuariosRolesTable.usuarioId, usuariosTable.id))
      .innerJoin(rolesTable, and(eq(rolesTable.id, usuariosRolesTable.roleId), eq(rolesTable.nome, "estudante")))
      .where(isNull(usuariosTable.deletadoEm));

    // 2. Usuários com matrícula ativa (mesmo sem role)
    const comMatricula = await db
      .select({ id: usuariosTable.id, nome: usuariosTable.nome, criadoEm: usuariosTable.criadoEm })
      .from(usuariosTable)
      .innerJoin(matriculasTable, and(
        eq(matriculasTable.usuarioId, usuariosTable.id),
        isNull(matriculasTable.deletadoEm),
      ))
      .where(isNull(usuariosTable.deletadoEm));

    // UNION deduplicada por id
    const map = new Map<string, { id: string; nome: string | null; criadoEm: Date; matriculas: unknown[]; disciplinas: unknown[] }>();
    for (const u of [...comRole, ...comMatricula]) {
      if (!map.has(u.id)) {
        map.set(u.id, { id: u.id, nome: u.nome, criadoEm: u.criadoEm, matriculas: [], disciplinas: [] });
      }
    }

    if (map.size === 0) {
      return res.json([]);
    }

    const ids = [...map.keys()];

    // 3. Matrículas ativas dos estudantes encontrados
    const matRows = await db
      .select({
        usuarioId:   matriculasTable.usuarioId,
        matId:       matriculasTable.id,
        turmaId:     matriculasTable.turmaId,
        turmaSigla:  turmasTable.sigla,
        cursoId:     cursosTable.id,
        cursoNome:   cursosTable.nome,
        registro:    matriculasTable.registro,
        ano:         matriculasTable.ano,
        semestre:    matriculasTable.semestre,
        ativo:       matriculasTable.ativo,
        matCriadoEm: matriculasTable.criadoEm,
      })
      .from(matriculasTable)
      .innerJoin(turmasTable, eq(matriculasTable.turmaId, turmasTable.id))
      .innerJoin(cursosTable, eq(turmasTable.cursoId,     cursosTable.id))
      .where(and(
        sql`${matriculasTable.usuarioId} = ANY(ARRAY[${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}])`,
        isNull(matriculasTable.deletadoEm),
      ))
      .orderBy(matriculasTable.ano, matriculasTable.semestre);

    // 3b. Turnos de cada turma (para exibição na tabela de enturmações)
    const matTurmaIds = [...new Set(matRows.map((r) => r.turmaId))];
    const turnosByTurmaId = new Map<string, { id: string; nome: string }[]>();
    if (matTurmaIds.length > 0) {
      const turnoLinks = await db
        .select({ turmaId: turmaTurnosTable.turmaId, turnoId: turnosTable.id, turnoNome: turnosTable.nome })
        .from(turmaTurnosTable)
        .innerJoin(turnosTable, eq(turmaTurnosTable.turnoId, turnosTable.id))
        .where(inArray(turmaTurnosTable.turmaId, matTurmaIds));
      for (const r of turnoLinks) {
        const arr = turnosByTurmaId.get(r.turmaId) ?? [];
        arr.push({ id: r.turnoId, nome: r.turnoNome ?? "" });
        turnosByTurmaId.set(r.turmaId, arr);
      }
    }

    for (const r of matRows) {
      map.get(r.usuarioId)?.matriculas.push({
        id:        r.matId,
        usuarioId: r.usuarioId,
        turmaId:   r.turmaId,
        turmaSigla: r.turmaSigla,
        cursoId:   r.cursoId,
        cursoNome: r.cursoNome,
        registro:  r.registro,
        ano:       r.ano,
        semestre:  r.semestre,
        ativo:     r.ativo,
        criadoEm:  r.matCriadoEm,
        turnos:    turnosByTurmaId.get(r.turmaId) ?? [],
      });
    }

    // 4. Disciplinas cursadas por cada estudante
    const discRows = await db
      .select({
        usuarioId:        usuarioDisciplinasTable.usuarioId,
        disciplinaOfertaId: usuarioDisciplinasTable.disciplinaOfertaId,
        disciplinaNome:   disciplinasTable.nome,
        cursoNome:        cursosTable.nome,
        turnoNome:        turnosTable.nome,
      })
      .from(usuarioDisciplinasTable)
      .innerJoin(disciplinaOfertasTable, eq(usuarioDisciplinasTable.disciplinaOfertaId, disciplinaOfertasTable.id))
      .innerJoin(disciplinasTable, eq(disciplinaOfertasTable.disciplinaId, disciplinasTable.id))
      .innerJoin(cursosTable,      eq(disciplinaOfertasTable.cursoId,      cursosTable.id))
      .innerJoin(turnosTable,      eq(disciplinaOfertasTable.turnoId,      turnosTable.id))
      .where(sql`${usuarioDisciplinasTable.usuarioId} = ANY(ARRAY[${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}])`);

    for (const d of discRows) {
      map.get(d.usuarioId)?.disciplinas.push({
        disciplinaOfertaId: d.disciplinaOfertaId,
        disciplinaNome:     d.disciplinaNome,
        cursoNome:          d.cursoNome,
        turnoNome:          d.turnoNome,
      });
    }

    // Ordenar por nome
    const result = [...map.values()].sort((a, b) =>
      (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR")
    );

    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar enturmações" });
  }
});

// ── POST /api/matriculas — enturmar estudante (cria usuário se necessário) ────

router.post("/", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const body = enturmarSchema.parse(req.body);
    const secret = process.env["SESSION_SECRET"] ?? "default-dev-secret-change-in-production";

    // ── Verificar turma alvo ──────────────────────────────────────────────────
    const [turmaAlvo] = await db
      .select({ cursoId: cursosTable.id, cursoNome: cursosTable.nome })
      .from(turmasTable)
      .innerJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
      .where(eq(turmasTable.id, body.turmaId));

    if (!turmaAlvo) return res.status(400).json({ error: "Turma não encontrada." });

    // ── Resolver usuário ──────────────────────────────────────────────────────
    let usuarioId = body.usuarioId ?? null;
    let senhaGerada: string | null = null;
    let usuarioCriado = false;
    let emailResolvido = body.email ?? "";
    const roleId = await getOrCreateEstudanteRoleId();

    if (!usuarioId && body.email) {
      const hash = emailHash(body.email);

      // Buscar usuário pelo hash do e-mail
      const [existente] = await db
        .select({ id: usuariosTable.id })
        .from(usuariosTable)
        .where(and(eq(usuariosTable.emailHash, hash), isNull(usuariosTable.deletadoEm)))
        .limit(1);

      if (existente) {
        // Usuário já existe — apenas vincular
        usuarioId = existente.id;
      } else {
        // Criar novo usuário com role estudante
        const codigoAcesso = gerarCodigoAcesso();
        senhaGerada = randomBytes(8).toString("base64url").slice(0, 10);
        const senhaHash = await bcrypt.hash(senhaGerada, 12);

        const [novoUsuario] = await db.insert(usuariosTable).values({
          nome: body.nome ?? null,
          emailEncrypted: encryptEmail(body.email, secret),
          emailHash: hash,
          codigoAcesso,
          senhaHash,
          primeiroAcesso: true,
        }).returning();

        usuarioId = novoUsuario.id;
        usuarioCriado = true;

        await registrarAuditoria({
          tabela: "usuarios", operacao: "INSERT", registroId: usuarioId,
          usuarioId: req.usuarioId, ipOrigem: req.ip,
          endpoint: "POST /api/matriculas (criar usuário estudante)", metodoHttp: "POST", statusHttp: 201,
          duracaoMs: undefined,
        });

        // Enviar e-mail com credenciais (não bloqueia)
        enviarEmailBoasVindas(body.email, codigoAcesso, senhaGerada, body.nome).catch((e) => {
          console.error("[matriculas] falha ao enviar e-mail de boas-vindas:", e);
        });
      }
    }

    if (!usuarioId) return res.status(400).json({ error: "Informe o usuário ou o e-mail do estudante." });

    // ── Garantir role estudante (role sempre existe — getOrCreateEstudanteRoleId) ─
    {
      const [jaTemRole] = await db
        .select({ usuarioId: usuariosRolesTable.usuarioId })
        .from(usuariosRolesTable)
        .where(and(eq(usuariosRolesTable.usuarioId, usuarioId), eq(usuariosRolesTable.roleId, roleId)))
        .limit(1);

      if (!jaTemRole) {
        await db.insert(usuariosRolesTable).values({
          usuarioId,
          roleId,
          concedidoPor: req.usuarioId,
        });
      }
    }

    // ── Regras de enturmação múltipla ────────────────────────────────────────
    // Regra 1: Não é permitido enturmar em cursos diferentes.
    // Regra 2: No mesmo curso, é permitido enturmar em até 2 turmas de turnos DISTINTOS.
    // Regra 3: Não é permitido enturmar em turmas do mesmo turno.

    // Turnos da nova turma
    const novosTurnos = await db
      .select({ turnoId: turmaTurnosTable.turnoId })
      .from(turmaTurnosTable)
      .where(eq(turmaTurnosTable.turmaId, body.turmaId));
    const novosTurnoIds = new Set(novosTurnos.map((t) => t.turnoId));

    // Matrículas ativas do estudante
    const matriculasAtivas = await db
      .select({
        id:         matriculasTable.id,
        turmaId:    matriculasTable.turmaId,
        cursoId:    cursosTable.id,
        cursoNome:  cursosTable.nome,
        turmaSigla: turmasTable.sigla,
        ano:        matriculasTable.ano,
        semestre:   matriculasTable.semestre,
      })
      .from(matriculasTable)
      .innerJoin(turmasTable, eq(matriculasTable.turmaId, turmasTable.id))
      .innerJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
      .where(and(eq(matriculasTable.usuarioId, usuarioId), isNull(matriculasTable.deletadoEm)));

    if (matriculasAtivas.length > 0) {
      // Regra 1: Todos os cursos devem ser iguais
      const cursoDiferente = matriculasAtivas.find((m) => m.cursoId !== turmaAlvo.cursoId);
      if (cursoDiferente) {
        return res.status(422).json({
          error: `Este estudante já está enturmado no curso "${cursoDiferente.cursoNome}". Não é possível enturmar em cursos diferentes. Remova a enturmação atual primeiro.`,
        });
      }

      // Regra 2: Máximo 2 matrículas no mesmo curso
      if (matriculasAtivas.length >= 2) {
        return res.status(422).json({
          error: `Este estudante já possui 2 enturmações ativas no curso "${turmaAlvo.cursoNome}" (limite máximo). Remova uma enturmação antes de adicionar outra.`,
        });
      }

      // Regra 3: Turno deve ser diferente das matrículas existentes
      for (const mat of matriculasAtivas) {
        const turnosExistentes = await db
          .select({ turnoId: turmaTurnosTable.turnoId })
          .from(turmaTurnosTable)
          .where(eq(turmaTurnosTable.turmaId, mat.turmaId));

        const conflito = turnosExistentes.some((t) => novosTurnoIds.has(t.turnoId));
        if (conflito) {
          return res.status(422).json({
            error: `Este estudante já está enturmado na turma "${mat.turmaSigla}" neste turno. No mesmo curso, só é permitido enturmar em turnos diferentes.`,
          });
        }
      }
    }

    // ── Criar matrícula ───────────────────────────────────────────────────────
    const [matricula] = await db
      .insert(matriculasTable)
      .values({
        usuarioId,
        turmaId:  body.turmaId,
        registro: body.registro,
        ano:      body.ano,
        semestre: body.semestre,
      })
      .returning();

    // ── Sincronizar registro em estudantes (necessário para o carômetro) ──────
    // O carômetro lê a tabela `estudantes`; a enturmação usa `matriculas`.
    // Aqui criamos ou vinculamos o registro estudante para que o aluno apareça
    // na galeria fotográfica e possa ter ocorrências registradas.
    try {
      const [usuarioData] = await db
        .select({ nome: usuariosTable.nome, dataNascimento: usuariosTable.dataNascimento })
        .from(usuariosTable)
        .where(eq(usuariosTable.id, usuarioId))
        .limit(1);

      const nomeEstudante = usuarioData?.nome ?? body.nome ?? "Estudante";
      const dataNascimento = usuarioData?.dataNascimento ?? null;

      // Verifica se já existe um registro em estudantes para este usuário
      const [porUsuario] = await db
        .select({ id: estudantesTable.id })
        .from(estudantesTable)
        .where(eq(estudantesTable.usuarioId, usuarioId))
        .limit(1);

      if (porUsuario) {
        // Atualiza turmaId para refletir a enturmação mais recente
        await db.update(estudantesTable)
          .set({ turmaId: body.turmaId, atualizadoEm: new Date() })
          .where(eq(estudantesTable.id, porUsuario.id));
      } else {
        // Verifica se o registro numérico já existe (importação legada)
        const [porRegistro] = await db
          .select({ id: estudantesTable.id, usuarioId: estudantesTable.usuarioId })
          .from(estudantesTable)
          .where(eq(estudantesTable.registro, body.registro))
          .limit(1);

        if (porRegistro && !porRegistro.usuarioId) {
          // Vincula o estudante legado ao novo usuário
          await db.update(estudantesTable)
            .set({ usuarioId, turmaId: body.turmaId, atualizadoEm: new Date() })
            .where(eq(estudantesTable.id, porRegistro.id));
        } else if (!porRegistro) {
          // Cria novo registro em estudantes
          await db.insert(estudantesTable).values({
            nome:           nomeEstudante,
            registro:       body.registro,
            turmaId:        body.turmaId,
            usuarioId,
            dataNascimento,
          });
        }
        // Se porRegistro existe mas já tem outro usuarioId → conflito de registro,
        // não faz nada (a matrícula foi criada; o admin resolve manualmente).
      }
    } catch (syncErr) {
      // Falha na sincronização não cancela a matrícula — apenas loga
      console.error("[matriculas] falha ao sincronizar estudantes:", syncErr);
    }

    // ── Emitir carteira de estudante e cartão semestral automaticamente ──────
    try {
      await emitirCarteirasParaMatricula(usuarioId, matricula.id, body.ano, body.semestre);
    } catch (cartErr) {
      // Falha na emissão não cancela a matrícula
      console.error("[matriculas] falha ao emitir carteiras:", cartErr);
    }

    await registrarAuditoria({
      tabela: "matriculas", operacao: "INSERT", registroId: matricula.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/matriculas", metodoHttp: "POST", statusHttp: 201,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.status(201).json({
      matricula,
      usuarioCriado,
      ...(senhaGerada ? { senhaGerada } : {}),
    });
  } catch (err) {
    const cause = (err as { cause?: unknown })?.cause;
    console.error("[matriculas] POST error:", err, cause ? `\n  cause: ${JSON.stringify(cause)}` : "");
    const { status, error } = matriculaErrorMessage(err);
    res.status(status).json({ error });
  }
});

// ── PATCH /api/matriculas/:id — alterar enturmação ───────────────────────────

router.patch("/:id", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const body = z.object({
      turmaId:  z.string().uuid().optional(),
      registro: z.string().min(1).max(20).regex(/^\d+$/).optional(),
      ano:      z.number().int().min(2000).max(2100).optional(),
      semestre: z.number().int().refine((v) => v === 1 || v === 2).optional(),
    }).parse(req.body);

    // Buscar matrícula atual
    const [matAtual] = await db
      .select({
        id: matriculasTable.id, usuarioId: matriculasTable.usuarioId,
        turmaId: matriculasTable.turmaId, cursoId: cursosTable.id, cursoNome: cursosTable.nome,
      })
      .from(matriculasTable)
      .innerJoin(turmasTable, eq(matriculasTable.turmaId, turmasTable.id))
      .innerJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
      .where(and(eq(matriculasTable.id, String(req.params.id)), isNull(matriculasTable.deletadoEm)));

    if (!matAtual) return res.status(404).json({ error: "Enturmação não encontrada." });

    const novaTurmaId = body.turmaId ?? matAtual.turmaId;

    // Se turmaId mudou, re-validar regras de enturmação
    if (body.turmaId && body.turmaId !== matAtual.turmaId) {
      const [turmaAlvo] = await db
        .select({ cursoId: cursosTable.id, cursoNome: cursosTable.nome })
        .from(turmasTable)
        .innerJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
        .where(eq(turmasTable.id, body.turmaId));
      if (!turmaAlvo) return res.status(400).json({ error: "Turma não encontrada." });

      const novosTurnos = await db
        .select({ turnoId: turmaTurnosTable.turnoId })
        .from(turmaTurnosTable)
        .where(eq(turmaTurnosTable.turmaId, body.turmaId));
      const novosTurnoIds = new Set(novosTurnos.map((t) => t.turnoId));

      // Outras matrículas ativas (excluindo a atual)
      const outrasAtivas = await db
        .select({ id: matriculasTable.id, turmaId: matriculasTable.turmaId, cursoId: cursosTable.id, cursoNome: cursosTable.nome, turmaSigla: turmasTable.sigla })
        .from(matriculasTable)
        .innerJoin(turmasTable, eq(matriculasTable.turmaId, turmasTable.id))
        .innerJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
        .where(and(eq(matriculasTable.usuarioId, matAtual.usuarioId), isNull(matriculasTable.deletadoEm), ne(matriculasTable.id, matAtual.id)));

      if (outrasAtivas.length > 0) {
        const cursoDiferente = outrasAtivas.find((m) => m.cursoId !== turmaAlvo.cursoId);
        if (cursoDiferente) {
          return res.status(422).json({ error: `Este estudante já está enturmado no curso "${cursoDiferente.cursoNome}". Não é possível enturmar em cursos diferentes.` });
        }
        if (outrasAtivas.length >= 2) {
          return res.status(422).json({ error: `Limite de 2 enturmações ativas atingido.` });
        }
        for (const m of outrasAtivas) {
          const turnosExistentes = await db.select({ turnoId: turmaTurnosTable.turnoId }).from(turmaTurnosTable).where(eq(turmaTurnosTable.turmaId, m.turmaId));
          if (turnosExistentes.some((t) => novosTurnoIds.has(t.turnoId))) {
            return res.status(422).json({ error: `Este estudante já está enturmado na turma "${m.turmaSigla}" neste turno.` });
          }
        }
      }
    }

    await db.update(matriculasTable).set({
      ...(novaTurmaId !== matAtual.turmaId && { turmaId: novaTurmaId }),
      ...(body.registro  !== undefined && { registro: body.registro }),
      ...(body.ano       !== undefined && { ano: body.ano }),
      ...(body.semestre  !== undefined && { semestre: body.semestre }),
      atualizadoEm: new Date(),
    }).where(eq(matriculasTable.id, matAtual.id));

    await registrarAuditoria({ tabela: "matriculas", operacao: "UPDATE", registroId: matAtual.id, usuarioId: req.usuarioId, ipOrigem: req.ip, endpoint: `PATCH /api/matriculas/${matAtual.id}`, metodoHttp: "PATCH", statusHttp: 200, duracaoMs: req.startTime ? Date.now() - req.startTime : undefined });
    res.json({ ok: true });
  } catch (err) {
    const { status, error } = matriculaErrorMessage(err);
    res.status(status).json({ error });
  }
});

// ── DELETE /api/matriculas/:id ────────────────────────────────────────────────

router.delete("/:id", requirePermissao("estudantes:manage"), async (req: Request, res: Response) => {
  try {
    const [m] = await db
      .update(matriculasTable)
      .set({ deletadoEm: new Date(), ativo: false, atualizadoEm: new Date() })
      .where(and(eq(matriculasTable.id, String(req.params.id)), isNull(matriculasTable.deletadoEm)))
      .returning();

    if (!m) return res.status(404).json({ error: "Enturmação não encontrada." });

    await registrarAuditoria({
      tabela: "matriculas", operacao: "DELETE", registroId: m.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: `DELETE /api/matriculas/${String(req.params.id)}`, metodoHttp: "DELETE", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao desfazer enturmação." });
  }
});

export default router;
