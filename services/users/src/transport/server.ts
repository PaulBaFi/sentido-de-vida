import { createServer } from "node:http";
import type { createUsersHandler } from "../http/handler.ts";

export function createUsersServer(handler: ReturnType<typeof createUsersHandler>) {
  const server = createServer({ maxHeaderSize: 16_384 }, async (incoming, outgoing) => {
    try {
      const headers = new Headers();
      for (let i = 0; i < incoming.rawHeaders.length; i += 2) {
        headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
      }
      const request = new Request(new URL(incoming.url ?? "/", "http://users.local"), {
        method: incoming.method ?? "GET", headers,
      });
      const response = await handler(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(await response.text());
      incoming.resume();
    } catch {
      outgoing.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      outgoing.end('{"error":{"code":"dependency_unavailable","message":"El servicio no está disponible en este momento."}}');
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
