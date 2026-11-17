import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "./env";

/** Crear por petición; no compartir sesiones entre usuarios. */
export async function createServerAuthClient(writable = false) {
  const { url, publishableKey } = getSupabasePublicEnv();
  const cookieStore = await cookies();
  const client = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch (error) {
          if (writable) throw error;
          // Server Components no pueden escribir cookies.
          // El proxy persiste la renovación antes de renderizar.
        }
      },
    },
  });
  return { auth: client.auth };
}
