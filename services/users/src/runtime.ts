import type { PoolConfig } from "pg";
import type { IdentityVerifier } from "./application/ports.ts";
import { createDisabledUsersHandler } from "./composition.ts";
import { createTransactionalGetOwnProfile } from "./application/get-own-profile.ts";
import { createUsersHandler } from "./http/handler.ts";
import { loadPgSettings } from "./config/postgres.ts";
import { createSqlPool, type SqlPool } from "./postgres/connection.ts";
import { verifyRestrictedDatabase } from "./postgres/preflight.ts";
import { PostgresUnitOfWork } from "./postgres/unit-of-work.ts";
import { createSupabaseIdentityVerifier } from "./security/supabase-identity.ts";

export async function createUsersRuntime(env: NodeJS.ProcessEnv, options: {
  readFile?: (path: string) => string;
  poolFactory?: (config: PoolConfig) => SqlPool;
  identityFactory?: (config: { url: string; publishableKey: string }) => IdentityVerifier;
} = {}) {
  let pool: SqlPool | undefined;
  let closed = false;
  let closing: Promise<void> | undefined;
  const close = () => {
    if (closing) return closing;
    closed = true;
    closing = (async () => {
      if (pool) { try { await pool.end(); } catch { /* No exponer errores del driver. */ } }
    })();
    return closing;
  };
  try {
    const settings = loadPgSettings(env, options.readFile);
    if (!settings) return { enabled: false, handler: createDisabledUsersHandler(), close };
    const identity = (options.identityFactory ?? createSupabaseIdentityVerifier)(settings.auth);
    pool = (options.poolFactory ?? createSqlPool)(settings.pool);
    await verifyRestrictedDatabase(pool, settings.mode);
    const handler = createUsersHandler(createTransactionalGetOwnProfile({
      identity, transactions: new PostgresUnitOfWork(pool),
      now: () => Math.floor(Date.now() / 1000),
    }));
    return { enabled: true, handler: (request: Request) => closed ? createDisabledUsersHandler()(request) : handler(request), close };
  } catch {
    await close();
    return { enabled: false, handler: createDisabledUsersHandler(), close };
  }
}
