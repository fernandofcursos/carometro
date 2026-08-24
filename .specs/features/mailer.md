# Spec: Mailer — Envio de E-mails

**Status:** Implementado ✅

---

## Conceito

Sistema de envio de e-mails transacionais via SMTP configurável. Sem configuração, usa **Ethereal** (serviço de captura de e-mails para testes) — mensagens são enviadas mas não entregues; ficam visíveis em https://ethereal.email/messages.

---

## Configuração via Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|---|---|---|
| `RESEND_API_KEY` | API key do Resend (`re_xxx`) — modo recomendado, usa HTTPS/443 | Não |
| `RESEND_FROM` | Remetente quando usando Resend (ex.: `Seshat <noreply@escola.br>`). Sem ela usa `onboarding@resend.dev` | Não |
| `SMTP_HOST` | Servidor SMTP (ex.: `smtp.gmail.com`) — ignorado se Resend ativo | Não |
| `SMTP_PORT` | Porta SMTP (padrão: 587; 465 = SSL) | Não |
| `SMTP_USER` | Usuário SMTP | Não (junto com HOST) |
| `SMTP_PASS` | Senha ou App Password | Não (junto com HOST) |
| `SMTP_FROM` | Remetente SMTP (ex.: `Seshat <noreply@escola.br>`) | Não (padrão: `Seshat <noreply@seshat.local>`) |

---

## Modos de Operação

| Modo | Quando | Comportamento |
|---|---|---|
| **Resend** | `RESEND_API_KEY` definida | Entrega real via API HTTPS (porta 443) — funciona em qualquer ambiente |
| **SMTP** | `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` definidos (sem Resend) | Entrega real via servidor SMTP (porta 587/465) |
| **Local** | Sem vars de e-mail ou porta SMTP bloqueada | `jsonTransport` — e-mail processado e exibido apenas nos logs do servidor |

**Prioridade:** Resend > SMTP > captura local.

Em modo Ethereal, os logs do servidor exibem:
```
[mailer] Ethereal ativado — login: abc@ethereal.email / senha
[mailer] Visualize mensagens em https://ethereal.email/messages
[mailer] "Assunto do e-mail" → https://ethereal.email/message/...
```

Em modo Local (fallback sem rede), os logs exibem:
```
[mailer] Ethereal indisponível — modo captura local (e-mails exibidos apenas em log)
[mailer] "Assunto do e-mail" — capturado localmente (para: destino@email.com)
[mailer] Conteúdo texto: ...
```

### Fallback automático quando porta SMTP bloqueada

Se `SMTP_HOST` está configurado mas a porta está bloqueada (ex.: ambiente de desenvolvimento com proxy que só permite 443), `sendMail()` lança erro de conexão. O mailer detecta esses erros (`ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, `EHOSTUNREACH`, `timeout`) e faz fallback automático para `jsonTransport` (captura local):

```
[mailer] Falha de conexão SMTP (connect ETIMEDOUT ...) — usando captura local.
[mailer] "Assunto" — capturado localmente (para: destino@email.com)
```

Em produção, onde a porta 587 está liberada, o SMTP real é usado normalmente.

### Senha da conta Ethereal

A senha é gerada pelo `nodemailer.createTestAccount()` e exibida **uma única vez** no log do servidor ao iniciar:
```
[mailer] Ethereal ativado — login: <user>@ethereal.email / <senha>
```
Se o servidor foi reiniciado, a senha é perdida. Para reutilizar, acesse [https://ethereal.email](https://ethereal.email) → "Sign up" → cria conta manualmente e configure via SMTP_HOST/USER/PASS:
```env
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=<user>@ethereal.email
SMTP_PASS=<senha da conta>
```

---

## Transport — Singleton

O transport SMTP é criado uma única vez (singleton `_transport`) e reutilizado por todas as funções. Chamadas simultâneas não criam múltiplas contas Ethereal.

---

## Funções Exportadas

| Função | Assunto do e-mail |
|---|---|
| `enviarEmailRecuperacao(para, token, expiresAt, nomeUsuario?, codigoAcesso?)` | "Recuperação de senha — Seshat ETSM" |
| `enviarEmailBoasVindas(para, codigoAcesso, senhaGerada, nome?)` | "Seu acesso ao Seshat — ETSM" |
| `enviarEmailOcorrencia({ para, estudanteNome, tipoOcorrencia, dataOcorrencia, turnoNome?, disciplinaNome?, observacao?, textoPadrao? })` | "Notificação de Ocorrência: {estudante} — {tipo}" |
| `enviarEmailTeste(para)` | "Teste de envio — Seshat" |
| `diagnosticoMailer()` | Retorna estado do mailer (modo, host, user, from, resendConfigured?) |

---

## Templates Institucionais ETSM

Todos os e-mails transacionais seguem o padrão visual institucional da Escola Técnica de Santa Maria (ETSM/SEEDF).

### Estrutura comum

```html
<!-- Cabeçalho — fundo azul escuro #1e3a5f -->
<p>Escola Técnica de Santa Maria</p>
<p>Secretaria de Estado de Educação do Distrito Federal – SEEDF</p>

<!-- Banner colorido (varia por e-mail) -->

<!-- Corpo: saudação, conteúdo, assinatura -->

<!-- Rodapé cinza: "Comunicado automático gerado pelo Sistema Seshat" -->
```

### Boas-vindas (`enviarEmailBoasVindas`)

- Banner **verde** (#dcfce7 / #16a34a) — "✅ Cadastro Realizado com Sucesso"
- Tabela com e-mail, código de acesso e senha provisória
- Aviso âmbar de alteração obrigatória de senha no primeiro acesso
- Instruções de foto de perfil (menu Usuários → Foto do Perfil → Capturar Foto)
- Assinatura: **Equipe de Tecnologia da Informação / Escola Técnica de Santa Maria – ETSM**

### Recuperação de senha (`enviarEmailRecuperacao`)

- Banner **âmbar** (#fef9c3 / #f59e0b) — "🔐 Recuperação de Senha"
- Tabela com e-mail cadastrado, código de acesso e procedimento
- Passo a passo numerado para redefinição
- Caixa âmbar com aviso de segurança (não compartilhar token)
- Instruções de foto de perfil
- Assinatura: **Equipe de Tecnologia da Informação / Escola Técnica de Santa Maria – ETSM**

### Ocorrência (`enviarEmailOcorrencia`)

- Banner **âmbar** (#fef9c3 / #f59e0b) — "⚠️ Notificação de Ocorrência Disciplinar"

**Com `textoPadrao`:** exibe apenas o texto com placeholders substituídos (saudação/intro NÃO são adicionadas para evitar duplicidade):
- `{{NOME_ESTUDANTE}}`, `{{DATA_OCORRENCIA}}`, `{{DATA_REGISTRO}}`, `{{TIPO_OCORRENCIA}}`, `{{DESCRICAO}}`

**Sem `textoPadrao`:** template completo — saudação + intro legal + seções:
1. "Prezado(a) Responsável..." + parágrafo formal com referência às Portarias SEEDF nº 15/2015 e nº 180/2019
2. **DADOS DA OCORRÊNCIA** — tabela com ícones (nome, datas, tipo, turno, disciplina, descrição)
3. **FUNDAMENTAÇÃO E POSSÍVEIS SANÇÕES** — lista romana I–IV + direito ao contraditório + ECA
4. **ORIENTAÇÕES AO RESPONSÁVEL** — box com cabeçalho azul escuro (#1e40af) e corpo azul claro (#eff6ff), prazo de 3 dias úteis

> ⚠️ A saudação e intro formal ficam **dentro** do bloco `!textoPadrao` para não duplicar quando o texto padrão já as contém.

- Assinatura: **Equipe Gestora / Escola Técnica de Santa Maria – ETSM / SEEDF / Brasília – DF**

---

## Endpoints de Diagnóstico

**Requer:** `usuarios:manage`

### GET /api/mailer/status

Retorna o estado atual do mailer:
```json
{
  "modo": "resend" | "smtp" | "ethereal" | "local" | "não iniciado",
  "smtpHost": "smtp.gmail.com" | null,
  "smtpUser": "noreply@escola.br" | null,
  "etherealUser": "abc@ethereal.email" | null,
  "from": "Seshat <noreply@seshat.local>",
  "resendConfigured": true | undefined
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

### Com SMTP Real (Gmail — configuração oficial do projeto)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreplay.seshat.etsm@gmail.com
SMTP_PASS=jbvwwogmeuuexlfr
SMTP_FROM=Seshat <noreplay.seshat.etsm@gmail.com>
```

Verificar status: `GET /api/mailer/status` → `"modo": "smtp"`

---

---

## Página de Diagnóstico UI

**Rota:** `/mailer-diagnostico`  
**Arquivo:** `artifacts/seshat/src/pages/mailer-diagnostico/index.tsx`  
**Permissão:** `usuarios:manage` (verificada pela API; menu só aparece para quem tem a permissão)  
**Menu:** Administração → Diagnóstico de E-mail

### Painéis

**Status do Servidor:**
- Badge colorido: verde (smtp) / âmbar (ethereal) / cinza (não iniciado)
- Campos: Modo, Remetente, Servidor SMTP, Usuário SMTP
- Aviso âmbar em modo Ethereal com link para `https://ethereal.email/messages` e login
- Aviso verde em modo SMTP

**Enviar E-mail de Teste:**
- Campo `para` (email) + botão "Enviar teste"
- Enter no campo dispara o envio
- Toast com resultado; segundo toast com link Ethereal se aplicável

**E-mails por Funcionalidade:**
- Lista informativa: Recuperação de senha, Boas-vindas, Ocorrência menor, Notificação de responsáveis
- Exibe quando cada e-mail é disparado e a rota responsável

### Padrão de fetch usado na página

```typescript
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const res = await fetch(`${BASE}/api/mailer/status`, { credentials: "include" });
```

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `artifacts/api-server/src/lib/mailer.ts` | Transport singleton + todas as funções de envio |
| `artifacts/api-server/src/routes/mailer-test.ts` | GET /status + POST /teste |
| `artifacts/seshat/src/pages/mailer-diagnostico/index.tsx` | Página de diagnóstico UI |
