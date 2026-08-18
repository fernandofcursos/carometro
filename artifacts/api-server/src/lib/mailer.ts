import nodemailer from "nodemailer";

// ---------------------------------------------------------------------------
// Transport — singleton compartilhado por todas as funções
// ---------------------------------------------------------------------------

let _transport: nodemailer.Transporter | null = null;
let _etherealUser: string | null = null;

async function ensureTransport(): Promise<nodemailer.Transporter> {
  if (_transport) return _transport;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    _transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    console.log(`[mailer] SMTP configurado: ${host}:${port} (user: ${user})`);
    return _transport;
  }

  // Sem SMTP configurado → tenta Ethereal; se sem rede → captura local (log)
  try {
    const conta = await nodemailer.createTestAccount();
    _etherealUser = conta.user;
    _transport = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: { user: conta.user, pass: conta.pass },
    });
    console.log(`[mailer] Ethereal ativado — login: ${conta.user} / ${conta.pass}`);
    console.log(`[mailer] Visualize mensagens em https://ethereal.email/messages`);
  } catch {
    // Ethereal indisponível (sem acesso a api.nodemailer.com) → modo captura local
    console.warn("[mailer] Ethereal indisponível — modo captura local (e-mails exibidos apenas em log)");
    _transport = nodemailer.createTransport({ jsonTransport: true });
  }
  return _transport;
}

function remetente() {
  return process.env.SMTP_FROM ?? "Seshat <noreply@seshat.local>";
}

async function enviar(opts: nodemailer.SendMailOptions): Promise<void> {
  const t = await ensureTransport();
  const info = await t.sendMail({ from: remetente(), ...opts });
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) {
    console.log(`[mailer] "${opts.subject}" → ${preview}`);
  } else if (!info.messageId && info.message) {
    // jsonTransport (modo captura local)
    console.log(`[mailer] "${opts.subject}" — capturado localmente (para: ${opts.to})`);
    console.log(`[mailer] Conteúdo texto: ${opts.text ?? "(sem texto)"}`);
  } else {
    console.log(`[mailer] "${opts.subject}" enviado para ${opts.to} (id: ${info.messageId})`);
  }
}

// ---------------------------------------------------------------------------
// Diagnóstico — retorna estado do mailer para endpoint de teste
// ---------------------------------------------------------------------------

export async function diagnosticoMailer(): Promise<{
  modo: "smtp" | "ethereal" | "local" | "não iniciado";
  smtpHost: string | null;
  smtpUser: string | null;
  etherealUser: string | null;
  from: string;
}> {
  const host = process.env.SMTP_HOST ?? null;
  const user = process.env.SMTP_USER ?? null;
  const modo = _transport
    ? host ? "smtp" : _etherealUser ? "ethereal" : "local"
    : "não iniciado";
  return { modo, smtpHost: host, smtpUser: user, etherealUser: _etherealUser, from: remetente() };
}

// ---------------------------------------------------------------------------
// Envio de e-mail de teste (qualquer destinatário, conteúdo simples)
// ---------------------------------------------------------------------------

export async function enviarEmailTeste(para: string): Promise<void> {
  await enviar({
    to: para,
    subject: "Teste de envio — Seshat",
    text: "Este é um e-mail de teste do sistema Seshat. Se você recebeu, o envio está funcionando.",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1a56db">Teste de Envio — Seshat</h2>
        <p>Este é um e-mail de teste gerado pelo sistema.</p>
        <p>Se você recebeu esta mensagem, o envio de e-mails está funcionando corretamente.</p>
        <p style="color:#6b7280;font-size:0.85em">Enviado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
      </div>
    `,
  });
}

// ---------------------------------------------------------------------------
// Recuperação de senha
// ---------------------------------------------------------------------------

export async function enviarEmailRecuperacao(
  para: string,
  token: string,
  expiresAt: Date,
): Promise<void> {
  const expiracao = expiresAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  await enviar({
    to: para,
    subject: "Redefinição de senha — Seshat",
    text: `Token de recuperação: ${token}\nExpira em: ${expiracao}\n\nSe não foi você, ignore este e-mail.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1a56db">Redefinição de senha</h2>
        <p>Você solicitou a redefinição de senha no Seshat.</p>
        <p>Use o token abaixo na tela de recuperação:</p>
        <p style="font-size:1.4em;font-family:monospace;letter-spacing:2px;background:#f3f4f6;padding:12px;border-radius:6px;text-align:center">
          <strong>${token}</strong>
        </p>
        <p>O token expira em: <strong>${expiracao}</strong></p>
        <p style="color:#6b7280;font-size:0.85em">Se não foi você, ignore este e-mail. Sua senha não será alterada.</p>
      </div>
    `,
  });
}

// ---------------------------------------------------------------------------
// Boas-vindas (novo usuário)
// ---------------------------------------------------------------------------

export async function enviarEmailBoasVindas(
  para: string,
  codigoAcesso: string,
  senhaGerada: string,
  nome?: string | null,
): Promise<void> {
  const saudacao = nome ? `Olá, ${nome}!` : "Olá!";
  await enviar({
    to: para,
    subject: "Seu acesso ao Seshat",
    text: `${saudacao}\n\nSua conta no Seshat foi criada.\n\nCódigo de acesso: ${codigoAcesso}\nSenha temporária: ${senhaGerada}\n\nVocê será solicitado a definir uma nova senha no primeiro acesso.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1a56db">Bem-vindo ao Seshat</h2>
        <p>${saudacao}</p>
        <p>Sua conta foi criada. Use as credenciais abaixo para o primeiro acesso:</p>
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
        <p style="color:#6b7280;font-size:0.85em">Se não esperava este e-mail, entre em contato com a administração.</p>
      </div>
    `,
  });
}

// ---------------------------------------------------------------------------
// Ocorrência
// ---------------------------------------------------------------------------

export async function enviarEmailOcorrencia({
  para, estudanteNome, tipoOcorrencia, dataOcorrencia, turnoNome, disciplinaNome, observacao,
}: {
  para: string;
  estudanteNome: string;
  tipoOcorrencia: string;
  dataOcorrencia: string;
  turnoNome?: string | null;
  disciplinaNome?: string | null;
  observacao?: string | null;
}): Promise<void> {
  const dataFormatada = new Date(dataOcorrencia + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const linhas = [
    `<tr><td style="padding:8px 12px;background:#fef3c7;font-weight:600;width:35%">Tipo</td><td style="padding:8px 12px;background:#fffbeb">${tipoOcorrencia}</td></tr>`,
    `<tr><td style="padding:8px 12px;background:#fef3c7;font-weight:600">Data</td><td style="padding:8px 12px;background:#fffbeb">${dataFormatada}</td></tr>`,
    turnoNome ? `<tr><td style="padding:8px 12px;background:#fef3c7;font-weight:600">Turno</td><td style="padding:8px 12px;background:#fffbeb">${turnoNome}</td></tr>` : "",
    disciplinaNome ? `<tr><td style="padding:8px 12px;background:#fef3c7;font-weight:600">Disciplina</td><td style="padding:8px 12px;background:#fffbeb">${disciplinaNome}</td></tr>` : "",
    observacao ? `<tr><td style="padding:8px 12px;background:#fef3c7;font-weight:600">Descrição</td><td style="padding:8px 12px;background:#fffbeb">${observacao}</td></tr>` : "",
  ].filter(Boolean).join("\n");

  await enviar({
    to: para,
    subject: `Ocorrência: ${estudanteNome} — ${tipoOcorrencia}`,
    text: `Ocorrência registrada para ${estudanteNome}\nTipo: ${tipoOcorrencia}\nData: ${dataFormatada}${turnoNome ? `\nTurno: ${turnoNome}` : ""}${disciplinaNome ? `\nDisciplina: ${disciplinaNome}` : ""}${observacao ? `\nDescrição: ${observacao}` : ""}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#b45309">Registro de Ocorrência</h2>
        <p>Foi registrada uma ocorrência para o(a) estudante <strong>${estudanteNome}</strong>.</p>
        <table style="border-collapse:collapse;margin:16px 0;width:100%">${linhas}</table>
        <p>Acesse o sistema para visualizar os detalhes e registrar sua ciência.</p>
        <p style="color:#6b7280;font-size:0.85em">Comunicado automático — não responda este e-mail.</p>
      </div>
    `,
  });
}
