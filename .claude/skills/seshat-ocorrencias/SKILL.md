# Skill: Ocorrências

## Arquivos principais

| Arquivo | Responsabilidade |
|---|---|
| `artifacts/api-server/src/routes/ocorrencias.ts` | CRUD + notificar-pais + notificar-estudante |
| `artifacts/seshat/src/pages/seshat.tsx` | Formulário de ocorrência no carômetro |
| `artifacts/seshat/src/pages/ocorrencias/index.tsx` | Relatório de ocorrências |

## Endpoints

```
GET  /api/ocorrencias?estudanteId=uuid         → { ocorrencias[] }  // requer ocorrencias:view
GET  /api/ocorrencias/estudante/:estudanteId   → { ocorrencias[] }  // sem permissão extra (ownership check)
GET  /api/ocorrencias/:id                      → ocorrencia          // requer ocorrencias:view
POST /api/ocorrencias                          → ocorrencia criada   // requer ocorrencias:create
PUT  /api/ocorrencias/:id                      → partial update      // requer ocorrencias:create
DELETE /api/ocorrencias/:id                    → soft delete         // requer ocorrencias:create
POST /api/ocorrencias/:id/ciente               → estudante adulto ou responsável vinculado marca ciência
POST /api/ocorrencias/:id/notificar-pais       → notifica responsáveis por e-mail  // requer ocorrencias:create
POST /api/ocorrencias/:id/notificar-estudante  → notifica estudante adulto por e-mail  // requer ocorrencias:create
```

## Notificação por E-mail ao Registrar Ocorrência

### Lógica opt-in no POST /api/ocorrencias

A notificação por e-mail **não é automática** — depende de flags explícitas no body.

| Flag | Efeito |
|---|---|
| `enviarEmailPais: true` | Notifica responsáveis (somente se estudante for menor de 18) |
| `enviarEmailEstudante: true` | Notifica o próprio estudante (somente se for maior ou igual a 18) |
| Nenhuma flag | Nenhum e-mail é enviado |

```typescript
// POST /api/ocorrencias — lógica de envio opt-in
const { enviarEmailPais, enviarEmailEstudante, ...ocorrenciaData } = data;
const menor = await getEstudanteMenorDeIdade(data.estudanteId);
if (menor && enviarEmailPais) {
  await notificarPais(ocorrencia.id, data.estudanteId, turnoNome, disciplinaNome);
} else if (!menor && enviarEmailEstudante) {
  await notificarEstudante(ocorrencia.id, data.estudanteId, turnoNome, disciplinaNome);
}
```

**Schema:** `enviarEmailPais: boolean` e `enviarEmailEstudante: boolean` estão presentes em `criarSchema` mas são omitidos no `PUT /:id` (não se notifica ao editar).

**Verificação de idade:**
1. `estudantes.data_nascimento` (primária)
2. Fallback: `usuarios.data_nascimento` do usuário vinculado
3. Se nenhuma data → trata como maior (envia para e-mail próprio)

## Notificação Manual

```typescript
// POST /:id/notificar-pais  — menores de idade
// POST /:id/notificar-estudante — maiores de idade
// 200 → { ok: true, enviados: number, mensagem: string }
// 422 → { error: "Nenhum responsável com e-mail cadastrado..." }
// 404 → { error: "Ocorrência não encontrada." }
```

**Comportamento:**
- Aguarda cada envio (`await`), conta sucessos individualmente
- Falhas individuais são logadas mas não interrompem os demais
- Reenvio sempre permitido — sem bloqueio por `notificacaoPaisEnviadaEm`
- Atualiza `notificacaoPaisEnviadaEm` se ao menos 1 envio teve sucesso

## Campos de Notificação

Dois campos de timestamp retornados pelo GET e usados no frontend:

| Campo | Atualizado por |
|---|---|
| `notificacaoPaisEnviadaEm` | `notificarPais()` — ao notificar responsáveis (menores) |
| `notificacaoEstudanteEnviadaEm` | `notificarEstudante()` — ao notificar o próprio estudante (adultos) |

```typescript
// seshat.tsx — botão de notificação (rota e label dependem de estudanteMenor)
const jaMenorNotif = !!ocorrencia.notificacaoPaisEnviadaEm;
const jaAdultoNotif = !!ocorrencia.notificacaoEstudanteEnviadaEm;
const jaNotificado = estudanteMenor ? jaMenorNotif : jaAdultoNotif;
const dataNotif = estudanteMenor
  ? ocorrencia.notificacaoPaisEnviadaEm
  : ocorrencia.notificacaoEstudanteEnviadaEm;

const notificarMutation = useMutation({
  mutationFn: async (id: string) => {
    const rota = estudanteMenor
      ? `/api/ocorrencias/${id}/notificar-pais`
      : `/api/ocorrencias/${id}/notificar-estudante`;
    // POST sem body
  },
});

<Button onClick={() => notificarMutation.mutate(ocorrencia.id)}
  title={jaNotificado ? `Notificado em ${formatarData(dataNotif)} — clique para reenviar` : titlePrimeiro}
>
  <Send className="w-3 h-3 mr-1" />
  {jaNotificado ? "Reenviar e-mail" : (estudanteMenor ? "Notificar responsáveis" : "Notificar estudante")}
</Button>
```

- Visível apenas para usuários com `ocorrencias:create`
- Label e rota variam conforme `estudanteMenor`
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
