// Fase 4: Fila de mutações offline — persistência em localStorage
// Salva requisições que falham offline para sincronizar depois

// Fase 4: Tipo para cada mutação enfileirada
export type OfflineMutation = {
  // ID único para rastreamento (timestamp + random)
  id: string;
  // URL do endpoint (ex: "/api/estudantes/123/foto")
  url: string;
  // Método HTTP (POST, PUT, DELETE)
  method: string;
  // Body serializado em JSON (ou undefined para GET/HEAD)
  body?: string;
  // Content-Type do body (padrão: application/json)
  contentType?: string;
  // Timestamp de quando foi enfileirado
  enqueuedAt: number;
  // Número de tentativas de sincronização
  retries: number;
};

// Fase 4: Chave para armazenar fila em localStorage
const QUEUE_KEY = "carometro:offline-queue";

// Fase 4: Enfileirar mutação quando detectado offline
// Chamado por customFetch quando navigator.onLine === false
export function enqueueOfflineMutation(
  url: string,
  method: string,
  body?: unknown,
  contentType = "application/json",
): void {
  // Carregar fila atual do localStorage
  const queue = loadQueue();

  // Criar nova mutação com ID único e timestamp
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url,
    method,
    // Serializar body em JSON (ou undefined se não houver)
    body: body !== undefined ? JSON.stringify(body) : undefined,
    contentType,
    // Timestamp em milissegundos
    enqueuedAt: Date.now(),
    // Começar com 0 tentativas (será incrementado na sincronização)
    retries: 0,
  });

  // Persistir fila atualizada no localStorage
  saveQueue(queue);
}

// Fase 4: Carregar fila do localStorage com tratamento de erro
export function loadQueue(): OfflineMutation[] {
  try {
    // Tentar decodificar JSON armazenado
    const stored = localStorage.getItem(QUEUE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    // localStorage corrompido? Retornar fila vazia e limpar
    console.error("[OFFLINE] Erro ao carregar fila:", err);
    localStorage.removeItem(QUEUE_KEY);
    return [];
  }
}

// Fase 4: Salvar fila no localStorage (chamado após cada mudança)
export function saveQueue(queue: OfflineMutation[]): void {
  try {
    // Serializar fila em JSON e armazenar
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    // localStorage cheio? Limpar entradas antigas
    console.error("[OFFLINE] Erro ao salvar fila:", err);
    // TODO: Implementar rotação de fila antiga
  }
}

// Fase 4: Classe de erro customizado para mutações enfileiradas
// Usado para identificar erros causados por fila offline vs. erros reais
export class OfflineQueuedError extends Error {
  readonly name = "OfflineQueuedError";

  constructor(message: string) {
    super(message);
    // Manter cadeia de protótipos correto para instanceof
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// Fase 4: Obter tamanho da fila (para UI mostrar número de itens pendentes)
export function getQueueSize(): number {
  return loadQueue().length;
}

// Fase 4: Limpar fila (para teste/debug)
export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

// Fase 4: Remover mutação específica da fila após sincronizar com sucesso
export function removeFromQueue(mutationId: string): void {
  const queue = loadQueue();
  // Filtrar fora a mutação com esse ID
  const updated = queue.filter((m) => m.id !== mutationId);
  saveQueue(updated);
}

// Fase 4: Atualizar tentativas de sincronização
export function incrementRetries(mutationId: string): void {
  const queue = loadQueue();
  // Encontrar mutação e incrementar retries
  const mutation = queue.find((m) => m.id === mutationId);
  if (mutation) {
    mutation.retries++;
  }
  saveQueue(queue);
}
