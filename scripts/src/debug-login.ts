import { db, usuariosTable, eq } from "@workspace/db";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";

const email = process.argv[2] ?? "admin@escola.edu.br";
const senha = process.argv[3] ?? "";

async function main() {
  console.log("\n🔍 Diagnóstico de login");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  E-mail    : ${email}`);
  console.log(`  Senha     : ${"*".repeat(senha.length)} (${senha.length} chars)`);
  console.log(`  DATABASE_URL: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":****@")}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // 1. Calcular hash do e-mail
  const hash = createHash("sha256").update(email.toLowerCase()).digest("hex");
  console.log(`[1] emailHash (SHA-256): ${hash}`);

  // 2. Buscar usuário por emailHash
  const todos = await db.select({
    id: usuariosTable.id,
    nome: usuariosTable.nome,
    emailHash: usuariosTable.emailHash,
    codigoAcesso: usuariosTable.codigoAcesso,
    senhaHash: usuariosTable.senhaHash,
    primeiroAcesso: usuariosTable.primeiroAcesso,
    tentativas: usuariosTable.tentativasLoginFalhas,
    bloqueadoAte: usuariosTable.bloqueadoAte,
    deletadoEm: usuariosTable.deletadoEm,
  }).from(usuariosTable);

  console.log(`\n[2] Total de usuários no banco: ${todos.length}`);

  if (todos.length === 0) {
    console.error("\n❌ BANCO VAZIO — execute o seed:");
    console.error("   pnpm --filter @workspace/scripts run seed-admin admin@escola.edu.br");
    process.exit(1);
  }

  const usuario = todos.find(u => u.emailHash === hash);

  if (!usuario) {
    console.error(`\n❌ Usuário NÃO encontrado por emailHash`);
    console.log("\nUsuários existentes no banco:");
    todos.forEach(u => {
      console.log(`  - id: ${u.id}`);
      console.log(`    emailHash: ${u.emailHash}`);
      console.log(`    codigoAcesso: ${u.codigoAcesso}`);
      console.log(`    deletadoEm: ${u.deletadoEm ?? "null (ativo)"}`);
    });
    console.log(`\n  emailHash buscado: ${hash}`);
    process.exit(1);
  }

  console.log(`\n[3] ✅ Usuário encontrado: ${usuario.id}`);
  console.log(`     código de acesso : ${usuario.codigoAcesso}`);
  console.log(`     primeiroAcesso   : ${usuario.primeiroAcesso}`);
  console.log(`     tentativas falhas: ${usuario.tentativas}`);
  console.log(`     bloqueado até    : ${usuario.bloqueadoAte ?? "não bloqueado"}`);

  if (usuario.bloqueadoAte && new Date() < new Date(usuario.bloqueadoAte)) {
    console.error(`\n❌ CONTA BLOQUEADA até ${usuario.bloqueadoAte}`);
    process.exit(1);
  }

  if (!senha) {
    console.log("\n⚠  Nenhuma senha fornecida para verificar.");
    process.exit(0);
  }

  // 3. Verificar senha
  console.log(`\n[4] Verificando senha com bcrypt...`);
  const ok = await bcrypt.compare(senha, usuario.senhaHash);
  console.log(`     senhaHash (primeiros 20 chars): ${usuario.senhaHash.substring(0, 20)}...`);

  if (ok) {
    console.log("\n✅ SENHA CORRETA — login deveria funcionar!");
  } else {
    console.error("\n❌ SENHA INCORRETA");
    console.error("   O hash armazenado não corresponde à senha fornecida.");
    console.error("   Redefina a senha com:");
    console.error("   pnpm --filter @workspace/scripts run reset-admin-password admin@escola.edu.br");
  }

  process.exit(0);
}

main().catch(err => {
  console.error("\n❌ Erro de conexão com o banco:");
  console.error(err.message);
  process.exit(1);
});
