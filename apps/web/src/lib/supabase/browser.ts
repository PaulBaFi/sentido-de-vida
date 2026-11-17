"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "./env";

/** Fachada limitada a Auth: no expone tablas, RPC, Storage ni Realtime. */
export function createBrowserAuthClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  const client = createBrowserClient(url, publishableKey);
  return { auth: client.auth };
}
