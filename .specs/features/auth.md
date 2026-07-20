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

## Casos de Teste

- [ ] Login com credenciais corretas → 200 + cookie
- [ ] Login com senha errada → 401
- [ ] Login com email não cadastrado → 401 (mesma mensagem)
- [ ] `/api/me` sem cookie → 401
- [ ] `/api/me` com cookie expirado → 401
- [ ] Troca de senha no primeiro acesso → `primeiroAcesso` vira `false`
