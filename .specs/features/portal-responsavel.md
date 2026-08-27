# Spec: Portal do Responsável

## Objetivo

Oferecer ao responsável legal (pai/mãe/guardião) um portal de autoatendimento vinculado ao(s) estudante(s) sob sua responsabilidade. O acesso é restrito a usuários com role `pai_responsavel`.

## Regras de Acesso

- Role `pai_responsavel` obrigatória para acesso funcional ao portal
- **Administrador** (`usuarios:manage` ou `roles:manage`) também vê o menu "Portal do Responsável" para ajuste e teste — sem vínculo com estudantes, a página exibirá lista vazia
- A lista de estudantes vinculados é obtida via tabela `responsaveis_estudantes` (junction: usuário → estudante)
- O responsável só visualiza dados dos estudantes vinculados a ele
- O responsável **sempre pode dar ciência** em ocorrências (sem restrição de idade, diferente do portal estudante)
- Vínculos são gerenciados por coordenadores/equipe gestora via `/api/gestao-responsaveis`

## Funcionalidades

### 1. Dados do Estudante

- Foto do estudante (GET /api/fotos/:usuarioId)
- Dados pessoais da matrícula
- Carteira de estudante vigente com QR Code (se status `ativa`)

### 2. Ocorrências

- Listar ocorrências do estudante vinculado
- Dar ciência em ocorrências (sem restrição de idade)

### 3. Cartão de Saída

- Solicitar cartão de saída para o estudante (POST /api/portal-responsavel/cartao-saida)
- Campos: `estudanteId`, `dataSaida`, `horarioSaida` (opcional), `motivo` (opcional)
- Fluxo: `pendente` → `aprovado`/`recusado` (por coordenador)
- Se aprovado: gera QR Code com token HMAC-SHA256 assinado
- Listagem de solicitações anteriores com status

### 4. Atestados Médicos

- Enviar atestado médico para o estudante vinculado
- Arquivo: PDF ou imagem (max 5MB), convertido para base64 no frontend
- Armazenamento: criptografado com AES-256-CBC (ENCRYPTION_KEY) antes de salvar em bytea
- Campos: `estudanteId`, `dataInicio`, `dataFim` (opcional), arquivo
- Listagem de atestados enviados
- Download via `/api/portal-responsavel/atestados/:id/download`
- LGPD art. 11: dado de saúde = dado sensível — armazenamento sempre criptografado

## Schema de Dados

### responsaveis_estudantes
```
id              uuid PK
usuario_id      uuid FK → usuarios (responsável)
estudante_id    uuid FK → estudantes
criado_em       timestamptz
criado_por_id   uuid FK → usuarios (quem criou o vínculo)
UNIQUE (usuario_id, estudante_id)
```

### cartoes_saida
```
id                   uuid PK
estudante_id         uuid FK → estudantes
responsavel_id       uuid FK → usuarios
data_saida           date NOT NULL
horario_saida        time
motivo               varchar(300)
status               varchar(20) CHECK ('pendente','aprovado','recusado') DEFAULT 'pendente'
aprovado_por_id      uuid FK → usuarios
aprovado_em          timestamptz
observacao_aprovador varchar(300)
token                varchar(400)   -- preenchido ao aprovar
criado_em            timestamptz
atualizado_em        timestamptz
```

### atestados_medicos
```
id               uuid PK
estudante_id     uuid FK → estudantes
responsavel_id   uuid FK → usuarios
data_inicio      date NOT NULL
data_fim         date
nome_arquivo     varchar(200)
mime_type        varchar(60)
tamanho_bytes    integer
iv               char(24)          -- IV AES-256-CBC em base64
hash_integridade char(64)          -- SHA-256 do conteúdo original
dados            bytea             -- arquivo criptografado
criado_em        timestamptz
atualizado_em    timestamptz
```

## API Endpoints

### Portal do Responsável (`/api/portal-responsavel`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /me | Dados do responsável + lista de estudantes vinculados |
| GET | /ocorrencias?estudanteId= | Ocorrências do estudante |
| POST | /ocorrencias/:id/ciencia | Dar ciência |
| GET | /carteiras?estudanteId= | Carteiras do estudante |
| POST | /cartao-saida | Solicitar cartão de saída |
| GET | /cartao-saida?estudanteId= | Listar solicitações |
| POST | /atestado | Enviar atestado médico |
| GET | /atestados?estudanteId= | Listar atestados |
| GET | /atestados/:id/download | Baixar atestado (decriptografado) |

### Gestão (coordenadores) (`/api/gestao-responsaveis`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | / | Listar vínculos responsável↔estudante |
| POST | / | Criar vínculo |
| DELETE | /:id | Remover vínculo |
| GET | /cartoes-saida | Listar solicitações de saída |
| POST | /cartoes-saida/:id/aprovar | Aprovar cartão |
| POST | /cartoes-saida/:id/recusar | Recusar cartão |
| GET | /atestados-medicos | Listar atestados (metadados) |
| GET | /atestados-medicos/:id/download | Baixar atestado |

## Token do Cartão de Saída

- Gerado via HMAC-SHA256 com SESSION_SECRET
- Payload: `cartao_saida:{id}:{estudanteId}:{dataSaida}:{timestamp}`
- Armazenado na coluna `token` ao aprovar
- QR Code exibido no frontend com biblioteca `qrcode`

## LGPD e Segurança

- Atestados médicos = dados sensíveis (art. 11 LGPD) → criptografia obrigatória
- ENCRYPTION_KEY (AES-256) usada para criptografar antes do armazenamento
- IV único por arquivo (aleatório, armazenado em base64)
- Hash de integridade SHA-256 armazenado para verificação
- Apenas o responsável e coordenadores podem acessar os atestados do estudante vinculado

## Arquivos-chave

| Arquivo | Responsabilidade |
|---------|-----------------|
| `lib/db/src/schema/responsaveis-estudantes.ts` | Junction table responsável↔estudante |
| `lib/db/src/schema/cartoes-saida.ts` | Solicitações de cartão de saída |
| `lib/db/src/schema/atestados-medicos.ts` | Atestados médicos (criptografados) |
| `artifacts/api-server/src/routes/portal-responsavel.ts` | API do portal do responsável |
| `artifacts/api-server/src/routes/gestao-responsaveis.ts` | API de gestão (coordenadores) |
| `artifacts/seshat/src/pages/portal-responsavel/index.tsx` | UI do portal |
| `scripts/migrate-responsaveis.sql` | DDL das tabelas |
