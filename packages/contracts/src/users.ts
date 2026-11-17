import type { UUID } from "./authorization";
export type OwnProfileResponse = Readonly<{
  data: Readonly<{ profile: Readonly<{ id: UUID; displayName: string }> }>;
}>;
export type UsersErrorCode = "unauthenticated" | "forbidden" | "dependency_unavailable" | "invalid_request" | "not_found" | "method_not_allowed";
export type UsersErrorResponse = Readonly<{ error: Readonly<{ code: UsersErrorCode; message: string }> }>;

/** Ruta propia: sin identificadores, filtros, cuerpo ni par?metros del cliente. */
export type OwnProfileRequest = Readonly<{
  method: "GET";
  path: "/v1/users/me/profile";
  query?: never;
  body?: never;
}>;
