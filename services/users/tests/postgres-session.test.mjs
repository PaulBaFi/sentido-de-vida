import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runRollbackSession, rollback } from "./helpers/postgres-session.mjs";

const privateFailure = () => new Error("private-password-and-token");
function fixture(options = {}) {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql === "BEGIN" && options.begin) throw privateFailure();
      if (sql === "ROLLBACK" && options.rollback) throw privateFailure();
      return { command: options.command ?? sql };
    },
    release(destroy) {
      calls.push(["release", destroy]);
      if (options.release) throw privateFailure();
      if (options.asyncRelease) return Promise.reject(privateFailure());
    },
  };
  const pool = {
    async connect() { calls.push("connect"); if (options.connect) throw privateFailure(); return client; },
    async end() { calls.push("end"); if (options.end) throw privateFailure(); if (options.onEnd) await options.onEnd(); },
  };
  const inspect = async () => { calls.push("inspect"); if (options.inspect) throw privateFailure(); };
  const work = async () => { calls.push("work"); if (options.work) throw privateFailure(); return "synthetic-result"; };
  return { calls, pool, inspect, work };
}
async function failed(f, stages) {
  await assert.rejects(runRollbackSession(f.pool, f.inspect, f.work), error => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length, stages.length);
    for (let i = 0; i < stages.length; i++) assert.match(error.errors[i].message, stages[i]);
    assert.ok(!JSON.stringify(error, Object.getOwnPropertyNames(error)).includes("private-password"));
    assert.ok(!error.cause);
    for (const failure of error.errors) {
      assert.ok(!failure.message.includes("private-password"));
      assert.ok(!failure.cause);
    }
    return true;
  });
  assert.equal(f.calls.at(-1), "end");
}

test("éxito solo después de rollback, liberación y cierre", async () => {
  const f = fixture();
  assert.equal(await runRollbackSession(f.pool, f.inspect, f.work), "synthetic-result");
  assert.deepEqual(f.calls, ["inspect", "connect", "BEGIN", "work", "ROLLBACK", ["release", false], "end"]);
});
test("no devolver éxito mientras el cierre del pool siga pendiente", async () => {
  let finish;
  const wait = new Promise(resolve => { finish = resolve; });
  let closing;
  const started = new Promise(resolve => { closing = resolve; });
  const f = fixture({ onEnd: async () => { closing(); await wait; } });
  let complete = false;
  const run = runRollbackSession(f.pool, f.inspect, f.work).then(() => { complete = true; });
  await started;
  assert.equal(complete, false);
  finish();
  await run;
  assert.equal(complete, true);
});
test("ROLLBACK rechazado falla la prueba y descarta el cliente", async () => {
  const f = fixture({ rollback: true });
  await failed(f, [/ROLLBACK/]);
  assert.deepEqual(f.calls.at(-2), ["release", true]);
});
for (const command of ["unexpected", ""]) {
  test(`respuesta ROLLBACK inesperada (${command}) falla cerrado`, async () => {
    const f = fixture({ command });
    await failed(f, [/ROLLBACK/]);
    assert.deepEqual(f.calls.at(-2), ["release", true]);
  });
}
test("ROLLBACK sin respuesta no se considera confirmado", async () => {
  await assert.rejects(rollback({ query: async () => undefined }), /no confirmado/);
});
test("liberación síncrona fallida no impide intentar cerrar pool", () => failed(fixture({ release: true }), [/liberación/]));
test("liberación asíncrona fallida tampoco comunica éxito", () => failed(fixture({ asyncRelease: true }), [/liberación/]));
test("cierre rechazado hace fallar una prueba antes exitosa", () => failed(fixture({ end: true }), [/cierre/]));
test("error original y los tres fallos de limpieza se conservan sanitizados", async () => {
  const f = fixture({ work: true, rollback: true, release: true, end: true });
  await failed(f, [/verificación/, /ROLLBACK/, /liberación/, /cierre/]);
  assert.equal(f.calls.filter(call => call === "ROLLBACK").length, 1);
});
test("fallo de inspección cierra pool sin adquirir cliente", async () => {
  const f = fixture({ inspect: true, end: true });
  await failed(f, [/inspección/, /cierre/]);
  assert.deepEqual(f.calls, ["inspect", "end"]);
});
test("fallo de adquisición también cierra pool", () => failed(fixture({ connect: true }), [/adquisición/]));
test("fallo de BEGIN intenta rollback y descarta cliente", async () => {
  const f = fixture({ begin: true });
  await failed(f, [/inicio de transacción/]);
  assert.ok(f.calls.includes("ROLLBACK"));
  assert.deepEqual(f.calls.at(-2), ["release", true]);
});
test("fallo del cuerpo no se oculta aunque la limpieza tenga éxito", () => failed(fixture({ work: true }), [/verificación/]));
test("runner sin confirmaciones y DML negativo limitado a cero filas", () => {
  const source = readFileSync(new URL("./postgres.integration.test.mjs", import.meta.url), "utf8");
  const helper = readFileSync(new URL("./helpers/postgres-session.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source + helper, /\bCOMMIT\b/i);
  const modifications = [...source.matchAll(/"((?:UPDATE [^"]+ SET |DELETE FROM )[^"\n]+)"/g)].map(match => match[1]);
  assert.equal(modifications.length, 2);
  for (const sql of modifications) assert.match(sql, / WHERE false$/);
  const audit = readFileSync(new URL("../src/postgres/audit.ts", import.meta.url), "utf8");
  assert.doesNotMatch(audit, /\bCOMMIT\b/i);
  assert.match(audit, /INSERT INTO usuarios\.auditoria_accesos/);
  assert.match(source, /const requestId = randomUUID\(\)/);
  assert.match(source, /INSERT_AUDIT_SQL, \[requestId, a,/);
});
