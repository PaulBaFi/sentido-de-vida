import { createClient } from "@supabase/supabase-js";
import type { IdentityVerifier } from "../application/ports.ts";
import { UsersFailure } from "../domain/errors.ts";
import { identityFromVerifiedClaims } from "./identity-validation.ts";

/** Factoría no conectada al arranque por defecto. No carga variables ni accede a PostgreSQL. */
export function createSupabaseIdentityVerifier(config: {
  url: string; publishableKey: string;
}, options: { fetch?: typeof fetch; now?: () => number } = {}): IdentityVerifier {
  let url: URL;
  try { url = new URL(config.url); } catch { throw new UsersFailure("dependency_unavailable"); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey)) throw new UsersFailure("dependency_unavailable");
  const origin = url.origin;
  const networkFetch = options.fetch ?? fetch;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const client = createClient(origin, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const destination = new URL(input instanceof Request ? input.url : input.toString());
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      if (destination.origin !== origin || method !== "GET" ||
          !["/auth/v1/.well-known/jwks.json", "/auth/v1/user"].includes(destination.pathname)) {
        throw new UsersFailure("dependency_unavailable");
      }
      try {
        const timeout = AbortSignal.timeout(10_000);
        return await networkFetch(input, { ...init, redirect: "error",
          signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
      } catch {
        // No pasar errores originales al logger interno del SDK.
        return Response.json({ msg: "Auth dependency unavailable" }, { status: 503 });
      }
    } },
  });
  return {
    async verify(token) {
      if (typeof token !== "string" || token.length > 8192 ||
          !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new UsersFailure("unauthenticated");
      try {
        const { data, error } = await client.auth.getClaims(token);
        if (error) {
          if (error.status === 0 || (error.status ?? 0) >= 500 ||
              error.status === 429 || error.status === 404) throw new UsersFailure("dependency_unavailable");
          throw new UsersFailure("unauthenticated");
        }
        if (!data?.claims) throw new UsersFailure("unauthenticated");
        return identityFromVerifiedClaims(data.claims, origin + "/auth/v1", now());
      } catch (error) {
        if (error instanceof UsersFailure) throw error;
        if (error instanceof TypeError) throw new UsersFailure("dependency_unavailable");
        throw new UsersFailure("unauthenticated");
      }
    },
  };
}
