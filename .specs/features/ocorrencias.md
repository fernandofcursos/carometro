# Spec: Ocorrências

**Agente responsável:** Hermes + Ares  
**Status:** Implementado ✅

## Comportamento

### GET /api/ocorrencias

Lista ocorrências ativas com JOINs para exibição.  
**Requer:** `ocorrencias:view`  
**Filtro opcional:** `?estudanteId=uuid`

**Saída:**
```typescript
{
  ocorrencias: Array<{
    id: string;
    dataOcorrencia: string;       // "YYYY-MM-DD"
    observacao: string | null;
    estudanteId: string;
    tipoOcorrenciaId: string;
    disciplinaId: string | null;
    registradoPorId: string | null;
    tipoDescricao: string | null; // JOIN
    estudanteNome: string | null; // JOIN
    disciplinaNome: string | null;// JOIN
    criadoEm: string;
  }>
}
```

### POST /api/ocorrencias

**Requer:** `ocorrencias:create`  
O campo `registradoPorId` é preenchido automaticamente com `req.usuarioId` (não aceito do body).

**Entrada:**
```typescript
{
  estudanteId: string;       // UUID, obrigatório
  tipoOcorrenciaId: string;  // UUID, obrigatório
  dataOcorrencia: string;    // "YYYY-MM-DD", obrigatório
  disciplinaId?: string;     // UUID, opcional
  observacao?: string;       // texto livre
}
```

### PUT /api/ocorrencias/:id

**Requer:** `ocorrencias:create` — mesma permissão de criação.  
Todos os campos são opcionais (partial update).

### DELETE /api/ocorrencias/:id

Soft delete: seta `deletadoEm`.  
**Requer:** `ocorrencias:create`

## Tipos de Ocorrência (GET /api/tipos-ocorrencias)

Entidade independente com CRUD completo.  
**Requer:** `tipos-ocorrencias:manage`  
Status: `"ativo"` | `"inativo"` (enum `status_ocorrencia`)

## Casos de Teste

- [ ] POST sem `estudanteId` → 400
- [ ] POST com `estudanteId` inexistente → 400 (FK)
- [ ] `registradoPorId` sempre preenchido com usuário da sessão (não pode ser sobrescrito)
- [ ] GET filtra por `?estudanteId=uuid` corretamente
- [ ] GET sem permissão `ocorrencias:view` → 403
- [ ] POST sem permissão `ocorrencias:create` → 403
