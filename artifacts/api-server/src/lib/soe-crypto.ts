import { createHmac, createCipheriv, createDecipheriv, randomBytes } from "crypto";

function derivarChave(escolaId: string): Buffer {
  const globalKey = process.env.ENCRYPTION_KEY;
  if (!globalKey || globalKey.length < 32) {
    throw new Error("ENCRYPTION_KEY ausente ou muito curta (mínimo 32 chars)");
  }
  return createHmac("sha256", globalKey).update(escolaId).digest();
}

export function gerarChaveRef(escolaId: string): string {
  return createHmac("sha256", escolaId).update(Date.now().toString()).digest("hex").slice(0, 16);
}

// AES-256-CBC: cifra texto, retorna "iv_hex:ciphertext_hex"
export function cifrarRegistro(texto: string, escolaId: string): string {
  const chave = derivarChave(escolaId);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", chave, iv);
  const encrypted = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

// Decifra "iv_hex:ciphertext_hex" → texto original
export function decifrarRegistro(registroEnc: string, escolaId: string): string {
  const partes = registroEnc.split(":");
  if (partes.length !== 2) throw new Error("Formato de registro inválido");
  const [ivHex, ciphertextHex] = partes;
  const chave = derivarChave(escolaId);
  const iv = Buffer.from(ivHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", chave, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
