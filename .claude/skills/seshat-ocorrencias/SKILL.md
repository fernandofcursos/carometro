# Skill: Ocorrências

## Arquivos principais

| Arquivo | Responsabilidade |
|---|---|
| `artifacts/api-server/src/routes/ocorrencias.ts` | CRUD + ciente + notificar |
| `artifacts/seshat/src/pages/seshat.tsx` | Formulário de ocorrência no carômetro |
| `artifacts/seshat/src/pages/ocorrencias/index.tsx` | Relatório de ocorrências |

## Endpoints

| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/api/ocorrencias?estudanteId=uuid` | `ocorrencias:view` | Lista ocorrências; `estudanteId` opcional — sem ele retorna todas |
| GET | `/api/ocorrencias/estudante/:estudanteId` | requireAuth | Lista resumida (sem dados de registro/notificação) — para estudantes e pais |
| GET | `/api/ocorrencias/:id` | `ocorrencias:view` | Detalhe completo de uma ocorrência |
| POST | `/api/ocorrencias` | `ocorrencias:create` | Cria ocorrência |
| PUT | `/api/ocorrencias/:id` | `ocorrencias:create` | Edição parcial |
| DELETE | `/api/ocorrencias/:id` | `ocorrencias:create` | Soft delete |
| POST | `/api/ocorrencias/:id/ciente` | requireAuth | Marca ciência; 409 se já registrada; 403 se estudante menor |
| POST | `/api/ocorrencias/:id/notificar-pais` | `ocorrencias:create` | Notifica responsáveis por e-mail |
| POST | `/api/ocorrencias/:id/notificar-estudante` | `ocorrencias:create` | Notifica estudante adulto por e-mail |

> **Retorno do GET /api/ocorrencias:** array plano `[]` — não um objeto `{ ocorrencias[] }`.

### POST /:id/ciente — detalhes

```typescript
// 200 → { ok: true, cienteEm: <timestamp> }
// 404 → { error: "Ocorrência não encontrada." }
// 409 → { error: "Ciência já registrada." }
// 403 → { error: "Estudante menor de idade não pode registrar ciência. A ciência deve ser feita pelo pai ou responsável." }
```

### POST /:id/notificar-estudante — detalhes

```typescript
// 200 → { ok: true, mensagem: "E-mail enviado com sucesso." }
// 422 → { error: "Este estudante não possui e-mail próprio cadastrado." }
// Stamps notificacaoEstudanteEnviadaEm (não notificacaoPaisEnviadaEm)
```

## Notificação por E-mail ao Registrar Ocorrência

### Regra automática no POST /api/ocorrencias

| Condição | Destinatário |
|---|---|
| Estudante **menor de 18 anos** | Responsáveis (`estudante_emails.tipo = 'responsavel'`) |
| Estudante **maior ou igual a 18 anos** | Próprio estudante (`estudante_emails.tipo = 'proprio'`) |
| `enviarEmailPais: true` no body | Força envio para responsáveis (independente da idade) |

```typescript
// POST /api/ocorrencias — lógica de envio automático
const menor = await getEstudanteMenorDeIdade(data.estudanteId);
if (menor || enviarEmailPais) {
  await notificarPais(ocorrencia.id, data.estudanteId, turnoNome, disciplinaNome);
} else {
  await notificarEstudante(ocorrencia.id, data.estudanteId, turnoNome, disciplinaNome);
}
```

**Verificação de idade:**
1. `estudantes.data_nascimento` (primária)
2. Fallback: `usuarios.data_nascimento` do usuário vinculado
3. Se nenhuma data → trata como maior (envia para e-mail próprio)

**`notificacao_pais_enviada_em`** é atualizado quando envia para responsáveis — menores **ou** maiores com `enviarEmailPais: true`.
**`notificacao_estudante_enviada_em`** é atualizado quando envia para o próprio estudante adulto (path automático ou via `POST /:id/notificar-estudante`).

## Notificação Manual de Responsáveis

```typescript
// POST /:id/notificar-pais
// 200 → { ok: true, enviados: number, mensagem: string }
// 422 → { error: "Este estudante não possui e-mails de responsável cadastrados." }
// 404 → { error: "Ocorrência não encontrada." }
```

**Comportamento:**
- Aguarda cada envio (`await`), conta sucessos individualmente
- Falhas individuais são logadas mas não interrompem os demais
- Reenvio sempre permitido — sem bloqueio por `notificacaoPaisEnviadaEm`
- Atualiza `notificacaoPaisEnviadaEm` se ao menos 1 envio teve sucesso

## Campo notificacaoPaisEnviadaEm

Incluído no GET `/api/ocorrencias` e usado no frontend:

```typescript
// seshat.tsx — botão de notificação (3 estados dependendo de isMenor e notificação prévia)
<Button
  onClick={() => notificarMutation.mutate(ocorrencia.id)}
  title={jaNotificado
    ? `Notificado em ${format(...)} — clique para reenviar`
    : isMenor ? "Enviar e-mail para responsáveis" : "Enviar e-mail para o estudante"}
>
  <Send className="w-3 h-3 mr-1" />
  {jaNotificado ? "Reenviar e-mail" : isMenor ? "Notificar responsáveis" : "Notificar estudante"}
</Button>
// jaNotificado = notificacaoPaisEnviadaEm (menor) ou notificacaoEstudanteEnviadaEm (maior)
```

- Sempre visível para usuários com `ocorrencias:create`
- Label muda para "Reenviar e-mail" após primeiro envio
- Toast exibe `data.mensagem` da API
- Erro 422 → toast destrutivo

## Função de envio de e-mail

```typescript
import { enviarEmailOcorrencia } from "../lib/mailer.js";

await enviarEmailOcorrencia({
  para: email,
  estudanteNome: ocorrencia.estudanteNome,
  tipoOcorrencia: ocorrencia.tipoDescricao,
  dataOcorrencia: ocorrencia.dataOcorrencia,
  turnoNome: ocorrencia.turnoNome,
  disciplinaNome: ocorrencia.disciplinaNome,
  observacao: ocorrencia.observacao,
  textoPadrao,  // buscado de textosPadraoOcorrenciasTable (ativo=true, não deletado)
});
```

## Permissões necessárias

| Ação | Permissão |
|---|---|
| Ver ocorrências (lista + detalhe) | `ocorrencias:view` |
| Criar / editar / deletar / notificar | `ocorrencias:create` |
| Marcar ciência (`POST /:id/ciente`) | requireAuth (qualquer usuário autenticado) |
| Listar resumido por estudante (`GET /estudante/:id`) | requireAuth |
| Gerenciar tipos | `tipos-ocorrencias:manage` |
| Gerenciar textos padrão | `tipos-ocorrencias:manage` |

### Schema — campo adicional

`escolaId` (`uuid`, nullable) existe na tabela `ocorrencias` mas não é aceito via API (omitido do `criarSchema`) nem retornado nos GETs.
