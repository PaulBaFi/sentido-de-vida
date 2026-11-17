import { Pool, type PoolConfig } from "pg";
import { TLSSocket, checkServerIdentity } from "node:tls";
import { X509Certificate } from "node:crypto";

export function assertSecurePgConfig(config: PoolConfig): void {
  const ssl = config.ssl;
  if (config.connectionString || !config.host || !ssl || typeof ssl !== "object" ||
      ssl.rejectUnauthorized !== true || ssl.servername !== config.host ||
      (ssl.checkServerIdentity && ssl.checkServerIdentity !== checkServerIdentity) ||
      !(typeof ssl.ca === "string" || Buffer.isBuffer(ssl.ca))) throw new Error("Configuración TLS no válida.");
  const cert = new X509Certificate(ssl.ca);
  if (!cert.ca || Date.parse(cert.validFrom) > Date.now() || Date.parse(cert.validTo) <= Date.now()) {
    throw new Error("CA no válida.");
  }
}

export function assertVerifiedPgTls(stream: unknown, host: string): void {
  if (!(stream instanceof TLSSocket) || stream.encrypted !== true || stream.authorized !== true ||
      stream.authorizationError || stream.destroyed ||
      !["TLSv1.2", "TLSv1.3"].includes(stream.getProtocol() ?? "") ||
      checkServerIdentity(host, stream.getPeerCertificate())) throw new Error("TLS de cliente no verificado.");
}

export interface SqlResult { rows: readonly unknown[]; rowCount: number | null; command?: string }
export interface SqlExecutor {
  query(text: string, values?: readonly unknown[]): Promise<SqlResult>;
}
export interface SqlClient extends SqlExecutor { release(destroy?: boolean): void; assertVerifiedTls?(): void }
export interface SqlPool { connect(): Promise<SqlClient>; end(): Promise<void> }

export function createSqlPool(config: PoolConfig): SqlPool {
  assertSecurePgConfig(config);
  const pool = new Pool(config);
  // No excepciones ni configuración del driver en logs.
  pool.on("error", () => {});
  return {
    async connect() {
      const client = await pool.connect();
      const assertVerifiedTls = () => assertVerifiedPgTls(client.connection.stream, config.host!);
      try { assertVerifiedTls(); }
      catch { client.release(true); throw new Error("TLS de cliente no verificado."); }
      let broken = false;
      const onError = () => { broken = true; };
      client.on("error", onError);
      return {
        assertVerifiedTls,
        async query(text, values) {
          if (broken) throw new Error("Database connection unavailable");
          const result = await client.query(text, values ? [...values] : undefined);
          return { rows: result.rows, rowCount: result.rowCount, command: result.command };
        },
        release(destroy = false) {
          client.removeListener("error", onError);
          client.release(destroy || broken);
        },
      };
    },
    end: () => pool.end(),
  };
}
