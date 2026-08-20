import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { diagnosticoMailer, enviarEmailTeste, type EnvioInfo } from "../lib/mailer.js";

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
    // enviarEmailTeste já faz fallback para captura local em caso de erro de conexão SMTP
    const envio = await enviarEmailTeste(para);
    const info = await diagnosticoMailer();
    const dica = envio.previewUrl
      ? `Visualize em: ${envio.previewUrl}`
      : envio.capturado && envio.conteudo
      ? null  // conteudo é retornado diretamente
      : null;
    res.json({
      ok: true,
      mensagem: envio.capturado
        ? `E-mail capturado localmente (SMTP indisponível). Verifique o conteúdo abaixo.`
        : `E-mail de teste enviado para ${para}.`,
      modo: info.modo,
      dica,
      capturado: envio.capturado,
      conteudo: envio.conteudo,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Falha ao enviar e-mail de teste.",
      detalhe: err instanceof Error ? err.stack?.split("\n")[1]?.trim() : String(err),
    });
  }
});

export default router;
