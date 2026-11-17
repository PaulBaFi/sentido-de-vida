import assert from "node:assert/strict";
import test from "node:test";
import { checkAuthConnectivity } from "../src/lib/supabase/connectivity.ts";

const env = { url: "https://project.example", publishableKey: "sb_publishable_test_only" };
const settings = () => Response.json({ external: { email: true }, disable_signup: true });

test("conexión: solo dos GET de Auth y rechazo esperado del JWT sintético", async () => {
  const requests = [];
  const result = await checkAuthConnectivity(env, async (input, init) => {
    const url = new URL(input.toString());
    requests.push(url.pathname);
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "error");
    assert.ok(init.signal);
    assert.equal(new Headers(init.headers).get("apikey"), env.publishableKey);
    if (url.pathname === "/auth/v1/settings") return settings();
    return Response.json({ code: "bad_jwt", msg: "invalid jwt" }, { status: 403, headers: { "x-supabase-api-version": "2024-01-01" } });
  });
  assert.deepEqual(requests, ["/auth/v1/settings", "/auth/v1/user"]);
  assert.equal(result.status, "connected");
  assert.ok(!JSON.stringify(result).includes(env.publishableKey));
});

test("credenciales inválidas: 401 sin consultar usuarios", async () => {
  let calls = 0;
  const result = await checkAuthConnectivity(env, async () => {
    calls++;
    return Response.json({ message: "Invalid API key" }, { status: 401 });
  });
  assert.equal(result.status, "invalid_credentials");
  assert.equal(calls, 1);
});

test("fallo de red en settings sin mostrar excepción original", async () => {
  const result = await checkAuthConnectivity(env, async () => {
    throw new TypeError("diagnostic-sensitive-value");
  });
  assert.deepEqual(result, { status: "network_error" });
});

test("fallo de red durante la llamada del SDK", async () => {
  const result = await checkAuthConnectivity(env, async input => {
    if (new URL(input.toString()).pathname.endsWith("/settings")) return settings();
    throw new TypeError("diagnostic-sensitive-value");
  });
  assert.deepEqual(result, { status: "network_error" });
});

test("denegación y error de servicio no se confunden con credenciales inválidas", async () => {
  for (const [status, expected] of [[403, "access_denied"], [429, "service_error"], [503, "service_error"]]) {
    const result = await checkAuthConnectivity(env, async () => new Response(null, { status }));
    assert.equal(result.status, expected);
  }
});

test("HTTP 200 con cuerpo inesperado no prueba conectividad Auth", async () => {
  const result = await checkAuthConnectivity(env, async () => Response.json({ unrelated: true }));
  assert.equal(result.status, "unexpected_response");
});

test("un rechazo de sesión cualquiera no cuenta como conexión verificada", async () => {
  const result = await checkAuthConnectivity(env, async input => {
    if (new URL(input.toString()).pathname.endsWith("/settings")) return settings();
    return Response.json({ message: "Invalid API key" }, { status: 401 });
  });
  assert.equal(result.status, "invalid_credentials");
});
