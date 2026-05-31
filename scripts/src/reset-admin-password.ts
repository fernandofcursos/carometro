import { db } from "@workspace/db";
import { usuariosTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

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

  // Busca todos os usuarios
  const todos = await db.select().from(usuariosTable);

  // Encontra admin por e-mail (tentando decodificar)
  const { createHash, createDecipheriv } = await import("crypto");
  const secret = process.env["SESSION_SECRET"] ?? "default-dev-secret-change-in-production";
  const key = createHash("sha256").update(secret).digest();

  function decrypt(encrypted: string): string {
    const [ivHex, dataHex] = encrypted.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
    return decrypted.toString("utf8");
  }

  let admin = todos.find((u) => {
    try {
      return decrypt(u.emailEncrypted).toLowerCase() === email.toLowerCase();
    } catch {
      return false;
    }
  });

  // Se não encontrou por e-mail, busca o primeiro usuário
  if (!admin) {
    admin = todos[0];
  }

  if (!admin) {
    console.log("⚠️  Nenhum usuário encontrado.");
    console.log("    Use: pnpm --filter @workspace/scripts run seed-admin [email]");
    process.exit(1);
  }

  const novaSenha = generateSenha();
  const novaSenhaHash = await bcrypt.hash(novaSenha, 12);

  await db
    .update(usuariosTable)
    .set({
      senhaHash: novaSenhaHash,
      primeiroAcesso: true,
      tentativasLoginFalhas: 0,
      bloqueadoAte: null,
    })
    .where(eq(usuariosTable.id, admin.id));

  console.log("");
  console.log("✅  Senha redefinida com sucesso!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`   ID              : ${admin.id}`);
  console.log(`   Nova senha      : ${novaSenha}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("   No próximo login você será obrigado");
  console.log("   a definir uma nova senha.");
  console.log("");

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
