# ADR-002: PostgreSQL via Neon (Cloud Serverless)

**Status:** Aceito  
**Data:** 2025

## Contexto

Precisávamos de um banco PostgreSQL acessível tanto no ambiente de desenvolvimento local (macOS + VSCode Dev Container) quanto no ambiente de produção (Docker), sem gerenciar infraestrutura de banco.

## Decisão

Usar [Neon](https://neon.tech) como banco PostgreSQL serverless. A string de conexão é fornecida via variável de ambiente `DATABASE_URL`.

## Consequências

**Positivo:**
- Banco compartilhado entre desenvolvedor e produção (mesmos dados durante dev)
- Sem overhead de gerenciar PostgreSQL local
- Serverless: escala para zero quando inativo

**Negativo:**
- Dependência de rede: `pnpm --filter @workspace/db run push-force` **não pode ser executado de dentro do container remoto Claude Code** (DNS `EAI_AGAIN` — o container não tem acesso ao Neon)
- Deve ser executado localmente com `.env.local` presente
- Token Neon **nunca** deve ser commitado — se exposto, revogar imediatamente no painel Neon

## Segurança

- `DATABASE_URL` fica em `.env` (gitignored) e nas variáveis do ambiente de produção
- O `.env.example` contém placeholder: `postgresql://USER:PASSWORD@HOST/DB?sslmode=require`
