import type { UUID } from "@sentido/contracts";
import type { AuthorizationAudit } from "../application/ports.ts";
import type { SqlExecutor } from "./connection.ts";
import { UsersFailure } from "../domain/errors.ts";

export const INSERT_AUDIT_SQL = `INSERT INTO usuarios.auditoria_accesos
  (request_id, actor_id, recurso_id, operacion, policy_version, resultado)
  VALUES ($1::uuid, $2::uuid, $2::uuid, 'users.profile.read', $3::text, 'allowed')`;

export function transactionAudit(executor: SqlExecutor, subject: UUID, requestId: UUID): AuthorizationAudit {
  return {
    async record(event) {
      if (event.subject !== subject || event.requestId !== requestId || event.permission !== "users.profile.read") {
        throw new UsersFailure("forbidden");
      }
      const result = await executor.query(INSERT_AUDIT_SQL, [requestId, subject, event.policyVersion]);
      if (result.rowCount !== 1) throw new UsersFailure("dependency_unavailable");
    },
  };
}
