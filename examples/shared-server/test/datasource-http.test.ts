import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDataSourceApiHandler } from "../src/datasource-api-server";
import { createDatasourceExample } from "../src/datasource-client";
import { captureDataQuery } from "@rowick/data/server-data";
let server: Server, base: string, directory: string;
async function start(authorize?: (request: import("node:http").IncomingMessage, session: string) => { canRead: boolean; canWrite: boolean }) {
  server = createServer(createDataSourceApiHandler({ storageDirectory: directory, logicalRowCount: 10_000_000, ...(authorize ? { authorize } : {}) }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); if (!address || typeof address === "string") throw new Error("HTTP bind failed"); base = `http://127.0.0.1:${address.port}`;
}
async function stop() { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
beforeEach(async () => { directory = mkdtempSync(join(tmpdir(), "rowick-persistent-http-")); await start(); });
afterEach(async () => { await stop(); rmSync(directory, { recursive: true, force: true }); });
const post = (route: string, body: unknown, session = "test", extra = "", headers: Record<string, string> = {}) => fetch(`${base}/__rowick/datasource/${route}?session=${session}${extra}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
describe("persistent datasource HTTP integration", () => {
  it("reads logical pages, retains accepted rows on failure and recovers by retry", async () => {
    const example = createDatasourceExample({ baseUrl: base, session: "read-recovery" });
    try { await example.start(); expect(example.source.getState()).toMatchObject({ total: { kind: "exact", count: 10_000_000 }, cachedRowCount: 20 });
      await example.failNextRead(); expect(example.source.getState()).toMatchObject({ status: "error", rows: expect.any(Array) }); expect(example.source.getState().rows).toHaveLength(20);
      await example.source.retry(); expect(example.source.getState().status).toBe("ready");
    } finally { example.dispose(); }
  });
  it("cancels and fences a delayed HTTP response when a new query starts", async () => {
    const example = createDatasourceExample({ baseUrl: base, session: "abort-recovery" });
    try { await example.start(); const old = example.slowNextRead(); await example.small(); await old;
      expect(example.source.getState()).toMatchObject({ query: { limitToFirst: 40 }, total: { kind: "exact", count: 40 }, cachedRowCount: 20 });
    } finally { example.dispose(); }
  });
  it("retries a lost committed bulk response after HTTP server restart without repeating the write", async () => {
    const example = createDatasourceExample({ baseUrl: base, session: "restart" });
    try { await example.small(); example.source.selectAllMatching(); example.source.setRowSelected("record:1", false);
      const request = example.source.captureSelection({ operationId: "durable-operation", maxRows: 1000 });
      expect((await post("bulk", { selection: request, action: "close" }, "restart", "&lose=1")).status).toBe(503);
      const health = await (await fetch(`${base}/__rowick/datasource/health?session=restart`)).json(); expect(health.revision).toBe(2);
      await stop(); await start();
      // Retry the identical request against a newly created handler/store.
      const retry = await post("bulk", { selection: request, action: "close" }, "restart"); expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual({ matchedCount: 39, affectedCount: 23, deniedCount: 4, revision: 2 });
      expect((await (await fetch(`${base}/__rowick/datasource/health?session=restart`)).json()).revision).toBe(2);
      const initial = createDatasourceExample({ baseUrl: base, session: "restart" });
      try { await initial.small(); expect(initial.source.getState().revision).toBe(2); } finally { initial.dispose(); }
      expect((await post("export", { selection: request }, "restart")).status).toBe(200);
    } finally { example.dispose(); }
  });
  it("uses the same scoped snapshot for export and bulk, respects permissions, and isolates sessions", async () => {
    const example = createDatasourceExample({ baseUrl: base, session: "selection" });
    try { await example.small(); example.source.selectAllMatching(); example.source.setRowSelected("record:1", false);
      await example.actions.run("export"); expect(example.getExported()).toHaveLength(39);
      const result = await example.actions.run("bulk"); expect(result.result?.message).toBe("39 matching; 23 changed; 4 denied");
      const other = createDatasourceExample({ baseUrl: base, session: "other" }); try { await other.small(); expect(other.source.getState().rows.find((row) => row.id === "record:2")?.status).toBe("open"); } finally { other.dispose(); }
    } finally { example.dispose(); }
  });
  it("resynchronizes a genuine three-revision gap and live add/delete changes", async () => {
    const example = createDatasourceExample({ baseUrl: base, session: "live" });
    try { await example.start(); await example.invalidateGap(); expect(example.source.getState()).toMatchObject({ needsRefresh: true, revision: 4 });
      await example.source.refresh(); expect(example.source.getState().status).toBe("ready"); expect(example.source.getState().rows.find((row) => row.id === "record:1")?.value).toBe(4);
      await example.add(); expect(example.source.getState().total).toEqual({ kind: "exact", count: 10_000_001 });
      await example.remove(); expect(example.source.getState().total).toEqual({ kind: "exact", count: 10_000_000 }); expect(example.source.getState().rows.some((row) => row.id === "record:1")).toBe(false);
    } finally { example.dispose(); }
  });
  it("validates query/identity/row limits and read/write authorization on the server", async () => {
    const query = { status: "all", mode: "records" }, read = { query, queryKey: captureDataQuery(query).key, queryId: "query", block: { mode: "offset", offset: 0, limit: 20 } };
    expect((await post("read", { ...read, queryKey: "forged" })).status).toBe(409);
    expect((await post("read", { ...read, block: { ...read.block, limit: 201 } })).status).toBe(400);
    expect((await post("read", read, "../escape")).status).toBe(400);
    expect((await post("read", read, "origin", "", { origin: "https://untrusted.example" })).status).toBe(403);
    await stop(); await start(() => ({ canRead: true, canWrite: false }));
    expect((await post("mutate", { queryId: "query", mutation: { type: "delete", id: "record:1", expectedRevision: 1 } })).status).toBe(403);
    expect((await post("read", read)).status).toBe(200);
  });
});
