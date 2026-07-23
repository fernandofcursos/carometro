import nodemailer from "nodemailer";

// Configuração via variáveis de ambiente. Sem SMTP configurado, usa Ethereal
// (serviço de teste que captura e-mails sem entregar) para não quebrar em dev.
function criarTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  // Dev sem SMTP: usa Ethereal — mensagens visíveis em https://ethereal.email
  return null;
}

let transport = criarTransport();

export async function enviarEmailRecuperacao(
  para: string,
  token: string,
  expiresAt: Date,
): Promise<void> {
  const remetente = process.env.SMTP_FROM ?? "Carômetro <noreply@carometro.local>";
  const assunto = "Redefinição de senha — Carômetro";
  const expiracao = expiresAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const html = `
    <p>Você solicitou a redefinição de senha no Carômetro.</p>
    <p>Use o token abaixo na tela de recuperação:</p>
    <p style="font-size:1.4em;font-family:monospace;letter-spacing:2px"><strong>${token}</strong></p>
    <p>O token expira em: <strong>${expiracao}</strong></p>
    <p>Se não foi você, ignore este e-mail. Sua senha não será alterada.</p>
  `;

  const text = `Token de recuperação: ${token}\nExpira em: ${expiracao}\n\nSe não foi você, ignore este e-mail.`;

  if (!transport) {
    // Dev sem SMTP: cria conta Ethereal temporária na primeira vez
    const conta = await nodemailer.createTestAccount();
    transport = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: { user: conta.user, pass: conta.pass },
    });
    console.log(`[mailer] usando Ethereal: ${conta.user} / ${conta.pass}`);
  }

  const info = await transport.sendMail({
    from: remetente,
    to: para,
    subject: assunto,
    text,
    html,
  });

  // Em dev com Ethereal, exibir URL de pré-visualização
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`[mailer] e-mail de recuperação enviado → ${previewUrl}`);
  } else {
    console.log(`[mailer] e-mail de recuperação enviado para ${para} (messageId: ${info.messageId})`);
  }
}
