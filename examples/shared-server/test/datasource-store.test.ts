import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { captureDataQuery, type DataBlockRequest, type DataSelectionSnapshot } from "@rowick/data/server-data";
import { compileFilterExpression } from "@rowick/core";
import { createPersistentDataStore, persistentDataPolicies, validatePersistentDataQuery, type PersistentDataQuery } from "../src/datasource-store";
const cleanup: Array<() => void> = []; afterEach(() => { for (const stop of cleanup.splice(0)) stop(); });
const query: PersistentDataQuery = { status: "all", mode: "records" };
function fixture(options: { logicalRowCount?: number; maxOperations?: number; maxOverrides?: number } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "rowick-datasource-store-")); cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const filePath = join(directory, "data.json"), store = createPersistentDataStore({ filePath, ...options }); return { directory, filePath, store };
}
function input(nextQuery: PersistentDataQuery = query, block: DataBlockRequest = { mode: "offset", offset: 0, limit: 20 }) {
  return { query: nextQuery, queryKey: captureDataQuery(nextQuery).key, queryId: "query-1", block };
}
function selection(nextQuery: PersistentDataQuery = query, options: { ids?: string[]; excludedIds?: string[]; operationId?: string; maxRows?: number } = {}): DataSelectionSnapshot<PersistentDataQuery> {
  const common = { query: nextQuery, queryKey: captureDataQuery(nextQuery).key };
  return { version: 1, queryId: "query-1", observedRevision: 1, evaluation: "live-query", operationId: options.operationId ?? "bulk-1", maxRows: options.maxRows ?? 1000,
    selection: options.ids ? { ...common, mode: "explicit", ids: options.ids } : { ...common, mode: "all-matching", excludedIds: options.excludedIds ?? [] } };
}
describe("persistent remote fixture", () => {
  it("addresses ten million logical rows and the last page without materializing the dataset", () => {
    const { store, filePath } = fixture(), first = store.read(input()), last = store.read(input(query, { mode: "page", pageIndex: 499999, limit: 20 }));
    expect(first.rows).toHaveLength(20); expect(first.total).toEqual({ kind: "exact", count: 10_000_000 });
    expect(last.rows[0]?.id).toBe("record:9999980"); expect(last.rows.at(-1)?.id).toBe("record:9999999"); expect(last.hasNext).toBe(false);
    expect(readFileSync(filePath).length).toBeLessThan(300);
  });
  it("keeps page, arbitrary offset and cursor reads consistent, including unknown totals", () => {
    const { store } = fixture({ logicalRowCount: 100 }); const initial = store.read(input({ ...query, unknownTotal: true }, { mode: "cursor", cursor: null, limit: 2 }));
    expect(initial.total).toEqual({ kind: "unknown" }); const next = store.read(input({ ...query, unknownTotal: true }, { mode: "cursor", cursor: initial.nextCursor!, limit: 2 }));
    expect(next.rows.map((row) => row.id)).toEqual(store.read(input(query, { mode: "offset", offset: 2, limit: 2 })).rows.map((row) => row.id)); expect(next.rowOffset).toBe(2); expect(next.previousCursor).toBeNull();
    expect(store.read(input(query, { mode: "offset", offset: 3, limit: 2 })).rowOffset).toBe(3);
  });
  it("rejects tampered, expired or different-query cursors", () => {
    const { store } = fixture({ logicalRowCount: 30 }), cursor = store.read(input(query, { mode: "cursor", cursor: null, limit: 2 })).nextCursor!;
    expect(() => store.read(input(query, { mode: "cursor", cursor: cursor + "tamper", limit: 2 }))).toThrow(/signature/);
    expect(() => store.read(input({ ...query, status: "open" }, { mode: "cursor", cursor, limit: 2 }))).toThrow(/another query/);
    store.mutate("query-1", { type: "update", id: "record:1", expectedRevision: 1, value: 99 });
    expect(() => store.read(input(query, { mode: "cursor", cursor, limit: 2 }))).toThrow(/expired/);
  });
  it("loads group/tree children and evaluates the same advanced predicate on the server", () => {
    const { store } = fixture({ logicalRowCount: 30 }), grouped = store.read(input({ ...query, mode: "groups" }));
    expect(grouped.rows.map((row) => [row.id, row.value])).toEqual([["group:open", 20], ["group:closed", 10]]);
    const children = store.read(input(query, { mode: "offset", offset: 0, limit: 5, scope: { kind: "group", parentId: "group:open", path: ["open"] } }));
    expect(children.rows.every((row) => row.status === "open")).toBe(true); expect(children.total).toEqual({ kind: "exact", count: 20 });
    const tree = store.read(input(query, { mode: "offset", offset: 0, limit: 5, scope: { kind: "tree", parentId: "record:1" } })); expect(tree.rows).toHaveLength(3);
    const expression = { version: 1 as const, root: { kind: "group" as const, operator: "and" as const, children: [
      { kind: "condition" as const, columnId: "value", operator: "gte" as const, value: 5 },
      { kind: "condition" as const, columnId: "status", operator: "eq" as const, value: "open" },
    ] } };
    const predicate = compileFilterExpression(expression, persistentDataPolicies), matching = store.read(input({ ...query, expression }, { mode: "cursor", cursor: null, limit: 20 }));
    expect(matching.rows.map((row) => row.id)).toEqual(store.read(input()).rows.concat(store.read(input(query, { mode: "offset", offset: 20, limit: 20 })).rows).filter((row) => predicate((column) => row[column as keyof typeof row])).map((row) => row.id));
    expect(matching).not.toHaveProperty("rowOffset");
  });
  it("retains bounded previous cursor history for filtered windows", () => {
    const { store } = fixture({ logicalRowCount: 100 }); const filtered: PersistentDataQuery = { ...query, expression: { version: 1, root: { kind: "condition", columnId: "value", operator: "gte", value: 5 } } };
    const first = store.read(input(filtered, { mode: "cursor", cursor: null, limit: 2 })), second = store.read(input(filtered, { mode: "cursor", cursor: first.nextCursor!, limit: 2 }));
    expect(second.previousCursor).toBeNull(); expect(store.read(input(filtered, { mode: "cursor", cursor: second.previousCursor!, limit: 2 })).rows).toEqual(first.rows);
  });
  it("persists accepted revisions and an idempotency ledger across a new store instance", () => {
    const { store, filePath } = fixture({ logicalRowCount: 40 }); store.mutate("query-1", { type: "update", id: "record:1", expectedRevision: 1, name: "Persisted" });
    const request = selection({ ...query, limitToFirst: 40 }, { excludedIds: ["record:2"] }), first = store.bulk(request, "close"), restart = createPersistentDataStore({ filePath, logicalRowCount: 40 });
    expect(restart.get("record:1")?.name).toBe("Persisted"); expect(restart.bulk(request, "close")).toEqual(first); expect(restart.getRevision()).toBe(first.revision);
    expect(() => restart.bulk({ ...request, maxRows: 999 }, "close")).toThrow(/different input/);
  });
  it("recovers the same accepted data and idempotency result in a fresh OS process", async () => {
    const { directory, filePath } = fixture({ logicalRowCount: 40 }), bundled = join(directory, "standalone-store.mjs");
    const require = createRequire(import.meta.resolve("tsup")), esbuild = require("esbuild") as { build: (options: Record<string, unknown>) => Promise<unknown> };
    await esbuild.build({ entryPoints: [fileURLToPath(new URL("../src/datasource-store.ts", import.meta.url))], outfile: bundled,
      bundle: true, platform: "node", format: "esm", logLevel: "silent", tsconfig: fileURLToPath(new URL("../../../tsconfig.base.json", import.meta.url)) });
    const request = selection(query, { ids: ["record:1", "record:2"], operationId: "process-durable-operation" });
    const script = `const {createPersistentDataStore}=await import(${JSON.stringify(pathToFileURL(bundled).href)});
const store=createPersistentDataStore({filePath:process.argv[1],logicalRowCount:40});
if(process.argv[2]==="write")store.mutate("query-1",{type:"update",id:"record:1",expectedRevision:1,name:"Across processes"});
const result=store.bulk(JSON.parse(process.argv[3]),"close");
console.log(JSON.stringify({result,revision:store.getRevision(),row:store.get("record:1")}));`;
    const writer = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "--eval", script, filePath, "write", JSON.stringify(request)], { encoding: "utf8" }));
    const reader = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "--eval", script, filePath, "read", JSON.stringify(request)], { encoding: "utf8" }));
    expect(reader).toEqual(writer); expect(reader.row.name).toBe("Across processes"); expect(reader.revision).toBe(3);
  });
  it("re-evaluates live query membership and excludes deleted or out-of-query explicit IDs", () => {
    const { store } = fixture({ logicalRowCount: 40 }); store.mutate("query-1", { type: "delete", id: "record:1", expectedRevision: 1 });
    const request = selection({ ...query, status: "open" }, { ids: ["record:0", "record:1", "record:2", "missing"] });
    expect(store.export(request).map((row) => row.id)).toEqual(["record:2"]); expect(store.bulk(request, "close")).toMatchObject({ matchedCount: 1, affectedCount: 1, deniedCount: 0 });
    expect(store.export({ ...request, operationId: "new-export" })).toEqual([]);
  });
  it("applies per-row permissions and enforces row limits before any write", () => {
    const { store } = fixture({ logicalRowCount: 40 }); const request = selection({ ...query, limitToFirst: 40 }, { excludedIds: ["record:1"] });
    expect(store.export(request)).toHaveLength(39); const result = store.bulk(request, "close"); expect(result).toMatchObject({ matchedCount: 39, deniedCount: 4, affectedCount: 23 });
    expect(store.get("record:13")?.status).toBe("open");
    const large = fixture(); expect(() => large.store.bulk(selection(), "close")).toThrow(/row limit/); expect(large.store.getRevision()).toBe(1);
    expect(() => large.store.export(selection())).toThrow(/row limit/);
  });
  it("preserves old acknowledgements at ledger capacity instead of silently evicting them", () => {
    const { store } = fixture({ logicalRowCount: 10, maxOperations: 1 }); const first = selection(query, { ids: ["record:1"] }); const ack = store.bulk(first, "close");
    expect(() => store.bulk(selection(query, { ids: ["record:2"], operationId: "second" }), "close")).toThrow(/ledger capacity/); expect(store.bulk(first, "close")).toEqual(ack);
  });
  it("rejects stale writes and capacity exhaustion without corrupting accepted state", () => {
    const { store } = fixture({ logicalRowCount: 10, maxOverrides: 1 }); store.mutate("query-1", { type: "update", id: "record:1", expectedRevision: 1, value: 88 });
    expect(() => store.mutate("query-1", { type: "update", id: "record:1", expectedRevision: 1, value: 99 })).toThrow(/Revision conflict/);
    expect(() => store.mutate("query-1", { type: "delete", id: "record:2", expectedRevision: 1 })).toThrow(/capacity/); expect(store.get("record:2")).toBeDefined(); expect(store.getRevision()).toBe(2);
    expect(() => store.mutate("query-1", { type: "delete", id: "record:0", expectedRevision: 1 })).toThrow(/read-only/);
  });
  it("rejects unsupported queries and preserves malformed disk data for recovery", () => {
    expect(() => validatePersistentDataQuery({ ...query, expression: { version: 1, root: { kind: "condition", columnId: "private", operator: "eq", value: "secret" } } })).toThrow();
    const { store, filePath } = fixture({ logicalRowCount: 10 }); expect(() => store.read({ ...input(), queryKey: "forged" })).toThrow(/identity/);
    writeFileSync(filePath, '{"version":999}'); expect(() => createPersistentDataStore({ filePath, logicalRowCount: 10 })).toThrow(/preserve/); expect(readFileSync(filePath, "utf8")).toBe('{"version":999}');
  });
});
