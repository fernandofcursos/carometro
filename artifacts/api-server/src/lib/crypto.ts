import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Função auxiliar para obter chave de criptografia derivada do SESSION_SECRET
// A chave DEVE ser consistente entre diferentes instâncias (usa SESSION_SECRET como derivação)
export function getChaveEncriptacao(): Buffer {
  // Criar hash SHA-256 do SESSION_SECRET para gerar chave de 32 bytes (256 bits)
  // necessário para AES-256-CBC
  return createHash("sha256")
    .update(process.env.SESSION_SECRET!)
    .digest();
}

// Tipo para resultado de criptografia de foto
export type FotoCriptografada = {
  // Buffer com dados criptografados (bytea no banco)
  dadosCriptografados: Buffer;
  // IV em base64 (24 chars após encoding, armazenado como string)
  iv: string;
  // Hash SHA-256 em hex para verificação de integridade
  hash: string;
  // MIME type da imagem (image/jpeg, image/png, etc)
  mimeType: string;
  // Tamanho em bytes dos dados ORIGINAIS (antes de criptografar)
  tamanhoBytes: number;
};

// Criptografar foto em base64 com AES-256-CBC
// Input: data URL (ex: "data:image/jpeg;base64,/9j/4AAQ...")
// Output: dados criptografados + IV + hash para integridade
export function criptografarFoto(dadosBase64: string): FotoCriptografada {
  // Extrair MIME type e dados puros do data URL
  // Formato esperado: "data:image/jpeg;base64,/9j/4AAQ..."
  const match = dadosBase64.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    // Data URL inválida — não consegue extrair MIME type
    throw new Error("Formato de foto inválido. Esperado: data:image/jpeg;base64,...");
  }

  // Extrair MIME type (ex: "image/jpeg")
  const mimeType = match[1];
  // Decodificar base64 para Buffer binário
  const dadosBrutos = Buffer.from(match[2], "base64");

  // Gerar IV aleatório de 16 bytes (necessário para AES-256-CBC)
  // IV é usado como nonce para garantir que mesma foto gera output diferente
  const iv = randomBytes(16);

  // Criar cipher AES-256-CBC com chave derivada e IV aleatório
  const chave = getChaveEncriptacao();
  const cipher = createCipheriv("aes-256-cbc", chave, iv);

  // Criptografar dados originais
  const dadosCriptografados = Buffer.concat([
    cipher.update(dadosBrutos),
    cipher.final(),
  ]);

  // Calcular SHA-256 dos dados ORIGINAIS (antes de criptografar)
  // para poder verificar integridade depois
  const hash = createHash("sha256")
    .update(dadosBrutos)
    .digest("hex");

  return {
    dadosCriptografados,
    // IV em base64 para armazenar como string (24 chars)
    iv: iv.toString("base64"),
    hash,
    mimeType,
    // Tamanho original dos dados (não criptografados)
    tamanhoBytes: dadosBrutos.length,
  };
}

// Descriptografar foto criptografada no banco
// Input: buffer criptografado + IV em base64
// Output: buffer com dados originais
export function descriptografarFoto(
  dadosCriptografados: Buffer,
  ivBase64: string,
): Buffer {
  // Decodificar IV de base64 para Buffer
  const iv = Buffer.from(ivBase64, "base64");

  // Criar decipher com mesma chave e IV usado na criptografia
  const chave = getChaveEncriptacao();
  const decipher = createDecipheriv("aes-256-cbc", chave, iv);

  // Descriptografar dados (concatenando blocos de saída)
  const dadosBrutos = Buffer.concat([
    decipher.update(dadosCriptografados),
    decipher.final(),
  ]);

  return dadosBrutos;
}

// Descriptografar e-mail armazenado como "ivHex:encryptedHex" em bytea
// Formato gerado pelo seed-admin.ts: iv.toString("hex") + ":" + encrypted.toString("hex")
export function descriptografarEmail(encrypted: string): string {
  const [ivHex, encHex] = encrypted.split(":");
  if (!ivHex || !encHex) return "";
  const iv = Buffer.from(ivHex, "hex");
  const encBuf = Buffer.from(encHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", getChaveEncriptacao(), iv);
  return Buffer.concat([decipher.update(encBuf), decipher.final()]).toString("utf8");
}

// Verificar integridade de foto descriptografada
// Recomputa hash SHA-256 dos dados descriptografados e compara com hash armazenado
export function verificarIntegridade(
  dadosBrutos: Buffer,
  hashEsperado: string,
): boolean {
  // Recompurar hash dos dados descriptografados
  const hashAtual = createHash("sha256")
    .update(dadosBrutos)
    .digest("hex");

  // Comparar timing-safe para evitar timing attacks
  // (evita que atacante descubra hash bit-a-bit medindo tempo de resposta)
  return hashAtual === hashEsperado;
}
