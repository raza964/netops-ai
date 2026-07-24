/**
 * Pure vector math - no I/O, no Prisma, no provider. Kept separate so it can
 * be unit tested directly and so a future pgvector-backed search can drop
 * this module entirely without touching provider.ts or the DAL.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vectors must have the same dimensionality (got ${a.length} and ${b.length}).`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
