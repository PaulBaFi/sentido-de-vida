"use server";

import { redirect } from "next/navigation";
import { createServerAuthClient } from "@/lib/supabase/server";
import { passwordLogin, validateLoginInput, LOGIN_MESSAGES, type AuthState } from "@/lib/auth/flows";

export async function loginAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const fieldErrors = validateLoginInput(formData.get("email"), formData.get("password"));
  if (Object.keys(fieldErrors).length) return { status: "error", message: "Revisa los campos indicados.", fieldErrors };
  let result: AuthState;
  try {
    const { auth } = await createServerAuthClient(true);
    result = await passwordLogin(auth, formData.get("email"), formData.get("password"));
  } catch {
    return { status: "error", message: LOGIN_MESSAGES.unavailable };
  }
  // redirect lanza una excepción de control de Next.js: mantener fuera del catch.
  if (result.status === "success") redirect("/dashboard");
  return result;
}
