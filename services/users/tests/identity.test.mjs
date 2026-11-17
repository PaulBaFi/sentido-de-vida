import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { createSupabaseIdentityVerifier } from "../src/security/supabase-identity.ts";
import { subject, other } from "./fixtures.mjs";

const now = Math.floor(Date.now() / 1000);
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const config = { url: "https://identity-fixture.example", publishableKey: "sb_publishable_synthetic_test" };
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "synthetic-key", alg: "ES256", use: "sig" };
function jwt(overrides = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT", kid: "synthetic-key" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({ sub: subject, iss: config.url + "/auth/v1",
    aud: "authenticated", role: "authenticated", exp: now + 300, iat: now - 5,
    user_metadata: { role: "administrador", id: other }, ...overrides })).toString("base64url");
  const data = header + "." + claims;
  return data + "." + sign("sha256", Buffer.from(data), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
}
const jwksFetch = async (input, init) => {
  assert.equal(new URL(input.toString()).pathname, "/auth/v1/.well-known/jwks.json");
  assert.equal(init.method ?? "GET", "GET");
  assert.equal(init.redirect, "error");
  return Response.json({ keys: [jwk] });
};
function verifier(options = {}) {
  return createSupabaseIdentityVerifier(config, { fetch: jwksFetch, now: () => now, ...options });
}
test("SDK verifica firma ES256 real con JWKS sintético; no usa roles/IDs de user_metadata", async () => {
  const identity = await verifier().verify(jwt());
  assert.equal(identity.subject, subject);
  assert.equal(identity.verificationMethod, "getClaims");
  assert.equal(identity.expiresAt, now + 300);
  assert.equal(Object.hasOwn(identity, "role"), false);
  assert.equal(Object.hasOwn(identity, "user_metadata"), false);
});
test("firma alterada es 401 sin crear ninguna sesión", async () => {
  const parts = jwt().split(".");
  parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
  await assert.rejects(verifier().verify(parts.join(".")), error => error.kind === "unauthenticated");
});
for (const [label, claims] of [
  ["emisor ajeno", { iss: "https://other.example/auth/v1" }],
  ["audiencia ajena", { aud: "other" }],
  ["token caducado", { exp: now - 1 }],
  ["subject inválido", { sub: "not-a-uuid" }],
  ["rol técnico", { role: "service_role" }],
  ["fecha futura", { iat: now + 60 }],
  ["todavía no válido", { nbf: now + 60 }],
]) {
  test("JWT firmado pero " + label + " se deniega", async () => {
    await assert.rejects(verifier().verify(jwt(claims)), error => error.kind === "unauthenticated");
  });
}
test("tokens malformados, vacíos o demasiado largos se deniegan", async () => {
  for (const value of ["", "sb_secret_not_a_token", "a.b.", "a".repeat(9000)]) {
    await assert.rejects(verifier().verify(value), error => error.kind === "unauthenticated");
  }
});
test("error de red/JWKS se clasifica como dependencia no disponible", async () => {
  // Proyecto y kid distintos para evitar reutilizar la caché de claves del SDK.
  const isolated = createSupabaseIdentityVerifier({ ...config, url: "https://unavailable-fixture.example" }, {
    fetch: async () => { throw new TypeError("private diagnostic"); },
    now: () => now,
  });
  await assert.rejects(isolated.verify(jwt()), error => error.kind === "dependency_unavailable");
});
test("la configuración rechaza claves privilegiadas y URLs inseguras", () => {
  for (const publishableKey of ["sb_secret_synthetic", "legacy.jwt.not_allowed"]) {
    assert.throws(() => createSupabaseIdentityVerifier({ ...config, publishableKey }), error => error.kind === "dependency_unavailable");
  }
  assert.throws(() => createSupabaseIdentityVerifier({ ...config, url: "http://remote.example" }));
});
