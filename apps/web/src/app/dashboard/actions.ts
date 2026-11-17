"use server";

import { redirect } from "next/navigation";
import { createServerAuthClient } from "@/lib/supabase/server";
import { logout, type AuthState } from "@/lib/auth/flows";

export async function logoutAction(): Promise<AuthState> {
  let result: AuthState;
  try {
    const { auth } = await createServerAuthClient(true);
    result = await logout(auth);
  } catch {
    return { status: "error", message: "No pudimos cerrar la sesión. Inténtalo de nuevo." };
  }
  if (result.status === "success") redirect("/login?reason=signedout");
  return result;
}
