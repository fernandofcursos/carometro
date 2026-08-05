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
  const remetente = process.env.SMTP_FROM ?? "Seshat <noreply@seshat.local>";
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

export async function enviarEmailBoasVindas(
  para: string,
  codigoAcesso: string,
  senhaGerada: string,
  nome?: string | null,
): Promise<void> {
  const remetente = process.env.SMTP_FROM ?? "Seshat <noreply@seshat.local>";
  const saudacao = nome ? `Olá, ${nome}!` : "Olá!";

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#1a56db">Bem-vindo ao Carômetro</h2>
      <p>${saudacao}</p>
      <p>Sua conta foi criada. Use as credenciais abaixo para fazer o primeiro acesso:</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr>
          <td style="padding:6px 12px;background:#f3f4f6;font-weight:600">Código de acesso</td>
          <td style="padding:6px 12px;font-family:monospace;font-size:1.1em;letter-spacing:2px">${codigoAcesso}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px;background:#f3f4f6;font-weight:600">Senha temporária</td>
          <td style="padding:6px 12px;font-family:monospace;font-size:1.1em">${senhaGerada}</td>
        </tr>
      </table>
      <p style="color:#dc2626"><strong>Atenção:</strong> você será solicitado a definir uma nova senha no primeiro acesso.</p>
      <p style="color:#6b7280;font-size:0.85em">Se você não esperava receber este e-mail, entre em contato com a administração da instituição.</p>
    </div>
  `;

  const text = `${saudacao}\n\nSua conta no Carômetro foi criada.\n\nCódigo de acesso: ${codigoAcesso}\nSenha temporária: ${senhaGerada}\n\nVocê será solicitado a definir uma nova senha no primeiro acesso.`;

  if (!transport) {
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
    subject: "Seu acesso ao Carômetro",
    text,
    html,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`[mailer] e-mail de boas-vindas enviado → ${previewUrl}`);
  } else {
    console.log(`[mailer] e-mail de boas-vindas enviado para ${para} (messageId: ${info.messageId})`);
  }
}
