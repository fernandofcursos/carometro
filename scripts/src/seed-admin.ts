import { db } from "@workspace/db";
import { usuariosTable } from "@workspace/db/schema";
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
  const all = await db.select({ id: usuariosTable.id, perfil: usuariosTable.perfil }).from(usuariosTable);
  const hasAdmin = all.some((u) => u.perfil === "administrador");

  if (hasAdmin) {
    console.log("⚠️  Já existe um administrador cadastrado.");
    console.log("    Para criar outro, use a interface de Usuários após fazer login.");
    process.exit(0);
  }

  const codigoAcesso = generateCodigoAcesso();
  const senhaGerada = generateSenha();
  const senhaHash = await bcrypt.hash(senhaGerada, 12);

  const [u] = await db.insert(usuariosTable).values({
    emailEncrypted: encrypt(email),
    codigoAcesso,
    senhaHash,
    perfil: "administrador",
    primeiroAcesso: true,
  }).returning();

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
