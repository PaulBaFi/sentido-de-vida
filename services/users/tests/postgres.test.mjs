import assert from "node:assert/strict";
import test from "node:test";
import { rootCertificates } from "node:tls";
import { X509Certificate } from "node:crypto";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { createTransactionalGetOwnProfile } from "../src/application/get-own-profile.ts";
import { PostgresUnitOfWork } from "../src/postgres/unit-of-work.ts";
import { verifyRestrictedDatabase, PREFLIGHT_SQL } from "../src/postgres/preflight.ts";
import { loadPgSettings } from "../src/config/postgres.ts";
import { createUsersRuntime } from "../src/runtime.ts";
import { UsersFailure } from "../src/domain/errors.ts";
import { fixture, subject, other, token } from "./fixtures.mjs";

const requestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const row = { id: subject, nombres: "Persona", apellidos: "Sintética", rol: "paciente", activo: true };
function fakePool(options = {}) {
  const calls = [];
  const releases = [];
  let connections = 0, ends = 0;
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (options.fail && text.startsWith(options.fail)) throw new Error("private-connection-detail");
      if (text === PREFLIGHT_SQL) return { rows: [{ ok: options.preflight !== false, access_paths: [] }], rowCount: 1 };
      if (text.startsWith("SELECT id,")) return { rows: options.rows ?? [row], rowCount: 1 };
      if (text.startsWith("INSERT INTO")) return { rows: [], rowCount: options.auditCount ?? 1 };
      return { rows: [], rowCount: null, command: text === "COMMIT" ? (options.commitCommand ?? "COMMIT") : text };
    },
    release(destroy) { releases.push(Boolean(destroy)); },
  };
  return {
    calls, releases,
    get connections() { return connections; },
    get ends() { return ends; },
    async connect() {
      connections++;
      if (options.connectFail) throw new Error("private-connection-detail");
      return client;
    },
    async end() { ends++; },
  };
}
function useCase(pool, deps = fixture()) {
  return createTransactionalGetOwnProfile({ identity: deps.identity,
    transactions: new PostgresUnitOfWork(pool), now: deps.now });
}

test("un único cliente: BEGIN, contexto, SELECT, autorización, INSERT, COMMIT", async () => {
  const pool = fakePool();
  const result = await useCase(pool)(token, requestId);
  assert.deepEqual(result, { data: { profile: { id: subject, displayName: "Persona Sintética" } } });
  assert.equal(pool.connections, 1);
  assert.deepEqual(pool.calls.map(c => c.text.split(" ")[0]), ["BEGIN", "SELECT", "SELECT", "INSERT", "COMMIT"]);
  assert.deepEqual(pool.calls[1].values, [subject]);
  assert.deepEqual(pool.calls[2].values, [subject]);
  assert.deepEqual(pool.calls[3].values, [requestId, subject, "phase-2.3-draft"]);
  assert.ok(!JSON.stringify(pool.calls).includes(token));
  assert.deepEqual(pool.releases, [false]);
});

for (const [label, rows] of [
  ["ausente", []], ["inactivo", [{ ...row, activo: false }]],
  ["UUID ajeno", [{ ...row, id: other }]], ["rol inválido", [{ ...row, rol: "unapproved" }]],
]) {
  test("denegación " + label + ": ROLLBACK sin INSERT ni COMMIT", async () => {
    const pool = fakePool({ rows });
    await assert.rejects(useCase(pool)(token, requestId), error => error.kind === "forbidden");
    assert.equal(pool.calls.at(-1).text, "ROLLBACK");
    assert.ok(!pool.calls.some(c => c.text.startsWith("INSERT") || c.text === "COMMIT"));
    assert.deepEqual(pool.releases, [false]);
  });
}

for (const stage of ["BEGIN", "SELECT id,", "INSERT INTO", "COMMIT"]) {
  test("fallo de " + stage + ": no hay éxito y la conexión se descarta", async () => {
    const pool = fakePool({ fail: stage });
    await assert.rejects(useCase(pool)(token, requestId), error => error.kind === "dependency_unavailable");
    assert.deepEqual(pool.releases, [true]);
    assert.equal(pool.calls.filter(c => c.text === "COMMIT").length, stage === "COMMIT" ? 1 : 0);
    if (stage !== "BEGIN") assert.equal(pool.calls.at(-1).text, "ROLLBACK");
  });
}
test("fallo de ROLLBACK descarta la conexión y marca dependencia no disponible", async () => {
  const pool = fakePool({ rows: [], fail: "ROLLBACK" });
  await assert.rejects(useCase(pool)(token, requestId), error => error.kind === "dependency_unavailable");
  assert.deepEqual(pool.releases, [true]);
});
test("fallo de adquisición no expone detalles ni libera un cliente inexistente", async () => {
  const pool = fakePool({ connectFail: true });
  await assert.rejects(useCase(pool)(token, requestId), error => error.kind === "dependency_unavailable");
  assert.deepEqual(pool.releases, []);
});
test("una auditoría sin fila confirmada aborta la respuesta", async () => {
  const pool = fakePool({ auditCount: 0 });
  await assert.rejects(useCase(pool)(token, requestId), error => error.kind === "dependency_unavailable");
  assert.equal(pool.calls.at(-1).text, "ROLLBACK");
});
test("identidad inválida nunca adquiere conexión SQL", async () => {
  const pool = fakePool();
  const deps = fixture();
  deps.identity.verify = async () => { throw new UsersFailure("unauthenticated"); };
  await assert.rejects(useCase(pool, deps)(token, requestId), error => error.kind === "unauthenticated");
  assert.equal(pool.connections, 0);
});
test("puertos transaccionales no se pueden reutilizar tras liberar la conexión", async () => {
  const pool = fakePool();
  const identity = await fixture().identity.verify(token);
  let escaped;
  await new PostgresUnitOfWork(pool).run(identity, requestId, async ports => { escaped = ports; });
  const count = pool.calls.length;
  await assert.rejects(escaped.profiles.findByAuthSubject(subject), error => error.kind === "dependency_unavailable");
  assert.equal(pool.calls.length, count);
});
test("el repositorio y la auditoría están vinculados al actor y requestId", async () => {
  const identity = await fixture().identity.verify(token);
  const pool = fakePool();
  await assert.rejects(new PostgresUnitOfWork(pool).run(identity, requestId, async ports => {
    await ports.profiles.findByAuthSubject(other);
  }), error => error.kind === "forbidden");
  assert.ok(!pool.calls.some(c => c.text.startsWith("SELECT id,")));
  const pool2 = fakePool();
  await assert.rejects(new PostgresUnitOfWork(pool2).run(identity, requestId, async ports => {
    await ports.audit.record({ subject: other, requestId, permission: "users.profile.read", policyVersion: "phase-2.3-draft" });
  }), error => error.kind === "forbidden");
});
test("preflight rechaza identidad/privilegios/TLS inesperados", async () => {
  const pool = fakePool({ preflight: false });
  await assert.rejects(verifyRestrictedDatabase(pool), error => error.kind === "dependency_unavailable");
  assert.deepEqual(pool.releases, [true]);
  assert.match(PREFLIGHT_SQL, /session_user = 'sdv_users_app'/);
  assert.match(PREFLIGHT_SQL, /pg_stat_ssl/);
  for (const domain of ["catalogo", "citas", "pagos", "notificaciones"]) assert.ok(PREFLIGHT_SQL.includes(domain));
});

const ca = rootCertificates.find(pem => {
  const cert = new X509Certificate(pem);
  return cert.ca && Date.parse(cert.validTo) > Date.now() && Date.parse(cert.validFrom) < Date.now();
});
const passwordPath = resolve(tmpdir(), "synthetic-password-file");
const caPath = resolve(tmpdir(), "synthetic-ca-file");
function env() {
  return { USERS_PG_ENABLED: "true", USERS_PG_HOST: "db.project.example", USERS_PG_PORT: "5432",
    USERS_PG_MODE: "direct", USERS_PG_USER: "sdv_users_app", USERS_PG_DATABASE: "postgres",
    USERS_PG_PASSWORD_FILE: passwordPath, USERS_PG_CA_FILE: caPath,
    USERS_AUTH_URL: "https://project.example", USERS_AUTH_PUBLISHABLE_KEY: "sb_publishable_synthetic" };
}
const read = path => path === caPath ? ca : "synthetic-not-a-real-password\n";
test("configuración deshabilitada no lee secretos ni crea pool", async () => {
  let called = false;
  assert.equal(loadPgSettings({}, () => { throw new Error("No leer"); }), null);
  const runtime = await createUsersRuntime({}, { poolFactory: () => { called = true; throw new Error(); } });
  assert.equal(runtime.enabled, false);
  assert.equal(called, false);
});
test("pool pequeño con TLS verificado, sin URI ni flags inseguros", () => {
  const settings = loadPgSettings(env(), read);
  assert.equal(settings.pool.max, 2);
  assert.equal(settings.pool.ssl.rejectUnauthorized, true);
  assert.equal(settings.pool.ssl.servername, "db.project.example");
  assert.equal(Object.hasOwn(settings.pool, "connectionString"), false);
  assert.equal(settings.pool.password, "synthetic-not-a-real-password");
});
test("usuarios elevados, rutas relativas, TLS inseguro y certificados inválidos fallan cerrado", () => {
  for (const patch of [
    { USERS_PG_USER: "postgres" }, { USERS_PG_USER: "svc_usuarios" }, { USERS_PG_USER: "service_role" },
    { USERS_PG_PASSWORD_FILE: "relative-file" }, { USERS_PG_CA_FILE: "" },
    { NODE_TLS_REJECT_UNAUTHORIZED: "0" }, { USERS_PG_PORT: "invalid" },
    { USERS_PG_HOST: "127.0.0.1" },
  ]) assert.throws(() => loadPgSettings({ ...env(), ...patch }, read), error => error.kind === "dependency_unavailable");
  assert.throws(() => loadPgSettings(env(), () => "invalid-cert"), error => error.kind === "dependency_unavailable");
});
test("runtime sin archivos/dependencias queda cerrado y no expone excepciones", async () => {
  const runtime = await createUsersRuntime(env(), { readFile: () => { throw new Error("private-data"); } });
  assert.equal(runtime.enabled, false);
  const response = await runtime.handler(new Request("http://users.test/v1/users/me/profile", { headers: { authorization: "Bearer " + token } }));
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("private-data"));
});
test("runtime fallido cierra pool; runtime válido se cierra una sola vez", async () => {
  const failed = fakePool({ preflight: false });
  const runtime = await createUsersRuntime(env(), { readFile: read,
    poolFactory: () => failed, identityFactory: () => fixture().identity });
  assert.equal(runtime.enabled, false);
  assert.equal(failed.ends, 1);
  const pool = fakePool();
  const active = await createUsersRuntime(env(), { readFile: read,
    poolFactory: () => pool, identityFactory: () => fixture().identity });
  assert.equal(active.enabled, true);
  await active.close(); await active.close();
  assert.equal(pool.ends, 1);
});

test("COMMIT que informa ROLLBACK nunca entrega un perfil", async () => {
  const pool = fakePool({ commitCommand: "ROLLBACK" });
  await assert.rejects(useCase(pool)(token, requestId), error => error.kind === "dependency_unavailable");
  assert.deepEqual(pool.releases, [true]);
});
