import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dashboardProfile, usersEndpoint, profileNotice } from "../src/lib/users/profile.ts";
import { logout } from "../src/lib/auth/flows.ts";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const token = "synthetic.jwt.token";
const origin = "http://127.0.0.1:4001";
const payload = (subject = id, displayName = "Persona de Prueba") => ({ data: { profile: { id: subject, displayName } } });
function auth(options = {}) {
  return {
    getSession: async () => ({ data: { session: { access_token: token, user: { id: other, user_metadata: { rol: "administrador" } } } }, error: null }),
    getUser: async value => { assert.equal(value, token); return { data: { user: { id } }, error: null }; },
    ...options,
  };
}
test("solo el token verificado se envía a ruta propia y solo el nombre vuelve al dashboard", async () => {
  let called = 0;
  const result = await dashboardProfile(auth(), origin, async (url, options) => {
    called++;
    assert.equal(String(url), origin + "/v1/users/me/profile");
    assert.equal(options.method, "GET");
    assert.deepEqual(options.headers, { Authorization: `Bearer ${token}`, Accept: "application/json" });
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert.equal(options.credentials, "omit");
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(payload());
  });
  assert.deepEqual(result, { status: "ready", displayName: "Persona de Prueba" });
  assert.equal(called, 1);
  assert.ok(!JSON.stringify(result).includes(token));
});
test("sin sesión no verifica usuario ni llama al microservicio", async () => {
  const a = auth({ getSession: async () => ({ data: { session: null }, error: null }), getUser: () => assert.fail() });
  assert.deepEqual(await dashboardProfile(a, origin, () => assert.fail()), { status: "anonymous" });
});
test("un getUser fallido no se sustituye por la identidad de getSession", async () => {
  const a = auth({ getUser: async () => ({ data: { user: { id } }, error: { code: "bad_jwt" } }) });
  assert.deepEqual(await dashboardProfile(a, origin, () => assert.fail()), { status: "expired" });
});
test("token malformado no llega al servidor", async () => {
  for (const value of ["", "bad\r\nheader", "x".repeat(8193), undefined]) {
    const a = auth({ getSession: async () => ({ data: { session: { access_token: value } }, error: null }), getUser: () => assert.fail() });
    assert.deepEqual(await dashboardProfile(a, origin, () => assert.fail()), { status: "expired" });
  }
});
test("errores de sesión y Auth se clasifican sin revelar información interna", async () => {
  for (const [error, status] of [[{ code: "session_expired" }, "expired"], [{ name: "AuthSessionMissingError" }, "anonymous"], [new TypeError("private"), "connection"], [{ status: 503 }, "unavailable"]]) {
    const a = auth({ getSession: async () => ({ data: { session: null }, error }) });
    assert.deepEqual(await dashboardProfile(a, origin, () => assert.fail()), { status });
  }
});
test("excepción Auth y respuesta sin usuario deniegan sin contactar Usuarios", async () => {
  const a = auth({ getSession: async () => { throw new TypeError("private"); } });
  assert.deepEqual(await dashboardProfile(a, origin, () => assert.fail()), { status: "connection" });
  const b = auth({ getUser: async () => ({ data: { user: null }, error: null }) });
  assert.deepEqual(await dashboardProfile(b, origin, () => assert.fail()), { status: "anonymous" });
});
for (const [code, status] of [[401, "expired"], [403, "forbidden"], [429, "service_unavailable"], [500, "service_unavailable"], [503, "service_unavailable"], [404, "invalid_response"], [302, "invalid_response"]]) {
  test(`HTTP ${code}: resultado seguro ${status}`, async () => {
    const result = await dashboardProfile(auth(), origin, async () => new Response("private-raw-error", { status: code }));
    assert.deepEqual(result, { status });
    assert.ok(!JSON.stringify(result).includes("private"));
  });
}
test("red, timeout y redirecciones rechazadas conservan un mensaje seguro", async () => {
  for (const error of [new TypeError("private"), new DOMException("private", "TimeoutError")]) {
    assert.deepEqual(await dashboardProfile(auth(), origin, async () => { throw error; }), { status: "service_unavailable" });
  }
});
for (const [label, body] of [
  ["perfil ajeno", payload(other)], ["nombre vacío", payload(id, " ")],
  ["nombre largo", payload(id, "x".repeat(202))], ["control", payload(id, "Persona\nPrivada")],
  ["nombre nulo", payload(id, null)], ["rol extra", { data: { profile: { ...payload().data.profile, rol: "administrador" } } }],
  ["campo superior extra", { ...payload(), token }], ["sin estructura", {}], ["array", []],
]) {
  test(`respuesta inesperada (${label}) no entrega datos`, async () => {
    assert.deepEqual(await dashboardProfile(auth(), origin, async () => Response.json(body)), { status: "invalid_response" });
  });
}
test("JSON inválido, tipo MIME inesperado y cuerpo desproporcionado se rechazan", async () => {
  for (const response of [new Response("{", { headers: { "content-type": "application/json" } }), new Response(JSON.stringify(payload())), Response.json({ text: "x".repeat(5000) })]) {
    assert.deepEqual(await dashboardProfile(auth(), origin, async () => response), { status: "invalid_response" });
  }
});
test("origen exclusivamente del servidor, sin rutas, credenciales, query ni HTTP remoto", async () => {
  for (const value of [undefined, "bad-url", "http://remote.example", origin + "/other", origin + "?id=other", origin + "#hash", "https://user:pass@remote.example"]) {
    assert.throws(() => usersEndpoint(value));
    assert.deepEqual(await dashboardProfile(auth(), value, () => assert.fail()), { status: "service_unavailable" });
  }
  assert.equal(usersEndpoint("https://api.example").pathname, "/v1/users/me/profile");
});
test("dos usuarios no comparten perfiles ni tokens", async () => {
  const calls = [];
  for (const subject of [id, other]) {
    const a = auth({ getUser: async () => ({ data: { user: { id: subject } }, error: null }) });
    const result = await dashboardProfile(a, origin, async (_, options) => { calls.push(options.cache); return Response.json(payload(subject, subject === id ? "Persona A" : "Persona B")); });
    assert.equal(result.displayName, subject === id ? "Persona A" : "Persona B");
  }
  assert.deepEqual(calls, ["no-store", "no-store"]);
});
test("después de cerrar sesión no se consulta el perfil de nuevo", async () => {
  let active = true;
  const a = auth({ getSession: async () => ({ data: { session: active ? { access_token: token } : null }, error: null }), signOut: async options => { assert.equal(options.scope, "local"); active = false; return { error: null }; } });
  assert.equal((await dashboardProfile(a, origin, async () => Response.json(payload()))).status, "ready");
  assert.equal((await logout(a)).status, "success");
  assert.equal((await dashboardProfile(a, origin, () => assert.fail())).status, "anonymous");
});
test("mensajes accesibles sin razones técnicas ni información de cuenta", () => {
  assert.match(profileNotice("forbidden"), /no tiene acceso/);
  assert.match(profileNotice("service_unavailable"), /Inténtalo/);
  assert.match(profileNotice("invalid_response"), /forma segura/);
  const page = readFileSync(new URL("../src/app/dashboard/page.tsx", import.meta.url), "utf8");
  assert.match(page, /role="alert"/);
  assert.ok(!page.includes("access_token"));
  assert.ok(!page.includes('"use client"'));
  for (const file of ["profile.ts", "server.ts"]) assert.match(readFileSync(new URL(`../src/lib/users/${file}`, import.meta.url), "utf8"), /import "server-only"/);
  const login = readFileSync(new URL("../src/app/login/page.tsx", import.meta.url), "utf8");
  assert.match(login, /reason !== "expired"/);
});

test("mi perfil es SSR protegido, reutiliza la API propia y no ofrece operaciones PAC bloqueadas", () => {
  const page = readFileSync(new URL("../src/app/dashboard/mi-perfil/page.tsx", import.meta.url), "utf8");
  assert.ok(!page.includes('"use client"'));
  assert.match(page, /getDashboardProfile\(\)/);
  assert.match(page, /redirect\(loginDestination\(profile\)\)/);
  assert.match(page, /No confirma que tengas una ficha de paciente/);
  assert.match(page, /LogoutForm/);
  assert.match(page, /role="alert"/);
  assert.ok(!/<input|<button|<form|access_token|\.from\(/.test(page));
});
