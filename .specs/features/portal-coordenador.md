# Portal do Coordenador

## Visão Geral

Portal de autoatendimento para coordenadores de curso. O coordenador é vinculado a cursos via `coordenador_cursos` (campos: `usuarioId`, `cursoId`).

## API: `/api/portal-coordenador`

Todos os endpoints usam `requireAuth`. Filtragem sempre por `req.usuarioId`.

### Endpoints

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/me` | Dados do coordenador + cursos que coordena |
| GET | `/dashboard` | Stats, ocorrências recentes, avisos |
| GET | `/ocorrencias` | Todas as ocorrências dos estudantes nos cursos coordenados |
| POST | `/ocorrencias/:id/ciente` | Marcar ciente (`cienteEm = now()`, `cientePorId = usuarioId`) |
| GET | `/avisos` | Listar avisos criados pelo coordenador |
| POST | `/avisos` | Criar aviso |
| PUT | `/avisos/:id` | Editar (403 se autorId ≠ usuarioId) |
| DELETE | `/avisos/:id` | Soft-delete (403 se autorId ≠ usuarioId) |

### Dashboard Response

```typescript
{
  cursos: Array<{ cursoId, cursoNome }>;
  stats: { totalEstudantes, totalTurmas, ocorrenciasSemana };
  ocorrenciasRecentes: Array<{ id, estudanteNome, tipoDescricao, dataOcorrencia, cienteEm, cursoNome }>;
  avisos: Array<{ id, titulo, tipo, publicoAlvo, turmaSigla, criadoEm }>;
}
```

### JOIN para ocorrências

```
ocorrencias → estudantes → matriculas → turmas → cursos → coordenador_cursos
WHERE coordenador_cursos.usuarioId = req.usuarioId
```

## Frontend: `/portal-coordenador`

4 tabs:
- **Dashboard** — cards de stats, ocorrências recentes com botão "Registrar Ciente", avisos recentes
- **Ocorrências** — lista completa com filtro por curso, badge ciente/pendente, botão "Marcar Ciente"
- **Avisos** — CRUD completo (mesmo padrão do professor)
- **Perfil** — dados + lista de cursos coordenados

Header com gradiente `from-blue-600 to-indigo-700`.

## Tabelas envolvidas

- `coordenador_cursos`: `usuarioId`, `cursoId` (sem soft-delete)
- `cursos`: `id`, `nome`
- `turmas`: `id`, `cursoId`, `sigla`, `deletadoEm`
- `matriculas`: `usuarioId`, `turmaId`, `ativo` (boolean), `deletadoEm`
- `estudantes`: `id`, `usuarioId`, `nome`
- `ocorrencias`: `id`, `estudanteId`, `tipoOcorrenciaId`, `dataOcorrencia`, `observacao`, `cienteEm`, `cientePorId`, `deletadoEm`
- `avisos` (pode não existir): `id`, `titulo`, `conteudo`, `tipo`, `publicoAlvo`, `turmaId`, `autorId`, `publicado`, `deletadoEm`

## Menu

Role `coordenador` (ou admin) vê o grupo "Portal do Coordenador" no sidebar.

## Implementação

- `artifacts/api-server/src/routes/portal-coordenador.ts`
- `artifacts/seshat/src/pages/portal-coordenador/index.tsx`
- Registrado em `artifacts/api-server/src/index.ts` e `artifacts/seshat/src/App.tsx`
- Menu em `artifacts/seshat/src/components/layout.tsx`
