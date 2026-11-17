import { createUsersRuntime } from "./runtime.ts";
import { createUsersServer } from "./transport/server.ts";

const port = Number(process.env.PORT ?? 4001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT debe ser un puerto entre 1 y 65535.");
const runtime = await createUsersRuntime(process.env);
const server = createUsersServer(runtime.handler);
server.listen(port, "127.0.0.1", () => {
  console.log(runtime.enabled ? "Usuarios: PostgreSQL restringido habilitado." : "Usuarios: acceso cerrado; dependencias no habilitadas.");
});
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      void runtime.close();
    }, 15_000);
    deadline.unref();
    server.close(() => { clearTimeout(deadline); void runtime.close(); });
    server.closeIdleConnections();
  });
}
