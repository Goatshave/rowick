import { createAnalyticsExportJob, createDelimitedExporter, createServerAnalyticsExportRequest, type AnalyticsExportColumn, type AnalyticsExporter, type ServerAnalyticsExportRequest } from "./analytics-export";
import type { ServerSelection } from "@rowick/core";
export interface ServerAnalyticsExportHandlerOptions<TQuery, TData> {
  readonly columns: readonly AnalyticsExportColumn<TData>[];
  readonly validateQuery: (input: unknown) => TQuery;
  readonly getQueryKey: (query: Readonly<TQuery>) => string;
  readonly getRows: (query: Readonly<TQuery>, signal: AbortSignal, request: Request, selection: ServerSelection<TQuery> | null) => Iterable<TData> | AsyncIterable<TData> | Promise<Iterable<TData> | AsyncIterable<TData>>;
  readonly getRowId: (row: TData) => string;
  readonly authorize: (request: Request) => boolean | Promise<boolean>;
  readonly authorizeColumn: (column: AnalyticsExportColumn<TData>, request: Request) => boolean;
  readonly authorizeRow: (row: TData, query: Readonly<TQuery>, request: Request) => boolean;
  readonly exporters?: Partial<Readonly<Record<"csv" | "tsv" | "xlsx", AnalyticsExporter>>>;
  readonly includeSensitive?: boolean;
  readonly maxRows?: number;
  readonly maxBytes?: number;
  readonly maxScanRows?: number;
  readonly getRevision?: () => string;
}
class Forbidden extends Error {}
const cancelled = () => new DOMException("Export cancelled", "AbortError");
async function readJSON(request: Request) {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 262_144)) throw new RangeError("Request body limit");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !request.body) throw new TypeError("JSON body required");
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); }; request.signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) { if (request.signal.aborted) throw cancelled(); const next = await reader.read(); if (request.signal.aborted) throw cancelled(); if (next.done) break; if ((size += next.value.length) > 262_144) { void reader.cancel().catch(() => {}); throw new RangeError("Request body limit"); } chunks.push(next.value); }
  } finally { request.signal.removeEventListener("abort", abort); reader.releaseLock(); }
  const body = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as unknown;
}
function waitWithSignal<T>(work: T | Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise<T>((resolve, reject) => { const abort = () => { signal.removeEventListener("abort", abort); reject(cancelled()); }; signal.addEventListener("abort", abort, { once: true }); Promise.resolve(work).then((value) => { signal.removeEventListener("abort", abort); resolve(value); }, (error) => { signal.removeEventListener("abort", abort); reject(error); }); });
}
/** Fetch/Next.js/Nuxt/SvelteKit compatible endpoint. Every request is reauthorized against server-owned policies. */
export function createServerAnalyticsExportHandler<TQuery, TData>(options: ServerAnalyticsExportHandlerOptions<TQuery, TData>): (request: Request) => Promise<Response> {
  const exporters: Partial<Record<"csv" | "tsv" | "xlsx", AnalyticsExporter>> = { csv: createDelimitedExporter(), tsv: createDelimitedExporter({ delimiter: "\t" }), ...options.exporters };
  const maxScanRows = options.maxScanRows ?? 1_000_000;
  if (!Number.isSafeInteger(maxScanRows) || maxScanRows < 1 || maxScanRows > 10_000_000 || options.maxRows !== undefined && (!Number.isSafeInteger(options.maxRows) || options.maxRows < 1 || options.maxRows > 1_000_000) || options.maxBytes !== undefined && (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1 || options.maxBytes > 512_000_000) || new Set(options.columns.map((column) => column.id)).size !== options.columns.length || Object.values(exporters).some((exporter) => typeof exporter !== "function")) throw new TypeError("Invalid server export configuration");
  const errorResponse = (status: number, error: string) => new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  return async (request) => {
    if (request.method !== "POST") return errorResponse(405, "POST required");
    let cleanup = () => {};
    try {
      if (!await waitWithSignal(options.authorize(request), request.signal)) throw new Forbidden();
      const raw = await readJSON(request);
      if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some((key) => !["version", "queryKey", "query", "selection", "columns", "format", "maxRows"].includes(key))) throw new TypeError("Invalid request shape");
      const body = raw as ServerAnalyticsExportRequest<TQuery>; if (body.version !== 1 || !Array.isArray(body.columns)) throw new TypeError("Invalid request version");
      const query = options.validateQuery(body.query), queryKey = options.getQueryKey(query);
      if (queryKey !== body.queryKey) throw new TypeError("Query identity mismatch");
      const allowed = options.columns.filter((column) => column.exportable !== false && (!column.sensitive || options.includeSensitive === true) && options.authorizeColumn(column, request) === true);
      const selection = createServerAnalyticsExportRequest({ query, queryKey, ...(body.selection ? { selection: body.selection } : {}), columns: body.columns, allowedColumns: allowed.map((column) => column.id), format: body.format, maxRows: body.maxRows });
      const exporter = Object.hasOwn(exporters, selection.format) ? exporters[selection.format] : undefined; if (!exporter) throw new TypeError("Unsupported export format");
      const ids = new Set(selection.selection ? selection.selection.mode === "explicit" ? selection.selection.ids : selection.selection.excludedIds : []);
      const revision = options.getRevision?.(), source = selection.selection?.mode === "explicit" && ids.size === 0 ? [] : await waitWithSignal(options.getRows(selection.query, request.signal, request, selection.selection), request.signal);
      async function* selectedRows(): AsyncGenerator<TData, void, unknown> {
        let scanned = 0; const seen = new Set<string>();
        for await (const row of source) {
          if (request.signal.aborted) throw cancelled();
          if (++scanned > maxScanRows) throw new RangeError("Server export scan limit reached");
          const id = options.getRowId(row); if (typeof id !== "string" || !id.length) throw new TypeError("Invalid server row identity");
          if (selection.selection && (selection.selection.mode === "explicit" ? !ids.has(id) : ids.has(id))) continue;
          if (seen.has(id)) throw new TypeError("Duplicate server export row identity"); seen.add(id);
          yield row;
        }
      }
      const job = createAnalyticsExportJob({ rows: selectedRows(), columns: body.columns.map((id) => allowed.find((column) => column.id === id)!), scope: selection.selection ? "selection" : "filtered", ...(revision !== undefined ? { revision, getCurrentRevision: options.getRevision! } : {}) }, {
        exporter, maxRows: Math.min(selection.maxRows, options.maxRows ?? 100_000), maxArtifactBytes: options.maxBytes ?? 64_000_000,
        includeSensitive: options.includeSensitive === true, authorizeColumn: (column) => options.authorizeColumn(column, request) === true,
        authorizeRow: (row) => { if (!options.authorizeRow(row, selection.query, request)) throw new Forbidden(); return true; },
      });
      const abort = () => job.cancel(); request.signal.addEventListener("abort", abort, { once: true }); if (request.signal.aborted) job.cancel();
      cleanup = () => { request.signal.removeEventListener("abort", abort); job.dispose(); };
      const artifact = await job.start();
      return new Response(new Uint8Array(artifact.bytes), { headers: { "content-type": artifact.mimeType, "content-length": String(artifact.bytes.length), "content-disposition": `attachment; filename="export.${selection.format}"; filename*=UTF-8''${encodeURIComponent(artifact.filename).replace(/['()*]/g, (character) => "%" + character.charCodeAt(0).toString(16).toUpperCase())}`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
    } catch (error) {
      if (error instanceof Forbidden) return errorResponse(403, "Export not permitted");
      if (request.signal.aborted || error instanceof Error && error.name === "AbortError") return errorResponse(499, "Export cancelled");
      if (error instanceof RangeError) return errorResponse(413, "Export request or result exceeds its limit");
      if (error instanceof SyntaxError || error instanceof TypeError) return errorResponse(400, "Invalid export request");
      if (error instanceof Error && error.message.startsWith("Export source revision changed")) return errorResponse(409, "Export source changed; retry from current data");
      return errorResponse(500, "Export generation failed");
    } finally { cleanup(); }
  };
}
