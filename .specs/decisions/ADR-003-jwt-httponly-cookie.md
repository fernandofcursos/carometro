# ADR-003: Autenticação via JWT em httpOnly Cookie

**Status:** Aceito  
**Data:** 2025

## Contexto

Precisávamos de autenticação stateless compatível com SPA React, protegida contra XSS e com suporte a múltiplos papéis (RBAC).

## Decisão

JWT armazenado em cookie `httpOnly; Secure; SameSite=Lax` com nome `session`.

Payload do JWT:
```typescript
{
  sub: string;       // usuarioId (UUID)
  activeRoleId: string;
  iat: number;
  exp: number;       // 8 horas
}
```

O frontend nunca acessa o JWT diretamente — apenas envia o cookie automaticamente em todas as requisições para `/api/`.

## Fluxo

1. `POST /api/auth/login` → valida credenciais → `res.cookie("session", jwt, { httpOnly: true, secure: true, sameSite: "lax" })`
2. Toda rota protegida: middleware `requireAuth` lê `req.cookies.session`, verifica assinatura, popula `req.usuarioId` e `req.activeRoleId`
3. `POST /api/auth/logout` → `res.clearCookie("session")`

## Consequências

**Positivo:**
- Imune a XSS (JavaScript não acessa o cookie)
- SameSite=Lax protege contra CSRF básico
- Stateless: sem session store no servidor

**Negativo:**
- Revogação imediata impossível sem blacklist (aceitável para este contexto)
- `Secure` exige HTTPS — em dev local, nginx com certificado auto-assinado é necessário para testar fora de `localhost`

## `SESSION_SECRET`

Mínimo 64 bytes aleatórios. Gerado com:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
