import assert from "node:assert/strict";
import test from "node:test";
import { LOGIN_MESSAGES, validateLoginInput, classifyLoginError, passwordLogin, loginNotice, sessionFailure } from "../src/lib/auth/flows.ts";

for (const [label, email, password, expected] of [
  ["correo vacío", "", "secret", { email: "Ingresa tu correo electrónico." }],
  ["correo con espacios", "   ", "secret", { email: "Ingresa tu correo electrónico." }],
  ["correo inválido", "invalid", "secret", { email: "Ingresa un correo electrónico válido." }],
  ["contraseña vacía", "user@example.test", "", { password: "Ingresa tu contraseña." }],
  ["ambos vacíos", "", "", { email: "Ingresa tu correo electrónico.", password: "Ingresa tu contraseña." }],
]) {
  test("validación por campo: " + label, async () => {
    assert.deepEqual(validateLoginInput(email, password), expected);
    const state = await passwordLogin({ signInWithPassword: () => assert.fail("No se debe llamar al proveedor") }, email, password);
    assert.deepEqual(state.fieldErrors, expected);
    assert.ok(!JSON.stringify(state).includes("secret"));
  });
}

for (const [label, error, expected] of [
  ["credenciales incorrectas", { code: "invalid_credentials", status: 400 }, LOGIN_MESSAGES.credentials],
  ["correo no registrado", { code: "user_not_found", status: 404 }, LOGIN_MESSAGES.credentials],
  ["confirmación explícita 400", { code: "email_not_confirmed", status: 400 }, LOGIN_MESSAGES.confirmation],
  ["confirmación explícita 422", { code: "email_not_confirmed", status: 422 }, LOGIN_MESSAGES.confirmation],
  ["confirmación ambigua sin estado", { code: "email_not_confirmed" }, LOGIN_MESSAGES.unexpected],
  ["mensaje remoto engañoso", { code: "invalid_credentials", message: "Email not confirmed" }, LOGIN_MESSAGES.credentials],
  ["límite por código", { code: "over_request_rate_limit" }, LOGIN_MESSAGES.rateLimit],
  ["límite por HTTP", { status: 429 }, LOGIN_MESSAGES.rateLimit],
  ["red SDK", { name: "AuthRetryableFetchError", status: 0 }, LOGIN_MESSAGES.connection],
  ["excepción fetch", new TypeError("private diagnostic"), LOGIN_MESSAGES.connection],
  ["timeout local", { name: "TimeoutError" }, LOGIN_MESSAGES.connection],
  ["servicio 503 SDK", { name: "AuthRetryableFetchError", status: 503 }, LOGIN_MESSAGES.unavailable],
  ["servicio 500", { status: 500 }, LOGIN_MESSAGES.unavailable],
  ["proveedor deshabilitado", { code: "email_provider_disabled", status: 422 }, LOGIN_MESSAGES.unavailable],
  ["sesión expirada", { code: "session_expired" }, LOGIN_MESSAGES.expired],
  ["token de renovación ausente", { code: "refresh_token_not_found" }, LOGIN_MESSAGES.expired],
  ["código desconocido", { code: "future_error", status: 422, message: "private diagnostic" }, LOGIN_MESSAGES.unexpected],
  ["excepción inesperada", new Error("private diagnostic"), LOGIN_MESSAGES.unexpected],
]) {
  test("clasificación segura: " + label, async () => {
    assert.equal(classifyLoginError(error).message, expected);
    const auth = { signInWithPassword: async () => ({ data: {}, error }) };
    const result = await passwordLogin(auth, "user@example.test", "secret");
    assert.equal(result.message, expected);
    assert.ok(!JSON.stringify(result).includes("private diagnostic"));
    assert.ok(!JSON.stringify(result).includes("secret"));
  });
}

test("excepciones lanzadas pasan por la misma clasificación", async () => {
  for (const error of [new TypeError("private"), new Error("private")]) {
    const result = await passwordLogin({ signInWithPassword: async () => { throw error; } }, "user@example.test", "secret");
    assert.equal(result.message, classifyLoginError(error).message);
  }
});

test("sesión expirada y fallos de servicio tienen mensajes y destinos distintos", () => {
  assert.equal(loginNotice("expired"), "Tu sesión ha expirado. Inicia sesión nuevamente.");
  assert.equal(loginNotice("connection"), LOGIN_MESSAGES.connection);
  assert.equal(loginNotice("unavailable"), LOGIN_MESSAGES.unavailable);
  assert.equal(sessionFailure({ name: "AuthRetryableFetchError", status: 503 }).status, "unavailable");
  assert.equal(loginNotice("private remote message"), "");
});

test("credenciales y confirmación no se infieren del texto de excepciones", () => {
  assert.equal(classifyLoginError(new Error("Email not confirmed")).message, LOGIN_MESSAGES.unexpected);
  assert.equal(classifyLoginError({ status: 400, message: "user exists" }).message, LOGIN_MESSAGES.credentials);
});
