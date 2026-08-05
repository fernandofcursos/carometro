# Erros e Soluções — Migração para SDD

Registro dos erros encontrados durante a implementação do Spec Driven Development no projeto Carômetro.

---

## 1. TypeScript — `emitDecoratorMetadata` sem `experimentalDecorators`

**Erro:** `TS5052: Option 'emitDecoratorMetadata' cannot be specified without specifying option 'experimentalDecorators'`

**Solução:** Remover `"emitDecoratorMetadata": true` do `artifacts/api-server/tsconfig.json`.

---

## 2. drizzle-zod incompatível com Zod v3

**Erro:** `ZodObject missing _type, _parse, _getType` ao usar `createInsertSchema`.

**Causa:** `drizzle-zod ^0.8.x` requer Zod v4. O projeto usa Zod v3.

**Solução:** Fazer downgrade em `lib/db/package.json`:
```json
"drizzle-zod": "^0.7.0"
```

---

## 3. Express 5 — `req.params.id` tipado como `string | string[]`

**Erro:** `TS2769: Type 'string | string[]' is not assignable to type 'string'` em todas as rotas com parâmetros.

**Causa:** Express 5 alterou o tipo de `ParamsDictionary` para aceitar arrays.

**Solução:** Fazer cast explícito em todas as ocorrências:
```typescript
// Antes
req.params.id
// Depois
String(req.params.id)
```

---

## 4. TS7030 — Nem todos os caminhos retornam valor

**Erro:** `TS7030: Not all code paths return a value`

**Solução:** Adicionar `"noImplicitReturns": false` no `artifacts/api-server/tsconfig.json`.

---

## 5. lib/db — módulos não encontrados pelo api-server

**Erro:** `Cannot find module 'drizzle-orm/node-postgres' or 'pg'` ao compilar o api-server.

**Causa:** `lib/db` não tinha `dist/*.d.ts` gerado — o api-server tentava resolver os tipos direto do source.

**Solução:**
1. Adicionar script `"build": "tsc --build"` em `lib/db/package.json`
2. Adicionar condições `"workspace"` e `"types"` nos exports
3. Rodar `pnpm --filter @workspace/db run build` antes do typecheck

---

## 6. lib/api-client-react — TS6305: arquivo não compilado

**Erro:** `TS6305: Output file has not been built from source file`

**Solução:**
1. Excluir arquivos de teste do `tsconfig.json` do pacote
2. Adicionar `"build": "tsc --build"` no `package.json`
3. Rodar build antes do typecheck do frontend

---

## 7. Turmas — `sigla` com validação de tamanho exato

**Erro:** `String must contain exactly 10 character(s)` ao criar turma com sigla curta como "INF1A".

**Causa:** Schema usava `char("sigla", { length: 10 })` que exige exatamente 10 caracteres.

**Solução:** Alterar para `varchar("sigla", { length: 10 })` em `lib/db/src/schema/turmas.ts` e rodar `push-force`.

---

## 8. `criptografarFoto` — não aceitava base64 puro

**Erro:** Função lançava erro para strings base64 sem prefixo `data:image/...;base64,`.

**Solução:** Aceitar ambos os formatos em `artifacts/api-server/src/lib/crypto.ts`:
```typescript
const match = dadosBase64.match(/^data:(.+);base64,(.+)$/);
const mimeType = match ? match[1] : "image/jpeg";
const rawBase64 = match ? match[2] : dadosBase64;
```

---

## 9. GET /api/auditoria — resposta não era array

**Erro:** Orval gerava cliente esperando array, mas a rota retornava `{ logs, limite, total }`.

**Solução:** Alterar a rota para retornar o array diretamente:
```typescript
// Antes
res.json({ logs, limite, total: logs.length })
// Depois
res.json(logs)
```

---

## 10. seed-admin — `encryptEmail` retornava `Buffer` em vez de `string`

**Erro:** `TS2769: Type 'Buffer' is not assignable to type 'string'` ao inserir usuário.

**Causa:** O campo `emailEncrypted` usa `bytesAsString` custom type que espera `string`. A função retornava `Buffer`.

**Solução:** Converter para formato `"ivHex:encHex"` compatível com `descriptografarEmail()`:
```typescript
function encryptEmail(plaintext: string): string {
  // ...
  return iv.toString("hex") + ":" + enc.toString("hex");
}
```

---

## 11. seed-admin — import de `eq`/`and` direto de `drizzle-orm`

**Erro:** `Cannot find module 'drizzle-orm'` no contexto do script.

**Solução:** Importar de `@workspace/db` que já re-exporta os operadores:
```typescript
import { eq, and } from "@workspace/db";
```

---

## 12. Dev Container — loop de reconexão

**Causa:** Três problemas encadeados:
1. `set -e` no `entrypoint.sh` fazia o script sair quando `sudo pg_ctlcluster` falhava (sem permissão)
2. `healthcheck` verificava `localhost:5000` que nunca subia automaticamente no Dev Container
3. `devcontainer.json` sem `overrideCommand: true` — o VS Code Server não conseguia substituir o `entrypoint.sh`

**Solução:**
1. `entrypoint.sh`: `set -euo pipefail` → `set -uo pipefail`
2. `entrypoint.sh`: adicionar `-n` ao `sudo` para falhar silenciosamente
3. `docker-compose.yml`: healthcheck do serviço `dev` → `["CMD", "true"]`
4. `devcontainer.json`: adicionar `"overrideCommand": true`

---

## 13. esbuild — binário de plataforma errada

**Erro:** `The package "@esbuild/linux-x64" could not be found` (ou `@esbuild/darwin-x64`).

**Causa:** `node_modules` instalado em uma plataforma (Mac ou Linux) e copiado para outra.

**Solução:** Reinstalar dentro do ambiente correto:
```bash
rm -rf node_modules
pnpm install
```

---

## 14. Porta 5000 já em uso

**Erro:** `Error: Port 5000 is already in use`

**Causa:** O `entrypoint.sh` sobe o frontend em background; ao tentar subir manualmente a porta já está ocupada.

**Solução:**
```bash
kill $(lsof -ti :5000)
pnpm --filter @workspace/seshat run dev
```

---

## 15. DATABASE_URL apontando para localhost no container

**Erro:** `connect ECONNREFUSED 127.0.0.1:5432`

**Causa:** `.env` configurado para PostgreSQL local; o container não tem PG rodando ou não tem permissão para iniciá-lo.

**Solução:** Usar banco externo (Neon) editando o `.env` com a connection string do Neon:
```
DATABASE_URL=postgresql://usuario:senha@host.neon.tech/carometro?sslmode=require
```

---

## 16. drizzle-kit push travando no "Pulling schema"

**Causa:** `DATABASE_URL` com `localhost` apontando para banco inacessível — timeout silencioso.

**Solução:** Garantir que a variável está exportada na sessão:
```bash
unset DATABASE_URL
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d= -f2-)
cd lib/db && npx drizzle-kit push --force --config ./drizzle.config.ts
```

---

## 17. ERR_MODULE_NOT_FOUND: src/domain/errors.js ao iniciar API

**Erro:**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/src/domain/errors.js'
code: 'ERR_MODULE_NOT_FOUND'
```

**Causa:** O `tsx` com `"moduleResolution": "bundler"` no tsconfig não consegue mapear imports `.js` para arquivos `.ts` em modo ESM nativo do Node.js. Ocorre ao adicionar subdiretórios novos (ex: `src/domain/`) cujos arquivos `.ts` são importados com extensão `.js`.

**Solução:** Criar `tsconfig.dev.json` no `api-server` com `moduleResolution: node` apenas para o runtime do `tsx`, e apontar o script `dev` para esse arquivo via `TSX_TSCONFIG_PATH`:

1. Criar `artifacts/api-server/tsconfig.dev.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node"
  }
}
```

2. Editar `artifacts/api-server/package.json`:
```json
"dev": "TSX_TSCONFIG_PATH=tsconfig.dev.json tsx watch src/index.ts"
```

O `tsconfig.json` original (com `bundler`) permanece para o typecheck (`tsc --noEmit`).

---

## 18. Login retornando 500 "Erro ao fazer login"

**Erro:** POST `/api/auth/login` → HTTP 500. Log do pino não mostra o erro real (apenas `"msg":"request errored"`).

**Causa:** `ENCRYPTION_KEY` não definida no `.env`. A função `getChaveEncriptacao()` lança erro imediatamente quando a variável está ausente. O login chama essa função para descriptografar o e-mail do usuário, logo falha em 100% dos logins.

**Solução:**

1. Adicionar `ENCRYPTION_KEY` ao `.env`. Para desenvolvimento, derivar do `SESSION_SECRET` existente:
```bash
node -e "
  const { createHash } = require('crypto');
  const s = process.env.SESSION_SECRET ?? 'dev-secret-troque-em-producao-minimo-64-chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  console.log('ENCRYPTION_KEY=' + createHash('sha256').update(s).digest('hex'));
"
```

2. Adicionar ao `.env`:
```
ENCRYPTION_KEY=<valor gerado acima>
```

3. Reiniciar a API.

**Observação:** Em produção, `ENCRYPTION_KEY` e `SESSION_SECRET` DEVEM ser valores independentes. Rotacionar o JWT (SESSION_SECRET) não deve invalidar dados criptografados no banco. Gerar com:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 19. Login 500 / 401 — PostgreSQL local não iniciado no container

**Erro:**
- POST `/api/auth/login` → HTTP 500 ("Erro ao fazer login")
- Log: `DrizzleQueryError: connect ECONNREFUSED 127.0.0.1:5432`
- Console API: `[login] erro interno: ... cause: Error: connect ECONNREFUSED 127.0.0.1:5432`

**Causa:** O PostgreSQL local do container não foi iniciado. O `entrypoint.sh` era 100% manual e não subia o PG automaticamente ao abrir o Dev Container.

**Solução (automática a partir deste commit):** O `entrypoint.sh` agora inicia o PostgreSQL automaticamente quando `DATABASE_URL` aponta para `localhost` ou `127.0.0.1`. Basta reabrir o Dev Container.

**Solução manual (se ainda ocorrer):**
```bash
# Dentro do container:
su -c "pg_ctlcluster 16 main start" postgres
pg_isready  # deve mostrar "accepting connections"

# Criar banco se não existir:
su -c "psql -c \"CREATE USER carometro WITH PASSWORD 'carometro';\"
       psql -c \"CREATE DATABASE carometro OWNER carometro;\"
       psql -c \"GRANT ALL PRIVILEGES ON DATABASE carometro TO carometro;\"" postgres

# Aplicar schema:
pnpm --filter @workspace/db run push-force

# Criar admin:
pnpm --filter @workspace/api-server run seed-admin
```

**Solução alternativa (sem container):** Usar o banco Neon em `.env`:
```
DATABASE_URL=postgresql://usuario:senha@host.neon.tech/carometro?sslmode=require
```

---

## 20. Senha do admin inválida após redefinição do banco

**Sintoma:** Login retorna `401 "Identificador ou senha inválidos"` mesmo com as credenciais corretas.

**Causa:** O banco foi recriado (push-force) e o seed do admin gerou uma senha aleatória temporária exibida no terminal na criação. Se esse terminal foi fechado, a senha foi perdida.

**Solução:** Redefinir a senha via SQL (requer `pgcrypto`):
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE usuarios
SET senha_hash = crypt('NovaSenha@123', gen_salt('bf', 12)),
    tentativas_login_falhas = 0,
    bloqueado_ate = NULL,
    primeiro_acesso = false
WHERE codigo_acesso = 'SEU_CODIGO_AQUI';
```

Ou via psql de uma linha:
```bash
psql $DATABASE_URL -c "
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  UPDATE usuarios SET senha_hash = crypt('Admin@123', gen_salt('bf', 12)),
    tentativas_login_falhas = 0, bloqueado_ate = NULL, primeiro_acesso = false;
"
```

---

## 21. PostgreSQL local "Connection refused" mesmo com entrypoint corrigido

**Erro:**
```
psql: error: connection to server at "localhost" (::1), port 5432 failed: Connection refused
connection to server at "localhost" (127.0.0.1), port 5432 failed: Connection refused
```

**Causa:** O cluster existe (`pg_lsclusters` mostra `down`) mas não iniciou. O `entrypoint.sh` anterior usava `su -c` que falha silenciosamente sem TTY (comum em Dev Container / `docker exec`).

**Solução imediata (uma vez, dentro do container):**
```bash
pg_ctlcluster 16 main start
pg_isready   # deve mostrar "accepting connections"
```

**Verificar status:**
```bash
pg_lsclusters   # coluna Status deve ser "online"
```

**Solução permanente (já aplicada no entrypoint.sh):** O script agora tenta iniciar o PG com `pg_ctlcluster` direto (como root) antes de tentar `su`. Se ainda falhar, exibe o comando manual com instruções claras.

**Se o cluster não existir** (data directory vazio/corrompido):
```bash
pg_dropcluster 16 main --stop 2>/dev/null || true
pg_createcluster 16 main
pg_ctlcluster 16 main start
```

---

## 22. "Connection refused" em localhost:5432

**Erro:**
```
psql: error: connection to server at "localhost" (::1), port 5432 failed: Connection refused
connection to server at "localhost" (127.0.0.1), port 5432 failed: Connection refused
```

**Causa:** DATABASE_URL aponta para `localhost:5432` mas o PostgreSQL local não está rodando ou não existe neste ambiente (ex: cloud sem PG local).

**Solução A — iniciar o PostgreSQL local (Dev Container):**
```bash
pg_ctlcluster 16 main start
pg_isready   # deve mostrar "accepting connections"
```

**Solução B — usar banco externo (Neon cloud):**
1. Acesse https://neon.tech → crie um projeto (gratuito)
2. Copie a connection string: `postgresql://usuario:senha@ep-xxx.us-east-2.aws.neon.tech/carometro?sslmode=require`
3. Atualize `DATABASE_URL` no `.env`:
```
DATABASE_URL=postgresql://usuario:senha@ep-xxx.us-east-2.aws.neon.tech/carometro?sslmode=require
```
4. Aplique o schema e crie o admin:
```bash
pnpm --filter @workspace/db run push-force
pnpm --filter @workspace/api-server run seed-admin
```
