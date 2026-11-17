import assert from "node:assert/strict";
import test from "node:test";
import { isDni, validatePatientContact, validatePatientRegistration, validatePatientLookup } from "../src/patients.ts";
import { decidePermission } from "../src/authorization-policy.ts";

test("DNI exactamente ocho dígitos ASCII; conserva cero inicial", () => {
  assert.ok(isDni("00000001"));
  const parsed = validatePatientLookup({ dni: "00000001" });
  assert.deepEqual(parsed, { ok: true, value: { dni: "00000001" } });
});
test("DNI no convierte números ni acepta espacios, Unicode o longitudes distintas", () => {
  for (const value of [12345678, 0, "", "1234567", "123456789", " 12345678", "12345678 ", "１２３４５６７８", "١٢٣٤٥٦٧٨", null, undefined, {}, "1234ABCD", "1234\n678"]) {
    assert.equal(isDni(value), false);
    assert.equal(validatePatientLookup({ dni: value }).ok, false);
  }
});
test("registro prepara proyección mínima normalizada, sin actor ni rol", () => {
  assert.deepEqual(validatePatientRegistration({ dni: "00000001", nombres: " Persona ", apellidos: " Ficticia ", correo: "pac@example.invalid" }), {
    ok: true, value: { dni: "00000001", nombres: "Persona", apellidos: "Ficticia", correo: "pac@example.invalid" },
  });
});
for (const field of ["rol", "role", "actorId", "perfil_id", "id", "activo", "user_metadata", "password", "fechaNacimiento"]) {
  test(`asignación masiva (${field}) se rechaza en todos los DTO`, () => {
    assert.equal(validatePatientRegistration({ dni: "00000001", nombres: "Persona", apellidos: "Ficticia", [field]: "injected" }).ok, false);
    assert.equal(validatePatientContact({ telefono: "12345678", [field]: "injected" }).ok, false);
    assert.equal(validatePatientLookup({ dni: "00000001", [field]: "injected" }).ok, false);
  });
}
test("registro inválido contiene errores por campo sin copiar datos sensibles", () => {
  const invalid = validatePatientRegistration({ dni: "private-invalid", nombres: " ", apellidos: "x".repeat(101), telefono: "private-phone", correo: "private-email" });
  assert.equal(invalid.ok, false);
  assert.deepEqual(Object.keys(invalid.errors).sort(), ["apellidos", "correo", "dni", "nombres", "telefono"]);
  assert.ok(!JSON.stringify(invalid).includes("private-"));
});
test("contactos requieren un cambio explícito, sin modificar DNI o identidad", () => {
  assert.deepEqual(validatePatientContact({ telefono: "+51123456789" }), { ok: true, value: { telefono: "+51123456789" } });
  assert.deepEqual(validatePatientContact({ correo: "pac@example.invalid" }), { ok: true, value: { correo: "pac@example.invalid" } });
  for (const value of [{}, { telefono: null }, { correo: "" }, { dni: "00000001" }, { nombres: "Otra" }, { telefono: "123" }]) assert.equal(validatePatientContact(value).ok, false);
});
test("ningún DTO acepta arrays, instancias especiales o claves prototipo", () => {
  for (const value of [null, undefined, [], "text", new Date(), JSON.parse('{"__proto__":{},"dni":"00000001"}')]) {
    for (const validate of [validatePatientContact, validatePatientRegistration, validatePatientLookup]) assert.equal(validate(value).ok, false);
  }
});
const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function request(role, permission, target = actor) {
  return {
    context: { identity: { subject: actor, verificationMethod: "getUser", verifiedAt: 1799999999, expiresAt: 1800000100 }, profile: { id: actor, role, active: true, checkedAt: 1799999999 }, requestId: other, policyVersion: "phase-2.3-draft" },
    permission, target: { kind: "profile", id: target }, resource: { kind: "profile", id: target, profileId: target, resolvedAt: 1799999999 }, now: 1800000000,
  };
}
for (const role of ["administrador", "recepcionista", "psicologo", "paciente"]) {
  test(`${role}: PAC propio y ajeno sigue denegado hasta aprobación`, () => {
    for (const permission of ["patients.read-self", "patients.update-own-contact", "patients.create", "patients.read-admin", "patients.update-contact-admin"]) {
      for (const target of [actor, other]) assert.deepEqual(decidePermission(request(role, permission, target)), { allowed: false, reason: "pending_approval" });
    }
  });
}
test("perfil inactivo, identidad manipulada o inexistente no alcanzan permiso PAC", () => {
  const r = request("paciente", "patients.read-self");
  r.context.profile.active = false;
  assert.equal(decidePermission(r).reason, "inactive_profile");
  r.context.profile.active = true; r.context.identity.subject = other;
  assert.equal(decidePermission(r).reason, "identity_mismatch");
  r.context = null;
  assert.equal(decidePermission(r).reason, "unauthenticated");
});
