import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OwnProfileResponse } from "@sentido/contracts";
import { sessionFailure, verifyUser, type Identity } from "../auth/flows.ts";

export type DashboardProfile =
  | { status: "ready"; displayName: string }
  | Exclude<Identity, { status: "authenticated" }>
  | { status: "forbidden" | "service_unavailable" | "invalid_response" };

/** Origen configurado por el servidor; HTTP únicamente en loopback local. */
export function usersEndpoint(value: string | undefined): URL {
  if (!value) throw new Error("Configura USERS_API_URL en el servidor.");
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) throw new Error("Origen de Usuarios no válido.");
  return new URL("/v1/users/me/profile", url);
}

const keys = (value: unknown, fields: string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));

function ownProfile(value: unknown, userId: string): value is OwnProfileResponse {
  if (!keys(value, ["data"]) || !keys(value.data, ["profile"]) || !keys(value.data.profile, ["id", "displayName"])) return false;
  const p = value.data.profile;
  return typeof p.id === "string" && p.id.toLowerCase() === userId.toLowerCase() &&
    typeof p.displayName === "string" && p.displayName.trim().length > 0 && p.displayName.length <= 201 &&
    !/[\u0000-\u001f\u007f]/.test(p.displayName);
}

async function minimalJson(response: Response): Promise<unknown> {
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !response.body) throw new Error();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) throw new Error();
      chunks.push(value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

/** getSession transporta el token; getUser verifica el mismo token para autorizar. */
export async function dashboardProfile(
  auth: Pick<SupabaseClient["auth"], "getSession" | "getUser">,
  origin: string | undefined,
  request: typeof fetch = fetch,
): Promise<DashboardProfile> {
  let token: string;
  let userId: string;
  try {
    const { data, error } = await auth.getSession();
    if (error) return sessionFailure(error);
    if (!data.session) return { status: "anonymous" };
    token = data.session.access_token;
    if (typeof token !== "string" || token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return { status: "expired" };
    const verified = await verifyUser(auth, token);
    if (verified.status !== "authenticated") return verified;
    userId = verified.userId;
  } catch (error) { return sessionFailure(error); }

  let endpoint: URL;
  try { endpoint = usersEndpoint(origin); }
  catch { return { status: "service_unavailable" }; }
  let response: Response;
  try {
    response = await request(endpoint, {
      method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(5000),
    });
  } catch { return { status: "service_unavailable" }; }
  if (response.status === 401) return { status: "expired" };
  if (response.status === 403) return { status: "forbidden" };
  if (response.status === 429 || response.status >= 500) return { status: "service_unavailable" };
  if (response.status !== 200) return { status: "invalid_response" };
  try {
    const body = await minimalJson(response);
    return ownProfile(body, userId) ? { status: "ready", displayName: body.data.profile.displayName } : { status: "invalid_response" };
  } catch { return { status: "invalid_response" }; }
}

export function profileNotice(status: DashboardProfile["status"]): string {
  if (status === "forbidden") return "Tu cuenta no tiene acceso a este espacio. Comunícate con el centro.";
  if (status === "service_unavailable") return "No pudimos cargar tu perfil en este momento. Inténtalo nuevamente en unos minutos.";
  if (status === "invalid_response") return "No pudimos cargar tu perfil de forma segura. Inténtalo nuevamente más tarde.";
  return "";
}
