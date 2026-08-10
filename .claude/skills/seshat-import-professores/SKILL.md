# Skill: Import Professores

Feature de importação em lote de professores no Seshat, com criação de usuários e vínculos de disciplinas.

## Endpoint

`POST /api/import/professores` — permissão `import:execute`

## Template CSV

```csv
nome,email,disciplinaNome,cursoNome,turnoNome
Ana Silva,ana@escola.edu.br,Programação Web,Técnico em Informática,Manhã
```

## Arquivos-chave

- Rota: `artifacts/api-server/src/routes/import.ts` (handler `POST /professores`)
- Frontend: `artifacts/seshat/src/pages/importar/index.tsx` (card "3. Importar Professores")
- Schema usuário: `lib/db/src/schema/usuarios.ts`
- Schema vínculo: `lib/db/src/schema/usuario-disciplinas.ts`
- Referência criação usuário: `artifacts/api-server/src/scripts/seed-admin.ts`
- Spec: `.specs/features/import-professores.md`

## Regras

1. Lookup oferta de disciplina via (disciplinaNome + cursoNome + turnoNome)
2. Lookup usuário por `emailHash` = SHA-256(email.toLowerCase())
3. Se não existe: criar usuário com `nome`, email criptografado AES-256-CBC, `codigoAcesso` aleatório, `primeiroAcesso: true`
4. Garantir role `professor` no usuário (`onConflictDoNothing`)
5. Upsert em `usuario_disciplinas` (usuarioId, disciplinaOfertaId) — `onConflictDoNothing`

## Dependências

- Role `professor` deve existir (criada pelo `seed-admin`)
- Disciplina e oferta (disciplina+curso+turno) devem existir antes

## Casos de Uso Comuns

- Professor já existe mas falta vínculo: o import detecta pelo emailHash e apenas vincula
- Adicionar professor a múltiplas disciplinas: repetir o email em múltiplas linhas com disciplinas diferentes
- Redefinir senha: não é responsabilidade do import — usuário usa `primeiroAcesso` flow
