import type { ProfileRepository } from "../application/ports.ts";
import { UsersFailure } from "../domain/errors.ts";

/** Sin driver PostgreSQL, credenciales, red ni datos de respaldo. */
export class UnavailableProfileRepository implements ProfileRepository {
  async findByAuthSubject(): Promise<never> {
    throw new UsersFailure("dependency_unavailable");
  }
}
