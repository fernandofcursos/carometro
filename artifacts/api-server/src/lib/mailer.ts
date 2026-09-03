import nodemailer from "nodemailer";
import { config as dotenvConfig } from "dotenv";
import path from "path";

// ---------------------------------------------------------------------------
// Transport — singleton compartilhado por todas as funções
// ---------------------------------------------------------------------------

let _transport: nodemailer.Transporter | null = null;
let _etherealUser: string | null = null;
let _smtpKey: string | null = null;

/** Relê o .env para capturar mudanças sem reiniciar o servidor. */
function reloadEnv(): void {
  const envPath = path.resolve(process.cwd(), "../../.env");
  dotenvConfig({ path: envPath, override: true });
}

function smtpKeyAtual(): string {
  return `${process.env.SMTP_HOST ?? ""}:${process.env.SMTP_USER ?? ""}:${process.env.SMTP_PASS ?? ""}`;
}

async function ensureTransport(): Promise<nodemailer.Transporter> {
  reloadEnv();
  const key = smtpKeyAtual();
  if (_transport && _smtpKey !== null && _smtpKey !== key) {
    console.log("[mailer] Configuração SMTP alterada — reiniciando transport.");
    _transport = null;
    _etherealUser = null;
    _smtpKey = null;
  }

  if (_transport) return _transport;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  _smtpKey = key;

  const timeouts = { connectionTimeout: 6000, greetingTimeout: 5000, socketTimeout: 8000 };

  if (host && user && pass) {
    _transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, ...timeouts });
    console.log(`[mailer] SMTP configurado: ${host}:${port} (user: ${user})`);
    return _transport;
  }

  _transport = nodemailer.createTransport({ jsonTransport: true });
  console.log("[mailer] Modo captura local ativo — e-mails logados no servidor.");
  return _transport;
}

function remetente() {
  return process.env.SMTP_FROM ?? "Seshat <noreply@seshat.local>";
}

// ---------------------------------------------------------------------------
// Resend — envio via API HTTPS (porta 443, sem bloqueio de proxy)
// ---------------------------------------------------------------------------

function resendApiKey(): string | null {
  reloadEnv();
  return process.env.RESEND_API_KEY ?? null;
}

function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^(.+?)\s*<(.+?)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: "Seshat", email: from.trim() };
}

async function enviarViaResend(opts: nodemailer.SendMailOptions): Promise<EnvioInfo> {
  const apiKey = resendApiKey()!;
  const fromRaw = String(opts.from ?? remetente());
  const { email: fromEmail } = parseFrom(fromRaw);

  // Em teste sem domínio próprio verificado, Resend exige remetente @resend.dev
  // Se o remetente configurado não é @resend.dev e não tem domínio verificado,
  // usamos o domínio de teste oficial do Resend.
  const from = fromEmail.endsWith("@resend.dev") || process.env.RESEND_FROM
    ? (process.env.RESEND_FROM ?? fromRaw)
    : `Seshat <onboarding@resend.dev>`;

  const to = Array.isArray(opts.to) ? opts.to : [String(opts.to ?? "")];
  const para = to.join(", ");

  const body = {
    from,
    to,
    subject: String(opts.subject ?? ""),
    text: opts.text ? String(opts.text) : undefined,
    html: opts.html ? String(opts.html) : undefined,
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as { id?: string; statusCode?: number; message?: string; name?: string };

  if (!res.ok) {
    const msg = data.message ?? `Resend error ${res.status}`;
    console.error(`[mailer] Resend falhou: ${msg}`);
    // Erro de domínio não verificado: captura localmente em vez de lançar exceção
    if (msg.includes("verify a domain") || msg.includes("testing emails to your own")) {
      console.log(`[mailer] Resend sem domínio verificado — capturando localmente.`);
      const para = to.join(", ");
      console.log(`[mailer] "${opts.subject}" — capturado localmente (para: ${para})`);
      return {
        previewUrl: null,
        capturado: true,
        conteudo: {
          para,
          assunto: String(opts.subject ?? ""),
          texto: String(opts.text ?? ""),
        },
        resendSemDominio: true,
      } as EnvioInfo & { resendSemDominio: boolean };
    }
    throw new Error(msg);
  }

  console.log(`[mailer] "${opts.subject}" enviado via Resend para ${para} (id: ${data.id})`);
  return { previewUrl: null, capturado: false, conteudo: null };
}

// ---------------------------------------------------------------------------
// Tipos e helpers internos
// ---------------------------------------------------------------------------

export type EnvioInfo = {
  previewUrl: string | null;
  capturado: boolean;
  conteudo: { para: string; assunto: string; texto: string } | null;
  resendSemDominio?: boolean;
};

function isConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|connect|timeout/i.test(msg);
}

async function enviarComTransport(t: nodemailer.Transporter, opts: nodemailer.SendMailOptions): Promise<EnvioInfo> {
  const info = await t.sendMail({ from: remetente(), ...opts });
  const previewUrl = nodemailer.getTestMessageUrl(info) || null;
  if (previewUrl) {
    console.log(`[mailer] "${opts.subject}" → ${previewUrl}`);
    return { previewUrl, capturado: false, conteudo: null };
  }
  if (info.message) {
    const para = Array.isArray(opts.to) ? opts.to.join(", ") : String(opts.to ?? "");
    console.log(`[mailer] "${opts.subject}" — capturado localmente (para: ${para})`);
    return {
      previewUrl: null,
      capturado: true,
      conteudo: { para, assunto: String(opts.subject ?? ""), texto: String(opts.text ?? "") },
    };
  }
  console.log(`[mailer] "${opts.subject}" enviado para ${opts.to} (id: ${info.messageId})`);
  return { previewUrl: null, capturado: false, conteudo: null };
}

async function enviar(opts: nodemailer.SendMailOptions): Promise<EnvioInfo> {
  // Resend tem prioridade quando RESEND_API_KEY está definida
  if (resendApiKey()) {
    return enviarViaResend(opts);
  }

  const t = await ensureTransport();
  try {
    return await enviarComTransport(t, opts);
  } catch (err) {
    if (process.env.SMTP_HOST && isConnectionError(err)) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[mailer] Falha de conexão SMTP (${msg}) — usando captura local.`);
      const local = nodemailer.createTransport({ jsonTransport: true });
      return enviarComTransport(local, opts);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Diagnóstico
// ---------------------------------------------------------------------------

export async function diagnosticoMailer(): Promise<{
  modo: "resend" | "smtp" | "ethereal" | "local" | "não iniciado";
  smtpHost: string | null;
  smtpUser: string | null;
  etherealUser: string | null;
  from: string;
  resendConfigured?: boolean;
}> {
  reloadEnv();
  const apiKey = resendApiKey();
  if (apiKey) {
    console.log("[mailer] Modo Resend ativo (HTTPS/443).");
    return {
      modo: "resend",
      smtpHost: null,
      smtpUser: null,
      etherealUser: null,
      from: process.env.RESEND_FROM ?? "onboarding@resend.dev (padrão de teste)",
      resendConfigured: true,
    };
  }
  await ensureTransport();
  const host = process.env.SMTP_HOST ?? null;
  const user = process.env.SMTP_USER ?? null;
  const modo = host ? "smtp" : _etherealUser ? "ethereal" : "local";
  return { modo, smtpHost: host, smtpUser: user, etherealUser: _etherealUser, from: remetente() };
}

// ---------------------------------------------------------------------------
// Funções de envio públicas
// ---------------------------------------------------------------------------

export async function enviarEmailTeste(para: string): Promise<EnvioInfo> {
  return enviar({
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

export async function enviarEmailRecuperacao(
  para: string,
  token: string,
  expiresAt: Date,
  nomeUsuario?: string | null,
  codigoAcesso?: string | null,
): Promise<void> {
  const saudacao = nomeUsuario ? `Prezado(a) ${nomeUsuario},` : "Prezado(a),";
  const emailExibido = para;
  const codigoExibido = codigoAcesso ?? "—";

  const textoPlano = `${saudacao}

Foi solicitada a recuperação de senha para acesso ao Sistema de Carômetros da Escola Técnica de Santa Maria (ETSM).

Para sua segurança, a senha atual não é informada nem enviada por e-mail. O processo de recuperação permite que você cadastre uma nova senha pessoal de forma segura.

──────────────────────────────
📧 E-mail cadastrado: ${emailExibido}
🔑 Código de Acesso: ${codigoExibido}
🔒 Procedimento: Recuperação e redefinição de senha
──────────────────────────────

🔐 Como recuperar sua senha

1. Acesse a tela de login do Sistema de Carômetros da ETSM.
2. Selecione a opção "Esqueci minha senha" ou "Recuperar senha".
3. Informe o e-mail cadastrado ou o seu código de acesso.
4. Informe o token: ${token}
5. Cadastre uma nova senha pessoal e segura.
6. Após concluir a redefinição, utilize a nova senha para realizar seu acesso normalmente.

O token expira em: ${expiresAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}

⚠️ IMPORTANTE – Segurança da sua conta
Por motivos de segurança, não compartilhe sua senha, código de acesso ou qualquer link/token de recuperação com terceiros.
A equipe da ETSM não solicita sua senha por e-mail, telefone ou mensagem.
Caso você não tenha solicitado a recuperação de senha, não prossiga com o procedimento e entre em contato com a equipe de suporte da ETSM.

📸 Como incluir sua foto de perfil (Avatar)
Após recuperar sua senha e realizar o login:
1. Acesse o menu Usuários.
2. Clique no ícone Foto do Perfil.
3. Selecione a opção Capturar Foto.

Sua foto ficará visível no carômetro da turma ou setor ao qual você está vinculado(a).
Em caso de dúvidas, entre em contato com a equipe de suporte da ETSM.

Atenciosamente,
Equipe de Tecnologia da Informação
Escola Técnica de Santa Maria`;

  await enviar({
    to: para,
    subject: "Recuperação de senha — Seshat ETSM",
    text: textoPlano,
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <div style="background:#1e3a5f;padding:20px 24px">
          <p style="margin:0;color:#ffffff;font-size:1.05em;font-weight:700;letter-spacing:0.05em;text-transform:uppercase">Escola Técnica de Santa Maria</p>
          <p style="margin:4px 0 0;color:#93c5fd;font-size:0.8em">Secretaria de Estado de Educação do Distrito Federal – SEEDF</p>
        </div>
        <div style="background:#fef9c3;border-bottom:2px solid #f59e0b;padding:14px 24px;text-align:center">
          <p style="margin:0;font-size:1em;font-weight:700;color:#78350f;letter-spacing:0.06em;text-transform:uppercase">
            🔐&nbsp; Recuperação de Senha
          </p>
        </div>
        <div style="padding:24px;color:#1f2937">
          <p style="margin:0 0 12px">${saudacao}</p>
          <p style="line-height:1.7;margin:0 0 16px">Foi solicitada a recuperação de senha para acesso ao <strong>Sistema de Carômetros da Escola Técnica de Santa Maria (ETSM)</strong>. Para sua segurança, a senha atual não é informada nem enviada por e-mail. O processo de recuperação permite que você cadastre uma nova senha pessoal de forma segura.</p>

          <table style="border-collapse:collapse;width:100%;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:0.95em">
            <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 16px;font-weight:600;color:#374151;width:45%">📧 E-mail cadastrado</td><td style="padding:10px 16px">${emailExibido}</td></tr>
            <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 16px;font-weight:600;color:#374151">🔑 Código de Acesso</td><td style="padding:10px 16px;font-family:monospace;font-size:1.1em;letter-spacing:2px">${codigoExibido}</td></tr>
            <tr><td style="padding:10px 16px;font-weight:600;color:#374151">🔒 Procedimento</td><td style="padding:10px 16px">Recuperação e redefinição de senha</td></tr>
          </table>

          <p style="margin:20px 0 6px;font-size:0.8em;font-weight:700;color:#374151;letter-spacing:0.06em;text-transform:uppercase">🔐 Como recuperar sua senha</p>
          <ol style="padding-left:20px;font-size:0.9em;line-height:1.9;margin:0 0 16px;color:#374151">
            <li>Acesse a tela de login do Sistema de Carômetros da ETSM.</li>
            <li>Selecione a opção <strong>"Esqueci minha senha"</strong> ou <strong>"Recuperar senha"</strong>.</li>
            <li>Informe o e-mail cadastrado ou o seu código de acesso.</li>
            <li>Siga as instruções apresentadas pelo sistema.</li>
            <li>Cadastre uma nova senha pessoal e segura.</li>
            <li>Após concluir a redefinição, utilize a nova senha para realizar seu acesso normalmente.</li>
          </ol>

          <div style="background:#fef9c3;border:1px solid #f59e0b;border-radius:6px;padding:12px 16px;margin:16px 0">
            <p style="margin:0;font-weight:700;color:#78350f">⚠️ IMPORTANTE – Segurança da sua conta</p>
            <p style="margin:8px 0 0;color:#92400e;font-size:0.9em">Por motivos de segurança, não compartilhe sua senha, código de acesso ou qualquer link/token de recuperação com terceiros. A equipe da ETSM <strong>não solicita</strong> sua senha por e-mail, telefone ou mensagem.</p>
            <p style="margin:8px 0 0;color:#92400e;font-size:0.9em">Caso você não tenha solicitado a recuperação de senha, não prossiga com o procedimento e entre em contato com a equipe de suporte da ETSM.</p>
          </div>

          <p style="margin:20px 0 6px;font-size:0.8em;font-weight:700;color:#374151;letter-spacing:0.06em;text-transform:uppercase">📸 Como incluir sua foto de perfil (Avatar)</p>
          <p style="margin:0 0 8px;font-size:0.9em">Após recuperar sua senha e realizar o login:</p>
          <ol style="padding-left:20px;font-size:0.9em;line-height:1.9;margin:0 0 16px;color:#374151">
            <li>Acesse o menu <strong>Usuários</strong>.</li>
            <li>Clique no ícone <strong>Foto do Perfil</strong>.</li>
            <li>Selecione a opção <strong>Capturar Foto</strong>.</li>
          </ol>
          <p style="font-size:0.9em;line-height:1.6;margin:0 0 20px">Sua foto ficará visível no carômetro da turma ou setor ao qual você está vinculado(a).</p>

          <p style="margin:0 0 4px">Atenciosamente,</p>
          <p style="margin:0"><strong>Equipe de Tecnologia da Informação</strong><br>Escola Técnica de Santa Maria – ETSM</p>
        </div>
        <div style="background:#f3f4f6;border-top:1px solid #e5e7eb;padding:10px 24px;font-size:0.75em;color:#9ca3af;text-align:center">
          Em caso de dúvidas durante o processo de recuperação, entre em contato com a equipe de suporte da ETSM. Comunicado automático gerado pelo Sistema Seshat.
        </div>
      </div>
    `,
  });
}

export async function enviarEmailBoasVindas(
  para: string,
  codigoAcesso: string,
  senhaGerada: string,
  nome?: string | null,
): Promise<void> {
  const saudacao = nome ? `Prezado(a) ${nome},` : "Prezado(a),";

  const textoPlano = `${saudacao}

Seja bem-vindo(a) ao Sistema de Seshat da Escola Técnica de Santa Maria (ETSM)!

Seu cadastro foi realizado com sucesso. Abaixo estão suas credenciais de acesso:

──────────────────────────────
📧 E-mail: ${para}
🔑 Código de Acesso: ${codigoAcesso}
🔒 Senha Provisória: ${senhaGerada}
──────────────────────────────

O acesso ao sistema pode ser realizado utilizando o seu e-mail cadastrado ou o código de acesso gerado, combinado com a senha provisória informada acima.

⚠️ IMPORTANTE – Alteração de Senha Obrigatória
Por motivos de segurança, você deverá alterar sua senha no primeiro acesso ao sistema. Escolha uma senha pessoal e mantenha-a em sigilo.

📸 Como incluir sua foto de perfil (Avatar)
Após realizar o login, siga os passos abaixo para adicionar sua foto ao sistema:

  1. Acesse o menu Usuários
  2. Clique no ícone Foto do Perfil (exceto para estudantes/pais e responsáveis)
  3. Selecione a opção Capturar Foto

Sua foto ficará visível no carômetro da turma ou setor ao qual você está vinculado(a).

Em caso de dúvidas ou dificuldades, entre em contato com a equipe de suporte da ETSM.

Atenciosamente,
Equipe de Tecnologia da Informação
Escola Técnica de Santa Maria`;

  await enviar({
    to: para,
    subject: "Seu acesso ao Seshat — ETSM",
    text: textoPlano,
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <div style="background:#1e3a5f;padding:20px 24px">
          <p style="margin:0;color:#ffffff;font-size:1.05em;font-weight:700;letter-spacing:0.05em;text-transform:uppercase">Escola Técnica de Santa Maria</p>
          <p style="margin:4px 0 0;color:#93c5fd;font-size:0.8em">Secretaria de Estado de Educação do Distrito Federal – SEEDF</p>
        </div>
        <div style="background:#dcfce7;border-bottom:2px solid #16a34a;padding:14px 24px;text-align:center">
          <p style="margin:0;font-size:1em;font-weight:700;color:#14532d;letter-spacing:0.06em;text-transform:uppercase">
            ✅&nbsp; Cadastro Realizado com Sucesso
          </p>
        </div>
        <div style="padding:24px;color:#1f2937">
          <p style="margin:0 0 12px">${saudacao}</p>
          <p style="line-height:1.7;margin:0 0 16px">Seja bem-vindo(a) ao <strong>Sistema de Seshat da Escola Técnica de Santa Maria (ETSM)</strong>! Seu cadastro foi realizado com sucesso. Abaixo estão suas credenciais de acesso:</p>

          <table style="border-collapse:collapse;width:100%;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:0.95em">
            <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 16px;font-weight:600;color:#374151;width:45%">📧 E-mail</td><td style="padding:10px 16px">${para}</td></tr>
            <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 16px;font-weight:600;color:#374151">🔑 Código de Acesso</td><td style="padding:10px 16px;font-family:monospace;font-size:1.1em;letter-spacing:2px">${codigoAcesso}</td></tr>
            <tr><td style="padding:10px 16px;font-weight:600;color:#374151">🔒 Senha Provisória</td><td style="padding:10px 16px;font-family:monospace;font-size:1.1em">${senhaGerada}</td></tr>
          </table>
          <p style="font-size:0.88em;color:#6b7280;margin:8px 0 16px">O acesso pode ser realizado com o e-mail ou o código de acesso, combinado com a senha provisória.</p>

          <div style="background:#fef9c3;border:1px solid #f59e0b;border-radius:6px;padding:12px 16px;margin:16px 0">
            <p style="margin:0;font-weight:700;color:#78350f">⚠️ IMPORTANTE – Alteração de Senha Obrigatória</p>
            <p style="margin:8px 0 0;color:#92400e;font-size:0.9em">Por motivos de segurança, você deverá alterar sua senha no primeiro acesso ao sistema. Escolha uma senha pessoal e mantenha-a em sigilo.</p>
          </div>

          <p style="margin:20px 0 6px;font-size:0.8em;font-weight:700;color:#374151;letter-spacing:0.06em;text-transform:uppercase">📸 Como incluir sua foto de perfil (Avatar)</p>
          <p style="margin:0 0 8px;font-size:0.9em;line-height:1.6">Após realizar o login, siga os passos abaixo:</p>
          <ol style="padding-left:20px;font-size:0.9em;line-height:1.9;margin:0 0 16px;color:#374151">
            <li>Acesse o menu <strong>Usuários</strong></li>
            <li>Clique no ícone <strong>Foto do Perfil</strong> (exceto para estudantes/pais e responsáveis)</li>
            <li>Selecione a opção <strong>Capturar Foto</strong></li>
          </ol>
          <p style="font-size:0.9em;line-height:1.6;margin:0 0 20px">Sua foto ficará visível no carômetro da turma ou setor ao qual você está vinculado(a).</p>

          <p style="margin:0 0 4px">Atenciosamente,</p>
          <p style="margin:0"><strong>Equipe de Tecnologia da Informação</strong><br>Escola Técnica de Santa Maria – ETSM</p>
        </div>
        <div style="background:#f3f4f6;border-top:1px solid #e5e7eb;padding:10px 24px;font-size:0.75em;color:#9ca3af;text-align:center">
          Em caso de dúvidas, entre em contato com a equipe de suporte da ETSM. Comunicado automático gerado pelo Sistema Seshat.
        </div>
      </div>
    `,
  });
}

export async function enviarEmailOcorrencia({
  para, estudanteNome, tipoOcorrencia, dataOcorrencia, turnoNome, disciplinaNome, observacao, textoPadrao,
}: {
  para: string;
  estudanteNome: string;
  tipoOcorrencia: string;
  dataOcorrencia: string;
  turnoNome?: string | null;
  disciplinaNome?: string | null;
  observacao?: string | null;
  textoPadrao?: string | null;
}): Promise<void> {
  const dataFormatada = new Date(dataOcorrencia + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  });

  // Quando há texto padrão do tipo, substitui os placeholders e usa como corpo principal
  const corpoTexto = textoPadrao
    ? textoPadrao
        .replace(/\{\{NOME_ESTUDANTE\}\}/g, estudanteNome)
        .replace(/\{\{DATA_OCORRENCIA\}\}/g, dataFormatada)
        .replace(/\{\{DATA_REGISTRO\}\}/g, new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }))
        .replace(/\{\{TIPO_OCORRENCIA\}\}/g, tipoOcorrencia)
        .replace(/\{\{DESCRICAO\}\}/g, observacao ?? "")
    : null;

  const textoPlano = corpoTexto ?? observacao ?? "Nenhuma descrição registrada.";

  // Corpo do e-mail: texto padrão do tipo (pode ser HTML do editor rico ou texto plano)
  // ou apenas a descrição da ocorrência quando não há texto padrão
  const isHtml = corpoTexto ? /^<[a-z]/i.test(corpoTexto.trim()) : false;
  const htmlCorpoPrincipal = corpoTexto
    ? isHtml
      ? `<div style="font-size:0.95em;line-height:1.8;color:#374151;margin:0">${corpoTexto}</div>`
      : `<div style="white-space:pre-wrap;font-size:0.95em;line-height:1.8;color:#374151;margin:0">${corpoTexto.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`
    : observacao
      ? `<p style="font-size:0.95em;line-height:1.8;color:#374151;margin:0">${observacao}</p>`
      : `<p style="font-size:0.9em;color:#6b7280;font-style:italic;margin:0">Nenhuma descrição registrada.</p>`;

  await enviar({
    to: para,
    subject: `Notificação de Ocorrência: ${estudanteNome} — ${tipoOcorrencia}`,
    text: textoPlano,
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">

        <!-- Cabeçalho institucional -->
        <div style="background:#1e3a5f;padding:20px 24px">
          <p style="margin:0;color:#ffffff;font-size:1.05em;font-weight:700;letter-spacing:0.05em;text-transform:uppercase">Escola Técnica de Santa Maria</p>
          <p style="margin:4px 0 0;color:#93c5fd;font-size:0.8em">Secretaria de Estado de Educação do Distrito Federal – SEEDF</p>
        </div>

        <!-- Banner de notificação -->
        <div style="background:#fef9c3;border-bottom:2px solid #f59e0b;padding:14px 24px;text-align:center">
          <p style="margin:0;font-size:1em;font-weight:700;color:#78350f;letter-spacing:0.06em;text-transform:uppercase">
            ⚠️&nbsp; Notificação de <span style="color:#b45309">Ocorrência</span> Disciplinar
          </p>
        </div>

        <!-- Corpo -->
        <div style="padding:24px;color:#1f2937">
          ${htmlCorpoPrincipal}

          <p style="margin:20px 0 4px">Atenciosamente,</p>
          <p style="margin:0"><strong>Equipe Gestora</strong><br>
          Escola Técnica de Santa Maria – ETSM<br>
          Secretaria de Estado de Educação do Distrito Federal – SEEDF<br>
          Brasília – DF</p>
        </div>

        <!-- Rodapé -->
        <div style="background:#f3f4f6;border-top:1px solid #e5e7eb;padding:10px 24px;font-size:0.75em;color:#9ca3af;text-align:center">
          Comunicado automático gerado pelo Sistema Seshat — não responda este e-mail.
        </div>
      </div>
    `,
  });
}
