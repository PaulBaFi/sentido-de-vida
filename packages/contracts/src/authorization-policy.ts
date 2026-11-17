import type {
  ApplicationRole, AuthorizationDecision, AuthorizationRequest, DenialReason,
} from "./authorization";

/** Referencia de diseño; Usuarios la reutiliza solo en su preparación sin datos reales. */
export const DRAFT_POLICY_VERSION = "phase-2.3-draft" as const;
export const DRAFT_MAX_AGE_SECONDS = 60;
const roles: readonly ApplicationRole[] = ["administrador", "recepcionista", "psicologo", "paciente"];
const uuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const same = (a: unknown, b: unknown) => uuid(a) && uuid(b) && a.toLowerCase() === b.toLowerCase();
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const instant = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const deny = (reason: DenialReason): AuthorizationDecision => ({ allowed: false, reason });

/**
 * Función pura. Los tipos nominales no son prueba criptográfica:
 * solo adaptadores confiables podrán crear contexto/evidencia en la etapa futura.
 * Un allow es insuficiente sin cumplir obligations y reglas del dominio.
 */
export function decidePermission(input: AuthorizationRequest): AuthorizationDecision {
  const request = record(input);
  if (!request || !instant(request.now)) return deny("invalid_request");
  if (request.context === null || request.context === undefined) return deny("unauthenticated");
  const context = record(request.context);
  const identity = record(context?.identity);
  const profile = record(context?.profile);
  if (!context || !identity || !profile ||
      context.policyVersion !== DRAFT_POLICY_VERSION || !uuid(context.requestId) ||
      !uuid(identity.subject) || !uuid(profile.id) ||
      (identity.verificationMethod !== "getUser" && identity.verificationMethod !== "getClaims")) return deny("invalid_context");
  if (!same(identity.subject, profile.id)) return deny("identity_mismatch");
  if (profile.active === false) return deny("inactive_profile");
  if (profile.active !== true) return deny("invalid_context");
  if (!roles.includes(profile.role as ApplicationRole)) return deny("unknown_role");
  const now = request.now;
  if (!instant(identity.verifiedAt) || !instant(identity.expiresAt) || !instant(profile.checkedAt) ||
      identity.verifiedAt > now || profile.checkedAt > now ||
      identity.expiresAt <= now || identity.expiresAt <= identity.verifiedAt ||
      now - identity.verifiedAt > DRAFT_MAX_AGE_SECONDS ||
      now - profile.checkedAt > DRAFT_MAX_AGE_SECONDS) return deny("stale_context");

  // PAC está reservado: validar un contrato no habilita datos ni permisos SQL.
  // No se conecta ninguna operación hasta aprobar su autorización y persistencia.
  if (typeof request.permission === "string" && ["patients.read-self", "patients.update-own-contact", "patients.create", "patients.read-admin", "patients.update-contact-admin"].includes(request.permission)) {
    return deny("pending_approval");
  }

  const permissionKinds: Record<string, string> = {
    "users.profile.read": "profile", "users.profile.update-contact": "profile",
    "catalog.service.read": "service", "catalog.service.manage": "service",
    "appointments.read": "appointment", "appointments.reschedule": "appointment",
    "payments.read": "payment", "payments.record": "payment",
    "notifications.read": "notification", "notifications.retry": "notification",
  };
  if (typeof request.permission === "string" && ["users.roles.assign", "payments.refund.approve", "reports.read", "clinical.read"].includes(request.permission)) {
    return deny("pending_approval");
  }
  if (typeof request.permission !== "string" ||
      !Object.hasOwn(permissionKinds, request.permission)) return deny("permission_denied");
  const target = record(request.target);
  if (!target || !uuid(target.id) || target.kind !== permissionKinds[request.permission]) return deny("invalid_request");
  if (request.resource === null || request.resource === undefined) return deny("resource_not_found");
  const resource = record(request.resource);
  if (!resource || resource.kind !== target.kind || !same(resource.id, target.id)) return deny("resource_mismatch");
  if (!instant(resource.resolvedAt) || resource.resolvedAt > now ||
      now - resource.resolvedAt > DRAFT_MAX_AGE_SECONDS) return deny("stale_context");

  const role = profile.role as ApplicationRole;
  const staff = role === "administrador" || role === "recepcionista";
  const self = resource.kind === "profile" ? same(identity.subject, resource.profileId)
    : resource.kind === "appointment" || resource.kind === "payment" ? same(identity.subject, resource.patientProfileId)
    : resource.kind === "notification" ? same(identity.subject, resource.recipientProfileId) : false;
  const assigned = role === "psicologo" && same(identity.subject, resource.psychologistProfileId);
  let allowed = false;
  let scope: "self" | "assigned" | "operational" = "operational";
  let projection: Extract<AuthorizationDecision, { allowed: true }>["obligations"]["projection"] = "profile-contact";

  switch (resource.kind) {
    case "profile":
      if (!same(resource.profileId, resource.id)) return deny("resource_mismatch");
      // La recepción no recibe acceso genérico a perfiles; el caso paciente requiere contrato aparte.
      allowed = role === "administrador" || self;
      if (request.permission === "users.profile.update-contact") {
        if (!Array.isArray(request.fields) || request.fields.length === 0 ||
            request.fields.some(field => field !== "telefono")) return deny("permission_denied");
      } else if (request.fields !== undefined) return deny("invalid_request");
      scope = self ? "self" : "operational";
      break;
    case "service":
      if (typeof resource.published !== "boolean" || request.fields !== undefined) return deny("invalid_request");
      projection = "catalog";
      allowed = request.permission === "catalog.service.manage"
        ? role === "administrador" : staff || resource.published;
      break;
    case "appointment":
      if (!uuid(resource.patientProfileId) || !uuid(resource.psychologistProfileId) || request.fields !== undefined) return deny("invalid_request");
      projection = "appointment-operational";
      allowed = staff || (role === "paciente" && self) ||
        (request.permission === "appointments.read" && assigned);
      scope = staff ? "operational" : assigned ? "assigned" : "self";
      break;
    case "payment":
      if (!uuid(resource.patientProfileId) || request.fields !== undefined) return deny("invalid_request");
      projection = "payment-summary";
      allowed = staff || (request.permission === "payments.read" && role === "paciente" && self);
      scope = staff ? "operational" : "self";
      break;
    case "notification":
      if (!uuid(resource.recipientProfileId) || request.fields !== undefined) return deny("invalid_request");
      projection = "notification-status";
      allowed = role === "administrador" || (request.permission === "notifications.read" && self);
      scope = self ? "self" : "operational";
      break;
  }
  if (!allowed) return deny("permission_denied");
  return {
    allowed: true, policyVersion: DRAFT_POLICY_VERSION,
    obligations: {
      scope, projection, audit: true,
      ...(request.permission === "users.profile.update-contact" ? { writableFields: ["telefono"] as const } : {}),
    },
  };
}
