import type { UUID, VerifiedIdentity } from "@sentido/contracts";
export interface IdentityVerifier {
  verify(token: string): Promise<VerifiedIdentity>;
}
export interface ProfileRepository {
  /** Buscar exclusivamente por subject verificado; el resultado aún se valida. */
  findByAuthSubject(subject: UUID): Promise<unknown | null>;
}
export interface AuthorizationAudit {
  record(event: Readonly<{
    requestId: UUID;
    subject: UUID;
    permission: "users.profile.read";
    policyVersion: "phase-2.3-draft";
  }>): Promise<void>;
}

export type ProfileTransaction = Readonly<{ profiles: ProfileRepository; audit: AuthorizationAudit }>;
export interface OwnProfileUnitOfWork {
  run<T>(identity: VerifiedIdentity, requestId: UUID, work: (ports: ProfileTransaction) => Promise<T>): Promise<T>;
}
