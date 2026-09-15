// TODO: substituir por provedor real de embeddings (voyage-ai, OpenAI ada-002, etc.) antes de produção.
// Anthropic não oferece endpoint dedicado de embeddings; esta implementação usa
// um vetor determinístico baseado em hash para fins de desenvolvimento.

/**
 * Gera um vetor de embedding aproximado para o texto fornecido.
 * Retorna vetor normalizado de 1536 dimensões.
 *
 * ATENÇÃO: implementação placeholder — não usa similaridade semântica real.
 * Em produção, integrar com voyage-ai ou text-embedding-3 da OpenAI.
 */
export async function gerarEmbedding(texto: string): Promise<number[]> {
  const hash = Buffer.from(texto).reduce((acc, b, i) => acc + b * (i + 1), 0);
  const seed = hash % 1000;
  const vetor = Array.from({ length: 1536 }, (_, i) =>
    Math.sin(seed * i * 0.001) * 0.1
  );
  // Normalizar para vetor unitário
  const magnitude = Math.sqrt(vetor.reduce((s, v) => s + v * v, 0));
  return vetor.map(v => v / magnitude);
}
