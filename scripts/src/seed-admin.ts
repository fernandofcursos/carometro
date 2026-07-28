import { db } from "@workspace/db";
import {
  usuariosTable, rolesTable, usuariosRolesTable,
  permissoesTable, rolesPermissoesTable,
} from "@workspace/db/schema";
import { createHash, createCipheriv, randomBytes } from "crypto";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

function getKey(): Buffer {
  const raw = process.env["ENCRYPTION_KEY"];
  if (raw) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
    return createHash("sha256").update(raw).digest();
  }
  const secret = process.env["SESSION_SECRET"] ?? "default-dev-secret-change-in-production";
  return createHash("sha256").update(secret).digest();
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function generateCodigoAcesso(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 8; i++) result += charset[Math.floor(Math.random() * charset.length)];
  return result;
}

function generateSenha(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjklmnpqrstuvwxyz23456789@#!";
  let result = "";
  for (let i = 0; i < 10; i++) result += charset[Math.floor(Math.random() * charset.length)];
  return result;
}

// Todas as permissões do sistema — alinhadas com os guards de menu do layout.tsx
const TODAS_PERMISSOES: { recurso: string; acao: string; descricao: string }[] = [
  { recurso: "carometro",         acao: "view",    descricao: "Visualizar carômetro de estudantes e usuários" },
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
  { recurso: "import",            acao: "execute", descricao: "Executar importação de dados (XLSX)" },
  { recurso: "auditoria",         acao: "view",    descricao: "Visualizar log de auditoria" },
];

// Upsert de permissão: insere se não existe, retorna id existente se já existe
async function upsertPermissao(recurso: string, acao: string, descricao: string): Promise<string> {
  // Tentar inserir (onConflictDoNothing para unique recurso+acao)
  await db
    .insert(permissoesTable)
    .values({ recurso, acao, descricao })
    .onConflictDoNothing();

  // Buscar id (seja recém-inserido ou pré-existente)
  const [row] = await db
    .select({ id: permissoesTable.id })
    .from(permissoesTable)
    .where(and(eq(permissoesTable.recurso, recurso), eq(permissoesTable.acao, acao)));

  return row.id;
}

// Semear permissões e vincular ao role administrador (idempotente)
async function seedPermissoes(adminRoleId: string) {
  for (const perm of TODAS_PERMISSOES) {
    const permId = await upsertPermissao(perm.recurso, perm.acao, perm.descricao);
    await db
      .insert(rolesPermissoesTable)
      .values({ roleId: adminRoleId, permissaoId: permId })
      .onConflictDoNothing();
  }
  console.log(`   ✅ ${TODAS_PERMISSOES.length} permissões verificadas e vinculadas ao administrador.`);
}

async function main() {
  const email = process.argv[2] ?? "admin@escola.edu.br";

  // Verificar se já existe usuário
  const all = await db.select({ id: usuariosTable.id }).from(usuariosTable);

  if (all.length > 0) {
    console.log("⚠️  Já existe um usuário cadastrado.");
    console.log("    Garantindo que as permissões do administrador estão atualizadas...");
    // Ainda assim garantir permissões atualizadas
    const [adminRole] = await db.select().from(rolesTable).where(eq(rolesTable.nome, "administrador"));
    if (adminRole) await seedPermissoes(adminRole.id);
    process.exit(0);
  }

  const codigoAcesso = generateCodigoAcesso();
  const senhaGerada  = generateSenha();
  const senhaHash    = await bcrypt.hash(senhaGerada, 12);

  const [u] = await db.insert(usuariosTable).values({
    emailEncrypted: encrypt(email),
    emailHash:      createHash("sha256").update(email.toLowerCase()).digest("hex"),
    codigoAcesso,
    senhaHash,
    primeiroAcesso: true,
  }).returning();

  // Criar role 'administrador' se não existir
  let [adminRole] = await db.select().from(rolesTable).where(eq(rolesTable.nome, "administrador"));
  if (!adminRole) {
    [adminRole] = await db.insert(rolesTable).values({
      nome: "administrador",
      descricao: "Administrador do sistema com acesso total",
    }).returning();
  }

  // Vincular usuário ao role
  await db.insert(usuariosRolesTable).values({ usuarioId: u.id, roleId: adminRole.id });

  // Semear e vincular todas as permissões
  await seedPermissoes(adminRole.id);

  console.log("");
  console.log("✅  Administrador criado com sucesso!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`   E-mail          : ${email}`);
  console.log(`   Código de Acesso: ${codigoAcesso}`);
  console.log(`   Senha gerada    : ${senhaGerada}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("   Guarde estas credenciais. No primeiro login");
  console.log("   você será obrigado a definir uma nova senha.");
  console.log("");

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
