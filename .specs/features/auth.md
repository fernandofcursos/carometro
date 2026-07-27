# Spec: Autenticação

**Agente responsável:** Ares (segurança) + Hermes (implementação)  
**Athena:** aprovado  
**Status:** Parcialmente implementado — biometria pendente ⏳  
**Ver também:** [ADR-008 — Biometria](../decisions/ADR-008-biometria.md)

## Comportamento

### POST /api/auth/login

**Entrada:**
```typescript
{ email: string; codigoAcesso: string; senha: string }
```

**Saída (200):**
```typescript
{
  id: string;
  email: string;           // descriptografado
  codigoAcesso: string;
  primeiroAcesso: boolean;
  roles: string[];
  allRoles: { id, nome, descricao }[];
  activeRoleId: string;
  permissions: string[];   // formato "recurso:acao"
  disciplinas: [];
}
```

**Erros:**
- `401` — credenciais inválidas (não revelar qual campo está errado)
- `400` — payload malformado

**Efeito colateral:** cookie `session` (JWT httpOnly, 8h)

### POST /api/auth/logout

Remove o cookie `session`. Sempre retorna `200 { ok: true }`.

### GET /api/me

Retorna o mesmo shape de login para o usuário da sessão atual.  
Requer: `requireAuth`

### POST /api/auth/change-password

**Entrada:**
```typescript
{ senhaAtual: string; novaSenha: string }
```

Obrigatório quando `primeiroAcesso = true`. Após troca bem-sucedida, seta `primeiroAcesso = false`.

### POST /api/auth/switch-role

**Entrada:** `{ roleId: string }`  
Troca o `activeRoleId` no JWT. O role deve pertencer ao usuário.

## Recuperação de Senha

### Fluxo
1. Usuário clica em "Esqueci minha senha" na tela de login
2. Informa o e-mail cadastrado
3. Sistema valida internamente se o e-mail existe — **não revela ao usuário** (LGPD + user enumeration)
4. Se existir: gera token UUID aleatório, armazena hash SHA-256 no banco, válido por **1 hora**
5. Envia e-mail com o token via SMTP (variáveis `SMTP_HOST/PORT/USER/PASS/FROM`)
   - Sem SMTP configurado: usa Ethereal (serviço de teste) e exibe URL de pré-visualização no log da API
6. Usuário informa o token e a nova senha
7. Sistema valida token (hash + expiração + não usado), atualiza senha, invalida token

### Endpoints

#### POST /api/auth/solicitar-recuperacao
**Entrada:** `{ email: string }`  
**Saída:** sempre `200 { ok: true }` — não confirma se o e-mail existe  
**Efeito:** se e-mail existir, gera token e registra no banco

#### POST /api/auth/redefinir-senha
**Entrada:** `{ token: string; novaSenha: string }`  
**Saída:**
- `200 { ok: true }` — senha redefinida com sucesso
- `400` — token inválido, expirado ou já usado
- `400` — nova senha não atende requisitos

### Regras
- Token: UUID v4 gerado com `crypto.randomUUID()`, armazenado como hash SHA-256
- Expiração: 1 hora após geração (`recuperacaoExpiresAt`)
- Uso único: após redefinição, `recuperacaoTokenHash` e `recuperacaoExpiresAt` são zerados
- Nova senha: mínimo 8 caracteres
- Resposta de solicitação sempre 200 — nunca revelar se e-mail existe

### Schema (novas colunas em `usuarios`)
- `recuperacaoTokenHash`: `char(64)` nullable — SHA-256 do token em hex
- `recuperacaoExpiresAt`: `timestamp` nullable — expiração do token

### Auditoria
- `POST /api/auth/solicitar-recuperacao` → registra tentativa (sem revelar se e-mail existe)
- `POST /api/auth/redefinir-senha` → registra sucesso ou falha por token inválido

---

## Autenticação Biométrica

> Tecnologias e conformidade documentados em [ADR-008](../decisions/ADR-008-biometria.md).

### Visão Geral

O usuário pode autenticar-se por três métodos, combinados ou alternativos:

| Método | Tecnologia | Disponibilidade |
|--------|-----------|-----------------|
| Senha | bcrypt + JWT | Sempre disponível |
| Facial | `@vladmandic/face-api` (MIT) + câmera | Celular, tablet, laptop com câmera |
| Digital | WebAuthn FIDO2 (API nativa) | Dispositivos com Touch ID, Windows Hello, sensor Android |

### Regras Gerais de Biometria

- **Consentimento obrigatório** antes de qualquer captura biométrica (LGPD Art. 11, I)
  - Finalidade `"biometria_facial"` ou `"biometria_digital"` em `consentimentos_lgpd`
  - O usuário pode revogar e excluir a qualquer momento
- **Dado bruto nunca sai do dispositivo** — apenas a representação matemática (descritor ou chave pública)
- **Dados armazenados criptografados** com `ENCRYPTION_KEY` (AES-256-CBC) — ver ADR-004 e ADR-008
- **Toda operação auditada** — cadastro, autenticação e exclusão registrados em `auditoria_logs`
- **Fallback para senha sempre disponível** — biometria é alternativa, não substituto obrigatório
- **Limitação de tentativas** — máximo 5 falhas biométricas aplica o mesmo lockout da senha (15 min)

---

### Biometria Facial

#### Cadastro

**Quando:** primeiro acesso com biometria disponível (câmera presente) **e/ou** a qualquer momento em Perfil → Segurança → Biometria.

**Pré-condição:** consentimento `"biometria_facial"` registrado e `consentido: true`.

**Endpoint:** `POST /api/auth/biometria/facial/cadastrar`

```typescript
// Entrada (processamento facial ocorre INTEIRAMENTE no cliente)
{
  descriptor: number[];   // Float32Array(128) serializado — nunca a foto
  consentimentoId: string; // UUID do registro em consentimentos_lgpd
}

// Saída 200
{ ok: true; mensagem: "Biometria facial cadastrada com sucesso" }

// Erros
// 400 — descriptor inválido (não é array de 128 números)
// 403 — consentimento não registrado ou revogado
// 409 — biometria já cadastrada (usar /atualizar)
```

**Efeito no banco:**
- Criptografa `descriptor` com AES-256-CBC (ENCRYPTION_KEY)
- Salva `biometriaFacialDescriptor` (bytea) + `biometriaFacialIv` + `biometriaFacialAtivada: true`
- Registra auditoria com `operacao: "INSERT"`, `tabela: "biometria_facial"`

#### Autenticação

**Endpoint:** `POST /api/auth/biometria/facial/login`

```typescript
// Entrada
{
  identificador: string;  // email ou codigoAcesso (para localizar o usuário)
  descriptor: number[];   // Float32Array(128) do rosto capturado agora
}

// Saída 200 — mesmo shape do POST /api/auth/login
{ id, email, codigoAcesso, primeiroAcesso, roles, ... }

// Erros
// 401 — rosto não reconhecido (distância euclidiana > 0.5) ou biometria não cadastrada
// 429 — conta bloqueada por tentativas excessivas
```

**Processamento no servidor:**
1. Busca usuário por `identificador`
2. Descriptografa `biometriaFacialDescriptor`
3. Calcula distância euclidiana entre os dois descritores Float32Array(128)
4. Distância ≤ 0.5 → autenticado; > 0.5 → incrementa `tentativasLoginFalhas`
5. Sucesso → mesmo fluxo do login por senha (JWT cookie)

#### Remoção

**Endpoint:** `DELETE /api/auth/biometria/facial`  
Requer: `requireAuth`

- Zera `biometriaFacialDescriptor`, `biometriaFacialIv`, seta `biometriaFacialAtivada: false`
- Revoga consentimento `"biometria_facial"` (seta `consentido: false`)
- Registra auditoria com `operacao: "DELETE"`, `tabela: "biometria_facial"`
- Retorna: `200 { ok: true }`

---

### Biometria Digital (WebAuthn FIDO2)

#### Cadastro

**Quando:** primeiro acesso **e/ou** a qualquer momento em Perfil → Segurança → Biometria.  
O usuário pode cadastrar **múltiplos dispositivos** (celular + laptop, por exemplo).

**Pré-condição:** consentimento `"biometria_digital"` registrado e `consentido: true`.

**Fluxo de cadastro (dois passos):**

**Passo 1 — Gerar challenge:**
```
POST /api/auth/biometria/digital/cadastrar/iniciar

// Entrada
{ consentimentoId: string; nomeDispositivo?: string }  // ex: "iPhone de Fernando"

// Saída 200
{
  options: PublicKeyCredentialCreationOptionsJSON  // challenge para o browser
}
```

**Passo 2 — Confirmar cadastro:**
```
POST /api/auth/biometria/digital/cadastrar/confirmar

// Entrada
{
  credential: RegistrationResponseJSON  // resposta do autenticador WebAuthn
  nomeDispositivo?: string
}

// Saída 200
{ ok: true; credencialId: string; nomeDispositivo: string }

// Erros
// 400 — verificação da credencial falhou
// 403 — consentimento ausente ou revogado
```

**Efeito no banco:** INSERT em `webauthn_credenciais` com `publicKey`, `credentialId`, `counter: 0`.

#### Autenticação

**Fluxo de autenticação (dois passos):**

**Passo 1 — Gerar challenge:**
```
POST /api/auth/biometria/digital/login/iniciar

// Entrada
{ identificador: string }  // email ou codigoAcesso

// Saída 200
{ options: PublicKeyCredentialRequestOptionsJSON }
```

**Passo 2 — Verificar assinatura:**
```
POST /api/auth/biometria/digital/login/confirmar

// Entrada
{
  identificador: string
  credential: AuthenticationResponseJSON
}

// Saída 200 — mesmo shape do login por senha
{ id, email, codigoAcesso, roles, ... }

// Erros
// 401 — assinatura inválida ou credencial não encontrada
// 429 — conta bloqueada
```

**Processamento no servidor:**
1. Busca credencial por `credentialId`
2. Verifica assinatura com `@simplewebauthn/server` (verifica challenge, origin, counter)
3. Atualiza `counter` (proteção anti-replay)
4. Sucesso → mesmo fluxo do login por senha (JWT cookie)

#### Listagem e Remoção de Credenciais

```
GET  /api/auth/biometria/digital             — lista credenciais do usuário autenticado
DELETE /api/auth/biometria/digital/:credencialId  — remove credencial específica
```

Remoção revoga a credencial mas não o consentimento (usuário pode ter outros dispositivos).  
Quando a última credencial é removida, revoga o consentimento `"biometria_digital"`.

---

### Schema — Novas Colunas e Tabela

#### Novas colunas em `usuarios`

```typescript
// lib/db/src/schema/usuarios.ts
biometriaFacialDescriptor: bytesAsBuffer("biometria_facial_descriptor")   // Float32Array(128) criptografado
biometriaFacialIv:         char("biometria_facial_iv", { length: 24 })    // IV base64 da criptografia
biometriaFacialAtivada:    boolean("biometria_facial_ativada").default(false).notNull()
biometriaFacialCadastradaEm: timestamp("biometria_facial_cadastrada_em", { withTimezone: true })
```

#### Nova tabela `webauthn_credenciais`

```typescript
// lib/db/src/schema/webauthn-credenciais.ts
export const webauthnCredenciaisTable = pgTable("webauthn_credenciais", {
  id:              uuid("id").primaryKey().defaultRandom(),
  usuarioId:       uuid("usuario_id").notNull().references(() => usuariosTable.id),
  credentialId:    text("credential_id").notNull().unique(),  // base64url
  publicKey:       bytesAsBuffer("public_key").notNull(),     // chave pública COSE
  counter:         bigint("counter", { mode: "number" }).notNull().default(0),
  deviceType:      text("device_type"),                       // "platform" | "cross-platform"
  backedUp:        boolean("backed_up").default(false),
  nomeDispositivo: text("nome_dispositivo"),
  criadoEm:        timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  ultimoUsoEm:     timestamp("ultimo_uso_em", { withTimezone: true }),
});
```

---

### Tela de Biometria no Frontend

Localização: **Perfil → Segurança → Biometria Facial / Digital**

| Estado | UI |
|--------|----|
| Nenhuma biometria cadastrada | Botão "Cadastrar biometria facial" e/ou "Cadastrar digital" |
| Biometria facial ativa | Badge verde + botão "Atualizar" + botão "Remover" |
| Digital ativa | Lista de dispositivos cadastrados + botão "Adicionar dispositivo" + "Remover" por dispositivo |
| Sem câmera disponível | Ocultar opção facial |
| WebAuthn não suportado | Ocultar opção digital |
| Offline | Desabilitar cadastro (requer rede); login biométrico funciona se credencial local estiver disponível |

**Captura facial no browser:**
```typescript
// Sequência de inicialização (uma vez por sessão)
await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
await faceapi.nets.faceRecognitionNet.loadFromUri("/models");

// Captura e extração do descritor
const stream = await navigator.mediaDevices.getUserMedia({ video: true });
const detection = await faceapi
  .detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions())
  .withFaceLandmarks()
  .withFaceDescriptor();

if (!detection) throw new Error("Nenhum rosto detectado");
const descriptor = Array.from(detection.descriptor); // Float32Array → number[]
```

---

## Casos de Teste

### Autenticação Clássica
- [ ] Login com credenciais corretas → 200 + cookie
- [ ] Login com senha errada → 401
- [ ] Login com email não cadastrado → 401 (mesma mensagem)
- [ ] `/api/me` sem cookie → 401
- [ ] `/api/me` com cookie expirado → 401
- [ ] Troca de senha no primeiro acesso → `primeiroAcesso` vira `false`
- [ ] Solicitar recuperação com e-mail existente → 200 + token gerado no banco
- [ ] Solicitar recuperação com e-mail inexistente → 200 (não revela)
- [ ] Redefinir senha com token válido → 200 + senha atualizada + token invalidado
- [ ] Redefinir senha com token expirado → 400
- [ ] Redefinir senha com token já usado → 400
- [ ] Redefinir senha com token inexistente → 400
- [ ] Nova senha menor que 8 caracteres → 400

### Biometria Facial
- [ ] Cadastrar biometria sem consentimento → 403
- [ ] Cadastrar com descriptor de 128 floats válido → 200 + `biometriaFacialAtivada: true`
- [ ] Cadastrar com descriptor inválido (tamanho errado) → 400
- [ ] Login facial com rosto correto (distância ≤ 0.5) → 200 + cookie
- [ ] Login facial com rosto diferente (distância > 0.5) → 401
- [ ] Login facial incrementa `tentativasLoginFalhas` em caso de falha
- [ ] 5 falhas → conta bloqueada por 15 min
- [ ] Remover biometria facial → colunas zeradas + consentimento revogado + auditoria

### Biometria Digital (WebAuthn)
- [ ] Cadastrar sem consentimento → 403
- [ ] Iniciar cadastro → options com challenge único retornados
- [ ] Confirmar cadastro com credential válido → 200 + credencial em `webauthn_credenciais`
- [ ] Cadastrar segundo dispositivo → dois registros na tabela
- [ ] Iniciar login → options com allowCredentials do usuário
- [ ] Confirmar login com assinatura válida → 200 + counter atualizado + cookie
- [ ] Confirmar login com counter repetido (replay) → 401
- [ ] Listar credenciais → retorna dispositivos do usuário autenticado
- [ ] Remover única credencial → revoga consentimento `"biometria_digital"`
- [ ] Remover uma de duas credenciais → consentimento mantido
