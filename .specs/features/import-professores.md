# Feature: Importação de Professores

> Parte do módulo de importação em lote do Seshat

## Objetivo

Importar professores em lote via CSV, criando usuários com role `professor` e vinculando-os a ofertas de disciplinas.

## Endpoint

`POST /api/import/professores`

Permissão exigida: `import:execute`

## Template CSV

```csv
nome,email,disciplinaNome,cursoNome,turnoNome
Ana Silva,ana@escola.edu.br,Programação Web,Técnico em Informática,Manhã
Carlos Souza,carlos@escola.edu.br,Banco de Dados,Técnico em Informática,Manhã
```

## Regras de Negócio

- Campos obrigatórios: `nome`, `email`, `disciplinaNome`, `cursoNome`, `turnoNome`
- Pré-requisitos: disciplina + oferta (disciplina+curso+turno) devem existir; role `professor` deve existir (via seed-admin)
- Lógica por linha:
  1. Lookup `disciplinaOfertaId` via (disciplinaNome + cursoNome + turnoNome)
  2. Lookup usuário por `emailHash` (SHA-256 do email em lowercase)
  3. Se usuário **não existe**: criar com `nome`, email criptografado (AES-256-CBC), `codigoAcesso` aleatório, senha temporária hash, `primeiroAcesso: true`
  4. Se usuário **existe**: apenas garantir role professor
  5. Vincular role `professor` ao usuário (`onConflictDoNothing`)
  6. Upsert em `usuario_disciplinas` (usuarioId, disciplinaOfertaId) — `onConflictDoNothing`
- Usuário criado deve alterar senha no primeiro acesso (`primeiroAcesso: true`)
- Retorna `{ imported, errors }`

## Casos de Teste

- POST sem auth → 401
- POST sem permissão → 403
- POST com professor novo → usuário criado + role + vínculo de disciplina
- POST com email já existente → usuário não duplicado, role garantida, vínculo upsertado
- POST com `disciplinaNome` inexistente → erro na linha
- POST com oferta (disciplina+curso+turno) inexistente → erro na linha
- POST com role `professor` ausente (seed-admin não executado) → 500
- Auditoria registrada ao final
