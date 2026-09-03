import { Router, Request, Response } from "express";
import { z } from "zod";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import {
  db, usuariosTable, webauthnCredenciaisTable, consentimentosLgpdTable,
  eq, and, isNull,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { signToken, setAuthCookie } from "../lib/auth.js";
import { getChaveEncriptacao } from "../lib/crypto.js";
import { registrarAuditoria } from "../lib/audit.js";
import { rolesTable, usuariosRolesTable, rolesPermissoesTable, permissoesTable } from "@workspace/db";

const router = Router();

// RP (Relying Party) config — deve coincidir com o origin do frontend
const RP_NAME = process.env.RP_NAME ?? "Seshat";
const RP_ID = process.env.RP_ID ?? "localhost";
const ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

// Desafios temporários em memória (challenge é single-use, expira em 5 min)
// Em produção com múltiplas instâncias, usar Redis
const challengeStore = new Map<string, { challenge: string; expiresAt: number }>();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function storeChallenge(userId: string, challenge: string) {
  challengeStore.set(userId, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

function consumeChallenge(userId: string): string | null {
  const entry = challengeStore.get(userId);
  if (!entry) return null;
  challengeStore.delete(userId);
  if (entry.expiresAt < Date.now()) return null;
  return entry.challenge;
}

// Criptografar descriptor facial (Float32Array(128) → Buffer AES-256-CBC)
function criptografarDescriptor(descriptor: number[]): { dados: Buffer; iv: string } {
  const iv = randomBytes(16);
  const chave = getChaveEncriptacao();
  const plain = Buffer.from(new Float32Array(descriptor).buffer);
  const cipher = createCipheriv("aes-256-cbc", chave, iv);
  const dados = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { dados, iv: iv.toString("base64") };
}

function descriptografarDescriptor(dados: Buffer, ivBase64: string): number[] {
  const iv = Buffer.from(ivBase64, "base64");
  const chave = getChaveEncriptacao();
  const decipher = createDecipheriv("aes-256-cbc", chave, iv);
  const plain = Buffer.concat([decipher.update(dados), decipher.final()]);
  return Array.from(new Float32Array(plain.buffer));
}

function distanciaEuclidiana(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

// Helper para buscar roles + permissões (mesmo shape do login)
async function buscarRolesEPermissoes(usuarioId: string) {
  const rolesRows = await db
    .select({ id: rolesTable.id, nome: rolesTable.nome })
    .from(usuariosRolesTable)
    .innerJoin(rolesTable, eq(usuariosRolesTable.roleId, rolesTable.id))
    .where(eq(usuariosRolesTable.usuarioId, usuarioId));

  const permsRows = rolesRows.length > 0
    ? await db
        .select({ recurso: permissoesTable.recurso, acao: permissoesTable.acao })
        .from(usuariosRolesTable)
        .innerJoin(rolesPermissoesTable, eq(rolesPermissoesTable.roleId, usuariosRolesTable.roleId))
        .innerJoin(permissoesTable, eq(permissoesTable.id, rolesPermissoesTable.permissaoId))
        .where(eq(usuariosRolesTable.usuarioId, usuarioId))
    : [];

  const permissionsSet = new Set(permsRows.map((p) => `${p.recurso}:${p.acao}`));
  return {
    roles:        rolesRows.map((r) => r.nome),
    allRoles:     rolesRows,
    activeRoleId: rolesRows[0]?.id ?? null,
    permissions:  Array.from(permissionsSet),
  };
}

// Helper para buscar usuário por email ou codigoAcesso
async function buscarUsuarioPorIdentificador(identificador: string) {
  const { createHash } = await import("crypto");
  const hash = createHash("sha256").update(identificador.toLowerCase()).digest("hex");

  // Tenta por email hash primeiro
  const porEmail = await db
    .select()
    .from(usuariosTable)
    .where(and(eq(usuariosTable.emailHash, hash), isNull(usuariosTable.deletadoEm)))
    .limit(1);

  if (porEmail.length > 0) return porEmail[0];

  // Tenta por código de acesso
  const porCodigo = await db
    .select()
    .from(usuariosTable)
    .where(and(eq(usuariosTable.codigoAcesso, identificador), isNull(usuariosTable.deletadoEm)))
    .limit(1);

  return porCodigo[0] ?? null;
}

// ═══════════════════════════════════════════════════════════
// BIOMETRIA FACIAL
// ═══════════════════════════════════════════════════════════

const cadastrarFacialSchema = z.object({
  descriptor:       z.array(z.number()).length(128, "Descriptor deve ter exatamente 128 floats"),
  consentimentoId:  z.string().uuid("UUID de consentimento inválido"),
});

// POST /api/auth/biometria/facial/cadastrar
router.post("/facial/cadastrar", requireAuth, async (req: Request, res: Response) => {
  const parsed = cadastrarFacialSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const { descriptor, consentimentoId } = parsed.data;
  const usuarioId = req.usuarioId!;

  // Verificar consentimento ativo para biometria_facial
  const [consentimento] = await db
    .select()
    .from(consentimentosLgpdTable)
    .where(
      and(
        eq(consentimentosLgpdTable.id, consentimentoId),
        eq(consentimentosLgpdTable.usuarioId, usuarioId),
        eq(consentimentosLgpdTable.finalidade, "biometria_facial"),
        eq(consentimentosLgpdTable.consentido, true),
      )
    )
    .limit(1);

  if (!consentimento) {
    res.status(403).json({ error: "Consentimento biométrico não registrado ou revogado" });
    return;
  }

  // Verificar se já tem biometria cadastrada
  const [usuario] = await db
    .select({ biometriaFacialAtivada: usuariosTable.biometriaFacialAtivada })
    .from(usuariosTable)
    .where(eq(usuariosTable.id, usuarioId))
    .limit(1);

  if (usuario?.biometriaFacialAtivada) {
    res.status(409).json({ error: "Biometria facial já cadastrada. Use /atualizar para substituir." });
    return;
  }

  const { dados, iv } = criptografarDescriptor(descriptor);

  await db.update(usuariosTable).set({
    biometriaFacialDescriptor: dados,
    biometriaFacialIv: iv,
    biometriaFacialAtivada: true,
    biometriaFacialCadastradaEm: new Date(),
    atualizadoEm: new Date(),
  }).where(eq(usuariosTable.id, usuarioId));

  await registrarAuditoria({
    usuarioId,
    operacao: "INSERT",
    tabela: "biometria_facial",
    ipOrigem: req.ip ?? "",
    endpoint: "Biometria facial cadastrada",
  });

  res.json({ ok: true, mensagem: "Biometria facial cadastrada com sucesso" });
});

const loginFacialSchema = z.object({
  identificador: z.string().min(1),
  descriptor:    z.array(z.number()).length(128, "Descriptor deve ter exatamente 128 floats"),
});

// POST /api/auth/biometria/facial/login
router.post("/facial/login", async (req: Request, res: Response) => {
  const parsed = loginFacialSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const { identificador, descriptor } = parsed.data;
  const usuario = await buscarUsuarioPorIdentificador(identificador);

  if (!usuario || !usuario.biometriaFacialAtivada || !usuario.biometriaFacialDescriptor || !usuario.biometriaFacialIv) {
    res.status(401).json({ error: "Biometria facial não cadastrada ou usuário não encontrado" });
    return;
  }

  // Verificar bloqueio
  if (usuario.bloqueadoAte && usuario.bloqueadoAte > new Date()) {
    res.status(429).json({ error: "Conta temporariamente bloqueada. Tente em alguns minutos." });
    return;
  }

  const descriptorArmazenado = descriptografarDescriptor(usuario.biometriaFacialDescriptor, usuario.biometriaFacialIv);
  const distancia = distanciaEuclidiana(descriptor, descriptorArmazenado);

  if (distancia > 0.5) {
    // Incrementar tentativas falhas
    const novasTentativas = (usuario.tentativasLoginFalhas ?? 0) + 1;
    const bloqueadoAte = novasTentativas >= 5
      ? new Date(Date.now() + 15 * 60 * 1000)
      : null;

    await db.update(usuariosTable).set({
      tentativasLoginFalhas: novasTentativas,
      ...(bloqueadoAte ? { bloqueadoAte } : {}),
      atualizadoEm: new Date(),
    }).where(eq(usuariosTable.id, usuario.id));

    res.status(401).json({ error: "Rosto não reconhecido" });
    return;
  }

  // Autenticado — zerar tentativas e registrar login
  await db.update(usuariosTable).set({
    tentativasLoginFalhas: 0,
    bloqueadoAte: null,
    ultimoLoginEm: new Date(),
    atualizadoEm: new Date(),
  }).where(eq(usuariosTable.id, usuario.id));

  await registrarAuditoria({
    usuarioId: usuario.id,
    operacao: "SELECT",
    tabela: "biometria_facial",
    ipOrigem: req.ip ?? "",
    endpoint: "Login por biometria facial",
  });

  const { roles, allRoles, activeRoleId, permissions } = await buscarRolesEPermissoes(usuario.id);
  const token = signToken(usuario.id, roles);
  setAuthCookie(res, token);

  const { descriptografarEmail } = await import("../lib/crypto.js");
  res.json({
    id: usuario.id,
    email: descriptografarEmail(usuario.emailEncrypted),
    codigoAcesso: usuario.codigoAcesso,
    primeiroAcesso: usuario.primeiroAcesso,
    roles,
    allRoles,
    activeRoleId,
    permissions,
    disciplinas: [],
  });
});

// DELETE /api/auth/biometria/facial
router.delete("/facial", requireAuth, async (req: Request, res: Response) => {
  const usuarioId = req.usuarioId!;

  await db.update(usuariosTable).set({
    biometriaFacialDescriptor: null,
    biometriaFacialIv: null,
    biometriaFacialAtivada: false,
    atualizadoEm: new Date(),
  }).where(eq(usuariosTable.id, usuarioId));

  // Revogar consentimento de biometria facial
  await db.update(consentimentosLgpdTable).set({
    consentido: false,
    revogadoEm: new Date(),
    revogadoMotivo: "Biometria facial removida pelo usuário",
  }).where(
    and(
      eq(consentimentosLgpdTable.usuarioId, usuarioId),
      eq(consentimentosLgpdTable.finalidade, "biometria_facial"),
    )
  );

  await registrarAuditoria({
    usuarioId,
    operacao: "DELETE",
    tabela: "biometria_facial",
    ipOrigem: req.ip ?? "",
    endpoint: "Biometria facial removida pelo usuário",
  });

  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// BIOMETRIA DIGITAL (WebAuthn FIDO2)
// ═══════════════════════════════════════════════════════════

const iniciarCadastroDigitalSchema = z.object({
  consentimentoId: z.string().uuid(),
  nomeDispositivo: z.string().max(100).optional(),
});

// POST /api/auth/biometria/digital/cadastrar/iniciar
router.post("/digital/cadastrar/iniciar", requireAuth, async (req: Request, res: Response) => {
  const parsed = iniciarCadastroDigitalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const { consentimentoId } = parsed.data;
  const usuarioId = req.usuarioId!;

  // Verificar consentimento ativo
  const [consentimento] = await db
    .select()
    .from(consentimentosLgpdTable)
    .where(
      and(
        eq(consentimentosLgpdTable.id, consentimentoId),
        eq(consentimentosLgpdTable.usuarioId, usuarioId),
        eq(consentimentosLgpdTable.finalidade, "biometria_digital"),
        eq(consentimentosLgpdTable.consentido, true),
      )
    )
    .limit(1);

  if (!consentimento) {
    res.status(403).json({ error: "Consentimento biométrico não registrado ou revogado" });
    return;
  }

  const [usuario] = await db
    .select({ id: usuariosTable.id, codigoAcesso: usuariosTable.codigoAcesso })
    .from(usuariosTable)
    .where(eq(usuariosTable.id, usuarioId))
    .limit(1);

  // Credenciais já cadastradas (para excludeCredentials — evita duplicatas)
  const credenciaisExistentes = await db
    .select({ credentialId: webauthnCredenciaisTable.credentialId })
    .from(webauthnCredenciaisTable)
    .where(eq(webauthnCredenciaisTable.usuarioId, usuarioId));

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: Buffer.from(usuarioId),
    userName: usuario.codigoAcesso,
    attestationType: "none",
    excludeCredentials: credenciaisExistentes.map((c) => ({
      id: c.credentialId,
      type: "public-key" as const,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  storeChallenge(usuarioId, options.challenge);
  res.json({ options });
});

const confirmarCadastroDigitalSchema = z.object({
  credential:      z.any(),
  nomeDispositivo: z.string().max(100).optional(),
});

// POST /api/auth/biometria/digital/cadastrar/confirmar
router.post("/digital/cadastrar/confirmar", requireAuth, async (req: Request, res: Response) => {
  const parsed = confirmarCadastroDigitalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const usuarioId = req.usuarioId!;
  const expectedChallenge = consumeChallenge(usuarioId);

  if (!expectedChallenge) {
    res.status(400).json({ error: "Challenge expirado ou não encontrado. Reinicie o cadastro." });
    return;
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response:          parsed.data.credential as RegistrationResponseJSON,
      expectedChallenge,
      expectedOrigin:    ORIGIN,
      expectedRPID:      RP_ID,
    });
  } catch (err) {
    res.status(400).json({ error: "Verificação da credencial falhou" });
    return;
  }

  if (!verification.verified || !verification.registrationInfo) {
    res.status(400).json({ error: "Credencial inválida" });
    return;
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  await db.insert(webauthnCredenciaisTable).values({
    usuarioId,
    credentialId:    credential.id,
    publicKey:       Buffer.from(credential.publicKey) as unknown as Buffer,
    counter:         credential.counter,
    deviceType:      credentialDeviceType,
    backedUp:        credentialBackedUp,
    nomeDispositivo: parsed.data.nomeDispositivo ?? null,
  });

  await registrarAuditoria({
    usuarioId,
    operacao: "INSERT",
    tabela: "webauthn_credenciais",
    ipOrigem: req.ip ?? "",
    endpoint: `Credencial WebAuthn cadastrada: ${parsed.data.nomeDispositivo ?? "dispositivo sem nome"}`,
  });

  res.json({
    ok: true,
    credencialId:    credential.id,
    nomeDispositivo: parsed.data.nomeDispositivo ?? "",
  });
});

const iniciarLoginDigitalSchema = z.object({
  identificador: z.string().min(1),
});

// POST /api/auth/biometria/digital/login/iniciar
router.post("/digital/login/iniciar", async (req: Request, res: Response) => {
  const parsed = iniciarLoginDigitalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const usuario = await buscarUsuarioPorIdentificador(parsed.data.identificador);
  if (!usuario) {
    // Não revelar se usuário existe — retornar options vazios
    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: "preferred",
    });
    res.json({ options });
    return;
  }

  if (usuario.bloqueadoAte && usuario.bloqueadoAte > new Date()) {
    res.status(429).json({ error: "Conta temporariamente bloqueada. Tente em alguns minutos." });
    return;
  }

  const credenciais = await db
    .select({ credentialId: webauthnCredenciaisTable.credentialId })
    .from(webauthnCredenciaisTable)
    .where(eq(webauthnCredenciaisTable.usuarioId, usuario.id));

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "preferred",
    allowCredentials: credenciais.map((c) => ({
      id: c.credentialId,
      type: "public-key" as const,
    })),
  });

  storeChallenge(usuario.id, options.challenge);
  res.json({ options });
});

const confirmarLoginDigitalSchema = z.object({
  identificador: z.string().min(1),
  credential:    z.any(),
});

// POST /api/auth/biometria/digital/login/confirmar
router.post("/digital/login/confirmar", async (req: Request, res: Response) => {
  const parsed = confirmarLoginDigitalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const usuario = await buscarUsuarioPorIdentificador(parsed.data.identificador);
  if (!usuario) {
    res.status(401).json({ error: "Credencial não encontrada" });
    return;
  }

  if (usuario.bloqueadoAte && usuario.bloqueadoAte > new Date()) {
    res.status(429).json({ error: "Conta temporariamente bloqueada. Tente em alguns minutos." });
    return;
  }

  const expectedChallenge = consumeChallenge(usuario.id);
  if (!expectedChallenge) {
    res.status(400).json({ error: "Challenge expirado. Reinicie o login." });
    return;
  }

  const authResponse = parsed.data.credential as AuthenticationResponseJSON;

  // Buscar credencial pelo ID
  const [credencial] = await db
    .select()
    .from(webauthnCredenciaisTable)
    .where(
      and(
        eq(webauthnCredenciaisTable.credentialId, authResponse.id),
        eq(webauthnCredenciaisTable.usuarioId, usuario.id),
      )
    )
    .limit(1);

  if (!credencial) {
    res.status(401).json({ error: "Credencial não encontrada" });
    return;
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response:            authResponse,
      expectedChallenge,
      expectedOrigin:      ORIGIN,
      expectedRPID:        RP_ID,
      credential: {
        id:         credencial.credentialId,
        publicKey:  new Uint8Array(credencial.publicKey),
        counter:    credencial.counter,
      },
    });
  } catch (err) {
    res.status(401).json({ error: "Verificação da assinatura falhou" });
    return;
  }

  if (!verification.verified) {
    res.status(401).json({ error: "Assinatura inválida" });
    return;
  }

  // Atualizar counter (anti-replay)
  await db.update(webauthnCredenciaisTable).set({
    counter:    verification.authenticationInfo.newCounter,
    ultimoUsoEm: new Date(),
  }).where(eq(webauthnCredenciaisTable.id, credencial.id));

  await db.update(usuariosTable).set({
    tentativasLoginFalhas: 0,
    bloqueadoAte: null,
    ultimoLoginEm: new Date(),
    atualizadoEm: new Date(),
  }).where(eq(usuariosTable.id, usuario.id));

  await registrarAuditoria({
    usuarioId: usuario.id,
    operacao: "SELECT",
    tabela: "webauthn_credenciais",
    ipOrigem: req.ip ?? "",
    endpoint: `Login por WebAuthn: ${credencial.nomeDispositivo ?? credencial.credentialId.slice(0, 8)}`,
  });

  const { roles, allRoles, activeRoleId, permissions } = await buscarRolesEPermissoes(usuario.id);
  const token = signToken(usuario.id, roles);
  setAuthCookie(res, token);

  const { descriptografarEmail } = await import("../lib/crypto.js");
  res.json({
    id: usuario.id,
    email: descriptografarEmail(usuario.emailEncrypted),
    codigoAcesso: usuario.codigoAcesso,
    primeiroAcesso: usuario.primeiroAcesso,
    roles,
    allRoles,
    activeRoleId,
    permissions,
    disciplinas: [],
  });
});

// GET /api/auth/biometria/digital  — listar credenciais do usuário autenticado
router.get("/digital", requireAuth, async (req: Request, res: Response) => {
  const credenciais = await db
    .select({
      id:              webauthnCredenciaisTable.id,
      credentialId:    webauthnCredenciaisTable.credentialId,
      nomeDispositivo: webauthnCredenciaisTable.nomeDispositivo,
      deviceType:      webauthnCredenciaisTable.deviceType,
      backedUp:        webauthnCredenciaisTable.backedUp,
      criadoEm:        webauthnCredenciaisTable.criadoEm,
      ultimoUsoEm:     webauthnCredenciaisTable.ultimoUsoEm,
    })
    .from(webauthnCredenciaisTable)
    .where(eq(webauthnCredenciaisTable.usuarioId, req.usuarioId!));

  res.json(credenciais);
});

// DELETE /api/auth/biometria/digital/:credencialId
router.delete("/digital/:credencialId", requireAuth, async (req: Request, res: Response) => {
  const usuarioId = req.usuarioId!;
  const credencialId = req.params.credencialId as string;

  const [credencial] = await db
    .select({ id: webauthnCredenciaisTable.id })
    .from(webauthnCredenciaisTable)
    .where(
      and(
        eq(webauthnCredenciaisTable.id, credencialId),
        eq(webauthnCredenciaisTable.usuarioId, usuarioId),
      )
    )
    .limit(1);

  if (!credencial) {
    res.status(404).json({ error: "Credencial não encontrada" });
    return;
  }

  await db.delete(webauthnCredenciaisTable)
    .where(eq(webauthnCredenciaisTable.id, credencialId));

  // Se era a última credencial, revogar consentimento
  const restantes = await db
    .select({ id: webauthnCredenciaisTable.id })
    .from(webauthnCredenciaisTable)
    .where(eq(webauthnCredenciaisTable.usuarioId, usuarioId))
    .limit(1);

  if (restantes.length === 0) {
    await db.update(consentimentosLgpdTable).set({
      consentido: false,
      revogadoEm: new Date(),
      revogadoMotivo: "Última credencial WebAuthn removida pelo usuário",
    }).where(
      and(
        eq(consentimentosLgpdTable.usuarioId, usuarioId),
        eq(consentimentosLgpdTable.finalidade, "biometria_digital"),
      )
    );
  }

  await registrarAuditoria({
    usuarioId,
    operacao: "DELETE",
    tabela: "webauthn_credenciais",
    ipOrigem: req.ip ?? "",
    endpoint: `Credencial WebAuthn removida: ${credencialId}`,
  });

  res.json({ ok: true });
});

export default router;
