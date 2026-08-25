# Skill: Enturmação — Matrículas de Estudantes

## Conceito

Enturmação = vincular um `usuario` (role `estudante`) a uma `turma` (curso + período).
Cada vínculo é uma **matrícula** na tabela `matriculas`.

## Menu

```
Grupo: "Enturmação"  (canManageEstudantes = hasAny("estudantes:manage"))
└── "Estudantes" → /enturmacao
```

Não há item "Estudantes" separado neste grupo — a página de enturmação É a tela de estudantes.

## Regras de Negócio

| Regra | Detalhe |
|---|---|
| **Um curso** | Estudante só pode estar em **um único curso**. Validado em `POST /api/matriculas` |
| **Sem dois cursos simultâneos** | Bloqueia enturmação em curso diferente do atual → 422 |
| **Disciplinas do semestre atual** | Pode cursar uma ou mais; sem restrição adicional |
| **Disciplina de semestre anterior** | Uma única, em **turno contrário** ao da turma principal; validada em `usuario_disciplinas` |
| **Registro** | varchar(20), somente dígitos, fornecido externamente |

## Schema (`lib/db/src/schema/matriculas.ts`)

```typescript
matriculasTable: {
  id, usuarioId (FK → usuarios, restrict),
  turmaId (FK → turmas, restrict),
  registro (varchar 20, NOT NULL),
  ano (integer NOT NULL), semestre (smallint NOT NULL, CHECK IN (1,2)),
  ativo (boolean, default true),
  criadoEm, atualizadoEm, deletadoEm
  UNIQUE (usuarioId, turmaId, ano, semestre)
}
```

## POST /api/matriculas — fluxo

```
1. insertMatriculaSchema.parse(req.body)
2. Busca cursoId da turmaAlvo (JOIN turmas → cursos)
3. Busca matrículas ativas do estudante (WHERE deletadoEm IS NULL)
4. Extrai cursos distintos das matrículas ativas
5. Se cursosAtivos contém curso diferente → 422
6. db.insert(matriculasTable).values({ ...data, principal: true })
```

## Tratamento de Erros — `matriculaErrorMessage(err)`

| Trigger | Status | Mensagem |
|---|---|---|
| ZodError `registro` | 400 | "Registro inválido — deve ser numérico e ter no máximo 20 dígitos." |
| ZodError `semestre` | 400 | "Semestre deve ser 1 ou 2." |
| Turma não encontrada | 400 | "Turma não encontrada." |
| Outro curso ativo | 422 | "Este estudante já está enturmado em '...'." |
| 23505 / uq_matricula | 409 | "Este estudante já está enturmado nesta turma neste semestre." |
| Outros | 500 | "Erro interno ao salvar a enturmação." |

## Frontend (`artifacts/seshat/src/pages/enturmacao/index.tsx`)

- `EnturmacaoPage`: lista de estudantes com busca local
- `EstudanteCard`: accordion — matrículas ativas + `MatriculaForm`
- `MatriculaForm`: Turma + Registro (somente dígitos) + Ano + Semestre
- Remoção via AlertDialog → `DELETE /api/matriculas/:id`
- `apiMsg(err, fallback)`: extrai `err.data?.error` para exibir no toast

## Cópia de senha — tratamento de erro obrigatório

`NovoUsuarioDialog` usa `navigator.clipboard.writeText()`. Sempre incluir `.catch()` para evitar "Uncaught (in promise)" quando o clipboard é bloqueado por extensão, foco perdido ou contexto inseguro:

```typescript
navigator.clipboard.writeText(senhaGerada)
  .then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); })
  .catch(() => {}); // silencioso — não há ação alternativa necessária
```

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/matriculas.ts` | Schema + insertMatriculaSchema |
| `artifacts/api-server/src/routes/matriculas.ts` | Lógica de negócio + erros |
| `artifacts/api-server/src/index.ts` | Registra `/api/matriculas` |
| `artifacts/seshat/src/pages/enturmacao/index.tsx` | UI accordion |
| `artifacts/seshat/src/App.tsx` | Rota `/enturmacao` |
| `artifacts/seshat/src/components/layout.tsx` | Menu |
| `scripts/migrate-matriculas.sql` | DDL da tabela |
| `.specs/features/enturmacao.md` | Spec completa |
