# Skill: Ocorrências

## Arquivos principais

| Arquivo | Responsabilidade |
|---|---|
| `artifacts/api-server/src/routes/ocorrencias.ts` | CRUD + notificar-pais |
| `artifacts/seshat/src/pages/seshat.tsx` | Formulário de ocorrência no carômetro |
| `artifacts/seshat/src/pages/ocorrencias/index.tsx` | Relatório de ocorrências |

## Endpoints

```
GET  /api/ocorrencias?estudanteId=uuid  → { ocorrencias[] }  // requer ocorrencias:view
POST /api/ocorrencias                   → ocorrencia criada   // requer ocorrencias:create
PUT  /api/ocorrencias/:id               → partial update      // requer ocorrencias:create
DELETE /api/ocorrencias/:id             → soft delete         // requer ocorrencias:create
POST /api/ocorrencias/:id/notificar-pais → notifica responsáveis por e-mail
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

**`notificacao_pais_enviada_em`** é atualizado apenas quando envia para responsáveis (menores).

## Notificação Manual de Responsáveis

```typescript
// POST /:id/notificar-pais
// 200 → { ok: true, enviados: number, mensagem: string }
// 422 → { error: "Nenhum responsável com e-mail cadastrado..." }
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
// seshat.tsx — botão de notificação
<Button
  onClick={() => notificarMutation.mutate(ocorrencia.id)}
  title={ocorrencia.notificacaoPaisEnviadaEm
    ? `Notificado em ${format(new Date(ocorrencia.notificacaoPaisEnviadaEm), "dd/MM/yyyy HH:mm")} — clique para reenviar`
    : "Enviar e-mail aos responsáveis"}
>
  <Send className="w-3 h-3 mr-1" />
  {ocorrencia.notificacaoPaisEnviadaEm ? "Reenviar e-mail" : "Notificar responsáveis"}
</Button>
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
});
```

## Permissões necessárias

| Ação | Permissão |
|---|---|
| Ver ocorrências | `ocorrencias:view` |
| Criar / editar / deletar / notificar | `ocorrencias:create` |
| Gerenciar tipos | `tipos-ocorrencias:manage` |
| Gerenciar textos padrão | `tipos-ocorrencias:manage` |
