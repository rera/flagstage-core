import { AsyncLocalStorage } from "node:async_hooks";

import type { Database } from "./client";

const active = new AsyncLocalStorage<Database>();

/**
 * Better Auth runs our group reconciler inside its own database transaction.
 * A second transaction on the pooled client would wait on that one forever,
 * so reconciler queries join the transaction that is already open.
 */
export function bindTransactionContext(database: Database): Database {
  const bound = database as Database & { __flagstageTxBound?: boolean };
  if (bound.__flagstageTxBound) return database;
  const original = database.transaction.bind(database);
  bound.transaction = (async (callback, config) => {
    return original(async (tx) => {
      return active.run(tx as unknown as Database, () => callback(tx));
    }, config);
  }) as Database["transaction"];
  bound.__flagstageTxBound = true;
  return database;
}

export function currentDatabase(fallback: Database): Database {
  return active.getStore() ?? fallback;
}
