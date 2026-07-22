# Ciclo Completo de Inicialização — Carômetro Dev

---

## Primeira vez (setup inicial)

### 1. Pré-requisitos instalados no Mac
- Docker Desktop rodando
- VSCode com extensão **Dev Containers** (`ms-vscode-remote.remote-containers`)

### 2. Clonar o repositório

```bash
git clone https://github.com/fernandofcursos/carometro.git
cd carometro
git checkout claude/wonderful-feynman-Klc3C
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite `.env` com as credenciais reais:

```env
DATABASE_URL=postgresql://usuario:senha@host.neon.tech/neondb?sslmode=require
SESSION_SECRET=string-aleatoria-com-minimo-32-caracteres
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
NODE_ENV=development
REPL_ID=
```

### 4. Abrir no Dev Container

No VSCode:
1. `File → Open Folder` → selecione a pasta `carometro`
2. Clique em **"Reopen in Container"** no popup
   - Ou: `Cmd+Shift+P` → **Dev Containers: Reopen in Container**
3. Aguarde o build da imagem Docker (~2–5 min na primeira vez)
4. O VSCode reconecta dentro do container Linux

### 5. Instalar dependências (apenas na primeira vez)

No terminal do container:

```bash
pnpm install
```

### 6. Aplicar schema no banco

```bash
pnpm --filter @workspace/db run push-force
```

### 7. Criar usuário administrador

```bash
pnpm --filter @workspace/api-server run seed-admin admin@escola.edu.br
```

**Copie imediatamente** o Código de Acesso e a Senha exibidos — não são recuperáveis.

---

## Uso diário (container já criado)

### 1. Abrir o projeto no VSCode

No Mac:
1. Abra o VSCode
2. `File → Open Recent` → selecione `carometro`
3. Clique em **"Reopen in Container"** se aparecer o popup
   - Ou: `Cmd+Shift+P` → **Dev Containers: Reopen in Container**
4. Aguarde reconexão (~15–30s)

### 2. Atualizar o código

No terminal do container:

```bash
git pull origin claude/wonderful-feynman-Klc3C
```

> Se houver conflito com arquivos locais:
> ```bash
> git stash
> git pull origin claude/wonderful-feynman-Klc3C
> git stash pop
> ```

### 3. Subir os servidores

Abra **dois terminais** no VSCode (`+` no painel de terminais ou `Cmd+\``):

**Terminal 1 — API (porta 8080):**
```bash
PORT=8080 pnpm --filter @workspace/api-server run dev
```
Aguarde: `api-server listening on port 8080`

**Terminal 2 — Frontend (porta 5000):**
```bash
pnpm --filter @workspace/carometro run dev
```
Aguarde: `➜ Local: http://localhost:5000/`

### 4. Acessar o sistema

Abra no browser: **http://localhost:5000**

---

## Primeiro login

1. Informe o **Código de Acesso** ou e-mail do administrador
2. Informe a **Senha gerada** pelo seed
3. Um dialog de **"Defina sua nova senha"** aparecerá — é obrigatório no primeiro acesso
4. Preencha a senha atual (gerada) e defina uma nova (mínimo 6 caracteres)
5. O dashboard aparecerá após confirmar

---

## Recuperação de senha

Caso esqueça a senha:

1. Na tela de login, clique em **"Esqueci minha senha"**
2. Informe o e-mail cadastrado e clique em **"Solicitar token"**
3. Copie o token exibido no **log do terminal da API** (linha `[recuperacao] token para ...`)
4. Cole o token no campo, defina a nova senha e confirme

---

## Encerrar o sistema

### Parar os servidores
Em cada terminal onde estão rodando:
```
Cmd+C
```

### Sair do container (3 opções)

| Opção | Comando | Efeito |
|---|---|---|
| Fechar janela | `Cmd+W` | Container continua rodando em background |
| Parar container | `Cmd+Shift+P` → **Stop Current Container** | Container para, dados preservados |
| Abrir local | `Cmd+Shift+P` → **Reopen Folder Locally** | Sai do container, abre no Mac |

### Parar via terminal do Mac (fora do container)

```bash
cd carometro
docker compose stop dev      # para o container
docker compose down          # para e remove o container (dados preservados)
```

---

## Retomar após reiniciar o Mac

1. Inicie o **Docker Desktop** e aguarde inicializar
2. Abra o VSCode → `File → Open Recent` → `carometro`
3. `Cmd+Shift+P` → **Dev Containers: Reopen in Container**
4. Aguarde reconexão (~15–30s)
5. No terminal, suba os servidores (veja "Uso diário → passo 3")

---

## Comandos de referência rápida

```bash
# Instalar dependências
pnpm install

# Aplicar schema no banco
pnpm --filter @workspace/db run push-force

# Criar/recriar administrador
psql $DATABASE_URL -c "DELETE FROM usuarios;"
pnpm --filter @workspace/api-server run seed-admin admin@escola.edu.br

# Subir API (porta 8080)
PORT=8080 pnpm --filter @workspace/api-server run dev

# Subir frontend (porta 5000)
pnpm --filter @workspace/carometro run dev

# Rodar testes
pnpm --filter @workspace/api-server run test

# Verificar TypeScript
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/carometro run typecheck

# Matar processo travado na porta 5000
kill $(lsof -ti :5000)

# Verificar usuário no banco
psql $DATABASE_URL -c "SELECT codigo_acesso, primeiro_acesso FROM usuarios;"
```

---

## Solução de problemas rápidos

| Sintoma | Solução |
|---|---|
| `Port 5000 is already in use` | `kill $(lsof -ti :5000)` |
| `Port 8080 is already in use` | `kill $(lsof -ti :8080)` |
| `EMFILE: too many open files` | `pkill -f node && ulimit -n 65536` |
| `connect ECONNREFUSED 127.0.0.1:5432` | Verificar `DATABASE_URL` no `.env` |
| `connect ECONNREFUSED localhost:8080` | API não está rodando — subir no Terminal 1 |
| Login retorna "Identificador ou senha inválidos" | Recriar usuário com seed-admin |
| Tela em branco após login | Hard reload: `Cmd+Shift+R` |
| Container reconectando em loop | `Cmd+Shift+P` → **Rebuild and Reopen in Container** |
