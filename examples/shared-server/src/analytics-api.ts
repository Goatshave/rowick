import type { IncomingMessage, ServerResponse } from "node:http";
import { createServerAnalyticsExportHandler } from "@rowick/data/analytics";
import { createXlsxExporter } from "@rowick/export-xlsx";
import { analyticsRecords, type AnalyticsRecord } from "./analytics-client";
type Next = () => void;
interface MiddlewareServer { middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: Next) => void) => unknown }; }
interface Query { region: "all" | "KR" | "JP"; }
export function createExampleAnalyticsHandler() {
  return createServerAnalyticsExportHandler<Query, AnalyticsRecord>({
    columns: ["id", "region", "city", "quarter", "owner", "note", "amount", "money", "date", "active", "secret"].map((id) => ({ id, label: id,
      ...(id === "amount" ? { type: "number" as const, format: "#,##0.00" } : id === "money" ? { type: "decimal" as const } : id === "date" ? { type: "date" as const } : id === "active" ? { type: "boolean" as const } : { type: "text" as const }),
      ...(id === "secret" ? { sensitive: true } : {}), getValue: (row: AnalyticsRecord) => row[id as keyof AnalyticsRecord] })),
    validateQuery: (input) => { if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1 || !["all", "KR", "JP"].includes(String((input as Query).region))) throw new TypeError("Invalid query"); return { region: (input as Query).region }; },
    getQueryKey: (query) => `analytics:${query.region}`,
    getRows: (query) => analyticsRecords.filter((row) => query.region === "all" || row.region === query.region), getRowId: (row) => row.id,
    authorize: (request) => request.headers.get("x-rowick-example-key") === "local-example",
    authorizeColumn: (column) => column.id !== "secret", authorizeRow: () => true,
    exporters: { xlsx: createXlsxExporter({ filename: "server-analysis", sheetName: "서버 매출" }) },
  });
}
export function analyticsApiPlugin() {
  const install = (server: MiddlewareServer) => {
    const handle = createExampleAnalyticsHandler();
    server.middlewares.use((req, res, next) => {
      if (new URL(req.url ?? "/", "http://localhost").pathname !== "/__rowick/analytics/export") { next(); return; }
      void (async () => {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) { res.writeHead(403); res.end(); return; }
        const abort = new AbortController(), cancel = () => abort.abort(), closed = () => { if (!res.writableEnded) abort.abort(); }; req.on("aborted", cancel); res.on("close", closed); let length = 0; const chunks: Uint8Array[] = [];
        try {
          for await (const chunk of req) { const bytes = chunk instanceof Uint8Array ? chunk : new TextEncoder().encode(String(chunk)); if ((length += bytes.length) > 262_144) { res.writeHead(413); res.end(); return; } chunks.push(bytes); }
          const body = new Uint8Array(length); let position = 0; for (const chunk of chunks) { body.set(chunk, position); position += chunk.length; }
          const headers = new Headers(); for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(",") : value);
          const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method ?? "GET", headers, ...(req.method === "POST" ? { body } : {}), signal: abort.signal });
          const response = await handle(request); res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(new Uint8Array(await response.arrayBuffer()));
        } catch { if (!res.headersSent) res.writeHead(500); res.end(); } finally { req.off("aborted", cancel); res.off("close", closed); }
      })();
    });
  };
  return { name: "rowick-analytics-api", configureServer: install, configurePreviewServer: install };
}
