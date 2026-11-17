import type { VerifiedIdentity } from "@sentido/contracts";
import { isRecord, isUuid } from "../domain/profile.ts";
import { UsersFailure } from "../domain/errors.ts";

/** Únicamente después de verificar la firma con el SDK; no acepta claims decodificados sin verificar. */
export function identityFromVerifiedClaims(value: unknown, issuer: string, now: number): VerifiedIdentity {
  if (!isRecord(value) || !isUuid(value.sub) || value.iss !== issuer ||
      !(value.aud === "authenticated" || (Array.isArray(value.aud) && value.aud.includes("authenticated"))) ||
      value.role !== "authenticated" || !Number.isSafeInteger(value.exp) ||
      (value.exp as number) <= now || !Number.isSafeInteger(value.iat) ||
      ((value.iat as number) <= 0 || (value.iat as number) > now || (value.exp as number) <= (value.iat as number)) ||
      (value.nbf !== undefined && (!Number.isSafeInteger(value.nbf) || (value.nbf as number) > now))) {
    throw new UsersFailure("unauthenticated");
  }
  return { subject: value.sub, verificationMethod: "getClaims", verifiedAt: now,
    expiresAt: value.exp as number } as VerifiedIdentity;
}

export function validateVerifiedIdentity(value: unknown, now: number): VerifiedIdentity {
  if (!isRecord(value) || !isUuid(value.subject) ||
      !["getUser", "getClaims"].includes(value.verificationMethod as string) ||
      !Number.isSafeInteger(value.verifiedAt) || !Number.isSafeInteger(value.expiresAt) ||
      (value.expiresAt as number) <= now || (value.verifiedAt as number) > now) {
    throw new UsersFailure("unauthenticated");
  }
  // No demuestra origen: solo se invoca sobre la salida del puerto de identidad confiable.
  return value as unknown as VerifiedIdentity;
}
