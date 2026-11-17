import { createClient } from "@supabase/supabase-js";
import type { SupabasePublicEnv } from "./env";

type ConnectivityStatus =
  | "connected"
  | "network_error"
  | "invalid_credentials"
  | "access_denied"
  | "service_error"
  | "unexpected_response";

export type ConnectivityResult = {
  status: ConnectivityStatus;
  httpStatus?: number;
};

/**
 * Diagnóstico explícito, sin usuarios, cookies ni persistencia de sesiones.
 * Solo GET /settings y GET /user con un JWT sintético inválido.
 * No devuelve cuerpos, claves, tokens ni mensajes remotos.
 */
export async function checkAuthConnectivity(
  env: SupabasePublicEnv,
  fetcher: typeof fetch = fetch,
): Promise<ConnectivityResult> {
  let networkError = false;
  const allowed = ["/auth/v1/settings", "/auth/v1/user"];
  const safeFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (url.origin !== env.url || !allowed.includes(url.pathname) || method !== "GET") {
      throw new Error("Diagnóstico Auth: petición fuera del alcance de solo lectura.");
    }

    try {
      return await fetcher(input, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      networkError = true;
      // Evita que el SDK imprima excepciones originales con información remota.
      return Response.json(
        { error_code: "diagnostic_network_error", msg: "Error de red en diagnóstico." },
        { status: 503 },
      );
    }
  };

  const classify = (status: number): ConnectivityResult => {
    if (networkError) return { status: "network_error" };
    if (status === 401) return { status: "invalid_credentials", httpStatus: status };
    if (status === 403) return { status: "access_denied", httpStatus: status };
    return { status: "service_error", httpStatus: status };
  };

  const response = await safeFetch(new URL("/auth/v1/settings", env.url), {
    method: "GET",
    headers: { apikey: env.publishableKey },
    cache: "no-store",
  });
  if (!response.ok) return classify(response.status);

  try {
    const settings: unknown = await response.json();
    if (
      !settings ||
      typeof settings !== "object" ||
      !("external" in settings) ||
      !settings.external ||
      typeof settings.external !== "object" ||
      !("disable_signup" in settings) ||
      typeof settings.disable_signup !== "boolean"
    ) {
      return { status: "unexpected_response", httpStatus: response.status };
    }
  } catch {
    return { status: "unexpected_response", httpStatus: response.status };
  }

  // No usar el cliente SSR ligado a cookies de un usuario para este diagnóstico.
  const client = createClient(env.url, env.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: safeFetch },
  });

  const { error } = await client.auth.getUser("connectivity-probe-not-a-valid-jwt");
  if (networkError) return { status: "network_error" };
  // El rechazo explícito del JWT sintético confirma que el SDK llegó a Auth.
  if (error?.code === "bad_jwt") return { status: "connected", httpStatus: 200 };
  if (error) return classify(error.status ?? 500);
  return { status: "unexpected_response" };
}
