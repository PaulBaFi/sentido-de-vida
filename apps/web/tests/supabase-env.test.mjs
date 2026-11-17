import assert from "node:assert/strict";
import test from "node:test";
import { parseSupabasePublicEnv } from "../src/lib/supabase/env.ts";

const valid = {
  url: "https://project.example",
  publishableKey: "sb_publishable_test_only",
};

test("sin configuración: modo opcional desactivado y cliente explícito rechazado", () => {
  assert.equal(parseSupabasePublicEnv({}, false), null);
  assert.throws(() => parseSupabasePublicEnv({}), /NEXT_PUBLIC_SUPABASE_URL/);
});

test("configuración parcial no se trata como Auth desactivado", () => {
  assert.throws(() => parseSupabasePublicEnv({ url: valid.url }, false));
  assert.throws(() => parseSupabasePublicEnv({ publishableKey: valid.publishableKey }, false));
});

test("acepta HTTPS y HTTP local, normaliza espacios y barra final", () => {
  assert.deepEqual(parseSupabasePublicEnv({
    url: " https://project.example/ ",
    publishableKey: " sb_publishable_test_only ",
  }), valid);
  for (const url of ["http://localhost:54321", "http://127.0.0.1:54321", "http://[::1]:54321"]) {
    assert.equal(parseSupabasePublicEnv({ ...valid, url }).url, url);
  }
});

test("rechaza URLs inseguras o con componentes inesperados", () => {
  for (const url of [
    "invalid", "http://project.example", "ftp://localhost",
    "https://user:password@project.example", "https://project.example/path",
    "https://project.example?secret=hidden", "https://project.example#fragment",
  ]) {
    assert.throws(() => parseSupabasePublicEnv({ ...valid, url }));
  }
});

test("rechaza claves privilegiadas y JWT sin revelar sus valores", () => {
  for (const publishableKey of ["sb_secret_sensitive", "eyJhbGciOiJIUzI1NiJ9.payload.signature"]) {
    assert.throws(
      () => parseSupabasePublicEnv({ ...valid, publishableKey }),
      error => error instanceof Error && !error.message.includes(publishableKey),
    );
  }
});

test("rechaza un prefijo publishable sin contenido", () => {
  assert.throws(() => parseSupabasePublicEnv({ ...valid, publishableKey: "sb_publishable_" }));
});
