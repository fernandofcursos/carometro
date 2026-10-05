import { Router } from "express";
import { db, escolasTable, carteirasTable, eq } from "@workspace/db";
import { hashToken } from "../lib/token.js";

const router = Router();
// Sem requireAuth — rotas públicas

// GET /api/verificar/v2/pubkey/:escolaId — chave pública da escola para verificação offline
router.get("/pubkey/:escolaId", async (req, res) => {
  const [escola] = await db.select({
    id: escolasTable.id,
    nome: escolasTable.nome,
    signingPublicKey: escolasTable.signingPublicKey,
    signingPublicKeyAnterior: escolasTable.signingPublicKeyAnterior,
  }).from(escolasTable)
    .where(eq(escolasTable.id, req.params.escolaId))
    .limit(1);

  if (!escola || !escola.signingPublicKey) {
    return res.status(404).json({ erro: "Escola não encontrada ou sem chave configurada." });
  }

  return res.json({
    escolaId: escola.id,
    escolaNome: escola.nome,
    algoritmo: "Ed25519",
    publicKey: escola.signingPublicKey,
    publicKeyAnterior: escola.signingPublicKeyAnterior ?? null,
  });
});

// GET /api/verificar/v2/status/:token — status no banco pelo hash do token (sem dados pessoais)
router.get("/status/:token", async (req, res) => {
  const tokenHash = hashToken(req.params.token);

  const [carteira] = await db.select({
    status: carteirasTable.status,
    tipo: carteirasTable.tipo,
    ano: carteirasTable.ano,
    semestre: carteirasTable.semestre,
  }).from(carteirasTable)
    .where(eq(carteirasTable.tokenHash, tokenHash))
    .limit(1);

  if (!carteira) {
    return res.status(404).json({ erro: "Carteira não encontrada." });
  }

  return res.json({
    status: carteira.status,
    tipo: carteira.tipo,
    ano: carteira.ano,
    semestre: carteira.semestre,
  });
});

export default router;
