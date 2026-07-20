# Spec: RBAC (Roles e Permissões)

**Agente responsável:** Ares  
**Status:** Parcialmente implementado (seed ✅, rotas /roles e /usuarios pendentes)

## Modelo

```
Usuario ──< UsuarioRole >── Role ──< RolePermissao >── Permissao
                                                           │
                                                     recurso:acao
```

## Guards

Todo endpoint protegido usa dois middlewares em sequência:
1. `requireAuth` — valida JWT, popula `req.usuarioId`
2. `requirePermissao("recurso:acao")` — verifica se o usuário tem a permissão

O middleware busca permissões via JOIN: `usuarios_roles → roles_permissoes → permissoes`.

## GET /api/roles

Lista todos os roles com suas permissões.  
**Requer:** `roles:manage`

## POST /api/roles

Cria novo role.  
**Requer:** `roles:manage`  
**Entrada:** `{ nome: string; descricao?: string }`

## PUT /api/roles/:id/permissoes

Substitui as permissões de um role.  
**Requer:** `roles:manage`  
**Entrada:** `{ permissaoIds: string[] }`

## DELETE /api/roles/:id

Exclui role se não houver usuários vinculados.  
**Requer:** `roles:manage`  
**Erro:** `409` se role tem usuários ativos

## Casos de Teste

- [ ] Rota sem `requirePermissao` retorna dados para qualquer usuário autenticado ❌ (não deve existir)
- [ ] `requirePermissao("roles:manage")` com usuário sem essa permissão → 403
- [ ] `requirePermissao("roles:manage")` com administrador → 200
- [ ] Seed cria 14 permissões vinculadas ao role `administrador`
