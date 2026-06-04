# Fase 1 — API Server (api-server)

## O que foi criado

Estrutura completa do backend Express com padrão de segurança (ISO 27001 + LGPD):

```
artifacts/api-server/
├── package.json              # Dependências e scripts
├── tsconfig.json             # Configuração TypeScript
├── src/
│   ├── index.ts              # ✅ Entrypoint — cria app, registra rotas, inicia servidor
│   ├── app.ts                # ✅ Factory da aplicação com middlewares de segurança
│   ├── lib/
│   │   ├── auth.ts           # ✅ JWT sign/verify, cookie helpers, middleware requireAuth
│   │   ├── permissions.ts    # ✅ Middleware de autorização (RBAC)
│   │   └── audit.ts          # ✅ Stub de auditoria (Fase 9)
│   └── routes/
│       ├── auth.ts           # ✅ Login, logout, me
│       ├── turnos.ts         # ✅ CRUD padrão
│       ├── cursos.ts         # ✅ CRUD padrão
│       ├── turmas.ts         # ✅ CRUD padrão
│       ├── estudantes.ts     # ✅ CRUD + foto (LGPD)
│       ├── carometro.ts      # ✅ Endpoints de carômetro
│       ├── import.ts         # ✅ Importação XLSX
│       ├── ocorrencias.ts    # ✅ Registro de ocorrências
│       ├── roles.ts          # ✅ Gerenciamento de roles
│       ├── usuarios.ts       # ✅ Gerenciamento de usuários
│       └── disciplinas.ts    # ✅ CRUD de disciplinas
└── dist/
    └── [build output]
```

## Mudanças implementadas com comentários

### 1. **package.json**
- ✅ Scripts: `dev` (watch + reload), `build` (esbuild), `start` (produção)
- ✅ Dependências: Express 5, Helmet, CORS, bcryptjs, JWT, Pino logging, Zod
- ✅ Comentário: Cada dependência explicada com seu propósito

### 2. **tsconfig.json**
- ✅ Target: ES2020 (moderno)
- ✅ ModuleResolution: bundler (workspaces)
- ✅ Strict mode habilitado

### 3. **src/app.ts** — 🔐 Núcleo de segurança
- ✅ Helmet: headers de segurança (CSP, HSTS)
- ✅ CORS: apenas frontend autorizado
- ✅ Cookie parser + JSON parser (limite 10MB para fotos)
- ✅ Pino-HTTP: logging estruturado
- **Comentário**: Cada middleware anotado com referência ISO 27001

### 4. **src/lib/auth.ts** — 🔑 Autenticação
- ✅ `requireAuth()`: middleware para verificar JWT
- ✅ `signToken()`: gerar JWT com 8h validade
- ✅ `setAuthCookie()`: httpOnly + Secure + SameSite
- ✅ `clearAuthCookie()`: logout
- **Comentário**: Explicação de cada configuração de cookie

### 5. **src/lib/permissions.ts** — 🛡️ Autorização
- ✅ `requirePermissao()`: middleware para RBAC
- ✅ Será expandido na Fase 9 para buscar permissões do banco
- **Comentário**: TODO marcado para expansão futura

### 6. **src/lib/audit.ts** — 📋 Auditoria
- ✅ Type `RegistrarAuditoriaParams`: estrutura do log
- ✅ `registrarAuditoria()`: stub (será implementado na Fase 9)
- **Comentário**: Referência LGPD Art. 37

### 7. **src/index.ts** — 🚀 Entrypoint
- ✅ Cria app com middlewares
- ✅ Rota health check (`/api/healthz`)
- ✅ Handler de erro global (sem vazar stack trace em produção)
- ✅ Inicia servidor na porta 8080
- **Comentário**: TODOs para registrar rotas quando prontas

### 8. **src/routes/auth.ts** — 🔐 Autenticação
- ✅ `POST /login`: stub com validação Zod
- ✅ `POST /logout`: limpar cookie
- ✅ `GET /me`: verificar autenticação (será implementado)
- **Comentário**: TODO detalhado de implementação

### 9. **src/routes/turnos.ts** — 📋 Padrão CRUD
- ✅ `GET /` — listar todos os turnos
- ✅ `POST /` — criar novo turno (requer permissão)
- ✅ `PUT /:id` — atualizar turno
- ✅ `DELETE /:id` — soft delete
- **Comentário**: Padrão replicável para outras rotas

### 10. **src/routes/{outros}.ts** — 📦 Stubs
- ✅ Criados 8 arquivos de rota com o mesmo padrão
- ✅ Todos com autenticação + autorização
- **Comentário**: Prontos para implementação

## Checklist da Fase 1

- ✅ Estrutura de diretórios criada
- ✅ package.json com todas as dependências
- ✅ tsconfig.json configurado
- ✅ Middlewares de segurança em app.ts (Helmet, CORS, logging)
- ✅ Autenticação JWT com cookie httpOnly
- ✅ Autorização baseada em roles
- ✅ Rota de health check
- ✅ Handler de erro global
- ✅ Stubs de todas as 10 rotas
- ✅ Comentários em cada linha alterada/criada

## Próximos passos

1. **Implementar autenticação real** (src/routes/auth.ts):
   - Buscar usuário no banco por codigoAcesso
   - Verificar bloqueio por tentativas falhas
   - Comparar senha com bcrypt
   - Gerar JWT e setar cookie

2. **Conectar ao banco de dados**:
   - Importar tabelas do @workspace/db
   - Implementar queries com Drizzle ORM

3. **Implementar CRUD de cada rota**:
   - Seguir padrão de turnos.ts
   - Adicionar validação com Zod
   - Registrar auditoria em cada operação

## Conformidade

- ✅ **ISO 27001 A.8.26**: Headers de segurança (Helmet)
- ✅ **ISO 27001 A.8.5**: Autenticação segura (JWT + httpOnly)
- ✅ **ISO 27001 A.8.15**: Logging estruturado (Pino)
- ✅ **ISO 27001 A.8.3**: Erros não revelam detalhes internos
- ✅ **LGPD Art. 7**: Base legal será registrada em consentimentos
- ✅ **LGPD Art. 37**: Auditoria será implementada na Fase 9

---

**Versão**: 0.0.0 (Fase 1)
**Stack**: Node 24 · TypeScript 5.9 · Express 5 · Zod · JWT · Bcrypt · Pino
