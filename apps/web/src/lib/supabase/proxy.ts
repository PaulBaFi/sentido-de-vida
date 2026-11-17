import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "./env";
import { isProtectedPath, loginDestination, sessionFailure, type Identity } from "@/lib/auth/flows";
import { privateAuthResponse } from "@/lib/auth/response";

/** Renovación y primera barrera; el dashboard verifica además getUser() en servidor. */
export async function updateAuthSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const protectedRoute = isProtectedPath(request.nextUrl.pathname);
  const authRoute = protectedRoute || request.nextUrl.pathname === "/login";
  const finish = (identity?: Identity) => {
    if (protectedRoute && identity?.status !== "authenticated") {
      return privateAuthResponse(response, new URL(loginDestination(identity ?? { status: "unavailable" }), request.url));
    }
    return authRoute ? privateAuthResponse(response) : response;
  };

  try {
    const env = getSupabasePublicEnv(false);
    if (!env) return finish({ status: "unavailable" });

    const client = createServerClient(env.url, env.publishableKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, cacheHeaders) {
          const previous = response;
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const cookie of previous.cookies.getAll()) response.cookies.set(cookie);
          for (const header of ["cache-control", "expires", "pragma"]) {
            const value = previous.headers.get(header);
            if (value) response.headers.set(header, value);
          }
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          for (const [name, value] of Object.entries(cacheHeaders)) response.headers.set(name, value);
        },
      },
    });

    const { data, error } = await client.auth.getClaims();
    if (error) return finish(sessionFailure(error));
    return finish(data?.claims?.sub ? { status: "authenticated" } : { status: "anonymous" });
  } catch (error) {
    const failure = sessionFailure(error);
    return finish(failure.status === "expired" ? { status: "unavailable" } : failure);
  }
}
