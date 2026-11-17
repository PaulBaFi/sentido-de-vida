import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const executable = process.env.AUTH_BROWSER_PATH ?? [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium",
].find(existsSync);
if (!executable) throw new Error("Define AUTH_BROWSER_PATH para un navegador Chromium local.");
const base = new URL(process.env.AUTH_TEST_BASE_URL ?? "http://localhost:3100");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
const profile = resolve(".next", "auth-ux-profile-" + Date.now());
mkdirSync(profile, { recursive: true });
const browser = spawn(executable, [
  "--headless=new", "--remote-debugging-port=0", "--no-first-run",
  "--disable-extensions", "--disable-background-networking", "--user-data-dir=" + profile, "about:blank",
], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
let socket;
const pending = new Map();
let sequence = 0;
let sessionId;
try {
  const address = await new Promise((resolveAddress, reject) => {
    const timer = setTimeout(() => reject(new Error("No se pudo iniciar el navegador local.")), 15000);
    browser.on("error", () => { clearTimeout(timer); reject(new Error("No se pudo iniciar el navegador local.")); });
    let output = "";
    browser.stderr.on("data", chunk => {
      output += chunk.toString();
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolveAddress(match[1]); }
    });
  });
  socket = new WebSocket(address);
  await new Promise((resolveOpen, reject) => { socket.onopen = resolveOpen; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error("Comando de navegador no completado."));
    else waiter.resolve(message.result);
  };
  async function command(method, params = {}, session = sessionId) {
    const id = ++sequence;
    return new Promise((resolveCommand, reject) => {
      pending.set(id, { resolve: resolveCommand, reject });
      socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }));
    });
  }
  const target = await command("Target.createTarget", { url: "about:blank" });
  const attached = await command("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  sessionId = attached.sessionId;
  await command("Page.enable");
  async function evaluate(expression) {
    const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error("La comprobación de interfaz no pudo completarse.");
    return result.result.value;
  }
  async function waitFor(expression) {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
    }
    throw new Error("Tiempo agotado esperando la interfaz.");
  }
  await command("Page.navigate", { url: new URL("/login", base).href });
  await waitFor("!!document.querySelector('#email')?._valueTracker");
  const submit = "document.querySelector('form[aria-label=\"Iniciar sesión\"]').requestSubmit()";
  await evaluate(submit);
  await waitFor("document.querySelector('#email-error')?.textContent.includes('Ingresa tu correo electrónico.')");
  assert.equal(await evaluate("document.querySelector('#password-error')?.textContent.includes('Ingresa tu contraseña.')"), true);
  console.log("OK: validación de campos vacíos y errores accesibles");

  async function fill(id, value) {
    await evaluate("(()=>{const input=document.getElementById(" + JSON.stringify(id) + ");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input," + JSON.stringify(value) + ");input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  }
  await fill("email", "not-an-email");
  await fill("password", "synthetic-password");
  await evaluate(submit);
  await waitFor("document.querySelector('#email-error')?.textContent.includes('correo electrónico válido')");
  assert.equal(await evaluate("document.querySelector('#password').value === 'synthetic-password' && document.querySelector('#email').value === 'not-an-email'"), true);
  assert.equal(await evaluate("document.querySelector('#email').getAttribute('aria-describedby') === 'email-error'"), true);
  console.log("OK: formato inválido y valores conservados");

  await fill("email", "user@example.test");
  await fill("password", "");
  await evaluate(submit);
  await waitFor("!!document.querySelector('#password-error')");
  assert.equal(await evaluate("document.querySelector('#password').getAttribute('aria-invalid') === 'true'"), true);
  console.log("OK: contraseña requerida y asociación del mensaje");

  await fill("password", "synthetic-password");
  await evaluate("document.querySelector('button[aria-label=\"Mostrar contraseña\"]').click()");
  assert.equal(await evaluate("document.querySelector('#password').type === 'text'"), true);
  await evaluate("document.querySelector('button[aria-label=\"Ocultar contraseña\"]').click()");
  await evaluate("document.querySelector('#email').focus()");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate("document.activeElement.id === 'password'"), true);
  console.log("OK: teclado y visibilidad de contraseña");

  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  console.log("OK: ancho móvil sin desbordamiento horizontal");
  console.log("5 comprobaciones de navegador correctas; sin enviar credenciales válidas.");
  await command("Browser.close", {}, undefined);
} finally {
  socket?.close();
  browser.kill();
}
