import "server-only";
import { createServerAuthClient } from "@/lib/supabase/server";
import { verifyIdentity, type Identity } from "./flows";

export async function getIdentity(): Promise<Identity> {
  try {
    const { auth } = await createServerAuthClient();
    return await verifyIdentity(auth);
  } catch {
    return { status: "unavailable" };
  }
}
