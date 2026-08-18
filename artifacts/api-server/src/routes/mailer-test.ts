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
  // Timeout explícito para não travar o proxy do Vite (10s)
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout: servidor SMTP não respondeu em 8s. Verifique conectividade ou configure SMTP_HOST no .env.")), 8000)
  );
  try {
    await Promise.race([enviarEmailTeste(para), timeout]);
    const info = await diagnosticoMailer();
    const dica = info.modo === "ethereal"
      ? `Modo Ethereal ativo — acesse https://ethereal.email/messages para visualizar (login: ${info.etherealUser})`
      : null;
    res.json({ ok: true, mensagem: `E-mail de teste enviado para ${para}.`, modo: info.modo, dica });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Falha ao enviar e-mail de teste.",
      detalhe: err instanceof Error ? err.stack?.split("\n")[1]?.trim() : String(err),
    });
  }
});

export default router;
