# Spec: Carômetro

**Agente responsável:** Hermes + Aphrodite  
**Status:** Implementado ✅

## Comportamento

### GET /api/carometro

**Requer:** `carometro:view`

**Filtros opcionais:**
- `?turmaId=uuid` — filtrar por turma
- `?cursoId=uuid` — filtrar por curso (via JOIN turma → curso)
- `?busca=texto` — busca por nome ou registro
- `?comFoto=true` — apenas estudantes com foto cadastrada

**Saída:**
```typescript
Array<{
  turmaId: string; turmaSigla: string; turmaDescricao: string;
  cursoId: string; cursoNome: string;
  turnoId: string; turnoNome: string;
  estudantes: Array<{
    id: string; nome: string; registro: string;
    dataNascimento: string | null;
    fotoUrl: string | null;  // "/api/fotos/:id" | "/api/estudantes/:id/foto" | null
  }>;
}>
```

> **Foto não é mais retornada inline (data URL).** O campo `fotoUrl` é uma URL de endpoint — o browser busca cada foto individualmente com cache `private, max-age=86400`. Isso elimina o decrypt em lote no servidor (~120–160 MB/req) e habilita cache HTTP por imagem.  
> Para estudantes sem foto: `fotoUrl: null`.

---

## Endpoints de Grupo (Usuários por Role)

Retornam `UsuarioCard[]` — **array plano**, não objeto com `sections`.

```typescript
type UsuarioCard = {
  id: string;
  nome: string | null;
  email: string;           // descriptografado com SESSION_SECRET
  fotoUrl: string | null;  // "/api/fotos/:id" | "/api/usuarios/:id/foto" | null
  codigoAcesso: string;
  roles: { id: string; nome: string }[];
  ofertas: {
    ofertaId: string; disciplinaId: string; disciplinaNome: string;
    cursoId: string; cursoNome: string; turnoId: string; turnoNome: string;
  }[];
}
```

| Endpoint | Roles filtradas |
|---|---|
| `GET /api/carometro/equipe-gestora` | `equipe_gestora` |
| `GET /api/carometro/administracao` | `secretaria`, `administracao` |
| `GET /api/carometro/equipe-pedagogica` | `coordenador`, `soe`, `aee`, `supervisao_pedagogica` |
| `GET /api/carometro/corpo-docente` | `professor`, `educador` |
| `GET /api/carometro/apoio-operacional` | `inspetor`, `limpeza`, `portaria`, `merendeira`, `seguranca` |
| `GET /api/carometro/usuarios` | `pai_responsavel`, `estudante` |

Todos requerem `carometro:view`.

O frontend (`seshat-grupo.tsx`) agrupa por `ofertas[].turnoId + cursoId` para montar seções de turno/curso. Usuários sem ofertas aparecem em "Sem turno".

**Armadilha crítica:** a API DEVE retornar array plano. Se retornar `{ sections: [...] }`, o frontend faz `Array.isArray(data)` → `false` → lista vazia.

## Considerações de Performance

- Grid exibe todos os resultados filtrados de uma vez (sem paginação no MVP)
- **Descriptografia NÃO ocorre mais no servidor durante listagem** — cada foto é buscada individualmente pelo browser via `fotoUrl`, com `Cache-Control: private, max-age=86400`
- Fotos são cacheadas pelo browser; requisições subsequentes não vão ao servidor
- Para turmas grandes (100+ alunos), o carômetro carrega rapidamente porque não descriptografa nada em lote

## Casos de Teste

- [ ] GET sem filtros retorna todos os estudantes ativos
- [ ] `fotoUrl` aponta para `/api/fotos/:id` quando `foto_id` preenchido
- [ ] `fotoUrl` aponta para `/api/estudantes/:id/foto` como fallback (dados legados)
- [ ] `fotoUrl: null` para estudantes sem foto
- [ ] `GET /api/fotos/:id` com foto corrompida → 500 (não quebra o carômetro — a imagem falha individualmente)
- [ ] `?busca=` funciona por nome e por registro
- [ ] GET sem permissão `carometro:view` → 403

# Spec: Import XLSX

**Agente responsável:** Hermes  
**Status:** Implementado ✅

## POST /api/import

**Requer:** `import:execute`

**Entrada:**
```typescript
{ arquivo: string }  // base64 do arquivo .xlsx (com ou sem prefixo data:)
```

**Colunas esperadas na planilha (case-insensitive):**
- `nome` — obrigatório
- `registro` — obrigatório (chave de upsert)
- `turma` — obrigatório (sigla da turma, deve existir no banco)
- `observacao` — opcional

**Saída:**
```typescript
{
  inseridos: number;
  atualizados: number;
  erros: Array<{ linha: number; erro: string }>;
  total: number;
  mensagem: string;
}
```

**Lógica de upsert:**
- Busca estudante por `registro` — se existe: atualiza nome/turma/observacao (mantém foto)
- Se não existe: insere novo estudante (sem foto)

**Erros por linha** não interrompem o processamento — a importação continua nas linhas seguintes.

## Casos de Teste

- [ ] Planilha com 3 estudantes novos → `inseridos: 3`
- [ ] Planilha com registro existente → `atualizados: 1` (foto preservada)
- [ ] Linha com turma inexistente → erro na linha, restante processado
- [ ] Arquivo inválido (não é xlsx) → 400
- [ ] Planilha vazia → 400
