import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createGetOwnProfile } from "../src/application/get-own-profile.ts";
import { createUsersHandler } from "../src/http/handler.ts";
import { createUsersServer } from "../src/transport/server.ts";
import { createDisabledUsersHandler } from "../src/composition.ts";
import { UsersFailure } from "../src/domain/errors.ts";
import { validOwnProfileResponse } from "../src/http/validation.ts";
import { fixture, subject, other, token, now } from "./fixtures.mjs";

const path = "http://users.test/v1/users/me/profile";
function setup(deps = fixture()) {
  return { deps, handler: createUsersHandler(createGetOwnProfile(deps)) };
}
function request(url = path, headers = { authorization: "Bearer " + token }) {
  return new Request(url, { headers });
}

for (const role of ["administrador", "recepcionista", "psicologo", "paciente"]) {
  test("perfil propio autorizado para " + role + " con proyección mínima", async () => {
    const { handler, deps } = setup(fixture(role));
    const response = await handler(request());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: { profile: { id: subject, displayName: "Persona Sintética" } } });
    assert.deepEqual(deps.profiles.calls, [subject]);
    assert.equal(deps.events.length, 1);
    assert.equal(deps.events[0].permission, "users.profile.read");
    assert.ok(!JSON.stringify(deps.events).includes(token));
    assert.match(response.headers.get("cache-control"), /private.*no-store/);
  });
}
test("sin bearer, cookies o cabeceras duplicadas no autentican", async () => {
  const { handler, deps } = setup();
  for (const headers of [{}, { cookie: "authenticated=true" },
    { authorization: "Bearer wrong" }, { authorization: "Bearer " + token + ", Bearer " + token },
    { authorization: "Basic credentials" }]) {
    const response = await handler(request(path, headers));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("www-authenticate"), 'Bearer realm="users"');
  }
  assert.equal(deps.profiles.calls.length, 0);
});
test("JWT rechazado no consulta repositorios", async () => {
  const deps = fixture();
  deps.identity.verify = async () => { throw new UsersFailure("unauthenticated"); };
  const response = await setup(deps).handler(request());
  assert.equal(response.status, 401);
  assert.equal(deps.profiles.calls.length, 0);
});
for (const [label, change] of [
  ["ausente", deps => { deps.profiles.value = null; }],
  ["inactivo", deps => { deps.profiles.value.active = false; }],
  ["ID ajeno incluso para administrador", deps => { deps.profiles.value.id = other; }],
  ["rol no aprobado", deps => { deps.profiles.value.role = "superadmin"; }],
]) {
  test("403 con perfil " + label, async () => {
    const deps = fixture("administrador"); change(deps);
    const response = await setup(deps).handler(request());
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: {
      code: "forbidden", message: "No tienes permiso para realizar esta operación.",
    } });
    assert.equal(deps.events.length, 0);
  });
}
test("IDs/roles por query o cabeceras se rechazan sin usar dependencias", async () => {
  const { handler, deps } = setup();
  for (const url of [path + "?id=" + other, path + "?role=administrador", path + "?subject=" + other]) {
    assert.equal((await handler(request(url))).status, 400);
  }
  for (const header of ["x-user-id", "x-profile-id", "x-role", "x-roles"]) {
    assert.equal((await handler(request(path, { authorization: "Bearer " + token, [header]: "administrador" }))).status, 400);
  }
  assert.equal(deps.profiles.calls.length, 0);
});
test("rutas por ID y métodos no preparados no amplían el acceso", async () => {
  const { handler } = setup();
  assert.equal((await handler(request("http://users.test/v1/users/" + other + "/profile"))).status, 404);
  assert.equal((await handler(new Request(path, { method: "POST", body: "{}" }))).status, 405);
  assert.equal((await handler(request(path, { authorization: "Bearer " + token, "content-length": "5" }))).status, 400);
});
for (const dependency of ["identity", "profiles", "audit"]) {
  test("503 seguro ante fallo de " + dependency, async () => {
    const deps = fixture();
    const fail = async () => { throw new Error("private detail / token / connection string"); };
    if (dependency === "identity") deps.identity.verify = fail;
    if (dependency === "profiles") deps.profiles.findByAuthSubject = fail;
    if (dependency === "audit") deps.audit.record = fail;
    const response = await setup(deps).handler(request());
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "30");
    assert.ok(!(await response.text()).includes("private"));
  });
}
test("respuesta de repositorio malformada o desproporcionada no se filtra", async () => {
  for (const value of [{ id: "invalid" }, { id: subject, role: "paciente", active: true,
    givenName: "a".repeat(101), familyName: "Test" }]) {
    const deps = fixture(); deps.profiles.value = value;
    assert.equal((await setup(deps).handler(request())).status, 503);
  }
});
test("valida identidad caducada y contexto obsoleto sin permitir acceso", async () => {
  const deps = fixture();
  deps.identity.verify = async () => ({ subject, verificationMethod: "getClaims", verifiedAt: now - 10, expiresAt: now - 1 });
  assert.equal((await setup(deps).handler(request())).status, 401);
  assert.equal(deps.profiles.calls.length, 0);
  deps.identity.verify = async () => ({ subject, verificationMethod: "getClaims", verifiedAt: now - 61, expiresAt: now + 300 });
  assert.equal((await setup(deps).handler(request())).status, 403);
});
test("validación de respuestas rechaza campos extra y no expone tokens/roles", async () => {
  assert.equal(validOwnProfileResponse({ data: { profile: { id: subject, displayName: "Test", role: "administrador" } } }), false);
  const handler = createUsersHandler(async () => ({ data: { profile: { id: subject, displayName: "Test", token: "private" } } }));
  assert.equal((await handler(request())).status, 503);
});
test("arranque real cerrado: 401 anónimo y 503 con bearer sin usar red", async () => {
  const handler = createDisabledUsersHandler();
  assert.equal((await handler(request(path, {}))).status, 401);
  assert.equal((await handler(request())).status, 503);
});
test("transporte HTTP real local, sin Supabase ni base de datos", async () => {
  const { handler } = setup();
  const server = createUsersServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const response = await fetch("http://127.0.0.1:" + server.address().port + "/v1/users/me/profile", {
      headers: { authorization: "Bearer " + token },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.profile.id, subject);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
