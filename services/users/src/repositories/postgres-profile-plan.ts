import type { VerifiedIdentity, UUID } from "@sentido/contracts";
import { UsersFailure } from "../domain/errors.ts";
import { isRecord, isUuid, validateProfile, type Profile } from "../domain/profile.ts";

export type ParameterizedRead = Readonly<{ text: string; values: readonly UUID[] }>;

/**
 * Diseño puro, sin driver, conexión, lectura de secretos ni registro de consultas.
 * La identidad debe proceder del adaptador verificado; esto no autentica JWT.
 * Ambos statements requieren el mismo cliente y una transacción explícita.
 */
export function planOwnProfileRead(identity: VerifiedIdentity): Readonly<{
  phase: "design-only";
  context: ParameterizedRead;
  profile: ParameterizedRead;
}> {
  if (!identity || !isUuid(identity.subject)) throw new UsersFailure("unauthenticated");
  const values = Object.freeze([identity.subject]);
  return Object.freeze({
    phase: "design-only" as const,
    context: Object.freeze({
      text: "SELECT pg_catalog.set_config('app.auth_subject', $1::text, true)",
      values,
    }),
    profile: Object.freeze({
      text: "SELECT id, nombres, apellidos, rol, activo FROM usuarios.perfiles WHERE id = $1::uuid",
      values,
    }),
  });
}

/** Conversión del resultado propuesto: no filtra por activo ni asigna roles de respaldo. */
export function mapOwnProfileRows(rows: readonly unknown[]): Profile | null {
  if (!Array.isArray(rows)) throw new UsersFailure("dependency_unavailable");
  if (rows.length === 0) return null;
  if (rows.length !== 1) throw new UsersFailure("dependency_unavailable");
  const row = rows[0];
  const columns = ["id", "nombres", "apellidos", "rol", "activo"];
  if (!isRecord(row) || Object.keys(row).length !== columns.length ||
      columns.some(column => !Object.hasOwn(row, column))) {
    throw new UsersFailure("dependency_unavailable");
  }
  return validateProfile({
    id: row.id, givenName: row.nombres, familyName: row.apellidos,
    role: row.rol, active: row.activo,
  });
}
