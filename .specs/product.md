# Produto: Carômetro

## Visão

Sistema web para escolas gerenciarem o carômetro (grid de fotos) de estudantes, turmas, ocorrências e importação de dados, com controle de acesso por papel (RBAC) e conformidade com a LGPD.

## Personas

| Persona | Papel | Necessidade Principal |
|---------|-------|-----------------------|
| Administrador | `administrador` | Configurar o sistema, gerenciar usuários e papéis |
| Secretário(a) | `secretaria` | Cadastrar estudantes, turmas, cursos e importar XLSX |
| Professor(a) | `professor` | Registrar ocorrências, visualizar carômetro da própria turma |
| Coordenador(a) | `coordenacao` | Ver todos os carômetros, relatório de ocorrências |

## Entidades Principais

```
Curso ──< Turma >── Turno
              │
              └──< Estudante >── EstudanteEmail
                        │
                        └──< Ocorrencia >── TipoOcorrencia
                                    │
                                    └── Usuario (quem registrou)

Usuario ──< UsuarioRole >── Role ──< RolePermissao >── Permissao
```

## Fluxos Críticos

### Login
1. POST /api/auth/login (email + codigoAcesso + senha)
2. Backend: hash SHA-256 do email → busca na tabela → verifica bcrypt
3. Se `primeiroAcesso = true`: redirecionar para troca de senha
4. JWT gerado → httpOnly cookie `session`
5. Retorno: AuthUser (id, roles, permissions, email descriptografado)

### Cadastro de Estudante
1. POST /api/estudantes (multipart: dados + foto)
2. Backend: AES-256-CBC na foto → salvar em bytea
3. Auditoria: INSERT em auditoria_logs

### Carômetro
1. GET /api/carometro?turmaId=&cursoId=&busca=
2. Retorna: lista de estudantes com foto (base64) + dados de turma
3. Filtros: turma, curso, nome/registro

### Importação XLSX
1. POST /api/import (multipart: arquivo .xlsx)
2. Backend: lê planilha, valida colunas, upsert estudantes
3. Retorno: { inseridos, atualizados, erros[] }

## Requisitos Não-Funcionais

- Foto: máximo 5MB após compressão, formato JPEG/PNG/WEBP
- Sessão: JWT com expiração de 8h, renovação automática
- Auditoria: 100% das operações de escrita rastreadas
- LGPD: direito de exclusão implementado via soft delete
