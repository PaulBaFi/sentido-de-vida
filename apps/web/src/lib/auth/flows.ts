import type { SupabaseClient } from "@supabase/supabase-js";

type Auth = Pick<SupabaseClient["auth"], "signInWithPassword" | "getUser" | "signOut">;
export type LoginFieldErrors = { email?: string; password?: string };
export type AuthState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: LoginFieldErrors;
};
export const initialAuthState: AuthState = { status: "idle", message: "" };
export const LOGIN_MESSAGES = {
  emailRequired: "Ingresa tu correo electrónico.",
  emailInvalid: "Ingresa un correo electrónico válido.",
  passwordRequired: "Ingresa tu contraseña.",
  credentials: "El correo o la contraseña son incorrectos. Verifica tus datos e inténtalo nuevamente.",
  confirmation: "Debes confirmar tu correo electrónico antes de iniciar sesión.",
  rateLimit: "Has realizado demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
  connection: "No pudimos conectarnos al servidor. Comprueba tu conexión e inténtalo nuevamente.",
  unavailable: "El servicio de autenticación no está disponible en este momento. Inténtalo más tarde.",
  expired: "Tu sesión ha expirado. Inicia sesión nuevamente.",
  unexpected: "Ocurrió un problema inesperado. Inténtalo nuevamente.",
} as const;

export type Identity =
  | { status: "authenticated" }
  | { status: "anonymous" | "expired" | "connection" | "unavailable" };

function errorDetails(error: unknown) {
  return error && typeof error === "object"
    ? error as { name?: string; code?: string; status?: number }
    : {};
}

export function isConnectionError(error: unknown) {
  const e = errorDetails(error);
  // AuthRetryableFetchError también representa HTTP 5xx: no confundirlos con red.
  if (typeof e.status === "number" && e.status >= 400) return false;
  return e.status === 0 ||
    ["AuthRetryableFetchError", "TypeError", "AbortError", "TimeoutError"].includes(e.name ?? "");
}

export function classifyLoginError(error: unknown): AuthState {
  const e = errorDetails(error);
  let message: string = LOGIN_MESSAGES.unexpected;
  if (typeof e.status === "number" && e.status >= 500) {
    message = LOGIN_MESSAGES.unavailable;
  } else if (e.status === 429 || e.code === "over_request_rate_limit") {
    message = LOGIN_MESSAGES.rateLimit;
  } else if (
    e.status === 408 ||
    ["request_timeout", "email_provider_disabled", "provider_disabled", "unexpected_failure"].includes(e.code ?? "")
  ) {
    message = LOGIN_MESSAGES.unavailable;
  } else if (isConnectionError(error)) {
    message = LOGIN_MESSAGES.connection;
  } else if (e.code === "email_not_confirmed" && (e.status === 400 || e.status === 422)) {
    // Solo una respuesta explícita del flujo de contraseña, nunca texto ni consulta de cuenta.
    message = LOGIN_MESSAGES.confirmation;
  } else if ([
    "session_expired", "session_not_found", "refresh_token_not_found", "refresh_token_already_used", "bad_jwt",
  ].includes(e.code ?? "")) {
    message = LOGIN_MESSAGES.expired;
  } else if (
    ["invalid_credentials", "user_not_found", "user_banned"].includes(e.code ?? "") ||
    (!e.code && (e.status === 400 || e.status === 401))
  ) {
    message = LOGIN_MESSAGES.credentials;
  }
  return { status: "error", message };
}

export function validateLoginInput(email: unknown, password: unknown): LoginFieldErrors {
  const fieldErrors: LoginFieldErrors = {};
  if (typeof email !== "string" || email.trim().length === 0) {
    fieldErrors.email = LOGIN_MESSAGES.emailRequired;
  } else if (email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    fieldErrors.email = LOGIN_MESSAGES.emailInvalid;
  }
  if (typeof password !== "string" || password.length === 0) {
    fieldErrors.password = LOGIN_MESSAGES.passwordRequired;
  } else if (password.length > 1024) {
    fieldErrors.password = "La contraseña es demasiado larga.";
  }
  return fieldErrors;
}

export function sessionFailure(error: unknown): Exclude<Identity, { status: "authenticated" }> {
  if (isConnectionError(error)) return { status: "connection" };
  const e = errorDetails(error);
  if (!error || e.name === "AuthSessionMissingError") return { status: "anonymous" };
  if (
    ["bad_jwt", "session_expired", "session_not_found", "refresh_token_not_found", "refresh_token_already_used"].includes(e.code ?? "")
  ) return { status: "expired" };
  return { status: "unavailable" };
}

export async function verifyUser(auth: Pick<Auth, "getUser">, token?: string): Promise<
  { status: "authenticated"; userId: string } | Exclude<Identity, { status: "authenticated" }>
> {
  try {
    const { data, error } = await auth.getUser(token);
    if (error) return sessionFailure(error);
    return data.user?.id ? { status: "authenticated", userId: data.user.id } : { status: "anonymous" };
  } catch (error) {
    return isConnectionError(error) ? { status: "connection" } : { status: "unavailable" };
  }
}

export async function verifyIdentity(auth: Pick<Auth, "getUser">): Promise<Identity> {
  const result = await verifyUser(auth);
  return result.status === "authenticated" ? { status: "authenticated" } : result;
}

export async function passwordLogin(
  auth: Pick<Auth, "signInWithPassword">,
  email: unknown,
  password: unknown,
): Promise<AuthState> {
  const fieldErrors = validateLoginInput(email, password);
  if (Object.keys(fieldErrors).length) {
    return { status: "error", message: "Revisa los campos indicados.", fieldErrors };
  }
  try {
    const { data, error } = await auth.signInWithPassword({
      email: (email as string).trim(), password: password as string,
    });
    if (error) return classifyLoginError(error);
    if (!data.session || !data.user) return { status: "error", message: LOGIN_MESSAGES.unexpected };
    return { status: "success", message: "" };
  } catch (error) {
    return classifyLoginError(error);
  }
}

export async function logout(auth: Pick<Auth, "signOut">): Promise<AuthState> {
  try {
    const { error } = await auth.signOut({ scope: "local" });
    if (error) return { status: "error", message: "No pudimos cerrar la sesión. Comprueba tu conexión y vuelve a intentarlo." };
    return { status: "success", message: "" };
  } catch {
    return { status: "error", message: "No pudimos cerrar la sesión. Vuelve a intentarlo." };
  }
}

export function isProtectedPath(pathname: string) {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

export function loginDestination(identity: Identity): string {
  switch (identity.status) {
    case "expired": return "/login?reason=expired";
    case "connection": return "/login?reason=connection";
    case "unavailable": return "/login?reason=unavailable";
    default: return "/login";
  }
}

export function loginNotice(reason: unknown) {
  switch (reason) {
    case "expired": return LOGIN_MESSAGES.expired;
    case "connection": return LOGIN_MESSAGES.connection;
    case "unavailable": return LOGIN_MESSAGES.unavailable;
    case "signedout": return "Has cerrado tu sesión correctamente.";
    default: return "";
  }
}
