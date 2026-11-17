export type SupabasePublicEnv = {
  url: string;
  publishableKey: string;
};

type PublicEnvInput = {
  url?: string;
  publishableKey?: string;
};

/** Sin efectos al importar; nunca incluye valores recibidos en los errores. */
export function parseSupabasePublicEnv(
  input: PublicEnvInput,
  required = true,
): SupabasePublicEnv | null {
  const url = input.url?.trim();
  const publishableKey = input.publishableKey?.trim();

  if (!url && !publishableKey && !required) return null;
  if (!url || !publishableKey) {
    throw new Error(
      "Supabase Auth: define NEXT_PUBLIC_SUPABASE_URL y " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en apps/web/.env.local. " +
        "La portada puede ejecutarse sin Auth, pero crear un cliente requiere ambas variables.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Supabase Auth: NEXT_PUBLIC_SUPABASE_URL debe ser una URL válida.");
  }

  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (
    (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw new Error(
      "Supabase Auth: usa una URL HTTPS de proyecto sin credenciales, ruta ni parámetros; " +
        "HTTP solo se admite en localhost para desarrollo.",
    );
  }

  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    throw new Error(
      "Supabase Auth: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY debe ser una publishable key " +
        "con prefijo sb_publishable_. No uses secret keys, service_role ni JWT heredados.",
    );
  }

  return { url: parsed.origin, publishableKey };
}

export function getSupabasePublicEnv(): SupabasePublicEnv;
export function getSupabasePublicEnv(required: false): SupabasePublicEnv | null;
export function getSupabasePublicEnv(required = true) {
  // Accesos estáticos requeridos para que Next.js sustituya NEXT_PUBLIC_* en el navegador.
  return parseSupabasePublicEnv(
    {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    },
    required,
  );
}
