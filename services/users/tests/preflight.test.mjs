import assert from "node:assert/strict";
import test from "node:test";
import { verifyRestrictedDatabase, PREFLIGHT_SQL } from "../src/postgres/preflight.ts";

// Resultados del catálogo, no ACL inventadas por el evaluador. Los has_* SQL
// calculan privilegios efectivos; aquí se prueba la decisión usada al arrancar.
const path = (patch = {}) => ({ kind: "relation", schemaUsage: false,
  objectPrivilege: true, indirectAccess: false, ...patch });
function inspected(rows, error) {
  const releases = [];
  const queries = [];
  return { releases, queries,
    async connect() { return {
      async query(sql) { queries.push(sql); if (error) throw error; return { rows }; },
      release(destroy) { releases.push(destroy); },
    }; },
    async end() {},
  };
}
async function check(paths, allowed, ok = true) {
  const pool = inspected([{ ok, access_paths: paths }]);
  if (allowed) await verifyRestrictedDatabase(pool);
  else await assert.rejects(verifyRestrictedDatabase(pool), e => e.kind === "dependency_unavailable");
  assert.deepEqual(pool.releases, [!allowed]);
  assert.deepEqual(pool.queries, [PREFLIGHT_SQL]);
}

test("PUBLIC con SELECT sin USAGE no permite acceso directo", () => check([path()], true));
test("PUBLIC con SELECT y USAGE se rechaza", () => check([path({ schemaUsage: true })], false));
test("USAGE sin privilegio de objeto no concede lectura", () => check([path({ schemaUsage: true, objectPrivilege: false })], true));
test("solo los dos objetos mínimos aprobados y sin rutas adicionales", () => check([], true));
for (const kind of ["routine", "definer"]) {
  test(`${kind} ejecutable en esquema accesible se rechaza`, () => check([path({ kind, schemaUsage: true })], false));
  test(`${kind} sin USAGE ni ruta indirecta no es invocable directamente`, () => check([path({ kind })], true));
  test(`${kind} mediante cast u operador se rechaza aunque falte USAGE`, () => check([path({ kind, indirectAccess: true })], false));
}
for (const domain of ["catalogo", "citas", "pagos", "notificaciones"]) {
  test(`acceso efectivo cruzado a ${domain} se rechaza`, () => check([path({ schemaUsage: true })], false));
}
for (const label of ["tabla", "vista", "vista materializada", "partición", "tabla foránea", "secuencia"]) {
  test(`privilegio inesperado sobre ${label} accesible se rechaza`, () => check([path({ schemaUsage: true })], false));
}
test("privilegio por herencia o membresía no supera la inspección de identidad", () => check([], false, false));
test("ruta permitida no oculta otra ruta indirecta", () => check([path(), path({ kind: "definer", indirectAccess: true })], false));
for (const paths of [undefined, null, {}, [null], [path({ schemaUsage: null })],
  [path({ objectPrivilege: "true" })], [path({ indirectAccess: undefined })], [path({ kind: "unknown" })]]) {
  test(`catálogo ambiguo falla cerrado: ${JSON.stringify(paths)}`, () => check(paths, false));
}
test("errores de inspección se sanitizan y descartan la conexión", async () => {
  const pool = inspected([], new Error("detalle privado"));
  await assert.rejects(verifyRestrictedDatabase(pool), e => e.kind === "dependency_unavailable" && !e.message.includes("privado"));
  assert.deepEqual(pool.releases, [true]);
});
test("cero filas, múltiples filas y ok no booleano fallan cerrado", async () => {
  for (const rows of [[], [{ ok: true, access_paths: [] }, { ok: true, access_paths: [] }], [{ ok: "true", access_paths: [] }]]) {
    const pool = inspected(rows);
    await assert.rejects(verifyRestrictedDatabase(pool));
    assert.deepEqual(pool.releases, [true]);
  }
});
test("la inspección cubre objetos indirectos y privilegios efectivos sin excepciones de despliegue", () => {
  assert.match(PREFLIGHT_SQL, /has_schema_privilege\(current_user,n.oid,'USAGE'\)/);
  assert.match(PREFLIGHT_SQL, /has_any_column_privilege/);
  assert.match(PREFLIGHT_SQL, /has_sequence_privilege/);
  assert.match(PREFLIGHT_SQL, /has_function_privilege/);
  assert.match(PREFLIGHT_SQL, /pg_has_role\(current_user, r.oid, 'MEMBER'\)/);
  assert.match(PREFLIGHT_SQL, /'r','p','v','m','f','S'/);
  assert.match(PREFLIGHT_SQL, /pg_cast/);
  assert.match(PREFLIGHT_SQL, /pg_operator/);
  assert.ok(!PREFLIGHT_SQL.includes("cron"));
  assert.ok(!PREFLIGHT_SQL.includes("extensions"));
});
