import type { ActiveProfile, AuthorizationContext, OwnProfileResponse, UUID, VerifiedIdentity } from "@sentido/contracts";
import { decidePermission, DRAFT_POLICY_VERSION } from "@sentido/contracts/authorization-design";
import type { AuthorizationAudit, IdentityVerifier, OwnProfileUnitOfWork, ProfileRepository, ProfileTransaction } from "./ports.ts";
import { UsersFailure } from "../domain/errors.ts";
import { validateProfile } from "../domain/profile.ts";
import { validateVerifiedIdentity } from "../security/identity-validation.ts";

async function readAuthorizedProfile(
  identity: VerifiedIdentity, requestId: UUID, ports: ProfileTransaction, now: () => number,
): Promise<OwnProfileResponse> {
  const found = await ports.profiles.findByAuthSubject(identity.subject);
  if (found === null) throw new UsersFailure("forbidden");
  const profile = validateProfile(found);
  const checkedAt = now();
  const context = {
    identity,
    profile: { id: profile.id, role: profile.role, active: profile.active, checkedAt } as ActiveProfile,
    requestId, policyVersion: DRAFT_POLICY_VERSION,
  } as AuthorizationContext;
  const decision = decidePermission({
    context, permission: "users.profile.read",
    target: { kind: "profile", id: identity.subject },
    resource: { kind: "profile", id: profile.id, profileId: profile.id, resolvedAt: checkedAt },
    now: checkedAt,
  });
  if (!decision.allowed || decision.obligations.scope !== "self" ||
      decision.obligations.projection !== "profile-contact") throw new UsersFailure("forbidden");
  await ports.audit.record({ requestId, subject: identity.subject,
    permission: "users.profile.read", policyVersion: decision.policyVersion });
  return { data: { profile: { id: identity.subject, displayName: profile.givenName + " " + profile.familyName } } };
}

/** Composición de puertos para pruebas y arranque deshabilitado. */
export function createGetOwnProfile(deps: {
  identity: IdentityVerifier; profiles: ProfileRepository; audit: AuthorizationAudit; now: () => number;
}) {
  return async (token: string, requestId: UUID): Promise<OwnProfileResponse> => {
    try {
      const identity = validateVerifiedIdentity(await deps.identity.verify(token), deps.now());
      return await readAuthorizedProfile(identity, requestId, deps, deps.now);
    } catch (error) {
      if (error instanceof UsersFailure) throw error;
      throw new UsersFailure("dependency_unavailable");
    }
  };
}

/** La verificación remota ocurre ANTES de adquirir la conexión PostgreSQL. */
export function createTransactionalGetOwnProfile(deps: {
  identity: IdentityVerifier; transactions: OwnProfileUnitOfWork; now: () => number;
}) {
  return async (token: string, requestId: UUID): Promise<OwnProfileResponse> => {
    try {
      const identity = validateVerifiedIdentity(await deps.identity.verify(token), deps.now());
      return await deps.transactions.run(identity, requestId,
        ports => readAuthorizedProfile(identity, requestId, ports, deps.now));
    } catch (error) {
      if (error instanceof UsersFailure) throw error;
      throw new UsersFailure("dependency_unavailable");
    }
  };
}
