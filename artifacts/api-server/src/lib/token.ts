import { createHash, createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "crypto";

export type TokenPayload = {
  v: 1;
  tipo: "carteira" | "cartao-semestral" | "cartao-diario";
  escolaId: string;
  escolaNome: string;
  usuarioId: string;
  estudanteNome: string;
  cursoNome: string;
  turmaSigla: string;
  ano: number;
  semestre: 1 | 2;
  ts: number;
  exp: number;
};

// Calcula expiração: último ms do semestre (31/07 ou 31/12 às 23:59:59.999)
export function calcularExp(ano: number, semestre: 1 | 2): number {
  const mes = semestre === 1 ? 6 : 11; // julho=6, dezembro=11 (0-indexed)
  return new Date(ano, mes, 31, 23, 59, 59, 999).getTime();
}

function derivarChaveAES(secret: string, salt: Buffer): Buffer {
  return pbkdf2Sync(secret, salt, 100_000, 32, "sha256");
}

// Cifra chave privada Ed25519 (pkcs8 base64) com AES-256-GCM
// Formato: base64(salt_16 || iv_12 || authTag_16 || ciphertext)
export function cifrarChavePrivada(privKeyB64: string, secret: string): string {
  const salt = randomBytes(16);
  const iv   = randomBytes(12);
  const key  = derivarChaveAES(secret, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc  = Buffer.concat([cipher.update(privKeyB64, "utf8"), cipher.final()]);
  const tag  = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, enc]).toString("base64");
}

export function decifrarChavePrivada(cifrado: string, secret: string): string {
  const buf  = Buffer.from(cifrado, "base64");
  const salt = buf.subarray(0, 16);
  const iv   = buf.subarray(16, 28);
  const tag  = buf.subarray(28, 44);
  const enc  = buf.subarray(44);
  const key  = derivarChaveAES(secret, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final("utf8");
}

function b64urlToBuffer(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function bufferToB64url(b: Buffer): string {
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Assina payload com chave privada Ed25519 da escola
// privKeyCifradaB64: valor de escolas.signing_private_key (cifrado em repouso)
// secret: process.env.SESSION_SECRET
export async function assinarEd25519(
  payload: TokenPayload,
  privKeyCifradaB64: string,
  secret: string,
): Promise<string> {
  const privKeyB64 = decifrarChavePrivada(privKeyCifradaB64, secret);
  const privKeyBuf = Buffer.from(privKeyB64, "base64");
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", privKeyBuf, { name: "Ed25519" }, false, ["sign"],
  );
  const payloadStr = bufferToB64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = await crypto.subtle.sign("Ed25519", cryptoKey, Buffer.from(payloadStr, "utf8"));
  return `${payloadStr}.${bufferToB64url(Buffer.from(sig))}`;
}

// Verifica assinatura Ed25519. Tenta chave atual; se falhar, tenta anterior.
// Retorna o payload se válido e não expirado, null caso contrário.
export async function verificarEd25519(
  token: string,
  pubKeyB64: string,
  pubKeyAnteriorB64?: string | null,
): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  async function tentarChave(keyB64: string): Promise<boolean> {
    try {
      const keyBuf = Buffer.from(keyB64, "base64");
      const cryptoKey = await crypto.subtle.importKey(
        "raw", keyBuf, { name: "Ed25519" }, false, ["verify"],
      );
      return await crypto.subtle.verify(
        "Ed25519", cryptoKey,
        b64urlToBuffer(sigB64),
        Buffer.from(payloadB64, "utf8"),
      );
    } catch {
      return false;
    }
  }

  const valido = (await tentarChave(pubKeyB64)) ||
    (pubKeyAnteriorB64 ? await tentarChave(pubKeyAnteriorB64) : false);

  if (!valido) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(b64urlToBuffer(payloadB64)).toString("utf8"),
    ) as TokenPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Hash SHA-256 do token para busca no banco sem expor o token
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
