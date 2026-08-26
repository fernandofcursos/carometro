import { Router, Request, Response } from "express";
import { db, usuariosTable, rolesTable, usuariosRolesTable, permissoesTable, rolesPermissoesTable, eq, isNull, and } from "@workspace/db";
import { usuarioDisciplinasTable, disciplinaOfertasTable, disciplinasTable, cursosTable, turnosTable, coordenadorCursosTable, fotosTable } from "@workspace/db/schema";
import { z } from "zod";
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "crypto";
import bcrypt from "bcryptjs";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { registrarAuditoria } from "../lib/audit.js";
import { enviarEmailBoasVindas } from "../lib/mailer.js";
import { criptografarFoto, descriptografarFoto, verificarIntegridade } from "../lib/crypto.js";

const router = Router();
router.use(requireAuth);

function encryptEmail(email: string, secret: string): string {
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(email, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decryptEmail(encrypted: string, secret: string): string {
  try {
    const key = createHash("sha256").update(secret).digest();
    const [ivHex, encHex] = encrypted.split(":");
    if (!ivHex || !encHex) return "";
    const decipher = createDecipheriv("aes-256-cbc", key, Buffer.from(ivHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

function calcularIdade(dataNascimento: string): number {
  const hoje = new Date();
  const nasc = new Date(dataNascimento);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

async function validarRegrasRoles(roleIds: string[], dataNascimento?: string | null): Promise<string | null> {
  if (roleIds.length === 0) return null;

  const roleEstudante = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(eq(rolesTable.nome, "estudante"))
    .limit(1);

  if (roleEstudante.length === 0) return null;

  const temEstudante = roleIds.includes(roleEstudante[0].id);
  if (!temEstudante) return null;

  if (!dataNascimento) {
    return "Data de nascimento obrigatória para atribuir o perfil 'estudante'.";
  }

  const idade = calcularIdade(dataNascimento);
  if (idade < 18 && roleIds.length > 1) {
    return "Usuários menores de 18 anos com perfil 'estudante' não podem ter outros perfis combinados.";
  }

  return null;
}

const createUsuarioSchema = z.object({
  email: z.string().email(),
  nome: z.string().min(1).optional(),
  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  roleIds: z.array(z.string().uuid()).optional().default([]),
  disciplinaOfertaIds: z.array(z.string().uuid()).optional().default([]),
  cursoIds: z.array(z.string().uuid()).optional().default([]),
});

// GET /api/usuarios — listar usuários ativos com seus roles
router.get("/", requirePermissao("usuarios:manage"), async (req: Request, res: Response) => {
  try {
    const secret = process.env["SESSION_SECRET"] ?? "default-dev-secret-change-in-production";
    const usuarios = await db
      .select()
      .from(usuariosTable)
      .where(isNull(usuariosTable.deletadoEm))
      .orderBy(usuariosTable.criadoEm);

    const usuariosComRoles = await Promise.all(
      usuarios.map(async (u) => {
        const roles = await db
          .select({ id: rolesTable.id, nome: rolesTable.nome })
          .from(usuariosRolesTable)
          .innerJoin(rolesTable, eq(usuariosRolesTable.roleId, rolesTable.id))
          .where(eq(usuariosRolesTable.usuarioId, u.id));

        const disciplinas = await db
          .select({
            ofertaId:       disciplinaOfertasTable.id,
            disciplinaId:   disciplinasTable.id,
            disciplinaNome: disciplinasTable.nome,
            cursoId:        cursosTable.id,
            cursoNome:      cursosTable.nome,
            turnoId:        turnosTable.id,
            turnoNome:      turnosTable.nome,
          })
          .from(usuarioDisciplinasTable)
          .innerJoin(disciplinaOfertasTable, eq(usuarioDisciplinasTable.disciplinaOfertaId, disciplinaOfertasTable.id))
          .innerJoin(disciplinasTable, eq(disciplinaOfertasTable.disciplinaId, disciplinasTable.id))
          .innerJoin(cursosTable, eq(disciplinaOfertasTable.cursoId, cursosTable.id))
          .innerJoin(turnosTable, eq(disciplinaOfertasTable.turnoId, turnosTable.id))
          .where(eq(usuarioDisciplinasTable.usuarioId, u.id));

        const cursosCoordenados = await db
          .select({ id: cursosTable.id, nome: cursosTable.nome })
          .from(coordenadorCursosTable)
          .innerJoin(cursosTable, eq(coordenadorCursosTable.cursoId, cursosTable.id))
          .where(eq(coordenadorCursosTable.usuarioId, u.id));

        return {
          id:              u.id,
          nome:            u.nome,
          dataNascimento:  u.dataNascimento ?? null,
          email:           decryptEmail(u.emailEncrypted, secret),
          codigoAcesso:    u.codigoAcesso,
          primeiroAcesso:  u.primeiroAcesso,
          fotoUrl:         u.fotoId
            ? `/api/fotos/${u.fotoId}`
            : ((u.fotoStorageKey && u.fotoDados) ? `/api/usuarios/${u.id}/foto` : null),
          bloqueadoAte:    u.bloqueadoAte,
          ultimoLoginEm:   u.ultimoLoginEm,
          criadoEm:        u.criadoEm,
          roles,
          disciplinas,
          cursosCoordenados,
        };
      })
    );

    res.json(usuariosComRoles);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar usuários" });
  }
});

// GET /api/usuarios/:id
router.get("/:id", requirePermissao("usuarios:manage"), async (req: Request, res: Response) => {
  try {
    const secret = process.env["SESSION_SECRET"] ?? "default-dev-secret-change-in-production";
    const [u] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, String(req.params.id)));
    if (!u || u.deletadoEm) return res.status(404).json({ error: "Usuário não encontrado" });

    const roles = await db
      .select({ id: rolesTable.id, nome: rolesTable.nome })
      .from(usuariosRolesTable)
      .innerJoin(rolesTable, eq(usuariosRolesTable.roleId, rolesTable.id))
      .where(eq(usuariosRolesTable.usuarioId, u.id));

    const permissoes = await db
      .select({ recurso: permissoesTable.recurso, acao: permissoesTable.acao })
      .from(usuariosRolesTable)
      .innerJoin(rolesPermissoesTable, eq(usuariosRolesTable.roleId, rolesPermissoesTable.roleId))
      .innerJoin(permissoesTable, eq(rolesPermissoesTable.permissaoId, permissoesTable.id))
      .where(eq(usuariosRolesTable.usuarioId, u.id));

    res.json({
      id: u.id, nome: u.nome,
      dataNascimento: u.dataNascimento ?? null,
      email: decryptEmail(u.emailEncrypted, secret),
      fotoUrl: u.fotoId
        ? `/api/fotos/${u.fotoId}`
        : ((u.fotoStorageKey && u.fotoDados) ? `/api/usuarios/${u.id}/foto` : null),
      codigoAcesso: u.codigoAcesso, primeiroAcesso: u.primeiroAcesso,
      bloqueadoAte: u.bloqueadoAte, ultimoLoginEm: u.ultimoLoginEm, criadoEm: u.criadoEm,
      roles,
      permissions: permissoes.map((p) => `${p.recurso}:${p.acao}`),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao buscar usuário" });
  }
});

// POST /api/usuarios — criar usuário com senha temporária
router.post("/", requirePermissao("usuarios:manage"), async (req: Request, res: Response) => {
  try {
    const { email, nome, dataNascimento, roleIds, disciplinaOfertaIds, cursoIds } = createUsuarioSchema.parse(req.body);
    const secret = process.env["SESSION_SECRET"] ?? "default-dev-secret-change-in-production";

    const erroRegra = await validarRegrasRoles(roleIds, dataNascimento);
    if (erroRegra) return res.status(422).json({ error: erroRegra });

    // Gerar credenciais temporárias
    const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const codigoAcesso = Array.from({ length: 8 }, () => charset[Math.floor(Math.random() * charset.length)]).join("");
    const senhaGerada = randomBytes(8).toString("base64url").slice(0, 10);
    const senhaHash = await bcrypt.hash(senhaGerada, 12);

    const [u] = await db.insert(usuariosTable).values({
      nome: nome || null,
      dataNascimento: dataNascimento ?? null,
      emailEncrypted: encryptEmail(email, secret),
      emailHash: createHash("sha256").update(email.toLowerCase()).digest("hex"),
      codigoAcesso,
      senhaHash,
      primeiroAcesso: true,
    }).returning();

    // Vincular roles
    if (roleIds.length > 0) {
      await db.insert(usuariosRolesTable).values(
        roleIds.map((roleId) => ({ usuarioId: u.id, roleId, concedidoPor: req.usuarioId }))
      );
    }

    // Vincular disciplina-ofertas
    if (disciplinaOfertaIds.length > 0) {
      await db.insert(usuarioDisciplinasTable).values(
        disciplinaOfertaIds.map((disciplinaOfertaId) => ({ usuarioId: u.id, disciplinaOfertaId }))
      ).onConflictDoNothing();
    }

    // Vincular cursos coordenados
    if (cursoIds.length > 0) {
      await db.insert(coordenadorCursosTable).values(
        cursoIds.map((cursoId) => ({ usuarioId: u.id, cursoId }))
      ).onConflictDoNothing();
    }

    await registrarAuditoria({
      tabela: "usuarios", operacao: "INSERT", registroId: u.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "POST /api/usuarios", metodoHttp: "POST", statusHttp: 201,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.status(201).json({
      usuario: {
        id: u.id,
        nome: u.nome,
        email,
        codigoAcesso,
        primeiroAcesso: true,
        roles: [],
        disciplinas: [],
      },
      senhaGerada,
    });

    // Enviar e-mail com credenciais — não bloqueia nem falha a criação
    enviarEmailBoasVindas(email, codigoAcesso, senhaGerada, nome).catch((err) => {
      console.error("[usuarios] falha ao enviar e-mail de boas-vindas:", err);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("23505") || msg.includes("email_hash") || msg.includes("unique")) {
      return res.status(400).json({ error: "O e-mail informado já está cadastrado para outro usuário." });
    }
    res.status(400).json({ error: msg || "Dados inválidos" });
  }
});

// GET /api/usuarios/:id/foto — servir foto (nova tabela ou fallback inline)
router.get("/:id/foto", async (req: Request, res: Response) => {
  try {
    const [u] = await db
      .select({
        fotoId: usuariosTable.fotoId,
        fotoDados: usuariosTable.fotoDados,
        fotoIv: usuariosTable.fotoIv,
        fotoMimeType: usuariosTable.fotoMimeType,
        fotoHashIntegridade: usuariosTable.fotoHashIntegridade,
      })
      .from(usuariosTable)
      .where(eq(usuariosTable.id, String(req.params.id)));

    if (!u) return res.status(404).end();

    if (u.fotoId) return res.redirect(302, `/api/fotos/${u.fotoId}`);

    if (!u.fotoDados || !u.fotoIv) return res.status(404).end();

    const dadosBrutos = descriptografarFoto(u.fotoDados, u.fotoIv);

    if (u.fotoHashIntegridade && !verificarIntegridade(dadosBrutos, u.fotoHashIntegridade)) {
      return res.status(500).json({ error: "Erro de integridade da foto" });
    }

    res.set("Content-Type", u.fotoMimeType ?? "image/jpeg");
    res.set("Cache-Control", "private, max-age=3600");
    res.send(dadosBrutos);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao servir foto" });
  }
});

// PUT /api/usuarios/:id/foto — upload ou atualização de foto de perfil
router.put("/:id/foto", requirePermissao("usuarios:manage"), async (req: Request, res: Response) => {
  try {
    const { fotoBase64 } = z.object({ fotoBase64: z.string().min(1) }).parse(req.body);
    if (fotoBase64.length > 5_000_000) return res.status(413).json({ error: "Foto muito grande. Máximo: ~3.7MB" });

    const usuarioId = String(req.params.id);
    const foto = criptografarFoto(fotoBase64);

    const [fotoRow] = await db.insert(fotosTable).values({
      entidadeTipo: "usuario", entidadeId: usuarioId,
      mimeType: foto.mimeType, tamanhoBytes: foto.tamanhoBytes,
      iv: foto.iv, hashIntegridade: foto.hash, dados: foto.dadosCriptografados,
    }).onConflictDoUpdate({
      target: [fotosTable.entidadeTipo, fotosTable.entidadeId],
      set: { mimeType: foto.mimeType, tamanhoBytes: foto.tamanhoBytes, iv: foto.iv, hashIntegridade: foto.hash, dados: foto.dadosCriptografados, atualizadoEm: new Date() },
    }).returning({ id: fotosTable.id });

    const [u] = await db
      .update(usuariosTable)
      .set({ fotoId: fotoRow.id, atualizadoEm: new Date() })
      .where(eq(usuariosTable.id, usuarioId))
      .returning({ id: usuariosTable.id });

    if (!u) return res.status(404).json({ error: "Usuário não encontrado" });

    await registrarAuditoria({
      tabela: "usuarios", operacao: "UPDATE", registroId: u.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: `PUT /api/usuarios/${usuarioId}/foto`, metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.json({ ok: true, fotoUrl: `/api/fotos/${fotoRow.id}` });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Erro ao salvar foto" });
  }
});

// PUT /api/usuarios/:id — atualizar dados do usuário
router.put("/:id", requirePermissao("usuarios:manage"), async (req: Request, res: Response) => {
  try {
    const { nome, dataNascimento } = z.object({
      nome: z.string().min(2).optional(),
      dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    }).parse(req.body);

    const setFields: Record<string, unknown> = { atualizadoEm: new Date() };
    if (nome !== undefined) setFields.nome = nome;
    if (dataNascimento !== undefined) setFields.dataNascimento = dataNascimento;

    const [u] = await db
      .update(usuariosTable)
      .set(setFields)
      .where(eq(usuariosTable.id, String(req.params.id)))
      .returning();
    if (!u) return res.status(404).json({ error: "Usuário não encontrado" });
    await registrarAuditoria({
      tabela: "usuarios", operacao: "UPDATE", registroId: u.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/usuarios/:id", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json({ id: u.id, nome: u.nome, dataNascimento: u.dataNascimento });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// PUT /api/usuarios/:id/roles — substituir roles do usuário
router.put("/:id/roles", requirePermissao("usuarios:manage"), async (req: Request, res: Response) => {
  try {
    const { roleIds } = z.object({ roleIds: z.array(z.string().uuid()) }).parse(req.body);

    // Buscar dataNascimento do usuário para validar regra do estudante menor de 18
    const [usuario] = await db
      .select({ dataNascimento: usuariosTable.dataNascimento })
      .from(usuariosTable)
      .where(eq(usuariosTable.id, String(req.params.id)));

    const erroRegra = await validarRegrasRoles(roleIds, usuario?.dataNascimento);
    if (erroRegra) return res.status(422).json({ error: erroRegra });

    await db.delete(usuariosRolesTable).where(eq(usuariosRolesTable.usuarioId, String(req.params.id)));
    if (roleIds.length > 0) {
      await db.insert(usuariosRolesTable).values(
        roleIds.map((roleId) => ({ usuarioId: String(req.params.id), roleId, concedidoPor: req.usuarioId }))
      );
    }

    await registrarAuditoria({
      tabela: "usuarios_roles", operacao: "UPDATE", registroId: String(req.params.id),
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/usuarios/:id/roles", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.json({ ok: true, total: roleIds.length });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// PUT /api/usuarios/:id/cursos — substituir cursos coordenados pelo usuário
router.put("/:id/cursos", requirePermissao("usuarios:manage"), async (req: Request, res: Response) => {
  try {
    const { cursoIds } = z
      .object({ cursoIds: z.array(z.string().uuid()) })
      .parse(req.body);

    const usuarioId = String(req.params.id);

    await db.delete(coordenadorCursosTable).where(eq(coordenadorCursosTable.usuarioId, usuarioId));

    if (cursoIds.length > 0) {
      await db.insert(coordenadorCursosTable).values(
        cursoIds.map((cursoId) => ({ usuarioId, cursoId }))
      );
    }

    await registrarAuditoria({
      tabela: "coordenador_cursos", operacao: "UPDATE", registroId: usuarioId,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/usuarios/:id/cursos", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.json({ ok: true, total: cursoIds.length });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// PUT /api/usuarios/:id/disciplinas — substituir disciplinas (ofertas) do usuário
router.put("/:id/disciplinas", requirePermissao("usuarios:manage"), async (req: Request, res: Response) => {
  try {
    const { disciplinaOfertaIds } = z
      .object({ disciplinaOfertaIds: z.array(z.string().uuid()) })
      .parse(req.body);

    const usuarioId = String(req.params.id);

    await db.delete(usuarioDisciplinasTable).where(eq(usuarioDisciplinasTable.usuarioId, usuarioId));

    if (disciplinaOfertaIds.length > 0) {
      await db.insert(usuarioDisciplinasTable).values(
        disciplinaOfertaIds.map((disciplinaOfertaId) => ({ usuarioId, disciplinaOfertaId }))
      );
    }

    await registrarAuditoria({
      tabela: "usuario_disciplinas", operacao: "UPDATE", registroId: usuarioId,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "PUT /api/usuarios/:id/disciplinas", metodoHttp: "PUT", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.json({ ok: true, total: disciplinaOfertaIds.length });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dados inválidos" });
  }
});

// POST /api/usuarios/:id/resetar-senha — gera nova senha temporária
router.post("/:id/resetar-senha", requirePermissao("usuarios:manage"), async (req: Request, res: Response) => {
  try {
    const senhaGerada = randomBytes(8).toString("base64url").slice(0, 10);
    const senhaHash = await bcrypt.hash(senhaGerada, 12);

    const secret = process.env["SESSION_SECRET"] ?? "default-dev-secret-change-in-production";
    const [u] = await db
      .update(usuariosTable)
      .set({ senhaHash, primeiroAcesso: true, atualizadoEm: new Date() })
      .where(and(eq(usuariosTable.id, String(req.params.id)), isNull(usuariosTable.deletadoEm)))
      .returning();

    if (!u) return res.status(404).json({ error: "Usuário não encontrado" });

    const email = decryptEmail(u.emailEncrypted, secret);

    await registrarAuditoria({
      tabela: "usuarios", operacao: "UPDATE", registroId: u.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: `POST /api/usuarios/${String(req.params.id)}/resetar-senha`, metodoHttp: "POST", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });

    res.json({ ok: true, senhaGerada });

    enviarEmailBoasVindas(email, u.codigoAcesso ?? "", senhaGerada, u.nome).catch((err) => {
      console.error("[usuarios] falha ao enviar e-mail de reset de senha:", err);
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao resetar senha" });
  }
});

// DELETE /api/usuarios/:id — soft delete
router.delete("/:id", requirePermissao("usuarios:manage"), async (req: Request, res: Response) => {
  try {
    // Não permitir auto-exclusão
    if (String(req.params.id) === req.usuarioId) {
      return res.status(400).json({ error: "Não é possível excluir o próprio usuário" });
    }
    const [u] = await db
      .update(usuariosTable)
      .set({ deletadoEm: new Date() })
      .where(eq(usuariosTable.id, String(req.params.id)))
      .returning();
    if (!u) return res.status(404).json({ error: "Usuário não encontrado" });
    await registrarAuditoria({
      tabela: "usuarios", operacao: "DELETE", registroId: u.id,
      usuarioId: req.usuarioId, ipOrigem: req.ip,
      endpoint: "DELETE /api/usuarios/:id", metodoHttp: "DELETE", statusHttp: 200,
      duracaoMs: req.startTime ? Date.now() - req.startTime : undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao excluir usuário" });
  }
});

export default router;
