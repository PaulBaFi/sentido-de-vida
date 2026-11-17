import assert from "node:assert/strict";
import test from "node:test";
import { fixture, subject, other, token } from "./fixtures.mjs";
import { createGetOwnProfile } from "../src/application/get-own-profile.ts";
import { createUsersHandler } from "../src/http/handler.ts";

for (const role of ["administrador", "recepcionista", "psicologo", "paciente"]) {
  test(`${role}: perfil propio mínimo no equivale a una ficha de paciente`, async () => {
    const deps = fixture(role);
    const result = await createGetOwnProfile(deps)(token, other);
    assert.deepEqual(result, { data: { profile: { id: subject, displayName: "Persona Sintética" } } });
    assert.deepEqual(deps.profiles.calls, [subject]);
    assert.equal(Object.hasOwn(result.data, "patient"), false);
    assert.ok(!JSON.stringify(result).includes("never-return"));
  });
  test(`${role}: no puede convertir un resultado ajeno en perfil propio`, async () => {
    const deps = fixture(role); deps.profiles.value.id = other;
    await assert.rejects(createGetOwnProfile(deps)(token, other), e => e.kind === "forbidden");
    assert.equal(deps.events.length, 0);
  });
}
test("rutas PAC no publicadas no consultan dependencias ni aceptan escrituras", async () => {
  let calls = 0;
  const handler = createUsersHandler(async () => { calls++; assert.fail(); });
  for (const [method, path] of [["GET", "/v1/users/me/patient"], ["PATCH", "/v1/users/me/patient/contact"], ["POST", "/v1/users/patients"], ["POST", "/v1/users/patients/search"]]) {
    const response = await handler(new Request("http://users.local" + path, { method, headers: { Authorization: "Bearer " + token } }));
    assert.equal(response.status, 404);
  }
  assert.equal(calls, 0);
});
test("dependencia caída no provoca lectura alternativa o perfil inventado", async () => {
  const deps = fixture(); deps.profiles.findByAuthSubject = async () => { throw new Error("private-details"); };
  const response = await createUsersHandler(createGetOwnProfile(deps))(new Request("http://users.local/v1/users/me/profile", { headers: { Authorization: "Bearer " + token } }));
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("private-details"));
  assert.equal(deps.events.length, 0);
});
