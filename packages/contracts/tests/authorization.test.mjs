import assert from "node:assert/strict";
import test from "node:test";
import { decidePermission } from "../src/authorization-policy.ts";

const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const targetId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const requestId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const now = 1800000000;
const roles = ["administrador", "recepcionista", "psicologo", "paciente"];
function fixture(role = "paciente", permission = "appointments.read") {
  let resource;
  if (permission.startsWith("users.")) resource = { kind: "profile", id: actor, profileId: actor };
  else if (permission.startsWith("catalog.")) resource = { kind: "service", id: targetId, published: true };
  else if (permission.startsWith("payments.")) resource = { kind: "payment", id: targetId, patientProfileId: actor };
  else if (permission.startsWith("notifications.")) resource = { kind: "notification", id: targetId, recipientProfileId: actor };
  else resource = { kind: "appointment", id: targetId, patientProfileId: actor, psychologistProfileId: other };
  return {
    context: {
      identity: { subject: actor, verificationMethod: "getUser", verifiedAt: now - 5, expiresAt: now + 300 },
      profile: { id: actor, role, active: true, checkedAt: now - 5 },
      requestId, policyVersion: "phase-2.3-draft",
    },
    permission, target: { kind: resource.kind, id: resource.id },
    resource: { ...resource, resolvedAt: now - 5 }, now,
    ...(permission === "users.profile.update-contact" ? { fields: ["telefono"] } : {}),
  };
}

const matrix = [
  ["users.profile.read", [true, true, true, true]],
  ["users.profile.update-contact", [true, true, true, true]],
  ["catalog.service.read", [true, true, true, true]],
  ["catalog.service.manage", [true, false, false, false]],
  ["appointments.read", [true, true, false, true]],
  ["appointments.reschedule", [true, true, false, true]],
  ["payments.read", [true, true, false, true]],
  ["payments.record", [true, true, false, false]],
  ["notifications.read", [true, true, true, true]],
  ["notifications.retry", [true, false, false, false]],
];
for (const [permission, expected] of matrix) {
  for (const [i, role] of roles.entries()) {
    test(role + ": " + permission, () => {
      assert.equal(decidePermission(fixture(role, permission)).allowed, expected[i]);
    });
  }
}

for (const role of roles) {
  for (const permission of ["users.roles.assign", "payments.refund.approve", "reports.read", "clinical.read"]) {
    test("reservado para todos: " + role + " / " + permission, () => {
      assert.deepEqual(decidePermission(fixture(role, permission)), { allowed: false, reason: "pending_approval" });
    });
  }
}

test("solo administrador lee un perfil ajeno; no hay acceso genérico de recepción", () => {
  for (const role of roles) {
    const request = fixture(role, "users.profile.read");
    request.target.id = other;
    request.resource.id = other;
    request.resource.profileId = other;
    assert.equal(decidePermission(request).allowed, role === "administrador");
  }
});

test("paciente no accede a citas, pagos o notificaciones ajenos", () => {
  for (const permission of ["appointments.read", "appointments.reschedule", "payments.read", "notifications.read"]) {
    const request = fixture("paciente", permission);
    if (permission.startsWith("notifications")) request.resource.recipientProfileId = other;
    else request.resource.patientProfileId = other;
    request.resource.profileId = actor; // propiedad extra manipulada no cambia la propiedad real.
    assert.equal(decidePermission(request).allowed, false);
  }
});

test("psicólogo solo lee citas asignadas y no reprograma ni ve finanzas por coincidencia de ID", () => {
  const request = fixture("psicologo");
  request.resource.psychologistProfileId = actor;
  request.resource.patientProfileId = other;
  assert.equal(decidePermission(request).allowed, true);
  request.permission = "appointments.reschedule";
  assert.equal(decidePermission(request).allowed, false);
  assert.equal(decidePermission(fixture("psicologo", "payments.read")).allowed, false);
});

test("catálogo no publicado: solo personal operativo", () => {
  for (const role of roles) {
    const request = fixture(role, "catalog.service.read");
    request.resource.published = false;
    assert.equal(decidePermission(request).allowed, role === "administrador" || role === "recepcionista");
  }
});

test("sin identidad, perfil ausente, perfil inactivo o rol desconocido se deniega", () => {
  const request = fixture();
  request.context = null;
  assert.equal(decidePermission(request).reason, "unauthenticated");
  const missing = fixture(); delete missing.context.profile;
  assert.equal(decidePermission(missing).allowed, false);
  const inactive = fixture(); inactive.context.profile.active = false;
  assert.equal(decidePermission(inactive).reason, "inactive_profile");
  for (const role of ["admin", "authenticated", "svc_usuarios", "psicólogo", "unknown"]) {
    assert.equal(decidePermission(fixture(role)).reason, "unknown_role");
  }
});

test("identidad y perfil no pueden intercambiarse", () => {
  const request = fixture();
  request.context.profile.id = other;
  assert.equal(decidePermission(request).reason, "identity_mismatch");
});

test("IDs manipulados, UUID inválido y evidencia inexistente se deniegan", () => {
  const changed = fixture(); changed.target.id = other;
  assert.equal(decidePermission(changed).reason, "resource_mismatch");
  const invalid = fixture(); invalid.target.id = "not-a-uuid";
  assert.equal(decidePermission(invalid).reason, "invalid_request");
  const missing = fixture(); missing.resource = null;
  assert.equal(decidePermission(missing).reason, "resource_not_found");
  const kind = fixture(); kind.target.kind = "payment";
  assert.equal(decidePermission(kind).allowed, false);
});

test("no se compara auth UUID con un ID de ficha paciente", () => {
  const request = fixture();
  request.resource.patientProfileId = other;
  request.resource.patientId = actor;
  assert.equal(decidePermission(request).allowed, false);
});

test("identidad, perfil y evidencia deben estar vigentes", () => {
  for (const key of ["identity", "profile", "resource"]) {
    const request = fixture();
    if (key === "identity") request.context.identity.verifiedAt = now - 61;
    if (key === "profile") request.context.profile.checkedAt = now - 61;
    if (key === "resource") request.resource.resolvedAt = now - 61;
    assert.equal(decidePermission(request).reason, "stale_context");
  }
  const expired = fixture(); expired.context.identity.expiresAt = now;
  assert.equal(decidePermission(expired).reason, "stale_context");
  const future = fixture(); future.context.profile.checkedAt = now + 1;
  assert.equal(decidePermission(future).allowed, false);
});

test("ni administrador puede escribir rol, activo o IDs a través de actualizar contacto", () => {
  for (const role of roles) {
    for (const fields of [[], ["rol"], ["activo"], ["id"], ["perfil_id"], ["telefono", "rol"]]) {
      const request = fixture(role, "users.profile.update-contact");
      request.fields = fields;
      assert.equal(decidePermission(request).allowed, false);
    }
  }
});

test("sin comodines, rol universal ni permiso heredado del prototipo", () => {
  for (const permission of ["*", "users.*", "__proto__", "constructor", "not-implemented"]) {
    assert.equal(decidePermission(fixture("administrador", permission)).allowed, false);
  }
});

test("entradas malformadas no lanzan excepciones ni conceden acceso", () => {
  for (const value of [null, undefined, [], {}, "admin", { now, context: true }]) {
    assert.doesNotThrow(() => assert.equal(decidePermission(value).allowed, false));
  }
  const malformedPermission = fixture(); malformedPermission.permission = { toString: 0 };
  assert.doesNotThrow(() => assert.equal(decidePermission(malformedPermission).allowed, false));
  const malformedVerification = fixture(); malformedVerification.context.identity.verificationMethod = { toString: 0 };
  assert.doesNotThrow(() => assert.equal(decidePermission(malformedVerification).allowed, false));
  const request = fixture(); request.context.profile.active = "true";
  assert.equal(decidePermission(request).allowed, false);
});

test("decisión pura, sin mutaciones y con obligaciones explícitas", () => {
  const request = fixture();
  const before = structuredClone(request);
  const first = decidePermission(request);
  assert.deepEqual(first, decidePermission(request));
  assert.deepEqual(request, before);
  assert.equal(first.allowed, true);
  assert.equal(first.obligations.scope, "self");
  assert.equal(first.obligations.projection, "appointment-operational");
  assert.equal(first.obligations.audit, true);
  const update = decidePermission(fixture("paciente", "users.profile.update-contact"));
  assert.deepEqual(update.obligations.writableFields, ["telefono"]);
});

test("UUID equivalente con mayúsculas no pierde su relación de identidad", () => {
  const request = fixture();
  request.context.identity.subject = actor.toUpperCase();
  assert.equal(decidePermission(request).allowed, true);
});
