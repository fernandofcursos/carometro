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

## Notificação por E-mail ao Registrar Ocorrência

### Regra de envio automático no POST /api/ocorrencias

Ao registrar uma ocorrência, o sistema envia e-mail automaticamente com base na idade do estudante:

| Condição | Destinatário |
|---|---|
| **Menor de 18 anos** | Responsáveis cadastrados (`estudante_emails.tipo = 'responsavel'`) |
| **Maior ou igual a 18 anos** | Próprio estudante (`estudante_emails.tipo = 'proprio'`) |
| `enviarEmailPais: true` no body | Força envio para responsáveis (independente da idade) |

**Verificação de idade:**
1. Usa `estudantes.data_nascimento` (primária)
2. Fallback: `usuarios.data_nascimento` do usuário vinculado
3. Se nenhuma data disponível → trata como maior (envia para e-mail próprio)

**Comportamento:**
- Falhas individuais são logadas mas não interrompem o fluxo
- `notificacao_pais_enviada_em` é atualizado apenas quando enviado para responsáveis (menores)
- Se não há e-mail cadastrado do tipo adequado, o registro prossegue normalmente sem erro

## Notificação Manual de Responsáveis

### POST /api/ocorrencias/:id/notificar-pais

Reenvio manual para responsáveis via `enviarEmailOcorrencia()`.  
**Requer:** `ocorrencias:create`

**Comportamento:**
- Busca emails de responsáveis na tabela `estudante_emails` onde `tipo = 'responsavel'`
- Envia para todos os responsáveis encontrados; falhas individuais são logadas mas não interrompem os demais
- Permite reenvio a qualquer momento (sem bloqueio após primeiro envio)
- Atualiza `ocorrencias.notificacao_pais_enviada_em` apenas se ao menos 1 e-mail for enviado com sucesso

**Respostas:**
```typescript
// 200 — sucesso (≥ 1 e-mail enviado)
{ ok: true, enviados: number, mensagem: string }

// 422 — nenhum responsável com e-mail cadastrado
{ error: "Nenhum responsável com e-mail cadastrado para este estudante." }

// 404 — ocorrência não encontrada
{ error: "Ocorrência não encontrada." }
```

### Campo `notificacaoPaisEnviadaEm`

Incluído no GET `/api/ocorrencias` como `notificacaoPaisEnviadaEm: string | null`.  
Usado no frontend para exibir data do último envio e alterar label do botão.

---

## Comportamento no Carômetro (seshat.tsx)

- Botão **"Notificar responsáveis"** aparece para usuários com `ocorrencias:create`
- Após primeiro envio, exibe **"Reenviar e-mail"** com tooltip mostrando data do último envio
- Toast exibe `data.mensagem` retornado pela API
- Erro 422 → toast destrutivo "Nenhum responsável com e-mail"

---

## Casos de Teste

- [ ] POST sem `estudanteId` → 400
- [ ] POST com `estudanteId` inexistente → 400 (FK)
- [ ] `registradoPorId` sempre preenchido com usuário da sessão (não pode ser sobrescrito)
- [ ] GET filtra por `?estudanteId=uuid` corretamente
- [ ] GET sem permissão `ocorrencias:view` → 403
- [ ] POST sem permissão `ocorrencias:create` → 403
- [ ] POST `/notificar-pais` sem responsáveis → 422
- [ ] POST `/notificar-pais` com responsáveis → 200, `notificacaoPaisEnviadaEm` atualizado
- [ ] POST `/notificar-pais` segunda vez → 200 (reenvio permitido)
