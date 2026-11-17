import { createGetOwnProfile } from "./application/get-own-profile.ts";
import { createUsersHandler } from "./http/handler.ts";
import { UsersFailure } from "./domain/errors.ts";
import { UnavailableProfileRepository } from "./repositories/unavailable-profile-repository.ts";

/** Arranque cerrado: no interpreta credenciales ni habilita adaptadores por entorno. */
export function createDisabledUsersHandler() {
  return createUsersHandler(createGetOwnProfile({
    identity: { async verify() { throw new UsersFailure("dependency_unavailable"); } },
    profiles: new UnavailableProfileRepository(),
    audit: { async record() { throw new UsersFailure("dependency_unavailable"); } },
    now: () => Math.floor(Date.now() / 1000),
  }));
}
