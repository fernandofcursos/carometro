# Spec: Mailer — Envio de E-mails

**Status:** Implementado ✅

---

## Conceito

Sistema de envio de e-mails transacionais via SMTP configurável. Sem configuração, usa **Ethereal** (serviço de captura de e-mails para testes) — mensagens são enviadas mas não entregues; ficam visíveis em https://ethereal.email/messages.

---

## Configuração via Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|---|---|---|
| `SMTP_HOST` | Servidor SMTP (ex.: `smtp.gmail.com`) | Não — sem ela usa Ethereal |
| `SMTP_PORT` | Porta (padrão: 587; 465 = SSL) | Não |
| `SMTP_USER` | Usuário / e-mail de autenticação | Não (junto com HOST) |
| `SMTP_PASS` | Senha ou App Password | Não (junto com HOST) |
| `SMTP_FROM` | Remetente (ex.: `Seshat <noreply@escola.br>`) | Não (padrão: `Seshat <noreply@seshat.local>`) |

---

## Modos de Operação

| Modo | Quando | Comportamento |
|---|---|---|
| **SMTP** | `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` definidos | Entrega real via servidor configurado |
| **Ethereal** | Variáveis não definidas | Captura sem entrega; URL de preview nos logs |

Em modo Ethereal, os logs do servidor exibem:
```
[mailer] Ethereal ativado — login: abc@ethereal.email / senha
[mailer] Visualize mensagens em https://ethereal.email/messages
[mailer] "Assunto do e-mail" → https://ethereal.email/message/...
```

---

## Transport — Singleton

O transport SMTP é criado uma única vez (singleton `_transport`) e reutilizado por todas as funções. Chamadas simultâneas não criam múltiplas contas Ethereal.

---

## Funções Exportadas

| Função | Assunto do e-mail |
|---|---|
| `enviarEmailRecuperacao(para, token, expiresAt)` | "Redefinição de senha — Seshat" |
| `enviarEmailBoasVindas(para, codigoAcesso, senhaGerada, nome?)` | "Seu acesso ao Seshat" |
| `enviarEmailOcorrencia({ para, estudanteNome, tipoOcorrencia, dataOcorrencia, turnoNome?, disciplinaNome?, observacao? })` | "Ocorrência: {estudante} — {tipo}" |
| `enviarEmailTeste(para)` | "Teste de envio — Seshat" |
| `diagnosticoMailer()` | Retorna estado do mailer (modo, host, user, from) |

---

## Endpoints de Diagnóstico

**Requer:** `usuarios:manage`

### GET /api/mailer/status

Retorna o estado atual do mailer:
```json
{
  "modo": "smtp" | "ethereal" | "não iniciado",
  "smtpHost": "smtp.gmail.com" | null,
  "smtpUser": "noreply@escola.br" | null,
  "etherealUser": "abc@ethereal.email" | null,
  "from": "Seshat <noreply@seshat.local>"
}
```

### POST /api/mailer/teste

Envia um e-mail de teste para o destinatário informado:
```json
{ "para": "destino@exemplo.com" }
```

Resposta:
```json
{
  "ok": true,
  "mensagem": "E-mail de teste enviado para destino@exemplo.com.",
  "modo": "ethereal",
  "dica": "Modo Ethereal ativo — acesse https://ethereal.email/messages para visualizar (login: abc@ethereal.email)"
}
```

---

## Como Testar

### Sem SMTP (Ethereal — padrão)

1. Inicie o servidor normalmente (sem variáveis SMTP)
2. `POST /api/mailer/teste` com `{ "para": "qualquer@email.com" }`
3. Verifique os logs do servidor — aparece URL de preview
4. Acesse a URL para ver o e-mail capturado

### Com SMTP Real (Gmail como exemplo)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=sua-conta@gmail.com
SMTP_PASS=sua-app-password   # gerar em myaccount.google.com/apppasswords
SMTP_FROM=Seshat <sua-conta@gmail.com>
```

Verificar status: `GET /api/mailer/status` → `"modo": "smtp"`

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `artifacts/api-server/src/lib/mailer.ts` | Transport singleton + todas as funções de envio |
| `artifacts/api-server/src/routes/mailer-test.ts` | GET /status + POST /teste |
