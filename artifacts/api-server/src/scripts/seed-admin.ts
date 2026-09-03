/**
 * Seed script — cria o administrador inicial e garante que todas as 14
 * permissões canônicas estejam vinculadas ao role "administrador".
 *
 * Uso:
 *   pnpm --filter @workspace/api-server run seed-admin [email]
 *   pnpm --filter @workspace/api-server run seed-admin admin@escola.edu.br
 *
 * Idempotente: pode ser rodado múltiplas vezes sem duplicar dados.
 */
import { db } from "@workspace/db";
import {
  usuariosTable, rolesTable, usuariosRolesTable,
  permissoesTable, rolesPermissoesTable,
} from "@workspace/db/schema";
import { createHash, createCipheriv, randomBytes } from "crypto";
import { eq, and } from "@workspace/db";
import bcrypt from "bcryptjs";

// ── Criptografia de e-mail (AES-256-CBC, mesma chave do api-server) ───────────
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw) {
    // 64 chars hex = 32 bytes (formato preferido)
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
    return createHash("sha256").update(raw).digest();
  }
  // Fallback: derivar da SESSION_SECRET (compatibilidade com instalações sem ENCRYPTION_KEY)
  const secret = process.env.SESSION_SECRET ?? "default-dev-secret-change-in-production";
  return createHash("sha256").update(secret).digest();
}

function encryptEmail(plaintext: string): string {
  const key = getKey();
  const iv  = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  // Formato "ivHex:encHex" — compatível com descriptografarEmail() em crypto.ts
  return iv.toString("hex") + ":" + enc.toString("hex");
}

// ── Geradores de credenciais ──────────────────────────────────────────────────
function generateCodigoAcesso(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = "";
  for (let i = 0; i < 8; i++) r += charset[Math.floor(Math.random() * charset.length)];
  return r;
}

function generateSenha(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjklmnpqrstuvwxyz23456789@#!";
  let r = "";
  for (let i = 0; i < 10; i++) r += charset[Math.floor(Math.random() * charset.length)];
  return r;
}

// ── Permissões canônicas (constituição §4) ────────────────────────────────────
const PERMISSOES: { recurso: string; acao: string; descricao: string }[] = [
  { recurso: "carometro",         acao: "view",    descricao: "Visualizar carômetro" },
  { recurso: "estudantes",        acao: "view",    descricao: "Visualizar lista de estudantes" },
  { recurso: "estudantes",        acao: "manage",  descricao: "Criar, editar e excluir estudantes" },
  { recurso: "usuarios",          acao: "manage",  descricao: "Criar, editar e excluir usuários" },
  { recurso: "roles",             acao: "manage",  descricao: "Gerenciar papéis e permissões" },
  { recurso: "cursos",            acao: "manage",  descricao: "Criar, editar e excluir cursos" },
  { recurso: "turnos",            acao: "manage",  descricao: "Criar, editar e excluir turnos" },
  { recurso: "turmas",            acao: "manage",  descricao: "Criar, editar e excluir turmas" },
  { recurso: "disciplinas",       acao: "manage",  descricao: "Criar, editar e excluir disciplinas" },
  { recurso: "ocorrencias",       acao: "view",    descricao: "Visualizar relatório de ocorrências" },
  { recurso: "ocorrencias",       acao: "create",  descricao: "Registrar ocorrências" },
  { recurso: "tipos-ocorrencias", acao: "manage",  descricao: "Criar e editar tipos de ocorrência" },
  { recurso: "import",            acao: "execute", descricao: "Importar dados via XLSX" },
  { recurso: "auditoria",         acao: "view",    descricao: "Visualizar log de auditoria" },
  { recurso: "requerimentos",     acao: "create",  descricao: "Criar requerimentos (estudante adulto e responsável)" },
  { recurso: "requerimentos",     acao: "view",    descricao: "Visualizar próprios requerimentos" },
  { recurso: "requerimentos",     acao: "manage",  descricao: "Analisar e deferir/indeferir requerimentos" },
];

// ── Roles padrão do sistema ───────────────────────────────────────────────────
const ROLES_PADRAO: { nome: string; descricao: string; permissoes: { recurso: string; acao: string }[] }[] = [
  {
    nome: "coordenador",
    descricao: "Coordenador de curso",
    permissoes: [
      { recurso: "carometro",   acao: "view"   },
      { recurso: "estudantes",  acao: "view"   },
      { recurso: "estudantes",  acao: "manage" },
      { recurso: "ocorrencias", acao: "view"   },
      { recurso: "ocorrencias", acao: "create" },
      { recurso: "turmas",      acao: "manage" },
    ],
  },
  {
    nome: "professor",
    descricao: "Professor",
    permissoes: [
      { recurso: "carometro",   acao: "view"   },
      { recurso: "estudantes",  acao: "view"   },
      { recurso: "ocorrencias", acao: "view"   },
      { recurso: "ocorrencias", acao: "create" },
    ],
  },
  {
    nome: "secretaria",
    descricao: "Secretaria escolar",
    permissoes: [
      { recurso: "carometro",     acao: "view"    },
      { recurso: "estudantes",    acao: "view"    },
      { recurso: "estudantes",    acao: "manage"  },
      { recurso: "import",        acao: "execute" },
      { recurso: "requerimentos", acao: "view"    },
      { recurso: "requerimentos", acao: "manage"  },
    ],
  },
  {
    nome: "estudante",
    descricao: "Estudante — acesso restrito ao próprio carômetro",
    permissoes: [
      { recurso: "carometro",     acao: "view"   },
      { recurso: "estudantes",    acao: "view"   },
      { recurso: "requerimentos", acao: "create" },
      { recurso: "requerimentos", acao: "view"   },
    ],
  },
  {
    nome: "equipe_gestora",
    descricao: "Equipe gestora da instituição",
    permissoes: [
      { recurso: "carometro",   acao: "view"   },
    ],
  },
  {
    nome: "administracao",
    descricao: "Administração escolar",
    permissoes: [
      { recurso: "carometro",   acao: "view"   },
      { recurso: "estudantes",  acao: "view"   },
    ],
  },
  {
    nome: "soe",
    descricao: "Serviço de Orientação Educacional",
    permissoes: [
      { recurso: "carometro",   acao: "view"   },
      { recurso: "estudantes",  acao: "view"   },
      { recurso: "ocorrencias", acao: "view"   },
      { recurso: "ocorrencias", acao: "create" },
    ],
  },
  {
    nome: "aee",
    descricao: "Atendimento Educacional Especializado",
    permissoes: [
      { recurso: "carometro",   acao: "view"   },
      { recurso: "estudantes",  acao: "view"   },
      { recurso: "ocorrencias", acao: "view"   },
      { recurso: "ocorrencias", acao: "create" },
    ],
  },
  {
    nome: "supervisao_pedagogica",
    descricao: "Supervisão Pedagógica",
    permissoes: [
      { recurso: "carometro",     acao: "view"   },
      { recurso: "estudantes",    acao: "view"   },
      { recurso: "ocorrencias",   acao: "view"   },
      { recurso: "requerimentos", acao: "view"   },
      { recurso: "requerimentos", acao: "manage" },
    ],
  },
  {
    nome: "educador",
    descricao: "Educador",
    permissoes: [
      { recurso: "carometro",   acao: "view"   },
      { recurso: "estudantes",  acao: "view"   },
      { recurso: "ocorrencias", acao: "view"   },
      { recurso: "ocorrencias", acao: "create" },
    ],
  },
  {
    nome: "inspetor",
    descricao: "Inspetor escolar",
    permissoes: [
      { recurso: "carometro",   acao: "view"   },
    ],
  },
  {
    nome: "limpeza",
    descricao: "Equipe de limpeza",
    permissoes: [
      { recurso: "carometro",   acao: "view"   },
    ],
  },
  {
    nome: "portaria",
    descricao: "Portaria",
    permissoes: [
      { recurso: "carometro",   acao: "view"   },
    ],
  },
  {
    nome: "merendeira",
    descricao: "Merendeira",
    permissoes: [
      { recurso: "carometro",   acao: "view"   },
    ],
  },
  {
    nome: "seguranca",
    descricao: "Segurança",
    permissoes: [
      { recurso: "carometro",   acao: "view"   },
    ],
  },
  {
    nome: "pai_responsavel",
    descricao: "Pai / Responsável",
    permissoes: [
      { recurso: "carometro",     acao: "view"   },
      { recurso: "requerimentos", acao: "create" },
      { recurso: "requerimentos", acao: "view"   },
    ],
  },
];

async function seedRolesPadrao() {
  for (const r of ROLES_PADRAO) {
    const [existing] = await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.nome, r.nome));
    let roleId: string;
    if (existing) {
      roleId = existing.id;
    } else {
      const [novo] = await db.insert(rolesTable).values({ nome: r.nome, descricao: r.descricao }).returning();
      roleId = novo.id;
    }
    for (const p of r.permissoes) {
      const permId = await upsertPermissao(p.recurso, p.acao, p.recurso);
      await db.insert(rolesPermissoesTable).values({ roleId, permissaoId: permId }).onConflictDoNothing();
    }
  }
  console.log(`   ✅ ${ROLES_PADRAO.length} roles padrão garantidos.`);
}

async function upsertPermissao(recurso: string, acao: string, descricao: string): Promise<string> {
  await db.insert(permissoesTable).values({ recurso, acao, descricao }).onConflictDoNothing();
  const [row] = await db
    .select({ id: permissoesTable.id })
    .from(permissoesTable)
    .where(and(eq(permissoesTable.recurso, recurso), eq(permissoesTable.acao, acao)));
  return row.id;
}

async function seedPermissoes(adminRoleId: string) {
  for (const p of PERMISSOES) {
    const permId = await upsertPermissao(p.recurso, p.acao, p.descricao);
    await db
      .insert(rolesPermissoesTable)
      .values({ roleId: adminRoleId, permissaoId: permId })
      .onConflictDoNothing();
  }
  console.log(`   ✅ ${PERMISSOES.length} permissões garantidas.`);
}

async function main() {
  const email = process.argv[2] ?? "admin@escola.edu.br";

  const all = await db.select({ id: usuariosTable.id }).from(usuariosTable);

  if (all.length > 0) {
    console.log("⚠️  Usuário(s) já existem. Garantindo permissões do administrador...");
    const [adminRole] = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.nome, "administrador"));
    if (adminRole) {
      await seedPermissoes(adminRole.id);
    } else {
      console.log("   ⚠️  Role 'administrador' não encontrada. Crie manualmente.");
    }
    await seedRolesPadrao();
    process.exit(0);
  }

  // Criar usuário administrador
  const codigoAcesso = generateCodigoAcesso();
  const senhaGerada  = generateSenha();
  const senhaHash    = await bcrypt.hash(senhaGerada, 12);
  const emailHash    = createHash("sha256").update(email.toLowerCase()).digest("hex");

  const [u] = await db.insert(usuariosTable).values({
    emailEncrypted: encryptEmail(email),
    emailHash,
    codigoAcesso,
    senhaHash,
    primeiroAcesso: true,
  }).returning();

  // Criar role administrador
  let [adminRole] = await db.select().from(rolesTable).where(eq(rolesTable.nome, "administrador"));
  if (!adminRole) {
    [adminRole] = await db.insert(rolesTable).values({
      nome: "administrador",
      descricao: "Administrador do sistema com acesso total",
    }).returning();
  }

  await db.insert(usuariosRolesTable).values({ usuarioId: u.id, roleId: adminRole.id });
  await seedPermissoes(adminRole.id);
  await seedRolesPadrao();

  console.log("");
  console.log("✅  Administrador criado com sucesso!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`   E-mail          : ${email}`);
  console.log(`   Código de Acesso: ${codigoAcesso}`);
  console.log(`   Senha gerada    : ${senhaGerada}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("   No primeiro login você deverá definir uma nova senha.");
  console.log("");

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
