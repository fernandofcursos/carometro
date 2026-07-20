# Spec: Autenticação

**Agente responsável:** Ares (segurança) + Hermes (implementação)  
**Status:** Implementado ✅

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
5. Exibe o token no console/log (ambiente dev) — em produção seria enviado por e-mail
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

## Casos de Teste

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
