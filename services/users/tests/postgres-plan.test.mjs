import assert from "node:assert/strict";
import test from "node:test";
import { planOwnProfileRead, mapOwnProfileRows } from "../src/repositories/postgres-profile-plan.ts";
import { subject, other } from "./fixtures.mjs";

const identity = { subject, verificationMethod: "getClaims", verifiedAt: 1800000000, expiresAt: 1800000300 };
const row = { id: subject, nombres: "Persona", apellidos: "Sintética", rol: "paciente", activo: true };

test("consulta preparada con cinco columnas y único parámetro de identidad", () => {
  const plan = planOwnProfileRead(identity);
  assert.equal(plan.phase, "design-only");
  assert.equal(plan.profile.text, "SELECT id, nombres, apellidos, rol, activo FROM usuarios.perfiles WHERE id = $1::uuid");
  assert.deepEqual(plan.profile.values, [subject]);
  assert.ok(!plan.profile.text.includes(subject));
  assert.equal(Object.hasOwn(plan.profile, "name"), false); // sin prepared statement con nombre
});

test("contexto RLS es local a la transacción y parametrizado", () => {
  const plan = planOwnProfileRead(identity);
  assert.equal(plan.context.text, "SELECT pg_catalog.set_config('app.auth_subject', $1::text, true)");
  assert.deepEqual(plan.context.values, [subject]);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.profile.values));
});

test("campos adicionales de la identidad no entran en el SQL ni parámetros", () => {
  const plan = planOwnProfileRead({ ...identity, token: "synthetic-private", user_metadata: { id: other, role: "administrador" } });
  assert.deepEqual(plan.profile.values, [subject]);
  assert.ok(!JSON.stringify(plan).includes("synthetic-private"));
  assert.ok(!JSON.stringify(plan).includes(other));
});

test("UUID inválido no genera un plan de consulta", () => {
  for (const value of ["' OR true --", "", null, "users.perfiles", "aaaaaaaa"]) {
    assert.throws(() => planOwnProfileRead({ ...identity, subject: value }), error => error.kind === "unauthenticated");
  }
});

test("mapeo exacto, sin datos personales adicionales ni perfil falso de respaldo", () => {
  assert.equal(mapOwnProfileRows([]), null);
  assert.deepEqual(mapOwnProfileRows([row]), {
    id: subject, givenName: "Persona", familyName: "Sintética", role: "paciente", active: true,
  });
});

test("perfil inactivo y rol desconocido se preservan para la política compartida", () => {
  const profile = mapOwnProfileRows([{ ...row, rol: "unknown", activo: false }]);
  assert.equal(profile.active, false);
  assert.equal(profile.role, "unknown");
});

test("columnas extra, ausentes, tipos incorrectos o cardinalidad inesperada fallan cerrado", () => {
  for (const rows of [
    [row, row],
    [{ ...row, telefono: "not-required" }],
    [{ id: subject, nombres: "Persona", rol: "paciente", activo: true }],
    [{ ...row, activo: "true" }],
    [{ ...row, id: "invalid" }],
    null,
  ]) {
    assert.throws(() => mapOwnProfileRows(rows), error => error.kind === "dependency_unavailable");
  }
});

test("el mapeo no suplanta identidad ni modifica la fila recibida", () => {
  const input = { ...row, id: other };
  const before = structuredClone(input);
  assert.equal(mapOwnProfileRows([input]).id, other); // el caso de uso deniega la discordancia
  assert.deepEqual(input, before);
});
