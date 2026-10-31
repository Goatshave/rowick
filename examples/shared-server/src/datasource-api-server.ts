import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPersistentDataStore, DataServiceError } from "./datasource-store";

type Next = () => void;
interface MiddlewareServer { middlewares: { use: (handler: (request: IncomingMessage, response: ServerResponse, next: Next) => void) => unknown }; }
export interface DataSourceApiOptions {
  storageDirectory?: string; logicalRowCount?: number; maxActiveSessions?: number; maxStoredSessions?: number;
  /** Replace demo session scoping with real authentication/authorization in a product. */
  authorize?: (request: IncomingMessage, session: string) => { canRead: boolean; canWrite: boolean };
}
export function createDataSourceApiHandler(options: DataSourceApiOptions = {}) {
  const directory = options.storageDirectory ?? process.env.ROWICK_DATASOURCE_STORAGE ?? join(tmpdir(), "rowick-datasource-demo-v1");
  const capacity = options.maxActiveSessions ?? 64, diskCapacity = options.maxStoredSessions ?? 2048;
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1024 || !Number.isSafeInteger(diskCapacity) || diskCapacity < 1 || diskCapacity > 10_000) throw new TypeError("Invalid datasource session limit");
  const sessions = new Map<string, { store: ReturnType<typeof createPersistentDataStore>; active: number }>();
  const send = (response: ServerResponse, status: number, value: unknown) => {
    if (response.destroyed || response.writableEnded) return;
    response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff" }); response.end(JSON.stringify(value));
  };
  return (request: IncomingMessage, response: ServerResponse, next: Next = () => { response.writeHead(404); response.end(); }) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/__rowick/datasource/")) { next(); return; }
    void (async () => {
      const sessionId = url.searchParams.get("session");
      if (!sessionId || !/^[a-zA-Z\d_-]{1,80}$/.test(sessionId)) throw new DataServiceError(400, "A valid demo session is required");
      const permission = options.authorize?.(request, sessionId) ?? { canRead: true, canWrite: true };
      if (!permission.canRead) throw new DataServiceError(403, "Datasource access denied");
      if (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host) throw new DataServiceError(403, "Same-origin requests required");
      let entry = sessions.get(sessionId);
      if (!entry) {
        if (sessions.size >= capacity) { const victim = [...sessions].find(([, cached]) => cached.active === 0); if (victim) sessions.delete(victim[0]); else throw new DataServiceError(503, "Demo session concurrency capacity reached"); }
        const filePath = join(directory, `${sessionId}.json`);
        if (!existsSync(filePath) && existsSync(directory) && readdirSync(directory).filter((file) => file.endsWith(".json")).length >= diskCapacity) throw new DataServiceError(503, "Demo stored session capacity reached");
        entry = { store: createPersistentDataStore({ filePath, ...(options.logicalRowCount !== undefined ? { logicalRowCount: options.logicalRowCount } : {}) }), active: 0 };
        sessions.set(sessionId, entry);
      } else { sessions.delete(sessionId); sessions.set(sessionId, entry); }
      entry.active++;
      try {
        if (url.pathname === "/__rowick/datasource/health" && request.method === "GET") { send(response, 200, { revision: entry.store.getRevision(), logicalRowCount: entry.store.getLogicalRowCount() }); return; }
        if (request.method !== "POST") throw new DataServiceError(405, "POST JSON required");
        if (!request.headers["content-type"]?.startsWith("application/json")) throw new DataServiceError(415, "JSON body required");
        if (Number(request.headers["content-length"] ?? 0) > 131_072) throw new DataServiceError(413, "Datasource request is too large");
        let body = "", bytes = 0;
        for await (const chunk of request) { bytes += Buffer.byteLength(chunk); if (bytes > 131_072) throw new DataServiceError(413, "Datasource request is too large"); body += String(chunk); }
        const input = JSON.parse(body) as any;
        const delay = Number(url.searchParams.get("delay") ?? 30); if (!Number.isSafeInteger(delay) || delay < 0 || delay > 1_000) throw new DataServiceError(400, "Invalid demo delay");
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
        if (response.destroyed) return;
        if (url.pathname === "/__rowick/datasource/read") {
          if (url.searchParams.get("fail") === "1") throw new DataServiceError(503, "Temporary datasource read failure");
          send(response, 200, entry.store.read(input)); return;
        }
        if (url.pathname === "/__rowick/datasource/export") {
          const rows = entry.store.export(input.selection); send(response, 200, { rows, revision: entry.store.getRevision(), evaluation: "live-query" }); return;
        }
        if (!permission.canWrite) throw new DataServiceError(403, "Datasource write access denied");
        if (url.pathname === "/__rowick/datasource/bulk") {
          const result = entry.store.bulk(input.selection, input.action);
          if (url.searchParams.get("lose") === "1") throw new DataServiceError(503, "Bulk response lost after commit; retry the same operation");
          send(response, 200, result); return;
        }
        if (url.pathname === "/__rowick/datasource/mutate") {
          if (!input || typeof input.queryId !== "string" || !input.queryId || input.queryId.length > 1_000) throw new DataServiceError(400, "Invalid live query identity");
          send(response, 200, entry.store.mutate(input.queryId, input.mutation)); return;
        }
        throw new DataServiceError(404, "Datasource demo route not found");
      } finally { entry.active--; }
    })().catch((error: unknown) => send(response, error instanceof DataServiceError ? error.status : error instanceof SyntaxError || error instanceof TypeError || error instanceof RangeError ? 400 : 500,
      { error: error instanceof DataServiceError ? error.message : "Invalid datasource operation" }));
  };
}
/** Only local dev/preview uses this fixture. Products supply an authenticated API. */
export function datasourceApiPlugin(options: DataSourceApiOptions = {}) {
  const handler = createDataSourceApiHandler(options), install = (server: MiddlewareServer) => { server.middlewares.use(handler); };
  return { name: "rowick-persistent-datasource-api", configureServer: install, configurePreviewServer: install };
}
