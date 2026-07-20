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
  if (raw && raw.length === 32) return Buffer.from(raw, "utf8");
  // Fallback: derivar da SESSION_SECRET (compatibilidade com versão anterior)
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
];

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
