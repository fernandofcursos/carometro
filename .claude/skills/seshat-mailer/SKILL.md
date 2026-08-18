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
| `SMTP_HOST` | Servidor SMTP; sem ela → Ethereal |
| `SMTP_PORT` | Padrão 587; 465 = SSL |
| `SMTP_USER` | Usuário SMTP |
| `SMTP_PASS` | Senha SMTP |
| `SMTP_FROM` | Remetente; padrão `Seshat <noreply@seshat.local>` |

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

## Gmail como SMTP

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=conta@gmail.com
SMTP_PASS=xxxx-xxxx-xxxx-xxxx   # App Password (não a senha normal)
SMTP_FROM=Seshat <conta@gmail.com>
```
Gerar App Password: myaccount.google.com → Segurança → Senhas de app
