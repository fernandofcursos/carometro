# Guia de Desenvolvimento — Carômetro no VSCode Dev Container

Passo a passo completo: desde a primeira execução até encerrar o ambiente corretamente.

---

## Pré-requisitos (instalar uma vez)

| Ferramenta | Versão mínima |
|---|---|
| Docker Desktop | 4.x |
| VSCode | 1.85+ |
| Extensão **Dev Containers** | `ms-vscode-remote.remote-containers` |

---

## Parte 1 — Primeira execução

### 1.1 Clonar o repositório

```bash
git clone https://github.com/fernandofcursos/carometro.git
cd carometro
git checkout claude/wonderful-feynman-Klc3C
```

### 1.2 Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite `.env` com os valores reais:

```env
DATABASE_URL=postgresql://usuario:senha@host.neon.tech/carometro?sslmode=require
SESSION_SECRET=uma-string-aleatoria-com-pelo-menos-32-caracteres
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
NODE_ENV=development
REPL_ID=
```

> O arquivo `.env` está no `.gitignore`. Nunca commite credenciais reais.

### 1.3 Abrir no Dev Container

1. Abra a pasta `carometro` no VSCode (`File → Open Folder`)
2. Clique em **"Reopen in Container"** no popup que aparecer
   - Alternativa: `Cmd+Shift+P` → **Dev Containers: Reopen in Container**
3. O Docker vai buildar a imagem (~2–5 min na primeira vez)
4. O VSCode reconectará dentro do container Linux

---

## Parte 2 — Criar o usuário administrador

> Execute estes passos **dentro do terminal do Dev Container** (o terminal do VSCode após conectar).

### 2.1 Instalar dependências

```bash
pnpm install
```

### 2.2 Aplicar o schema no banco

```bash
pnpm --filter @workspace/db run push-force
```

Se o comando travar, verifique se o `DATABASE_URL` está carregado:

```bash
echo $DATABASE_URL
```

Se estiver vazio, carregue manualmente:

```bash
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d= -f2-)
pnpm --filter @workspace/db run push-force
```

### 2.3 Criar o administrador inicial

```bash
pnpm --filter @workspace/api-server run seed-admin admin@escola.edu.br
```

Substitua `admin@escola.edu.br` pelo e-mail desejado. A saída exibirá:

```
✅  Administrador criado com sucesso!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   E-mail          : admin@escola.edu.br
   Código de Acesso: XXXX-XXXX
   Senha gerada    : xxxxxxxx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   No primeiro login você deverá definir uma nova senha.
```

**Guarde o Código de Acesso e a Senha gerada.** Eles não são recuperáveis.

### 2.4 Recriar administrador (se precisar resetar)

```bash
psql $DATABASE_URL -c "DELETE FROM usuarios;"
pnpm --filter @workspace/api-server run seed-admin admin@escola.edu.br
```

---

## Parte 3 — Subir o sistema em desenvolvimento

> Abra dois terminais no VSCode: `Cmd+\`` ou clique em **+** no painel de terminais.

### Terminal 1 — API (porta 8080)

```bash
pnpm --filter @workspace/api-server run dev
```

Aguarde aparecer: `api-server listening on port 8080`

### Terminal 2 — Frontend (porta 5000)

```bash
pnpm --filter @workspace/carometro run dev
```

Aguarde aparecer: `➜ Local: http://localhost:5000/`

### Verificar se está funcionando

```bash
curl http://localhost:8080/api/healthz
# Deve retornar: {"status":"ok"}
```

Acesse no browser: **http://localhost:5000**

---

## Parte 4 — Primeiro login

1. Acesse `http://localhost:5000`
2. No campo **E-mail ou Código de Acesso**, insira o e-mail ou o Código de Acesso gerado pelo seed
3. No campo **Senha**, insira a senha gerada
4. Clique em **Entrar**
5. Um dialog de **"Defina sua nova senha"** aparecerá (primeiro acesso obrigatório)
6. Preencha:
   - **Senha atual:** a senha gerada pelo seed
   - **Nova senha:** mínimo 6 caracteres
   - **Confirmar nova senha:** repetir a nova senha
7. Clique em **Alterar senha e continuar**
8. O dashboard e o menu lateral aparecerão

---

## Parte 5 — Comandos úteis durante o desenvolvimento

```bash
# Rodar testes unitários (53 testes)
pnpm --filter @workspace/api-server run test

# Verificar TypeScript do backend
pnpm --filter @workspace/api-server run typecheck

# Verificar TypeScript do frontend
pnpm --filter @workspace/carometro run typecheck

# Ver usuários no banco
psql $DATABASE_URL -c "SELECT codigo_acesso, criado_em FROM usuarios;"

# Se a porta 5000 já estiver em uso
kill $(lsof -ti :5000)
```

---

## Parte 6 — Encerrar o sistema corretamente

### 6.1 Parar os servidores

Em cada terminal onde os servidores estão rodando:

```
Cmd+C
```

### 6.2 Sair do Dev Container

No VSCode:

- **Opção A (mantém container):** Feche apenas a janela do VSCode (`Cmd+W`)
  - O container continua rodando em background
  - Na próxima vez, o VSCode reconecta automaticamente

- **Opção B (para o container):** `Cmd+Shift+P` → **Dev Containers: Stop Current Container**
  - O container para mas os dados do banco (volume Docker) são preservados

- **Opção C (abre localmente):** `Cmd+Shift+P` → **Dev Containers: Reopen Folder Locally**

### 6.3 Parar o Docker via terminal (fora do container)

```bash
# Parar apenas o container dev
docker compose stop dev

# Parar todos os containers do projeto
docker compose down

# Parar e remover volumes (apaga dados do banco local)
docker compose down -v
```

---

## Parte 7 — Retomar após reiniciar o Mac

1. Inicie o **Docker Desktop**
2. Abra o VSCode na pasta `carometro`
3. Clique em **"Reopen in Container"** — o container reinicia automaticamente
4. Aguarde a reconexão (~30s)
5. No terminal, verifique se o banco está acessível:
   ```bash
   echo $DATABASE_URL
   ```
6. Suba os servidores (Parte 3)

> Se o `DATABASE_URL` estiver vazio após reconectar, o `.env` não foi recarregado.
> Execute: `export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d= -f2-)`

---

## Referência rápida

| O que fazer | Comando |
|---|---|
| Subir API | `pnpm --filter @workspace/api-server run dev` |
| Subir Frontend | `pnpm --filter @workspace/carometro run dev` |
| Aplicar schema | `pnpm --filter @workspace/db run push-force` |
| Criar admin | `pnpm --filter @workspace/api-server run seed-admin email@x.com` |
| Rodar testes | `pnpm --filter @workspace/api-server run test` |
| Parar porta travada | `kill $(lsof -ti :5000)` |
| Parar container | `docker compose stop dev` |
