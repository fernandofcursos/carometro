# Feature: Gestão de Usuários

> Athena aprovado | Status: implementado

## Objetivo

CRUD de usuários do sistema com suporte a roles, disciplinas, foto e credenciais temporárias.

## Endpoints

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| `GET` | `/api/usuarios` | `usuarios:read` | Listar usuários |
| `POST` | `/api/usuarios` | `usuarios:manage` | Criar usuário |
| `GET` | `/api/usuarios/:id` | `usuarios:read` | Buscar usuário |
| `PATCH` | `/api/usuarios/:id` | `usuarios:manage` | Atualizar usuário |
| `DELETE` | `/api/usuarios/:id` | `usuarios:manage` | Excluir usuário |
| `GET` | `/api/usuarios/:id/foto` | autenticado | Servir foto descriptografada |
| `POST` | `/api/usuarios/:id/foto` | `usuarios:manage` | Salvar foto |

## Regras de Negócio

### Criação (POST /api/usuarios)
- Campo obrigatório: `email`
- Campos opcionais: `nome`, `dataNascimento`, `roleIds[]`, `disciplinaOfertaIds[]`
- E-mail armazenado criptografado (AES-256-CBC); indexado por hash SHA-256
- **E-mail duplicado → HTTP 400: "O e-mail informado já está cadastrado para outro usuário."**
- Senha e código de acesso gerados automaticamente (temporários)
- `primeiroAcesso: true` — usuário deve trocar a senha no primeiro login
- E-mail de boas-vindas enviado de forma assíncrona (não bloqueia a resposta)

### Validação de roles
- Roles de estudante exigem `dataNascimento`
- Roles incompatíveis entre si retornam HTTP 422 com mensagem descritiva

### Seleção de Disciplinas para Estudantes

Ao criar ou editar um usuário com role `estudante`, o painel exibe um **modal de seleção de disciplinas** com as seguintes regras:

| Regra | Detalhe |
|---|---|
| **Agrupamento** | Disciplinas exibidas agrupadas por **Curso** e depois por **Turno** |
| **Opção padrão** | **"Todas as disciplinas"** é o valor padrão — seleciona todas as disciplinas disponíveis do curso |
| **Seleção individual** | O usuário pode desmarcar "Todas" e selecionar disciplinas específicas via checkbox |
| **Toggle "Todas"** | Marcar "Todas as disciplinas" seleciona automaticamente todas do grupo Curso/Turno; desmarcar remove a seleção em bloco |
| **Persistência** | Disciplinas salvas via `disciplinaOfertaIds[]` no POST/PATCH ou via `PUT /api/usuario-disciplinas` (bulk) |

**Estrutura visual do modal:**

```
Modal: Selecionar Disciplinas

▸ Técnico em Informática
  ▸ Manhã
    [✓] Todas as disciplinas
    [✓] Programação Web
    [✓] Banco de Dados
  ▸ Tarde
    [ ] Redes de Computadores

▸ Técnico em Administração
  ▸ Noite
    [ ] Todas as disciplinas
    [ ] Contabilidade
```

> A opção "Todas as disciplinas" por grupo Curso/Turno é um atalho de seleção — não é uma entidade salva no banco; resulta em múltiplos registros em `usuario_disciplinas`, um por disciplina do grupo.

### Foto
- Armazenada criptografada (AES-256-CBC) em `bytea` no banco
- Tamanho máximo: ~3.7 MB (base64 ~5 MB)
- Hash de integridade SHA-256 verificado na leitura

## Erros e Códigos HTTP

| Situação | Status | Mensagem |
|----------|--------|---------|
| E-mail já cadastrado | 400 | "O e-mail informado já está cadastrado para outro usuário." |
| Role incompatível | 422 | mensagem descritiva da regra violada |
| Foto muito grande | 413 | "Foto muito grande. Máximo: ~3.7MB" |
| Usuário não encontrado | 404 | "Usuário não encontrado" |
| Excluir próprio usuário | 400 | "Não é possível excluir o próprio usuário" |

## Casos de Teste

- POST sem auth → 401
- POST sem permissão → 403
- POST com e-mail duplicado → 400 com mensagem amigável
- POST válido → 201 com `usuario` + `senhaGerada`
- POST com roleIds de estudante sem dataNascimento → 422
