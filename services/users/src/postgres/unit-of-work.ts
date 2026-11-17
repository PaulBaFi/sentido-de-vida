import type { UUID, VerifiedIdentity } from "@sentido/contracts";
import type { OwnProfileUnitOfWork, ProfileTransaction } from "../application/ports.ts";
import type { SqlClient, SqlExecutor, SqlPool } from "./connection.ts";
import { UsersFailure } from "../domain/errors.ts";
import { planOwnProfileRead } from "../repositories/postgres-profile-plan.ts";
import { PostgresProfileRepository } from "../repositories/postgres-profile-repository.ts";
import { transactionAudit } from "./audit.ts";

export class PostgresUnitOfWork implements OwnProfileUnitOfWork {
  private readonly pool: SqlPool;
  constructor(pool: SqlPool) { this.pool = pool; }

  async run<T>(identity: VerifiedIdentity, requestId: UUID, work: (ports: ProfileTransaction) => Promise<T>): Promise<T> {
    let client: SqlClient | undefined;
    let began = false;
    let committing = false;
    let active = false;
    let destroy = false;
    let rollbackFailed = false;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      began = true;
      active = true;
      const context = planOwnProfileRead(identity).context;
      await client.query(context.text, context.values);
      const captured = client;
      const scoped: SqlExecutor = {
        query(text, values) {
          if (!active) return Promise.reject(new UsersFailure("dependency_unavailable"));
          return captured.query(text, values);
        },
      };
      const result = await work({
        profiles: new PostgresProfileRepository(scoped, identity),
        audit: transactionAudit(scoped, identity.subject, requestId),
      });
      active = false;
      committing = true;
      const committed = await client.query("COMMIT");
      if (committed.command !== "COMMIT") throw new UsersFailure("dependency_unavailable");
      began = false;
      return result;
    } catch (error) {
      active = false;
      destroy = committing || !(error instanceof UsersFailure) || !began;
      if (client && began) {
        try { await client.query("ROLLBACK"); }
        catch { destroy = true; rollbackFailed = true; }
      }
      if (!committing && !rollbackFailed && error instanceof UsersFailure) throw error;
      throw new UsersFailure("dependency_unavailable");
    } finally {
      active = false;
      client?.release(destroy);
    }
  }
}
