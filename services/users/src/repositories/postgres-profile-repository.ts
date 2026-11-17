import type { UUID, VerifiedIdentity } from "@sentido/contracts";
import type { ProfileRepository } from "../application/ports.ts";
import type { SqlExecutor } from "../postgres/connection.ts";
import { UsersFailure } from "../domain/errors.ts";
import { mapOwnProfileRows, planOwnProfileRead } from "./postgres-profile-plan.ts";

export class PostgresProfileRepository implements ProfileRepository {
  constructor(executor: SqlExecutor, identity: VerifiedIdentity) {
    this.executor = executor;
    this.identity = identity;
  }
  private readonly executor: SqlExecutor;
  private readonly identity: VerifiedIdentity;

  async findByAuthSubject(subject: UUID) {
    if (subject.toLowerCase() !== this.identity.subject.toLowerCase()) throw new UsersFailure("forbidden");
    const query = planOwnProfileRead(this.identity).profile;
    const result = await this.executor.query(query.text, query.values);
    return mapOwnProfileRows(result.rows);
  }
}
