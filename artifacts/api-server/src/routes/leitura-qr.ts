import { Router } from "express";
import {
  db, carteirasTable, cartoesSaidaTable, escolasTable, estudantesTable,
  eq, and, isNull,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { verificarEd25519 } from "../lib/token.js";
import { registrarOcorrenciaComEmail } from "../lib/ocorrencia-helper.js";

const router = Router();
router.use(requireAuth);
router.use(requirePermissao("carteiras:verificar"));

async function buscarPubKeyEscola(escolaId: string) {
  const [e] = await db.select({
    signingPublicKey:         escolasTable.signingPublicKey,
    signingPublicKeyAnterior: escolasTable.signingPublicKeyAnterior,
  }).from(escolasTable).where(eq(escolasTable.id, escolaId)).limit(1);
  return e ?? null;
}

function dentroJanela(dataSaida: string | null, horarioSaida: string | null): boolean {
  if (!horarioSaida) return false;
  const [hh, mm] = horarioSaida.split(":").map(Number);
  const agora = new Date();
  const hoje = agora.toISOString().substring(0, 10);
  if (dataSaida && dataSaida !== hoje) return false;
  const totalMin = agora.getHours() * 60 + agora.getMinutes();
  return Math.abs(totalMin - (hh * 60 + mm)) <= 5;
}

function decodePayload(token: string): { escolaId: string; tipo: string } | null {
  try {
    const [payloadB64] = token.split(".");
    return JSON.parse(Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch { return null; }
}

// POST /api/leitura-qr/carteira — valida carteira, sem ocorrência
router.post("/carteira", async (req, res) => {
  const { token } = req.body as { token?: string };
  if (!token) return res.status(400).json({ valido: false, erro: "Token obrigatório." });

  const info = decodePayload(token);
  if (!info) return res.status(400).json({ valido: false, erro: "Token malformado." });

  const chave = await buscarPubKeyEscola(info.escolaId);
  if (!chave?.signingPublicKey) {
    return res.status(400).json({ valido: false, erro: "Escola sem chave configurada." });
  }

  const payload = await verificarEd25519(token, chave.signingPublicKey, chave.signingPublicKeyAnterior);
  if (!payload) return res.status(400).json({ valido: false, erro: "Assinatura inválida ou token expirado." });

  const [carteira] = await db.select({ status: carteirasTable.status, tipo: carteirasTable.tipo })
    .from(carteirasTable).where(eq(carteirasTable.token, token)).limit(1);

  if (!carteira) return res.status(404).json({ valido: false, erro: "Carteira não encontrada." });
  if (carteira.status !== "ativa") {
    return res.status(403).json({ valido: false, status: carteira.status, erro: "Carteira inativa." });
  }

  return res.json({
    valido: true, tipo: carteira.tipo,
    estudanteNome: payload.estudanteNome,
    cursoNome: payload.cursoNome, turmaSigla: payload.turmaSigla,
  });
});

// POST /api/leitura-qr/cartao-liberacao — valida e registra ocorrência de saída
router.post("/cartao-liberacao", async (req, res) => {
  const { token } = req.body as { token?: string };
  if (!token) return res.status(400).json({ valido: false, erro: "Token obrigatório." });

  const info = decodePayload(token);
  if (!info) return res.status(400).json({ valido: false, erro: "Token malformado." });

  const chave = await buscarPubKeyEscola(info.escolaId);
  if (!chave?.signingPublicKey) {
    return res.status(400).json({ valido: false, erro: "Escola sem chave configurada." });
  }

  const payload = await verificarEd25519(token, chave.signingPublicKey, chave.signingPublicKeyAnterior);
  if (!payload) return res.status(400).json({ valido: false, erro: "Assinatura inválida ou token expirado." });

  if (info.tipo === "cartao-semestral") {
    const [c] = await db.select().from(carteirasTable).where(eq(carteirasTable.token, token)).limit(1);
    if (!c) return res.status(404).json({ valido: false, erro: "Cartão não encontrado." });
    if (c.status !== "ativa") return res.status(403).json({ valido: false, erro: "Cartão revogado." });
    if (!dentroJanela(null, c.horarioSaida)) {
      return res.status(422).json({ valido: false, erro: "Fora do horário autorizado.", horarioSaida: c.horarioSaida });
    }
    // Idempotência: não registra duas vezes no mesmo dia
    if (c.lidoEm) {
      const hoje = new Date().toISOString().substring(0, 10);
      if (c.lidoEm.toISOString().substring(0, 10) === hoje) {
        return res.json({ valido: true, jaRegistrado: true });
      }
    }
    const [estudante] = await db.select({ id: estudantesTable.id })
      .from(estudantesTable)
      .where(and(eq(estudantesTable.usuarioId, c.usuarioId), isNull(estudantesTable.deletadoEm)))
      .limit(1);
    if (!estudante) return res.status(404).json({ valido: false, erro: "Estudante não encontrado." });

    const { ocorrenciaId, emailEnviado } = await registrarOcorrenciaComEmail({
      estudanteId: estudante.id, tipo: "saida-antecipada",
      registradoPorId: req.usuarioId!, horarioSaida: c.horarioSaida ?? "",
      tipoCartao: "cartao-semestral", ip: req.ip!,
    });
    await db.update(carteirasTable).set({ lidoEm: new Date(), lidoPorId: req.usuarioId })
      .where(eq(carteirasTable.id, c.id));
    return res.json({ valido: true, tipo: "cartao-semestral", ocorrenciaId, emailEnviado });

  } else {
    // cartao-diario
    const [c] = await db.select().from(cartoesSaidaTable).where(eq(cartoesSaidaTable.token, token)).limit(1);
    if (!c) return res.status(404).json({ valido: false, erro: "Cartão não encontrado." });
    if (c.status !== "aprovado") return res.status(403).json({ valido: false, erro: "Cartão não aprovado." });
    if (!dentroJanela(c.dataSaida, c.horarioSaida)) {
      return res.status(422).json({ valido: false, erro: "Fora do horário autorizado.", horarioSaida: c.horarioSaida });
    }
    if (c.lidoEm) return res.json({ valido: true, jaRegistrado: true });

    const { ocorrenciaId, emailEnviado } = await registrarOcorrenciaComEmail({
      estudanteId: c.estudanteId, tipo: "saida-antecipada",
      registradoPorId: req.usuarioId!, horarioSaida: c.horarioSaida ?? "",
      tipoCartao: "diario", ip: req.ip!,
    });
    await db.update(cartoesSaidaTable).set({ lidoEm: new Date(), lidoPorId: req.usuarioId })
      .where(eq(cartoesSaidaTable.id, c.id));
    return res.json({ valido: true, tipo: "cartao-diario", ocorrenciaId, emailEnviado });
  }
});

export default router;
