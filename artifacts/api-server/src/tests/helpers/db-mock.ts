import { vi } from "vitest";

/**
 * Creates a Drizzle-compatible chainable query builder mock.
 * The mock resolves to `result` when awaited.
 */
export function makeQuery(result: unknown[] = []) {
  const q: Record<string, unknown> = {};
  const chain = () => q;
  q.from = chain;
  q.where = chain;
  q.innerJoin = chain;
  q.leftJoin = chain;
  q.orderBy = chain;
  q.limit = chain;
  q.offset = chain;
  q.set = chain;
  q.values = chain;
  q.returning = chain;
  q.onConflictDoNothing = chain;
  q.onConflictDoUpdate = chain;
  // Make the builder thenable so `await db.select()...` works
  q.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

/** Returns a mock db object with vi.fn() for each method. */
export function createDbMock() {
  return {
    select: vi.fn(() => makeQuery()),
    insert: vi.fn(() => makeQuery()),
    update: vi.fn(() => makeQuery()),
    delete: vi.fn(() => makeQuery()),
  };
}
