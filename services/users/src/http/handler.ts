import { randomUUID } from "node:crypto";
import type { UUID, UsersErrorCode } from "@sentido/contracts";
import type { createGetOwnProfile } from "../application/get-own-profile.ts";
import { UsersFailure } from "../domain/errors.ts";
import { bearerToken, invalidOwnProfileRequest, validOwnProfileResponse } from "./validation.ts";

const messages: Record<UsersErrorCode, string> = {
  unauthenticated: "Se requiere autenticación válida.",
  forbidden: "No tienes permiso para realizar esta operación.",
  dependency_unavailable: "El servicio no está disponible en este momento.",
  invalid_request: "La solicitud no es válida.",
  not_found: "Recurso no encontrado.",
  method_not_allowed: "Método no permitido.",
};
export function createUsersHandler(getOwnProfile: ReturnType<typeof createGetOwnProfile>) {
  return async (request: Request): Promise<Response> => {
    const requestId = randomUUID() as UUID;
    const headers = new Headers({
      "Cache-Control": "private, no-store, max-age=0",
      "Pragma": "no-cache", "Expires": "0",
      "X-Content-Type-Options": "nosniff", "X-Request-Id": requestId,
    });
    const errorResponse = (status: number, code: UsersErrorCode) => {
      if (status === 401) headers.set("WWW-Authenticate", 'Bearer realm="users"');
      if (status === 503) headers.set("Retry-After", "30");
      return Response.json({ error: { code, message: messages[code] } }, { status, headers });
    };
    try {
      if (new URL(request.url).pathname !== "/v1/users/me/profile") return errorResponse(404, "not_found");
      if (request.method !== "GET") {
        headers.set("Allow", "GET");
        return errorResponse(405, "method_not_allowed");
      }
      if (invalidOwnProfileRequest(request)) return errorResponse(400, "invalid_request");
      const token = bearerToken(request.headers);
      if (!token) return errorResponse(401, "unauthenticated");
      const body = await getOwnProfile(token, requestId);
      if (!validOwnProfileResponse(body)) return errorResponse(503, "dependency_unavailable");
      return Response.json(body, { status: 200, headers });
    } catch (error) {
      if (error instanceof UsersFailure) {
        if (error.kind === "unauthenticated") return errorResponse(401, "unauthenticated");
        if (error.kind === "forbidden") return errorResponse(403, "forbidden");
      }
      return errorResponse(503, "dependency_unavailable");
    }
  };
}
