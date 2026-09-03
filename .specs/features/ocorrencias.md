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

| Condição | Destinatário | Campo atualizado |
|---|---|---|
| **Menor de 18 anos** | Responsáveis (`estudante_emails.tipo = 'responsavel'`) | `notificacaoPaisEnviadaEm` |
| **Maior ou igual a 18 anos** | Próprio estudante (`estudante_emails.tipo = 'proprio'`) | `notificacaoEstudanteEnviadaEm` |
| `enviarEmailPais: true` no body | Força envio para responsáveis (independente da idade) | `notificacaoPaisEnviadaEm` |

**Verificação de idade:**
1. Usa `estudantes.data_nascimento` (primária)
2. Fallback: `usuarios.data_nascimento` do usuário vinculado
3. Se nenhuma data disponível → trata como maior (envia para e-mail próprio)

**Conteúdo do e-mail:**
- Se o tipo de ocorrência possui um **texto padrão ativo** (`textos_padrao_ocorrencias`), o corpo do e-mail usa esse texto com os placeholders substituídos (`{{NOME_ESTUDANTE}}`, `{{DATA_OCORRENCIA}}`, `{{TIPO_OCORRENCIA}}`, `{{DESCRICAO}}`, `{{DATA_REGISTRO}}`)
- Caso não haja texto padrão, usa o formato tabelado padrão com tipo, data, turno, disciplina e descrição

**Comportamento:**
- Falhas individuais são logadas mas não interrompem o fluxo
- `notificacao_pais_enviada_em` é atualizado apenas quando enviado para responsáveis (menores)
- Se não há e-mail cadastrado do tipo adequado, o registro prossegue normalmente sem erro

## Notificação Manual de Responsáveis

### POST /api/ocorrencias/:id/notificar-pais

Reenvio manual para responsáveis.  
**Requer:** `ocorrencias:create`

- Busca `estudante_emails.tipo = 'responsavel'`
- Atualiza `notificacaoPaisEnviadaEm` se ≥ 1 enviado
- Mensagem de sucesso: `"E-mail enviado para N responsável(is)."`

```typescript
// 200 { ok: true, enviados: number, mensagem: string }
// 422 { error: "Este estudante não possui e-mails de responsável cadastrados." }
// 404 { error: "Ocorrência não encontrada." }
```

### POST /api/ocorrencias/:id/notificar-estudante

Reenvio manual para o próprio estudante (maior de 18 anos).  
**Requer:** `ocorrencias:create`

- Busca `estudante_emails.tipo = 'proprio'`
- Atualiza `notificacaoEstudanteEnviadaEm` se ≥ 1 enviado
- Mensagem de sucesso: `"E-mail enviado com sucesso."`

```typescript
// 200 { ok: true, enviados: number, mensagem: string }
// 422 { error: "Este estudante não possui e-mail próprio cadastrado." }
// 404 { error: "Ocorrência não encontrada." }
```

### Campos de notificação

Incluídos no GET `/api/ocorrencias`:

| Campo | Tipo | Quando é preenchido |
|---|---|---|
| `notificacaoPaisEnviadaEm` | `string \| null` | Último envio para responsáveis (menor de 18) |
| `notificacaoEstudanteEnviadaEm` | `string \| null` | Último envio para o próprio estudante (maior de 18) |

**Migration necessária:**
```sql
ALTER TABLE ocorrencias
  ADD COLUMN IF NOT EXISTS notificacao_estudante_enviada_em TIMESTAMPTZ;
```
Script: `scripts/migrate-notificacao-estudante.sql`

---

## Comportamento no Carômetro (seshat.tsx)

| Situação | Label do botão | Tooltip |
|---|---|---|
| Menor, nunca notificado | "Notificar responsáveis" | "Enviar e-mail para responsáveis" |
| Menor, já notificado | "Reenviar e-mail" | data do último envio |
| Maior, nunca notificado | "Notificar estudante" | "Enviar e-mail para o estudante" |
| Maior, já notificado | "Reenviar e-mail" | data do último envio |

- Toast de sucesso para menor: mensagem da API (`"E-mail enviado para N responsável(is)."`)
- Toast de sucesso para maior: `"E-mail enviado com sucesso."`
- Erro 422 → toast destrutivo com mensagem da API
- Mutation chama `/notificar-pais` para menores e `/notificar-estudante` para maiores

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


---

## Ciência do Estudante (Portal)

O estudante maior de 18 anos pode registrar ciência de suas próprias ocorrências via `POST /api/portal/ocorrencias/:id/ciencia`.

| Campo | Tipo | Descrição |
|---|---|---|
| `ciente_em` | timestamptz | Data/hora em que a ciência foi registrada |
| `ciente_por_id` | uuid FK → usuarios | Usuário que deu ciência (o próprio estudante) |

A ciência registrada na tabela `ocorrencias` é exibida na interface administrativa e no portal do estudante. Estudantes menores de idade (< 18 anos) não podem dar ciência — a responsabilidade recai sobre o responsável legal.
