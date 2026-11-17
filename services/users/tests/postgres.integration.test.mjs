import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { readPgSettings } from "../src/config/postgres.ts";
import { createSqlPool } from "../src/postgres/connection.ts";
import { verifyRestrictedDatabase } from "../src/postgres/preflight.ts";
import { INSERT_AUDIT_SQL } from "../src/postgres/audit.ts";
import { isUuid } from "../src/domain/profile.ts";
import { runRollbackSession, rollback } from "./helpers/postgres-session.mjs";

const approved = process.env.USERS_PG_INTEGRATION_TESTS === "approved-isolated";
const a = process.env.USERS_PG_TEST_SUBJECT;
const b = process.env.USERS_PG_TEST_OTHER_SUBJECT;
async function session(work) {
  assert.ok(isUuid(a) && isUuid(b) && a !== b, "Se requieren dos perfiles sintéticos existentes y distintos.");
  assert.equal(process.env.USERS_PG_ENABLED, "false", "El servicio debe permanecer deshabilitado.");
  const settings = readPgSettings(process.env);
  const pool = createSqlPool(settings.pool);
  return runRollbackSession(pool, p => verifyRestrictedDatabase(p, settings.mode), work);
}
const context = (client, subject) => client.query("SELECT pg_catalog.set_config('app.auth_subject',$1::text,true)", [subject]);
async function denied(client, text) {
  let code;
  try { await client.query(text); }
  catch (error) { code = error.code; }
  assert.equal(code, "42501");
}

test("integración: identidad técnica, TLS y permisos efectivos mínimos", { skip: !approved }, async () => {
  await session(async client => {
    const result = await client.query("SELECT session_user = 'sdv_users_app' AND current_user = 'sdv_users_app' AS ok");
    assert.ok(result.rows[0].ok === true);
  });
});
test("integración: perfil propio, ID ajeno y cambios de contexto en el mismo cliente", { skip: !approved }, async () => {
  await session(async client => {
    const query = "SELECT id,nombres,apellidos,rol,activo FROM usuarios.perfiles WHERE id=$1::uuid";
    await context(client, a);
    assert.equal((await client.query(query, [a])).rows.length, 1);
    assert.equal((await client.query(query, [b])).rows.length, 0);
    await context(client, b);
    assert.equal((await client.query(query, [b])).rows.length, 1);
    assert.equal((await client.query(query, [a])).rows.length, 0);
    await rollback(client);
    await client.query("BEGIN");
    assert.equal((await client.query(query, [a])).rows.length, 0);
  });
});
for (const [label, query] of [
  ["catalogo", "SELECT id FROM catalogo.servicios WHERE false"],
  ["citas", "SELECT id FROM citas.citas WHERE false"],
  ["pagos", "SELECT id FROM pagos.transacciones WHERE false"],
  ["notificaciones", "SELECT id FROM notificaciones.envios WHERE false"],
  ["pacientes", "SELECT id FROM usuarios.pacientes WHERE false"],
  ["columnas adicionales", "SELECT * FROM usuarios.perfiles WHERE false"],
  ["UPDATE perfiles", "UPDATE usuarios.perfiles SET rol='administrador' WHERE false"],
  ["SET ROLE", "SET LOCAL ROLE svc_usuarios"],
  ["lectura auditoría", "SELECT request_id FROM usuarios.auditoria_accesos WHERE false"],
  ["DELETE auditoría", "DELETE FROM usuarios.auditoria_accesos WHERE false"],
]) {
  test("integración denegada: " + label, { skip: !approved }, async () => {
    await session(async client => { await context(client, a); await denied(client, query); });
  });
}
test("integración: INSERT permitido de auditoría, siempre revertido", { skip: !approved }, async () => {
  await session(async client => {
    await context(client, a);
    const requestId = randomUUID();
    if (process.env.USERS_PG_AUDIT_REQUEST_FILE) {
      appendFileSync(process.env.USERS_PG_AUDIT_REQUEST_FILE, JSON.stringify(requestId) + "\n", "utf8");
    }
    const result = await client.query(INSERT_AUDIT_SQL, [requestId, a, "phase-2.3-draft"]);
    assert.equal(result.rowCount, 1);
    // session() hace ROLLBACK: no se persiste ningún evento de esta prueba.
  });
});
