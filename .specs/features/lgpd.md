# Feature: LGPD — Consentimentos e Direitos dos Titulares

> Athena aprovado | Status: implementado

## Objetivo

Garantir conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018) mediante registro de consentimentos, atendimento de solicitações de acesso/retificação/exclusão e rastreabilidade completa dos tratamentos.

## Endpoints

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| `POST` | `/api/lgpd/consentimentos` | auth | Registrar/atualizar consentimento |
| `GET`  | `/api/lgpd/consentimentos/:usuarioId` | auth | Listar consentimentos do usuário |
| `POST` | `/api/lgpd/solicitacoes` | auth | Abrir solicitação de direitos |
| `GET`  | `/api/lgpd/solicitacoes` | auth | Listar solicitações do usuário |

## Regras de Negócio

- Um usuário pode ter apenas um registro por `finalidade`. O registro é atualizado via upsert.
- Solicitações têm `status` inicial `"pendente"` e são atendidas manualmente pela administração.
- Tipos de solicitação: `"acesso"`, `"retificacao"`, `"exclusao"`, `"portabilidade"`.
- Toda operação é registrada em `auditoria_logs` com `operacao: "INSERT"` ou `"UPDATE"`.
- Base legal padrão: `"consentimento"` (Art. 7, I, LGPD).

## Modelo de Dados

```
consentimentos_lgpd
  id          uuid PK
  usuarioId   uuid FK → usuarios
  finalidade  text NOT NULL  (ex: "biometric", "analytics")
  consentido  boolean NOT NULL
  versaoPolitica text DEFAULT "1.0"
  baseLegal   enum NOT NULL
  criadoEm   timestamp
  atualizadoEm timestamp
```

## Casos de Teste

- POST /api/lgpd/consentimentos sem auth → 401
- POST com dados válidos → 200, campo `consentido: true`
- POST com mesma finalidade → upsert, não duplica
- GET /api/lgpd/consentimentos/:usuarioId → array de consentimentos do usuário
- POST /api/lgpd/solicitacoes com `tipo: "exclusao"` → 201, status "pendente"
