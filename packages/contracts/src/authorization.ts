/** Contratos propuestos; aún no hay adaptadores de Auth ni de perfiles conectados. */
declare const uuidBrand: unique symbol;
declare const identityBrand: unique symbol;
declare const profileBrand: unique symbol;

export type UUID = string & { readonly [uuidBrand]: "uuid" };
export type ApplicationRole = "administrador" | "recepcionista" | "psicologo" | "paciente";
export type VerifiedIdentity = Readonly<{
  subject: UUID;
  verificationMethod: "getUser" | "getClaims";
  verifiedAt: number;
  expiresAt: number;
}> & { readonly [identityBrand]: true };
export type ActiveProfile = Readonly<{
  id: UUID;
  role: ApplicationRole;
  active: true;
  checkedAt: number;
}> & { readonly [profileBrand]: true };

export type AuthorizationContext = Readonly<{
  identity: VerifiedIdentity;
  profile: ActiveProfile;
  requestId: UUID;
  policyVersion: "phase-2.3-draft";
}>;

export type Permission =
  | "patients.read-self" | "patients.update-own-contact" | "patients.create" | "patients.read-admin" | "patients.update-contact-admin"
  | "users.profile.read" | "users.profile.update-contact" | "users.roles.assign"
  | "catalog.service.read" | "catalog.service.manage"
  | "appointments.read" | "appointments.reschedule"
  | "payments.read" | "payments.record" | "payments.refund.approve"
  | "notifications.read" | "notifications.retry"
  | "reports.read" | "clinical.read";

export type ResourceKind = "profile" | "service" | "appointment" | "payment" | "notification";
type ResourceBase = Readonly<{ id: UUID; resolvedAt: number }>;
/** Evidencia resuelta por backend de confianza; nunca por el navegador. */
export type ResourceEvidence = ResourceBase & (
  | { readonly kind: "profile"; readonly profileId: UUID }
  | { readonly kind: "service"; readonly published: boolean }
  | { readonly kind: "appointment"; readonly patientProfileId: UUID; readonly psychologistProfileId: UUID }
  | { readonly kind: "payment"; readonly patientProfileId: UUID }
  | { readonly kind: "notification"; readonly recipientProfileId: UUID }
);

export type AuthorizationRequest = Readonly<{
  context: AuthorizationContext | null;
  permission: Permission;
  target: Readonly<{ kind: ResourceKind; id: UUID }>;
  resource: ResourceEvidence | null;
  fields?: readonly string[];
  now: number;
}>;

export type DenialReason =
  | "unauthenticated" | "invalid_context" | "identity_mismatch" | "inactive_profile"
  | "unknown_role" | "stale_context" | "invalid_request" | "resource_not_found"
  | "resource_mismatch" | "permission_denied" | "pending_approval";

export type AuthorizationDecision =
  | Readonly<{ allowed: false; reason: DenialReason }>
  | Readonly<{
      allowed: true;
      policyVersion: "phase-2.3-draft";
      obligations: Readonly<{
        scope: "self" | "assigned" | "operational";
        projection: "profile-contact" | "catalog" | "appointment-operational" | "payment-summary" | "notification-status";
        audit: true;
        writableFields?: readonly ["telefono"];
      }>;
    }>;
