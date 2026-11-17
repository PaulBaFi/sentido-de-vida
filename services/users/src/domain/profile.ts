import type { UUID } from "@sentido/contracts";
import { UsersFailure } from "./errors.ts";
export type Profile = Readonly<{
  id: UUID;
  role: string;
  active: boolean;
  givenName: string;
  familyName: string;
}>;
export const isUuid = (value: unknown): value is UUID =>
  typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function validateProfile(value: unknown): Profile {
  if (!isRecord(value) || !isUuid(value.id) ||
      typeof value.role !== "string" || typeof value.active !== "boolean" ||
      typeof value.givenName !== "string" || typeof value.familyName !== "string" ||
      !value.givenName.trim() || !value.familyName.trim() ||
      value.givenName.trim().length > 100 || value.familyName.trim().length > 100) {
    throw new UsersFailure("dependency_unavailable");
  }
  // Proyección explícita, sin copiar columnas adicionales del repositorio.
  return { id: value.id, role: value.role, active: value.active,
    givenName: value.givenName.trim(), familyName: value.familyName.trim() };
}
