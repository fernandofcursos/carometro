import { db } from "@workspace/db";
import { usuariosTable, rolesTable, usuariosRolesTable } from "@workspace/db/schema";
import { createHash, createCipheriv, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

function getKey(): Buffer {
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
  for (let i = 0; i < 8; i++) {
    result += charset[Math.floor(Math.random() * charset.length)];
  }
  return result;
}

function generateSenha(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjklmnpqrstuvwxyz23456789@#!";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += charset[Math.floor(Math.random() * charset.length)];
  }
  return result;
}

async function main() {
  const email = process.argv[2] ?? "admin@escola.edu.br";

  // Check if admin already exists
  const all = await db.select({ id: usuariosTable.id }).from(usuariosTable);
  const hasAdmin = all.length > 0;

  if (hasAdmin) {
    console.log("⚠️  Já existe um usuário cadastrado.");
    console.log("    Para criar outro, use a interface de Usuários após fazer login.");
    process.exit(0);
  }

  const codigoAcesso = generateCodigoAcesso();
  const senhaGerada = generateSenha();
  const senhaHash = await bcrypt.hash(senhaGerada, 12);

  const [u] = await db.insert(usuariosTable).values({
    emailEncrypted: encrypt(email),
    emailHash: createHash("sha256").update(email.toLowerCase()).digest("hex"),
    codigoAcesso,
    senhaHash,
    primeiroAcesso: true,
  }).returning();

  // Create 'administrador' role if not exists
  const roles = await db.select().from(rolesTable).where(eq(rolesTable.nome, "administrador"));
  let adminRoleId: string;
  if (roles.length === 0) {
    const [newRole] = await db.insert(rolesTable).values({
      nome: "administrador",
      descricao: "Administrador do sistema com acesso total",
    }).returning();
    adminRoleId = newRole.id;
  } else {
    adminRoleId = roles[0].id;
  }

  // Link user to role
  await db.insert(usuariosRolesTable).values({
    usuarioId: u.id,
    roleId: adminRoleId,
  });

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
