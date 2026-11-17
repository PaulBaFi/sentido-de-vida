import type { UUID } from "./authorization.js";

/** Contratos PAC preparados; no hay endpoints ni persistencia habilitados. */
declare const dniBrand: unique symbol;
declare const patientIdBrand: unique symbol;
export type Dni = string & { readonly [dniBrand]: true };
export type PatientId = UUID & { readonly [patientIdBrand]: true };
export type PatientContact = Readonly<{ telefono: string | null; correo: string | null }>;
export type PatientContactPatch = Readonly<{ telefono?: string; correo?: string }>;
export type PatientRegistration = Readonly<{
  dni: Dni; nombres: string; apellidos: string; telefono?: string; correo?: string;
}>;
export type OwnPatientResponse = Readonly<{
  data: { patient: { id: PatientId; displayName: string; contact: PatientContact } };
}>;
export type AdministrativePatientResponse = Readonly<{
  data: { patient: { id: PatientId; displayName: string; active: boolean } | null };
}>;
export type PatientDraftRequest =
  | Readonly<{ method: "GET"; path: "/v1/users/me/patient"; query?: never; body?: never }>
  | Readonly<{ method: "PATCH"; path: "/v1/users/me/patient/contact"; body: PatientContactPatch; query?: never }>
  | Readonly<{ method: "POST"; path: "/v1/users/patients"; body: PatientRegistration; query?: never }>
  | Readonly<{ method: "POST"; path: "/v1/users/patients/search"; body: { dni: Dni }; query?: never }>;

export type PatientField = "dni" | "nombres" | "apellidos" | "telefono" | "correo";
export type PatientValidation<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; errors: Partial<Record<PatientField, string>>; message: string }>;

/** Formato únicamente: no comprueba existencia, titularidad ni identidad legal. */
export const isDni = (value: unknown): value is Dni => typeof value === "string" && /^[0-9]{8}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const failure = (errors: Partial<Record<PatientField, string>> = {}): PatientValidation<never> =>
  ({ ok: false, errors, message: "Revisa los datos de la solicitud." });
const text = (value: unknown, max: number): value is string => typeof value === "string" &&
  value.trim().length > 0 && value.trim().length <= max && !/[\u0000-\u001f\u007f]/.test(value);
function contactErrors(input: Record<string, unknown>): Partial<Record<PatientField, string>> {
  const errors: Partial<Record<PatientField, string>> = {};
  if (Object.hasOwn(input, "telefono") && (typeof input.telefono !== "string" || !/^\+?[0-9]{8,15}$/.test(input.telefono))) {
    errors.telefono = "Ingresa un teléfono de 8 a 15 dígitos, con + opcional.";
  }
  if (Object.hasOwn(input, "correo") && (!text(input.correo, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.correo))) {
    errors.correo = "Ingresa un correo electrónico válido.";
  }
  return errors;
}
export function validatePatientContact(value: unknown): PatientValidation<PatientContactPatch> {
  if (!record(value) || Object.keys(value).length === 0 ||
      Object.keys(value).some(key => key !== "telefono" && key !== "correo")) return failure();
  const errors = contactErrors(value);
  if (Object.keys(errors).length) return failure(errors);
  return { ok: true, value: {
    ...(Object.hasOwn(value, "telefono") ? { telefono: value.telefono as string } : {}),
    ...(Object.hasOwn(value, "correo") ? { correo: value.correo as string } : {}),
  } };
}
export function validatePatientRegistration(value: unknown): PatientValidation<PatientRegistration> {
  if (!record(value) || Object.keys(value).some(key => !["dni", "nombres", "apellidos", "telefono", "correo"].includes(key))) return failure();
  const errors = contactErrors(value);
  if (!isDni(value.dni)) errors.dni = "Ingresa un DNI de ocho dígitos.";
  if (!text(value.nombres, 100)) errors.nombres = "Ingresa nombres válidos de hasta 100 caracteres.";
  if (!text(value.apellidos, 100)) errors.apellidos = "Ingresa apellidos válidos de hasta 100 caracteres.";
  if (Object.keys(errors).length) return failure(errors);
  return { ok: true, value: {
    dni: value.dni as Dni, nombres: (value.nombres as string).trim(), apellidos: (value.apellidos as string).trim(),
    ...(Object.hasOwn(value, "telefono") ? { telefono: value.telefono as string } : {}),
    ...(Object.hasOwn(value, "correo") ? { correo: value.correo as string } : {}),
  } };
}
/** Búsqueda administrativa futura por body, nunca por URL con DNI. */
export function validatePatientLookup(value: unknown): PatientValidation<{ dni: Dni }> {
  if (!record(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, "dni")) return failure();
  return isDni(value.dni) ? { ok: true, value: { dni: value.dni } } : failure({ dni: "Ingresa un DNI de ocho dígitos." });
}
