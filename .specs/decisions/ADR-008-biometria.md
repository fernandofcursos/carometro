# ADR-008: Autenticação Biométrica — Tecnologias e Protocolos

**Data:** 2026-07-27  
**Status:** Aprovado — Athena  
**Autor:** Ares (segurança) + Athena (arquiteta)

---

## Contexto

O sistema precisa suportar autenticação biométrica por:
1. **Face** — câmera no celular, tablet ou laptop
2. **Digital** — leitor biométrico no dispositivo (Touch ID, Windows Hello, sensor Android)

Os dados biométricos são dados sensíveis pela LGPD (Art. 5, II e Art. 11) e exigem tratamento especial.

---

## Decisões

### D1: Biometria Facial — `face-api.js`

**Biblioteca:** [`@vladmandic/face-api`](https://github.com/vladmandic/face-api) (MIT License, gratuita)  
**Executa:** 100% no cliente (browser) — nenhum dado bruto sai do dispositivo  
**Modelos:** TinyFaceDetector + FaceLandmark68 + FaceRecognition128 (~3MB total, hospedados em `/public/models/`)

**Como funciona:**
1. Browser acessa câmera via `getUserMedia()` (API nativa)
2. face-api.js detecta o rosto e extrai um **descritor facial** — vetor Float32Array de 128 números
3. O descritor (NÃO a foto) é enviado criptografado para o servidor
4. No login, o browser captura novo descritor e compara com o armazenado (distância euclidiana ≤ 0.5 = mesmo rosto)

**Por que não enviar a foto:**
- A foto é dado biométrico bruto — mais sensível que o descritor matemático
- O descritor não permite reconstruir o rosto (irreversível para fins práticos)
- Alinha com o princípio de **minimização de dados** (LGPD Art. 6, III)

### D2: Biometria Digital — WebAuthn (FIDO2)

**API:** [Web Authentication API](https://www.w3.org/TR/webauthn-3/) — padrão W3C, nativa em todos os browsers modernos  
**Biblioteca servidor:** [`@simplewebauthn/server`](https://simplewebauthn.dev/) (MIT License, gratuita)  
**Biblioteca cliente:** [`@simplewebauthn/browser`](https://simplewebauthn.dev/) (MIT License, gratuita)

**Como funciona:**
1. **Cadastro:** servidor gera um `challenge`; dispositivo usa leitor biométrico local para criar um par de chaves (privada fica no hardware do dispositivo, pública vai para o servidor)
2. **Autenticação:** servidor envia novo `challenge`; dispositivo usa biometria para assinar com a chave privada; servidor verifica a assinatura com a chave pública
3. **Nenhum dado biométrico sai do dispositivo** — o hardware garante isso (TPM, Secure Enclave)

**Suporte:** Chrome, Firefox, Safari, Edge (desktop e mobile)  
**Autenticadores suportados:** Touch ID, Face ID, Windows Hello, Android Biometrics, YubiKey

### D3: O que NÃO usar

| Descartado | Motivo |
|-----------|--------|
| AWS Rekognition / Google Vision | Pago; dados biométricos enviados para terceiros (LGPD) |
| Face Recognition (Python) | Requer servidor separado; complexidade desnecessária |
| Implementação própria de WebAuthn | Alta complexidade criptográfica; simplewebauthn é auditado |
| Armazenar foto para comparação | Dado bruto sensível; viola minimização de dados LGPD |
| Biometria sem consentimento explícito | Ilegal pela LGPD Art. 11 |

---

## Conformidade Legal e de Segurança

### LGPD (Lei 13.709/2018)

| Artigo | Requisito | Como atendemos |
|--------|-----------|----------------|
| Art. 5, II | Dado sensível — biometria | Tratado com base no Art. 11, I (consentimento explícito) |
| Art. 11, I | Consentimento específico para dado sensível | `consentimentos_lgpd` com `finalidade: "biometria_facial"` e `"biometria_digital"` |
| Art. 6, III | Minimização de dados | Armazena descritor (128 floats), nunca a foto |
| Art. 6, VII | Segurança | Descritor criptografado AES-256 em repouso; TLS em trânsito |
| Art. 18, VI | Direito de eliminação | `DELETE /api/auth/biometria` remove os dados; audita |
| Art. 37 | Registro de tratamento | `auditoria_logs` registra cadastro, uso e exclusão |
| Art. 46 | Medidas de segurança | Encryption at rest, TLS, acesso por chave dedicada |

### ISO 27001

| Controle | Requisito | Como atendemos |
|----------|-----------|----------------|
| A.9.4.2 | Procedimentos seguros de logon | WebAuthn resiste a phishing e replay (challenge único) |
| A.8.24 | Uso de criptografia | AES-256-CBC para descritor; chave ENCRYPTION_KEY dedicada |
| A.8.15 | Logging | Toda operação biométrica auditada com `usuarioId`, IP, timestamp |
| A.5.34 | Privacidade e proteção de dados | Consentimento, minimização, direito de exclusão |

### NIST SP 800-63B (Autenticação Digital)

- WebAuthn com autenticador de plataforma (Touch ID etc.) = **AAL2** (nível de garantia 2)
- Resistente a phishing, credential stuffing e man-in-the-middle
- Recomendado para sistemas com dados sensíveis

---

## Armazenamento no Banco

### Facial (novas colunas em `usuarios`)
```sql
biometria_facial_descriptor  BYTEA NULL      -- Float32Array(128) criptografado AES-256
biometria_facial_iv          CHAR(24) NULL   -- IV da criptografia (base64)
biometria_facial_ativada     BOOLEAN DEFAULT FALSE
biometria_facial_cadastrada_em TIMESTAMPTZ NULL
```

### Digital/WebAuthn (tabela separada — um usuário pode ter N autenticadores)
```sql
CREATE TABLE webauthn_credenciais (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id        UUID NOT NULL REFERENCES usuarios(id),
  credential_id     TEXT NOT NULL UNIQUE,   -- base64url, ID do autenticador
  public_key        BYTEA NOT NULL,          -- chave pública COSE
  counter           BIGINT NOT NULL DEFAULT 0, -- proteção anti-replay
  device_type       TEXT,                   -- "platform" | "cross-platform"
  backed_up         BOOLEAN DEFAULT FALSE,  -- credencial tem backup (iCloud Keychain etc.)
  nome_dispositivo  TEXT,                   -- "iPhone de Fernando", "MacBook Pro"
  criado_em         TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ultimo_uso_em     TIMESTAMPTZ
);
```

---

## Fluxo de Dados (sem dado bruto biométrico no servidor)

```
FACIAL:
  Browser → getUserMedia() → face-api.js → Float32Array(128)
          → encrypt(descriptor, ENCRYPTION_KEY) → POST /api/auth/biometria/facial/cadastrar
          → servidor armazena apenas bytes criptografados

DIGITAL:
  Browser → simplewebauthn.startRegistration() → hardware biométrico do dispositivo
          → credencial assinada (chave pública) → POST /api/auth/biometria/digital/cadastrar
          → servidor armazena apenas a chave PÚBLICA (dado não sensível)
          → chave PRIVADA nunca sai do hardware do dispositivo
```

---

## Consequências

**Vantagens:**
- Nenhuma biblioteca paga ou serviço externo
- Dados biométricos brutos nunca chegam ao servidor
- WebAuthn é resistente a phishing por design (bound to origin)
- Consentimento rastreável via tabela LGPD existente

**Limitações:**
- Reconhecimento facial: requer câmera com boa iluminação; não funciona offline (modelos ~3MB para carregar)
- WebAuthn: não funciona em browsers muito antigos (IE, Safari < 14)
- Digital: depende de hardware disponível no dispositivo
- O descritor facial pode degradar com mudanças físicas significativas (envelhecimento, óculos, barba)
