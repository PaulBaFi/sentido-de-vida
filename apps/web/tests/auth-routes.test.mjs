import assert from "node:assert/strict";
import test from "node:test";

const base = new URL(process.env.AUTH_TEST_BASE_URL ?? "http://localhost:3100");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Usa un servidor de pruebas local.");
const read = path => fetch(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(15000) });

test("HTTP: login accesible, formulario etiquetado y caché privada", async () => {
  const response = await read("/login");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /name="email"/);
  assert.match(html, /name="password"/);
  assert.match(html, /autoComplete="current-password"|autocomplete="current-password"/);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.ok(!html.includes('href="/register"'));
});

test("HTTP: visitante anónimo no recibe contenido del dashboard", async () => {
  const response = await read("/dashboard");
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), base).pathname, "/login");
  assert.match(response.headers.get("cache-control"), /private.*no-store/);
  assert.ok(!(await response.text()).includes("Estamos preparando tu espacio"));
});

test("HTTP: cookie arbitraria no concede acceso al dashboard", async () => {
  const response = await fetch(new URL("/dashboard", base), {
    redirect: "manual", headers: { cookie: "session=forged; authenticated=true" },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), base).pathname, "/login");
});

test("HTTP: perfil de acceso propio permanece protegido y sin caché", async () => {
  for (const cookie of ["", "session=forged; role=paciente"]) {
    const response = await fetch(new URL("/dashboard/mi-perfil", base), {
      redirect: "manual", headers: { cookie }, signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location"), base).pathname, "/login");
    assert.match(response.headers.get("cache-control"), /private.*no-store/);
    assert.ok(!(await response.text()).includes("Nombre registrado"));
  }
});
