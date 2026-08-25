import { Router, Request, Response } from "express";
import { ZodError, z } from "zod";
import { createHash, randomBytes, createCipheriv } from "crypto";
import bcrypt from "bcryptjs";
import {
  db, matriculasTable, turmasTable, cursosTable,
  rolesTable, usuariosRolesTable, usuariosTable,
  estudantesTable,
  eq, isNull, inArray, and,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";
import { enviarEmailBoasVindas } from "../lib/mailer.js";

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

  if (code === "23505" && (msg.includes("uq_matricula_semestre") || causeMsg.includes("uq_matricula_semestre"))) {
    return { status: 409, error: "Este estudante já está enturmado em outro curso neste semestre." };
  }
  if (code === "23505") {
    return { status: 409, error: "Este estudante já está enturmado nesta turma neste semestre." };
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

async function getEstudanteRoleId(): Promise<string | null> {
  const [r] = await db.select({ id: rolesTable.id }).from(rolesTable)
    .where(eq(rolesTable.nome, "estudante")).limit(1);
  return r?.id ?? null;
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
        id:         matriculasTable.id,
        usuarioId:  matriculasTable.usuarioId,
        turmaId:    matriculasTable.turmaId,
        turmaSigla: turmasTable.sigla,
        cursoId:    cursosTable.id,
        cursoNome:  cursosTable.nome,
        registro:   matriculasTable.registro,
        ano:        matriculasTable.ano,
        semestre:   matriculasTable.semestre,
        ativo:      matriculasTable.ativo,
        criadoEm:   matriculasTable.criadoEm,
      })
      .from(matriculasTable)
      .innerJoin(turmasTable, eq(matriculasTable.turmaId, turmasTable.id))
      .innerJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
      .where(and(inArray(matriculasTable.usuarioId, usuarioIds), isNull(matriculasTable.deletadoEm)))
      .orderBy(matriculasTable.ano, matriculasTable.semestre);

    const byUsuario = matriculas.reduce((acc, m) => {
      if (!acc[m.usuarioId]) acc[m.usuarioId] = [];
      acc[m.usuarioId].push(m);
      return acc;
    }, {} as Record<string, typeof matriculas>);

    res.json(usuariosEstudante.map((u) => ({ ...u, matriculas: byUsuario[u.id] ?? [] })));
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
    const roleId = await getEstudanteRoleId();

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

    // ── Garantir role estudante ───────────────────────────────────────────────
    if (roleId) {
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

    // ── Regra: um único semestre por estudante (independente de curso ou turno) ─
    const [matriculaNoSemestre] = await db
      .select({
        id:        matriculasTable.id,
        cursoNome: cursosTable.nome,
        turmaSigla: turmasTable.sigla,
      })
      .from(matriculasTable)
      .innerJoin(turmasTable, eq(matriculasTable.turmaId, turmasTable.id))
      .innerJoin(cursosTable, eq(turmasTable.cursoId, cursosTable.id))
      .where(and(
        eq(matriculasTable.usuarioId, usuarioId),
        eq(matriculasTable.ano, body.ano),
        eq(matriculasTable.semestre, body.semestre),
        isNull(matriculasTable.deletadoEm),
      ))
      .limit(1);

    if (matriculaNoSemestre) {
      return res.status(422).json({
        error: `Este estudante já está enturmado em "${matriculaNoSemestre.cursoNome} — ${matriculaNoSemestre.turmaSigla}" no ${body.semestre}º semestre de ${body.ano}. Um estudante só pode ter uma enturmação por semestre.`,
      });
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
