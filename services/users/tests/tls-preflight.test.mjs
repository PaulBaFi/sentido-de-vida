import assert from "node:assert/strict";
import test from "node:test";
import { TLSSocket, rootCertificates } from "node:tls";
import { Socket } from "node:net";
import { X509Certificate } from "node:crypto";
import { assertSecurePgConfig, assertVerifiedPgTls } from "../src/postgres/connection.ts";
import { verifyRestrictedDatabase, PREFLIGHT_SQL } from "../src/postgres/preflight.ts";

const host = "pooler.test.invalid";
const ca = rootCertificates.find(pem => {
  const c = new X509Certificate(pem);
  return c.ca && Date.parse(c.validFrom) < Date.now() && Date.parse(c.validTo) > Date.now();
});
const config = () => ({ host, ssl: { ca, servername: host, rejectUnauthorized: true } });
test("CA vigente, hostname exacto y rejectUnauthorized obligatorios", () => assert.doesNotThrow(() => assertSecurePgConfig(config())));
for (const [name, change] of [
  ["TLS deshabilitado", c => { c.ssl = false; }],
  ["TLS sin verificar", c => { c.ssl.rejectUnauthorized = false; }],
  ["CA ausente", c => { delete c.ssl.ca; }],
  ["CA inválida", c => { c.ssl.ca = "invalid"; }],
  ["hostname distinto", c => { c.ssl.servername = "other.invalid"; }],
  ["hostname ausente", c => { delete c.ssl.servername; }],
  ["callback que omite verificación", c => { c.ssl.checkServerIdentity = () => undefined; }],
  ["URI que puede sustituir SSL", c => { c.connectionString = "postgres://synthetic.invalid"; }],
]) {
  test(`rechaza ${name}`, () => { const c = config(); change(c); assert.throws(() => assertSecurePgConfig(c)); });
}
function socket() {
  const stream = new TLSSocket(new Socket());
  stream.authorized = true;
  stream.getProtocol = () => "TLSv1.3";
  stream.getPeerCertificate = () => ({ subjectaltname: `DNS:${host}` });
  return stream;
}
test("evidencia TLS exige socket real, autorización y hostname", () => {
  assert.throws(() => assertVerifiedPgTls({ encrypted: true, authorized: true }, host));
  const stream = socket();
  try {
    assert.doesNotThrow(() => assertVerifiedPgTls(stream, host));
    assert.throws(() => assertVerifiedPgTls(stream, "other.invalid"));
    stream.authorized = false;
    assert.throws(() => assertVerifiedPgTls(stream, host));
    stream.authorized = true;
    stream.authorizationError = new Error("synthetic");
    assert.throws(() => assertVerifiedPgTls(stream, host));
  } finally { stream.destroy(); }
});
test("protocolo antiguo y socket destruido no constituyen evidencia TLS válida", () => {
  const stream = socket();
  try {
    stream.getProtocol = () => "TLSv1";
    assert.throws(() => assertVerifiedPgTls(stream, host));
    stream.getProtocol = () => "TLSv1.3";
    stream.destroy();
    assert.throws(() => assertVerifiedPgTls(stream, host));
  } finally { stream.destroy(); }
});
function pool(evidence, ok = true) {
  const queries = [], releases = [];
  return { queries, releases, async connect() { return {
    assertVerifiedTls: evidence,
    async query(sql, values) { queries.push({ sql, values }); return { rows: [{ ok, access_paths: [] }] }; },
    release(destroy) { releases.push(destroy); },
  }; }, async end() {} };
}
test("session exige evidencia TLS del driver antes de consultar permisos", async () => {
  for (const evidence of [undefined, () => { throw new Error("TLS inválido"); }]) {
    const p = pool(evidence);
    await assert.rejects(verifyRestrictedDatabase(p, "session"));
    assert.equal(p.queries.length, 0);
    assert.deepEqual(p.releases, [true]);
  }
});
test("session con TLS verificado conserva la inspección SQL de permisos", async () => {
  let verified = false;
  const p = pool(() => { verified = true; });
  await verifyRestrictedDatabase(p, "session");
  assert.ok(verified);
  assert.deepEqual(p.queries, [{ sql: PREFLIGHT_SQL, values: ["session"] }]);
  assert.deepEqual(p.releases, [false]);
  await assert.rejects(verifyRestrictedDatabase(pool(() => {}, false), "session"));
});
test("direct y transaction conservan el requisito pg_stat_ssl; modo inválido denegado", async () => {
  for (const mode of ["direct", "transaction"]) {
    const p = pool(undefined, false);
    await assert.rejects(verifyRestrictedDatabase(p, mode));
    assert.deepEqual(p.queries[0].values, [mode]);
  }
  const p = pool(() => {});
  await assert.rejects(verifyRestrictedDatabase(p, "unexpected"));
  assert.equal(p.queries.length, 0);
  assert.match(PREFLIGHT_SQL, /\$1::text = 'session' OR COALESCE\(\(SELECT ssl FROM pg_stat_ssl/);
});
