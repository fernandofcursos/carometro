# Skill: Mailer — Envio de E-mails

## Transport Singleton

```typescript
// lib/mailer.ts — _transport criado uma única vez
let _transport: nodemailer.Transporter | null = null;
let _etherealUser: string | null = null;

async function ensureTransport(): Promise<nodemailer.Transporter> {
  if (_transport) return _transport;
  // SMTP_HOST + SMTP_USER + SMTP_PASS → SMTP real
  // Senão → Ethereal (captura sem entrega)
}
```

## Adicionar nova função de envio

```typescript
export async function enviarEmailXxx(para: string, dados: ...): Promise<void> {
  await enviar({
    to: para,
    subject: "Assunto",
    text: "versão texto",
    html: `<div>...html...</div>`,
  });
}
// enviar() chama ensureTransport() + sendMail() + loga preview URL
```

## Variáveis de Ambiente

| Var | Uso |
|---|---|
| `RESEND_API_KEY` | API key do Resend (`re_xxx`) — modo prioritário, HTTPS/443 |
| `RESEND_FROM` | Remetente Resend; sem ela usa `onboarding@resend.dev` (teste) |
| `SMTP_HOST` | Servidor SMTP; usado se Resend não configurado |
| `SMTP_PORT` | Padrão 587; 465 = SSL |
| `SMTP_USER` | Usuário SMTP |
| `SMTP_PASS` | Senha SMTP |
| `SMTP_FROM` | Remetente SMTP; padrão `Seshat <noreply@seshat.local>` |

**Prioridade:** `RESEND_API_KEY` > SMTP > captura local.

## Resend — Configuração

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# Opcional — sem isso usa onboarding@resend.dev (apenas para testes)
RESEND_FROM=Seshat <noreply@seudominio.com.br>
```

1. Criar conta em https://resend.com
2. Dashboard → API Keys → Create API Key
3. Para domínio próprio: Domains → Add Domain → verificar DNS
4. Sem domínio: usar `onboarding@resend.dev` (já verificado, só para testes)

### Implementação (`mailer.ts`)

```typescript
// Resend via fetch nativo (HTTPS/443 — sem bloqueio de proxy)
async function enviarViaResend(opts): Promise<EnvioInfo> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  // res.ok → enviado; !res.ok → throw Error(data.message)
}
// enviar() chama enviarViaResend() quando RESEND_API_KEY está definida
```

## Modos sem SMTP

### Ethereal (requer acesso a api.nodemailer.com)
1. Não definir variáveis SMTP
2. `POST /api/mailer/teste { "para": "qualquer@email.com" }`
3. Log: `[mailer] Ethereal ativado — login: <user>@ethereal.email / <senha>`
4. Log: `[mailer] "Teste de envio..." → https://ethereal.email/message/...`
5. Abrir URL para ver o e-mail

**A senha é exibida UMA VEZ ao iniciar o servidor.** Se o servidor foi reiniciado, a conta mudou.  
Para fixar uma conta Ethereal, cadastre em https://ethereal.email e configure via SMTP:
```env
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=<user>@ethereal.email
SMTP_PASS=<senha>
```

### Modo captura local (fallback sem rede externa)

Quando `api.nodemailer.com` está inacessível (proxy bloqueado), o mailer cai automaticamente para `jsonTransport`:
- E-mails são processados mas **apenas logados no servidor** — sem envio real
- Log: `[mailer] Ethereal indisponível — modo captura local`
- Log: `[mailer] "Assunto" — capturado localmente (para: destino@email.com)`
- UI exibe badge "captura local" (azul) com aviso nos logs

### Fallback quando porta SMTP bloqueada (ex.: dev container)

Se `SMTP_HOST` está configurado mas a porta está bloqueada, `sendMail()` lança erro de conexão. A função `enviar()` detecta isso e faz fallback automático para `jsonTransport`:

```typescript
// em enviar():
try {
  return await enviarComTransport(t, opts);
} catch (err) {
  if (process.env.SMTP_HOST && isConnectionError(err)) {
    // ECONNREFUSED | ETIMEDOUT | ENOTFOUND | EHOSTUNREACH | timeout
    const local = nodemailer.createTransport({ jsonTransport: true });
    return enviarComTransport(local, opts);
  }
  throw err;
}
```

Log: `[mailer] Falha de conexão SMTP (connect ETIMEDOUT ...) — usando captura local.`  
Em produção (porta 587 liberada) o SMTP real funciona normalmente.

## Diagnóstico via API

```bash
# Status do mailer
GET /api/mailer/status
# → { modo, smtpHost, smtpUser, etherealUser, from }

# Enviar e-mail de teste
POST /api/mailer/teste
{ "para": "destino@email.com" }
# → { ok, mensagem, modo, dica }
```

Requer permissão `usuarios:manage`.

**Armadilha — "Failed to fetch" ao enviar teste:**  
O proxy Vite tem timeout de 10s. Se o SMTP não responder nesse prazo, o browser recebe "Failed to fetch" em vez do erro real. Solução implementada: timeout de 8s no `Promise.race` da rota + `connectionTimeout: 6000` no transport nodemailer. O frontend captura o `TypeError: Failed to fetch` e exibe mensagem útil. Se ocorrer, verificar logs do servidor (`[mailer] ...`) para o erro real.

**Armadilha — dados antigos no diagnóstico:**  
`diagnosticoMailer()` chama `ensureTransport()` internamente para detectar mudanças nas env vars e reiniciar o singleton antes de retornar o status. Se o servidor não foi reiniciado após alterar o `.env`, o botão "Atualizar" na página de diagnóstico é suficiente para refletir a nova configuração — não é necessário reiniciar o servidor manualmente.  
Nota: `tsx watch` observa apenas arquivos-fonte, **não** o `.env`. Para que mudanças no `.env` sejam carregadas sem reinicialização manual, é necessário reiniciar o servidor de desenvolvimento.

## Funções disponíveis

| Função | Quando usar |
|---|---|
| `enviarEmailRecuperacao(para, token, expiresAt)` | Recuperação de senha |
| `enviarEmailBoasVindas(para, codigo, senha, nome?)` | Novo usuário criado |
| `enviarEmailOcorrencia({para, estudanteNome, tipo, data, turno?, disciplina?, obs?})` | Ocorrência registrada para menor ou pai/responsável |
| `enviarEmailTeste(para)` | Diagnóstico manual |
| `diagnosticoMailer()` | Estado atual (modo, credenciais) |

## Página de Diagnóstico UI

**Rota:** `/mailer-diagnostico`  
**Menu:** Administração → Diagnóstico de E-mail (visível para `usuarios:manage`)

Usa `useQuery` + `useMutation` do TanStack Query com `fetch` nativo:

```typescript
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
// GET /api/mailer/status
const { data: status, refetch } = useQuery<MailerStatus>({
  queryKey: ["mailer-status"],
  queryFn: async () => {
    const res = await fetch(`${BASE}/api/mailer/status`, { credentials: "include" });
    if (!res.ok) throw new Error("Sem acesso");
    return res.json();
  },
});
// POST /api/mailer/teste
const testeMutation = useMutation({
  mutationFn: async (destino: string): Promise<TesteResult> => {
    const res = await fetch(`${BASE}/api/mailer/teste`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ para: destino }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Erro ao enviar");
    return body;
  },
});
```

**IMPORTANTE:** NÃO usar `apiClient` ou `customFetch` de `@workspace/api-client-react` —
`dist/index.d.ts` pode estar desatualizado e não exportar esses símbolos.
Sempre usar `fetch` nativo com `credentials: "include"` e prefixo `BASE`.

## Configuração Gmail — conta oficial do projeto

Conta: `noreplay.seshat.etsm@gmail.com`

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreplay.seshat.etsm@gmail.com
SMTP_PASS=jbvwwogmeuuexlfr
SMTP_FROM=Seshat <noreplay.seshat.etsm@gmail.com>
```
