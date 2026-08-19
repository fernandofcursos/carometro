# Constituição do Seshat

> Regras invioláveis. Qualquer mudança exige revisão explícita da Athena (arquiteta).

## 1. Propósito

O Seshat é um sistema de gestão escolar para registro fotográfico de estudantes, controle de turmas, ocorrências e geração de relatórios. Destina-se a escolas públicas e privadas com foco em segurança, rastreabilidade e conformidade com a LGPD.

## 2. Princípios Invioláveis

### 2.1 Segurança por design
- Credenciais (DATABASE_URL, SESSION_SECRET, tokens Neon) **nunca** são commitadas no repositório.
- E-mails de usuários são armazenados criptografados com AES-256-CBC. O hash SHA-256 é usado para buscas.
- Fotos de estudantes são armazenadas em bytea criptografado no banco.
- Todas as rotas protegidas exigem `requireAuth` + `requirePermissao`.

### 2.2 Spec antes do código
- Nenhuma rota existe sem uma spec em `.specs/features/`.
- Nenhuma decisão arquitetural significativa existe sem um ADR em `.specs/decisions/`.
- Nenhuma spec existe sem um teste que a prove.

### 2.3 Rastreabilidade
- Toda operação de escrita (INSERT, UPDATE, DELETE) gera um registro em `auditoria_logs`.
- O campo `usuarioId` em auditoria nunca é nulo quando há sessão ativa.

### 2.4 LGPD
- Usuários têm direito de acesso, retificação e exclusão dos próprios dados.
- Estudantes menores de idade: dados tratados com base no legítimo interesse educacional.
- Consentimentos registrados na tabela `lgpd_consentimentos`.

## 3. Stack Canônica

| Camada | Tecnologia |
|--------|-----------|
| Monorepo | pnpm workspaces |
| Backend | Express 5 + TypeScript |
| ORM | Drizzle ORM |
| Banco | PostgreSQL (Neon cloud) |
| Auth | JWT em httpOnly cookie |
| Frontend | React 19 + Vite 7 + TanStack Query |
| UI | shadcn/ui + Tailwind |
| Codegen | Orval (OpenAPI → hooks + Zod) |

## 4. Permissões Canônicas

Formato: `recurso:acao`

| Permissão | Descrição |
|-----------|-----------|
| `carometro:view` | Ver grid de fotos |
| `estudantes:view` | Listar estudantes |
| `estudantes:manage` | CRUD de estudantes |
| `usuarios:manage` | CRUD de usuários |
| `roles:manage` | Gerenciar papéis/permissões |
| `cursos:manage` | CRUD de cursos |
| `turnos:manage` | CRUD de turnos |
| `turmas:manage` | CRUD de turmas |
| `disciplinas:manage` | CRUD de disciplinas |
| `ocorrencias:view` | Ver relatório |
| `ocorrencias:create` | Registrar ocorrência |
| `tipos-ocorrencias:manage` | CRUD de tipos |
| `import:execute` | Importar XLSX |
| `auditoria:view` | Ver logs |

## 6. Premissas de Plataforma

- **Sistema web** — acessível exclusivamente via browser, sem cliente nativo instalável além do PWA
- **PWA obrigatório** — o frontend deve ser instalável como Progressive Web App em qualquer dispositivo (desktop, tablet, celular)
- **Suporte a mobile** — layout responsivo para tablets e celulares; orientação portrait como padrão para mobile
- **Modo offline** — operações de leitura funcionam com cache local (Workbox); mutações offline são enfileiradas em localStorage e sincronizadas automaticamente ao reconectar
- **Conteinerizado** — desenvolvimento e produção rodam em containers Docker; orquestração em Kubernetes para produção quando aplicável
- **Hospedagem em nuvem** — aplicação hospedada em provedor cloud (a definir); banco de dados em Neon (PostgreSQL cloud); credenciais nunca commitadas

## 7. Convenções de Código

- Rotas: `artifacts/api-server/src/routes/<recurso>.ts`
- Schemas Drizzle: `lib/db/src/schema/<recurso>.ts`
- Páginas frontend: `artifacts/seshat/src/pages/<recurso>/index.tsx`
- Testes unitários: `tests/<recurso>.test.ts`
- Testes E2E: `tests/e2e/<fluxo>.spec.ts`
