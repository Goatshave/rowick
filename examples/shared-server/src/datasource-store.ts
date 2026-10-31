import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { dirname } from "node:path";
import { compileFilterExpression, validateFilterExpression, type FilterColumnPolicy, type FilterExpression } from "@rowick/core";
import { captureDataQuery, validateDataBlockRequest, type DataBlockRequest, type DataLiveEvent, type DataResponse, type DataSelectionSnapshot } from "@rowick/data/server-data";

export interface PersistentDataRow { id: string; name: string; value: number; status: "open" | "closed"; revision: number; kind: "record" | "group"; parentId?: string; }
export interface PersistentDataQuery { status: "all" | "open" | "closed"; mode: "records" | "groups"; unknownTotal?: boolean; limitToFirst?: number; expression?: FilterExpression | null; }
export interface PersistentOperationResult { matchedCount: number; affectedCount: number; deniedCount: number; revision: number; }
interface LedgerEntry { signature: string; result: PersistentOperationResult; }
interface DiskState { version: 1; logicalRowCount: number; revision: number; secret: string; overrides: Array<[string, PersistentDataRow]>; deleted: string[]; operations: Array<[string, LedgerEntry]>; }
export class DataServiceError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export const persistentDataPolicies: readonly FilterColumnPolicy[] = [
  { id: "id", type: "text" }, { id: "name", type: "text" }, { id: "value", type: "number" }, { id: "status", type: "text" }, { id: "revision", type: "number" },
];
function plain(value: unknown): asserts value is Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new DataServiceError(400, "Invalid data request"); }
export function validatePersistentDataQuery(input: unknown): PersistentDataQuery {
  plain(input);
  if (!['all', 'open', 'closed'].includes(String(input.status)) || !['records', 'groups'].includes(String(input.mode)) ||
    Object.keys(input).some((key) => !["status", "mode", "unknownTotal", "limitToFirst", "expression"].includes(key)) ||
    input.unknownTotal !== undefined && typeof input.unknownTotal !== "boolean" || input.limitToFirst !== undefined &&
    (!Number.isSafeInteger(input.limitToFirst) || Number(input.limitToFirst) < 1 || Number(input.limitToFirst) > 10_000)) throw new DataServiceError(400, "Invalid data query");
  return Object.freeze({ status: input.status as PersistentDataQuery["status"], mode: input.mode as PersistentDataQuery["mode"],
    ...(input.unknownTotal !== undefined ? { unknownTotal: input.unknownTotal } : {}), ...(input.limitToFirst !== undefined ? { limitToFirst: input.limitToFirst as number } : {}),
    ...(input.expression !== undefined ? { expression: input.expression === null ? null : validateFilterExpression(input.expression, persistentDataPolicies) } : {}) });
}

/** A bounded, atomic-file local fixture, not a multi-process database or production authentication layer. */
export function createPersistentDataStore(options: { filePath: string; logicalRowCount?: number; maxOverrides?: number; maxOperations?: number; canMutate?: (row: PersistentDataRow) => boolean }) {
  const logicalCount = options.logicalRowCount ?? 10_000_000, maxOverrides = options.maxOverrides ?? 10_000, maxOperations = options.maxOperations ?? 512;
  if (!Number.isSafeInteger(logicalCount) || logicalCount < 1 || logicalCount > 100_000_000 || !Number.isSafeInteger(maxOverrides) || maxOverrides < 1 || !Number.isSafeInteger(maxOperations) || maxOperations < 1) throw new TypeError("Invalid persistent datasource limits");
  let revision = 1, secret = randomBytes(32).toString("hex"), overrides = new Map<string, PersistentDataRow>(), deleted = new Set<string>(), operations = new Map<string, LedgerEntry>();
  const persist = () => {
    const serialized = JSON.stringify({ version: 1, logicalRowCount: logicalCount, revision, secret, overrides: [...overrides], deleted: [...deleted], operations: [...operations] } satisfies DiskState);
    if (Buffer.byteLength(serialized) > 10_000_000) throw new DataServiceError(503, "Persistent demo file capacity reached");
    mkdirSync(dirname(options.filePath), { recursive: true });
    const temporary = `${options.filePath}.${randomUUID()}.tmp`, handle = openSync(temporary, "wx", 0o600);
    try { writeFileSync(handle, serialized); fsyncSync(handle); }
    finally { closeSync(handle); }
    renameSync(temporary, options.filePath);
  };
  if (existsSync(options.filePath)) {
    if (statSync(options.filePath).size > 10_000_000) throw new DataServiceError(503, "Persistent demo file exceeds its bound");
    const disk = JSON.parse(readFileSync(options.filePath, "utf8")) as DiskState;
    if (disk.version !== 1 || disk.logicalRowCount !== logicalCount || !Number.isSafeInteger(disk.revision) || disk.revision < 1 || typeof disk.secret !== "string" || !/^[a-f\d]{64}$/.test(disk.secret) ||
      !Array.isArray(disk.overrides) || disk.overrides.length > maxOverrides || !Array.isArray(disk.deleted) || disk.deleted.length > maxOverrides || !Array.isArray(disk.operations) || disk.operations.length > maxOperations) throw new DataServiceError(503, "Invalid persistent demo file; preserve it for recovery");
    const validRow = (value: unknown): value is PersistentDataRow => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const row = value as PersistentDataRow;
      return typeof row.id === "string" && /^(record:\d+(?::child:[0-2])?|added:[\w-]+)$/.test(row.id) && row.id.length <= 128 && typeof row.name === "string" && row.name.length > 0 && row.name.length <= 100 &&
        Number.isFinite(row.value) && ["open", "closed"].includes(row.status) && Number.isSafeInteger(row.revision) && row.revision > 0 && row.kind === "record" &&
        (row.parentId === undefined || typeof row.parentId === "string" && row.id.startsWith(`${row.parentId}:child:`));
    };
    if (disk.overrides.some((entry) => !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !validRow(entry[1]) || entry[0] !== entry[1].id) ||
      new Set(disk.overrides.map(([rowId]) => rowId)).size !== disk.overrides.length || disk.deleted.some((rowId) => typeof rowId !== "string" || !/^(record:\d+(?::child:[0-2])?|added:[\w-]+)$/.test(rowId)) ||
      disk.operations.some((entry) => !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !entry[1] || typeof entry[1].signature !== "string" ||
        !entry[1].result || ![entry[1].result.matchedCount, entry[1].result.affectedCount, entry[1].result.deniedCount, entry[1].result.revision].every((number) => Number.isSafeInteger(number) && number >= 0) ||
        entry[1].result.revision > disk.revision)) throw new DataServiceError(503, "Invalid persistent demo entries; preserve them for recovery");
    revision = disk.revision; secret = disk.secret; overrides = new Map(disk.overrides.map(([rowId, row]) => [rowId, Object.freeze({ ...row })])); deleted = new Set(disk.deleted);
    operations = new Map(disk.operations.map(([key, entry]) => [key, { signature: entry.signature, result: Object.freeze({ ...entry.result }) }]));
  } else persist();
  const baseIndex = (id: string) => /^record:(0|[1-9]\d*)$/.test(id) ? Number(id.slice(7)) : null;
  const base = (index: number, parentId?: string, childIndex?: number): PersistentDataRow => Object.freeze({ id: parentId ? `${parentId}:child:${childIndex}` : `record:${index}`, name: parentId ? `Child ${childIndex} of ${parentId}` : `Record ${index}`,
    value: index % 1000, status: index % 3 === 0 ? "closed" : "open", revision: 1, kind: "record", ...(parentId ? { parentId } : {}) });
  const get = (rowId: string): PersistentDataRow | undefined => {
    if (deleted.has(rowId)) return undefined;
    const parent = /^(record:\d+):child:\d+$/.exec(rowId); if (parent && deleted.has(parent[1]!)) return undefined;
    const stored = overrides.get(rowId); if (stored) return stored;
    const index = baseIndex(rowId); if (index !== null) return index < logicalCount ? base(index) : undefined;
    const child = /^record:(0|[1-9]\d*):child:([0-2])$/.exec(rowId);
    return child && Number(child[1]) < logicalCount && !deleted.has(`record:${child[1]}`) ? base(Number(child[1]) + Number(child[2]), `record:${child[1]}`, Number(child[2])) : undefined;
  };
  const effective = (query: PersistentDataQuery, request: DataBlockRequest): PersistentDataQuery => request.scope?.kind === "group" ? { ...query, mode: "records", status: request.scope.parentId === "group:open" ? "open" : request.scope.parentId === "group:closed" ? "closed" : (() => { throw new DataServiceError(400, "Unknown demo group"); })() } : query;
  const member = (query: PersistentDataQuery, row: PersistentDataRow) => (query.status === "all" || row.status === query.status) &&
    (query.limitToFirst === undefined || (baseIndex(row.id) !== null && baseIndex(row.id)! < query.limitToFirst));
  const prefix = (last: number, query: PersistentDataQuery) => {
    const count = Math.max(0, Math.min(logicalCount, query.limitToFirst ?? logicalCount, last + 1));
    let matching = query.status === "all" ? count : query.status === "closed" ? Math.ceil(count / 3) : count - Math.ceil(count / 3);
    for (const rowId of deleted) { const index = baseIndex(rowId); if (index !== null && index < count && member(query, base(index))) matching--; }
    for (const [rowId, row] of overrides) {
      const index = baseIndex(rowId); if (index !== null && index < count && !deleted.has(rowId)) matching += Number(member(query, row)) - Number(member(query, base(index)));
    }
    return matching;
  };
  const extras = (query: PersistentDataQuery) => [...overrides.values()].filter((row) => row.id.startsWith("added:") && !deleted.has(row.id) && member(query, row));
  const knownTotal = (query: PersistentDataQuery) => prefix(logicalCount - 1, query) + extras(query).length;
  const cursorFor = (offset: number, fingerprint: string, history: readonly number[] = []) => {
    const payload = Buffer.from(JSON.stringify({ offset, revision, fingerprint, history })).toString("base64url"), signature = createHmac("sha256", secret).update(payload).digest("base64url"); return `${payload}.${signature}`;
  };
  const cursorOffset = (cursor: string, fingerprint: string) => {
    if (cursor.length > 4_000) throw new DataServiceError(400, "Invalid cursor");
    const [payload = "", signature = ""] = cursor.split("."), expected = createHmac("sha256", secret).update(payload).digest();
    const actual = Buffer.from(signature, "base64url"); if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new DataServiceError(400, "Invalid cursor signature");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { offset: number; revision: number; fingerprint: string; history: number[] };
    if (!Number.isSafeInteger(decoded.offset) || decoded.offset < 0 || decoded.fingerprint !== fingerprint || !Array.isArray(decoded.history) || decoded.history.length > 32 || decoded.history.some((offset) => !Number.isSafeInteger(offset) || offset < 0)) throw new DataServiceError(400, "Cursor belongs to another query");
    if (decoded.revision !== revision) throw new DataServiceError(409, "Cursor expired after a revision change; refresh from the first block");
    return decoded;
  };
  const read = (input: { query: unknown; queryId: string; queryKey: string; block: DataBlockRequest }): DataResponse<PersistentDataRow> & { rowOffset?: number } => {
    const query = validatePersistentDataQuery(input.query);
    if (captureDataQuery(query).key !== input.queryKey || typeof input.queryId !== "string" || !input.queryId.length || input.queryId.length > 1_000) throw new DataServiceError(409, "Query identity mismatch");
    const request = validateDataBlockRequest(input.block, 200);
    const scopedQuery = effective(query, request), fingerprint = createHmac("sha256", secret).update(JSON.stringify([input.queryKey, request.scope ?? null])).digest("hex");
    const cursor = request.mode === "cursor" && request.cursor !== null ? cursorOffset(request.cursor, fingerprint) : { offset: 0, history: [] as number[] };
    const position = request.mode === "cursor" ? cursor.offset : request.mode === "page" ? request.pageIndex * request.limit : request.offset;
    if (!Number.isSafeInteger(position) || position < 0) throw new DataServiceError(400, "Invalid data position");
    const edges = (count: number, length: number) => request.mode === "cursor" ? {
      ...(position + length < count ? { nextCursor: cursorFor(position + length, fingerprint) } : {}),
      ...(position > 0 ? { previousCursor: position <= request.limit ? null : cursorFor(position - request.limit, fingerprint) } : {}),
    } : {};
    if (request.scope?.kind === "tree") {
      const parent = get(request.scope.parentId); if (!parent || parent.parentId || parent.kind !== "record") throw new DataServiceError(404, "Tree parent is unavailable");
      const matcher = query.expression ? compileFilterExpression(query.expression, persistentDataPolicies) : () => true;
      const children = [0, 1, 2].map((index) => get(`${parent.id}:child:${index}`)).filter((row): row is PersistentDataRow => Boolean(row && (query.status === "all" || row.status === query.status) && matcher((column) => row[column as keyof PersistentDataRow])));
      const rows = children.slice(position, position + request.limit); return { queryId: input.queryId, rows, total: { kind: "exact", count: children.length }, revision, hasNext: position + rows.length < children.length, rowOffset: position, ...edges(children.length, rows.length) };
    }
    if (query.mode === "groups" && !request.scope) {
      const groupCount = (status: "open" | "closed") => {
        if (!query.expression?.root) return knownTotal({ ...query, status });
        const upper = Math.min(logicalCount, query.limitToFirst ?? logicalCount); if (upper > 100_000) throw new DataServiceError(422, "Run large filtered grouping in an indexed server query");
        const matcher = compileFilterExpression(query.expression, persistentDataPolicies); let count = 0;
        for (let index = 0; index < upper; index++) { const row = get(`record:${index}`); if (row && row.status === status && matcher((column) => row[column as keyof PersistentDataRow])) count++; }
        for (const row of extras(query)) if (row.status === status && matcher((column) => row[column as keyof PersistentDataRow])) count++;
        return count;
      };
      const groups: PersistentDataRow[] = (["open", "closed"] as const).filter((status) => query.status === "all" || query.status === status).map((status) => ({ id: `group:${status}`, name: status === "open" ? "Open records" : "Closed records", status, value: groupCount(status), revision, kind: "group" }));
      const rows = groups.slice(position, position + request.limit);
      return { queryId: input.queryId, rows, total: { kind: "exact", count: groups.length }, revision, hasNext: position + rows.length < groups.length, rowOffset: position, ...edges(groups.length, rows.length) };
    }
    const expression = scopedQuery.expression, hasExpression = expression != null && expression.root !== null;
    const matcher = hasExpression ? compileFilterExpression(expression, persistentDataPolicies) : undefined;
    const matches = (row: PersistentDataRow) => member(scopedQuery, row) && (!matcher || matcher((column) => row[column as keyof PersistentDataRow]));
    let rows: PersistentDataRow[] = [], hasNext = false, nextPosition = position, rowOffset: number | undefined;
    if (!hasExpression) {
      const count = knownTotal(scopedQuery), baseCount = prefix(logicalCount - 1, scopedQuery);
      if (position < baseCount) {
        let low = 0, high = Math.min(logicalCount, scopedQuery.limitToFirst ?? logicalCount) - 1;
        while (low < high) { const middle = Math.floor((low + high) / 2); if (prefix(middle, scopedQuery) > position) high = middle; else low = middle + 1; }
        for (let index = low; index < Math.min(logicalCount, scopedQuery.limitToFirst ?? logicalCount) && rows.length < request.limit; index++) { const row = get(`record:${index}`); if (row && matches(row)) rows.push(row); }
      }
      if (rows.length < request.limit) rows.push(...extras(scopedQuery).slice(Math.max(0, position - baseCount), Math.max(0, position - baseCount) + request.limit - rows.length));
      hasNext = position + rows.length < count; nextPosition = position + rows.length; rowOffset = position;
    } else {
      // A real backend should push this predicate into an indexed query. This
      // fixture bounds scanning and exposes cursor windows without inventing rank.
      if (request.mode !== "cursor" && position > 10_000) throw new DataServiceError(422, "Use a cursor for an expensive filtered offset");
      const upper = Math.min(logicalCount, scopedQuery.limitToFirst ?? logicalCount), scanStart = request.mode === "cursor" ? position : 0;
      let skipped = 0, scanned = 0, index = scanStart;
      for (; index < upper && rows.length < request.limit && scanned < 50_000; index++, scanned++) {
        const row = get(`record:${index}`); if (row && matches(row)) { if (request.mode !== "cursor" && skipped++ < position) continue; rows.push(row); }
      }
      if (request.mode !== "cursor" && scanned >= 50_000 && rows.length < request.limit) throw new DataServiceError(422, "Use a cursor to continue a filtered scan");
      hasNext = index < upper; nextPosition = index;
    }
    const count = hasExpression || scopedQuery.unknownTotal ? { kind: "unknown" as const } : { kind: "exact" as const, count: knownTotal(scopedQuery) };
    return { queryId: input.queryId, rows, total: count, revision, hasNext, ...(rowOffset !== undefined ? { rowOffset } : {}),
      ...(request.mode === "cursor" && hasNext ? { nextCursor: cursorFor(nextPosition, fingerprint, hasExpression ? [...cursor.history, position].slice(-32) : []) } : {}),
      ...(request.mode === "cursor" && position > 0 && (!hasExpression || cursor.history.length) ? { previousCursor: hasExpression ? cursor.history.at(-1) === 0 ? null : cursorFor(cursor.history.at(-1)!, fingerprint, cursor.history.slice(0, -1)) : position <= request.limit ? null : cursorFor(position - request.limit, fingerprint) } : {}),
      aggregates: { logicalRows: hasExpression || scopedQuery.unknownTotal ? null : knownTotal(scopedQuery) } };
  };
  const apply = (changes: readonly PersistentDataRow[], removes: readonly string[] = []) => {
    if (!Number.isSafeInteger(revision + 1)) throw new DataServiceError(503, "Revision capacity reached");
    if (new Set([...overrides.keys(), ...deleted, ...changes.map((row) => row.id), ...removes]).size > maxOverrides) throw new DataServiceError(503, "Demo override capacity reached");
    const previous = { revision, overrides: new Map(overrides), deleted: new Set(deleted), operations: new Map(operations) };
    try { for (const row of changes) { overrides.set(row.id, Object.freeze({ ...row })); deleted.delete(row.id); } for (const rowId of removes) { overrides.delete(rowId); deleted.add(rowId); }
      revision++; persist();
    } catch (error) { revision = previous.revision; overrides = previous.overrides; deleted = previous.deleted; operations = previous.operations; throw error; }
  };
  const canMutate = options.canMutate ?? ((row: PersistentDataRow) => (baseIndex(row.id) ?? 1) % 13 !== 0);
  const bulk = (snapshot: DataSelectionSnapshot<PersistentDataQuery>, action: "close"): PersistentOperationResult => {
    plain(snapshot); plain(snapshot.selection);
    const query = validatePersistentDataQuery(snapshot.selection.query), queryKey = captureDataQuery(query).key;
    if (snapshot.version !== 1 || snapshot.evaluation !== "live-query" || snapshot.selection.queryKey !== queryKey || action !== "close" || query.mode !== "records" ||
      typeof snapshot.operationId !== "string" || !/^[\w:-]{1,128}$/.test(snapshot.operationId) || !Number.isSafeInteger(snapshot.maxRows) || snapshot.maxRows < 1 || snapshot.maxRows > 1_000 ||
      !["explicit", "all-matching"].includes(snapshot.selection.mode)) throw new DataServiceError(400, "Invalid bulk selection");
    const members = snapshot.selection.mode === "explicit" ? snapshot.selection.ids : snapshot.selection.excludedIds;
    if (!Array.isArray(members) || members.length > 5_000 || members.some((rowId) => typeof rowId !== "string" || !rowId.length || rowId.length > 1_000)) throw new DataServiceError(400, "Invalid bulk IDs");
    const signature = JSON.stringify([action, snapshot.queryId, queryKey, snapshot.selection.mode, [...new Set(members)].sort(), snapshot.maxRows]);
    const previous = operations.get(snapshot.operationId); if (previous) { if (previous.signature !== signature) throw new DataServiceError(409, "Operation ID already belongs to different input"); return previous.result; }
    if (operations.size >= maxOperations) throw new DataServiceError(503, "Idempotency ledger capacity reached; no entry is silently evicted");
    const matcher = query.expression ? compileFilterExpression(query.expression, persistentDataPolicies) : () => true;
    const matches = (row: PersistentDataRow) => member(query, row) && matcher((column) => row[column as keyof PersistentDataRow]);
    let selected: PersistentDataRow[];
    if (snapshot.selection.mode === "explicit") selected = [...new Set(members)].map(get).filter((row): row is PersistentDataRow => Boolean(row && matches(row)));
    else {
      if (!query.expression && knownTotal(query) - members.length > snapshot.maxRows) throw new DataServiceError(413, "Selection exceeds operation row limit");
      const excluded = new Set(members); selected = [];
      // This fixture refuses a scan above 100k; production all-query operations
      // belong in a bounded server job/indexed database, never a browser loop.
      const upper = Math.min(logicalCount, query.limitToFirst ?? logicalCount); if (upper > 100_000 && query.expression) throw new DataServiceError(422, "Run large filtered bulk work in a server job");
      for (let index = 0; index < upper && selected.length <= snapshot.maxRows; index++) { const row = get(`record:${index}`); if (row && !excluded.has(row.id) && matches(row)) selected.push(row); }
      for (const row of extras(query)) if (!excluded.has(row.id) && matches(row)) selected.push(row);
    }
    if (selected.length > snapshot.maxRows) throw new DataServiceError(413, "Selection exceeds operation row limit");
    const permitted = selected.filter(canMutate), changed = permitted.filter((row) => row.status !== "closed").map((row) => ({ ...row, status: "closed" as const, revision: row.revision + 1 }));
    const result = Object.freeze({ matchedCount: selected.length, affectedCount: changed.length, deniedCount: selected.length - permitted.length, revision: revision + 1 });
    const ledgerBefore = new Map(operations); operations.set(snapshot.operationId, { signature, result });
    try { apply(changed); } catch (error) { operations = ledgerBefore; throw error; }
    return Object.freeze(result);
  };
  return {
    read, get, bulk, getRevision: () => revision, getLogicalRowCount: () => logicalCount,
    mutate: (queryId: string, mutation: { type: "update" | "delete"; id: string; expectedRevision: number; value?: number; name?: string } | { type: "add"; name: string; value: number }): DataLiveEvent<PersistentDataRow> => {
      if (mutation.type === "add") {
        if (typeof mutation.name !== "string" || mutation.name.length < 1 || mutation.name.length > 100 || !Number.isFinite(mutation.value)) throw new DataServiceError(422, "Invalid added row");
        const row: PersistentDataRow = { id: `added:${randomUUID()}`, name: mutation.name, value: mutation.value, status: "open", revision: 1, kind: "record" }; apply([row]);
        return { type: "add", queryId, revision, row };
      }
      const row = get(mutation.id); if (!row) throw new DataServiceError(404, "Record was deleted");
      if (!canMutate(row)) throw new DataServiceError(403, "Record is read-only");
      if (!Number.isSafeInteger(mutation.expectedRevision) || mutation.expectedRevision !== row.revision) throw new DataServiceError(409, "Revision conflict; reload before writing");
      if (mutation.type === "delete") { apply([], [mutation.id]); return { type: "delete", queryId, revision, id: mutation.id }; }
      if (mutation.type !== "update" || mutation.value !== undefined && !Number.isFinite(mutation.value) || mutation.name !== undefined && (typeof mutation.name !== "string" || mutation.name.length < 1 || mutation.name.length > 100)) throw new DataServiceError(422, "Invalid update");
      const next = { ...row, ...(mutation.value !== undefined ? { value: mutation.value } : {}), ...(mutation.name !== undefined ? { name: mutation.name } : {}), revision: row.revision + 1 }; apply([next]);
      return { type: "update", impact: "query", queryId, revision, row: next };
    },
    export: (snapshot: DataSelectionSnapshot<PersistentDataQuery>): readonly PersistentDataRow[] => {
      // The same validator/selection semantics are used without performing a write.
      const query = validatePersistentDataQuery(snapshot.selection.query);
      if (snapshot.version !== 1 || snapshot.evaluation !== "live-query" || snapshot.selection.queryKey !== captureDataQuery(query).key || query.mode !== "records" || !Number.isSafeInteger(snapshot.maxRows) || snapshot.maxRows < 1 || snapshot.maxRows > 1_000) throw new DataServiceError(400, "Invalid export selection");
      const ids = snapshot.selection.mode === "explicit" ? snapshot.selection.ids : snapshot.selection.excludedIds;
      if (!Array.isArray(ids) || ids.length > 5_000 || ids.some((id) => typeof id !== "string" || !id)) throw new DataServiceError(400, "Invalid export IDs");
      const matcher = query.expression ? compileFilterExpression(query.expression, persistentDataPolicies) : () => true;
      const matches = (row: PersistentDataRow) => member(query, row) && matcher((column) => row[column as keyof PersistentDataRow]);
      if (snapshot.selection.mode === "explicit") { const selected = [...new Set(ids)].map(get).filter((row): row is PersistentDataRow => Boolean(row && matches(row))); if (selected.length > snapshot.maxRows) throw new DataServiceError(413, "Selection exceeds operation row limit"); return selected; }
      if (snapshot.selection.mode !== "all-matching") throw new DataServiceError(400, "Invalid selection mode");
      if (!query.expression && knownTotal(query) - ids.length > snapshot.maxRows) throw new DataServiceError(413, "Selection exceeds operation row limit");
      const upper = Math.min(logicalCount, query.limitToFirst ?? logicalCount); if (upper > 100_000 && query.expression) throw new DataServiceError(422, "Run large filtered exports in a server job");
      const excluded = new Set(ids), selected: PersistentDataRow[] = [];
      for (let index = 0; index < upper && selected.length <= snapshot.maxRows; index++) { const row = get(`record:${index}`); if (row && !excluded.has(row.id) && matches(row)) selected.push(row); }
      for (const row of extras(query)) if (!excluded.has(row.id) && matches(row)) selected.push(row);
      if (selected.length > snapshot.maxRows) throw new DataServiceError(413, "Selection exceeds operation row limit"); return selected;
    },
  };
}
