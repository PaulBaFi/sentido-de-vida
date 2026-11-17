import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server.js";
import { passwordLogin, logout, verifyIdentity, isProtectedPath, loginDestination, loginNotice } from "../src/lib/auth/flows.ts";
import { privateAuthResponse } from "../src/lib/auth/response.ts";

test("login válido normaliza email, conserva contraseña y exige sesión emitida", async () => {
  let input;
  const auth = { signInWithPassword: async value => {
    input = value;
    return { data: { user: { id: "user" }, session: { access_token: "synthetic" } }, error: null };
  }};
  assert.equal((await passwordLogin(auth, " user@example.test ", " secret ")).status, "success");
  assert.deepEqual(input, { email: "user@example.test", password: " secret " });
  assert.equal((await passwordLogin({ signInWithPassword: async () => ({ data: {}, error: null }) }, "user@example.test", "secret")).status, "error");
});

test("formulario inválido no llama a Supabase", async () => {
  const auth = { signInWithPassword: async () => assert.fail("No debe consultar Auth") };
  for (const [email, password] of [["invalid", "secret"], ["a@b.test", ""], [null, "secret"], ["a@b.test", null]]) {
    assert.equal((await passwordLogin(auth, email, password)).status, "error");
  }
});

test("errores de cuenta usan el mismo mensaje sin enumerar ni mostrar detalles", async () => {
  const messages = [];
  for (const code of ["invalid_credentials", "user_banned", "user_not_found"]) {
    const state = await passwordLogin({ signInWithPassword: async () => ({ data: {}, error: { code, message: "sensitive" } }) }, "user@example.test", "secret");
    assert.equal(state.status, "error");
    assert.ok(!state.message.includes("sensitive"));
    messages.push(state.message);
  }
  assert.equal(new Set(messages).size, 1);
});

test("login distingue red y límite de intentos", async () => {
  for (const error of [{ name: "AuthRetryableFetchError", status: 0 }, { name: "TypeError" }]) {
    const state = await passwordLogin({ signInWithPassword: async () => ({ data: {}, error }) }, "user@example.test", "secret");
    assert.match(state.message, /conexión/);
  }
  const limited = await passwordLogin({ signInWithPassword: async () => ({ data: {}, error: { status: 429 } }) }, "user@example.test", "secret");
  assert.match(limited.message, /demasiados intentos/i);
});

test("dashboard acepta solo un usuario verificado por getUser sin error", async () => {
  assert.deepEqual(await verifyIdentity({ getUser: async () => ({ data: { user: { id: "verified" } }, error: null }) }), { status: "authenticated" });
  assert.deepEqual(await verifyIdentity({ getUser: async () => ({ data: { user: { id: "forged" } }, error: { code: "bad_jwt" } }) }), { status: "expired" });
  assert.deepEqual(await verifyIdentity({ getUser: async () => ({ data: { user: null }, error: { name: "AuthSessionMissingError" } }) }), { status: "anonymous" });
});

test("errores de identidad no conceden acceso", async () => {
  assert.equal((await verifyIdentity({ getUser: async () => { throw new TypeError("private"); } })).status, "connection");
  assert.equal((await verifyIdentity({ getUser: async () => { throw new Error("private"); } })).status, "unavailable");
});

test("protección incluye dashboard y descendientes, sin coincidencias parciales", () => {
  for (const path of ["/dashboard", "/dashboard/", "/dashboard/anything"]) assert.equal(isProtectedPath(path), true);
  for (const path of ["/", "/login", "/dashboard-public"]) assert.equal(isProtectedPath(path), false);
  assert.equal(loginDestination({ status: "anonymous" }), "/login");
  assert.equal(loginDestination({ status: "expired" }), "/login?reason=expired");
  assert.equal(loginDestination({ status: "connection" }), "/login?reason=connection");
  assert.equal(loginNotice("https://evil.example"), "");
});

test("logout es local y nunca declara éxito si falla", async () => {
  let options;
  assert.equal((await logout({ signOut: async input => { options = input; return { error: null }; } })).status, "success");
  assert.deepEqual(options, { scope: "local" });
  assert.equal((await logout({ signOut: async () => ({ error: { status: 503 } }) })).status, "error");
  assert.equal((await logout({ signOut: async () => { throw new Error("secret"); } })).status, "error");
});

test("redirección conserva cookies renovadas y bloquea caché compartida", () => {
  const original = NextResponse.next();
  original.cookies.set("synthetic-auth", "synthetic-value", { path: "/", sameSite: "lax", secure: true });
  const response = privateAuthResponse(original, new URL("https://app.example/login?reason=expired"));
  assert.equal(response.status, 307);
  assert.equal(response.cookies.get("synthetic-auth").value, "synthetic-value");
  assert.match(response.headers.get("cache-control"), /private.*no-store/);
  assert.equal(response.headers.get("expires"), "0");
});

test("respuestas autenticadas tampoco admiten caché compartida", () => {
  const original = NextResponse.next();
  assert.equal(privateAuthResponse(original), original);
  assert.match(original.headers.get("cache-control"), /no-store/);
});
