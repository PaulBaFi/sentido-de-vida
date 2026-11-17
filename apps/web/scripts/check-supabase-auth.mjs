import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { getSupabasePublicEnv } from "../src/lib/supabase/env.ts";
import { checkAuthConnectivity } from "../src/lib/supabase/connectivity.ts";

try {
  loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url)));
} catch {
  console.error("No se pudo cargar apps/web/.env.local; no se muestran sus valores.");
  process.exit(1);
}

let env;
try {
  env = getSupabasePublicEnv();
} catch {
  console.error(JSON.stringify({
    status: "configuration_error",
    message: "Revisa presencia y formato de las dos variables públicas de Supabase.",
  }));
  process.exit(1);
}

console.log("Configuración: URL y publishable key disponibles y con formato válido; valores ocultos.");
try {
  const result = await checkAuthConnectivity(env);
  console.log(JSON.stringify(result));
  if (result.status !== "connected") process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ status: "unexpected_response" }));
  process.exitCode = 1;
}
