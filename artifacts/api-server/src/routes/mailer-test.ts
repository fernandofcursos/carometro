import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { diagnosticoMailer, enviarEmailTeste } from "../lib/mailer.js";

const router = Router();

// GET /api/mailer/status — diagnóstico (requer admin)
router.get("/status", requireAuth, requirePermissao("usuarios:manage"), async (req, res) => {
  try {
    const info = await diagnosticoMailer();
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: "Erro ao verificar status do mailer." });
  }
});

// POST /api/mailer/teste — envia e-mail de teste para o destinatário informado
router.post("/teste", requireAuth, requirePermissao("usuarios:manage"), async (req, res) => {
  const { para } = req.body as { para?: string };
  if (!para || !para.includes("@")) {
    return res.status(400).json({ error: "Informe um e-mail válido no campo 'para'." });
  }
  try {
    await enviarEmailTeste(para);
    const info = await diagnosticoMailer();
    res.json({
      ok: true,
      mensagem: `E-mail de teste enviado para ${para}.`,
      modo: info.modo,
      dica: info.modo === "ethereal"
        ? "Modo Ethereal ativo — acesse https://ethereal.email/messages para visualizar (login: " + info.etherealUser + ")"
        : null,
    });
  } catch (err) {
    res.status(500).json({
      error: "Falha ao enviar e-mail de teste.",
      detalhe: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
