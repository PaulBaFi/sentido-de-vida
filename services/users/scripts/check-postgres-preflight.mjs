import { readPgSettings } from "../src/config/postgres.ts";
import { createSqlPool } from "../src/postgres/connection.ts";
import { verifyRestrictedDatabase } from "../src/postgres/preflight.ts";

let pool;
let passed = false;
try {
  if (process.env.USERS_PG_ENABLED !== "false") throw new Error("Servicio debe permanecer deshabilitado.");
  const settings = readPgSettings(process.env);
  pool = createSqlPool(settings.pool);
  await verifyRestrictedDatabase(pool, settings.mode);
  passed = true;
} catch {
  // No registrar excepciones originales ni configuración privada.
  passed = false;
} finally {
  if (pool) {
    try { await pool.end(); }
    catch { passed = false; }
  }
}
console.log(passed ? "PREFLIGHT_PASS" : "PREFLIGHT_FAIL");
process.exitCode = passed ? 0 : 1;
