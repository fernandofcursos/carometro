# Feature: Modo Offline e Sincronização

**Agente responsável:** Hermes + Atlas  
**Athena:** aprovado  
**Status:** Implementado ✅

## Objetivo

Permitir que usuários continuem trabalhando sem conexão com a internet. Operações de leitura usam cache local. Operações de escrita são enfileiradas e sincronizadas automaticamente ao reconectar.

## Comportamento por Tipo de Operação

### Leituras (GET)
- Servidas pelo cache Workbox (`NetworkFirst` com fallback)
- Dados de listas: até 24h no cache
- Fotos de estudantes: até 7 dias no cache
- `/api/auth/me`: até 8h (duração da sessão JWT)
- Se cache expirado e sem rede: exibir estado de erro com mensagem clara

### Escritas (POST/PUT/DELETE)
- Tentativa imediata via rede
- Se offline (`navigator.onLine === false`): enfileirado em localStorage
- Fila persistida entre sessões (fechamento e reabertura do browser)
- Sincronização automática ao detectar reconexão (`window.addEventListener("online")`)
- Máximo de 5 tentativas por mutação — descartada após exceder

## Fila Offline (`OfflineMutation`)

```typescript
type OfflineMutation = {
  id: string;           // timestamp + random (identificador único)
  url: string;          // endpoint (ex: "/api/estudantes/123/foto")
  method: string;       // POST | PUT | DELETE
  body?: string;        // JSON serializado
  contentType?: string; // padrão: "application/json"
  enqueuedAt: number;   // timestamp de enfileiramento
  retries: number;      // contador de tentativas (max 5)
};
```

**Armazenamento:** `localStorage["carometro:offline-queue"]`

## Fluxo de Sincronização

```
Reconecta à rede
      ↓
useNetworkStatus detecta window.online
      ↓
Carrega fila do localStorage
      ↓
Para cada mutação (em ordem de enqueuedAt):
  ├─ Tenta POST/PUT/DELETE via fetch
  ├─ Sucesso → remove da fila
  └─ Falha → incrementa retries
             └─ retries ≥ 5 → remove da fila (descartar)
      ↓
Salva fila atualizada no localStorage
      ↓
Invalida caches TanStack Query (refetch automático)
```

## Indicador Visual

- Componente `<StatusRede>` exibido globalmente em `App.tsx`
- Banner não intrusivo (parte inferior da tela) indica modo offline
- Quantidade de mutações pendentes exibida no banner
- Desaparece automaticamente ao reconectar e sincronizar

## Limitações e Decisões de Design

| Situação | Comportamento |
|----------|--------------|
| Conflito de dados (mesmo registro editado online e offline) | Last-write-wins — a sincronização envia o dado local; sem merge automático |
| Upload de foto offline | Enfileirado normalmente (body serializado em base64) |
| Importação XLSX offline | Não suportada — requer conexão (operação pesada) |
| Login offline | Não suportado — JWT requer validação com o servidor |
| Mutações com mais de 5 falhas | Descartadas silenciosamente; log de console |

## Arquivos de Implementação

| Arquivo | Responsabilidade |
|---------|-----------------|
| `lib/api-client-react/src/offline-queue.ts` | CRUD da fila em localStorage |
| `artifacts/seshat/src/hooks/use-network-status.ts` | Detecta online/offline, drena fila |
| `artifacts/seshat/src/components/status-rede.tsx` | UI do indicador de rede |
| `artifacts/seshat/src/App.tsx` | Monta `<StatusRede>` globalmente |

## Casos de Teste

- [ ] Ir offline → tentar POST → confirmar enfileiramento no localStorage
- [ ] Reconectar → confirmar sincronização automática e remoção da fila
- [ ] Fechar e reabrir o browser offline → fila preservada
- [ ] Mutação com 5 falhas → descartada da fila
- [ ] Banner de offline aparece ao perder conexão
- [ ] Banner desaparece após sincronização bem-sucedida
- [ ] Listas servidas do cache ao abrir offline (< 24h)
- [ ] Foto servida do cache ao abrir offline (< 7 dias)
