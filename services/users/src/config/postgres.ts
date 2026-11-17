import { readFileSync, realpathSync, statSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import { isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolConfig } from "pg";
import { UsersFailure } from "../domain/errors.ts";

const workspace = fileURLToPath(new URL("../../../../", import.meta.url));
export function readPrivateFile(path: string): string {
  if (!isAbsolute(path)) throw new UsersFailure("dependency_unavailable");
  const actual = realpathSync(path);
  const location = relative(workspace, actual);
  if (!(location.startsWith(".." + sep) || isAbsolute(location))) throw new UsersFailure("dependency_unavailable");
  const stat = statSync(actual);
  if (!stat.isFile() || stat.size === 0 || stat.size > 1_048_576 ||
      (process.platform !== "win32" && (stat.mode & 0o077) !== 0)) throw new UsersFailure("dependency_unavailable");
  return readFileSync(actual, "utf8");
}
export type PgSettings = Readonly<{
  mode: "direct" | "session" | "transaction";
  pool: PoolConfig;
  auth: { url: string; publishableKey: string };
}>;

export function loadPgSettings(
  env: NodeJS.ProcessEnv,
  read = readPrivateFile,
): PgSettings | null {
  if (env.USERS_PG_ENABLED !== "true") return null;
  return readPgSettings(env, read);
}

/** Inspección explícita: valida configuración sin habilitar el servicio. */
export function readPgSettings(env: NodeJS.ProcessEnv, read = readPrivateFile): PgSettings {
  try {
    const required = (key: string) => {
      const value = env[key]?.trim();
      if (!value) throw new UsersFailure("dependency_unavailable");
      return value;
    };
    if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new UsersFailure("dependency_unavailable");
    const host = required("USERS_PG_HOST");
    const mode = required("USERS_PG_MODE");
    const user = required("USERS_PG_USER");
    const port = Number(required("USERS_PG_PORT"));
    const database = required("USERS_PG_DATABASE");
    const passwordFile = required("USERS_PG_PASSWORD_FILE");
    const caFile = required("USERS_PG_CA_FILE");
    if (!/^[A-Za-z0-9][A-Za-z0-9.-]{0,251}[A-Za-z0-9]$/.test(host) || host.includes("..") || isIP(host) ||
        !["direct", "session", "transaction"].includes(mode) ||
        (mode === "direct" ? user !== "sdv_users_app" : !/^sdv_users_app\.[a-z0-9]{20}$/.test(user)) ||
        !Number.isInteger(port) || port < 1 || port > 65535 ||
        !/^[a-zA-Z0-9_-]{1,63}$/.test(database) ||
        !isAbsolute(passwordFile) || !isAbsolute(caFile)) throw new UsersFailure("dependency_unavailable");
    const password = read(passwordFile).replace(/\r?\n$/, "");
    const ca = read(caFile);
    const certificate = new X509Certificate(ca);
    if (!password || password.length > 4096 || /[\r\n\0]/.test(password) ||
        !certificate.ca || Date.parse(certificate.validTo) <= Date.now() ||
        Date.parse(certificate.validFrom) > Date.now()) throw new UsersFailure("dependency_unavailable");
    return {
      mode: mode as PgSettings["mode"],
      pool: { host, port, user, database, password,
        ssl: { ca, rejectUnauthorized: true, servername: host, minVersion: "TLSv1.2" },
        max: 2, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000,
        query_timeout: 3500, statement_timeout: 2000, lock_timeout: 500,
        idle_in_transaction_session_timeout: 5000, application_name: "sentido-users" },
      auth: { url: required("USERS_AUTH_URL"), publishableKey: required("USERS_AUTH_PUBLISHABLE_KEY") },
    };
  } catch {
    throw new UsersFailure("dependency_unavailable");
  }
}
