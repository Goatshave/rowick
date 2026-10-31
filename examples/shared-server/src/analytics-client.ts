import { createAnalyticsController, createServerAnalyticsExportRequest, type AnalyticsExportArtifact, type AnalyticsExporter, type PivotConfiguration, type PivotField } from "@rowick/data/analytics";
import { createXlsxExporter } from "@rowick/export-xlsx";
export interface AnalyticsRecord { id: string; region: string | null; city: string; quarter: string; amount: number | null; money: string; date: string; active: boolean; owner: string; note: string; secret: string; }
export const analyticsRecords: readonly AnalyticsRecord[] = [
  { id: "a", region: "KR", city: "Seoul", quarter: "Q1", amount: 10, money: "9007199254740993.12", date: "2024-02-29", active: true, owner: "001", note: '=HYPERLINK("https://example.invalid")', secret: "never-export-this" },
  { id: "b", region: "KR", city: "Seoul", quarter: "Q2", amount: 20, money: "1.20", date: "2026-10-25", active: false, owner: "001", note: "한글\n두 번째 줄", secret: "never-export-this" },
  { id: "c", region: "KR", city: "Busan", quarter: "Q1", amount: 5, money: "5.00", date: "2026-10-25", active: true, owner: "002", note: "Busan", secret: "never-export-this" },
  { id: "d", region: "JP", city: "Tokyo", quarter: "Q1", amount: 7, money: "7.00", date: "2026-10-25", active: true, owner: "003", note: "Tokyo", secret: "never-export-this" },
  { id: "e", region: null, city: "Unknown", quarter: "Q1", amount: null, money: "0.00", date: "2026-10-25", active: false, owner: "002", note: "Missing amount", secret: "never-export-this" },
];
export const analyticsFields: readonly PivotField<AnalyticsRecord>[] = ["id", "region", "city", "quarter", "amount", "owner"].map((id) => ({ id, label: id[0]!.toUpperCase() + id.slice(1), getValue: (row) => row[id as keyof AnalyticsRecord] }));
export const initialAnalyticsConfiguration: PivotConfiguration = { version: 1, rowAxes: ["region", "city"], columnAxes: ["quarter"], metrics: [{ id: "sales", label: "Sales", columnId: "amount", operation: "sum" }, { id: "count", label: "Count", operation: "count" }], subtotals: true, rowTotals: true };
export function createAnalyticsExample(options: { onArtifact?: (artifact: AnalyticsExportArtifact) => void; loadView?: () => string | null; saveView?: (view: string) => void } = {}) {
  let filtered = false, revision = 0, saved: string | null = null, failStorage = false, failExport = false;
  const json: AnalyticsExporter = (document) => {
    if (failExport) { failExport = false; throw new Error("Simulated exporter failure"); }
    return { filename: "custom-analysis.json", mimeType: "application/json", bytes: new TextEncoder().encode(JSON.stringify({ version: 1, columns: document.columns.map((column) => column.id), rows: document.rows.map((row) => row.map((cell) => cell.value)) })) };
  };
  const slow: AnalyticsExporter = async (document, context) => {
    for (let index = 0; index < 20; index++) { if (context.signal.aborted) throw new DOMException("Cancelled", "AbortError"); context.progress(index / 20); await new Promise<void>((resolve) => setTimeout(resolve, 25)); }
    return json(document, context);
  };
  const serverXlsx: AnalyticsExporter = async (document, context) => {
    if (document.scope !== "filtered") throw new Error("Choose Filtered records for the server export example");
    const query = { region: filtered ? "KR" : "all" }, columns = ["id", "region", "city", "amount", "money", "date", "active", "owner", "note"];
    const request = createServerAnalyticsExportRequest({ query, queryKey: `analytics:${query.region}`, columns, allowedColumns: columns, format: "xlsx" });
    context.progress(.1);
    const response = await fetch("/__rowick/analytics/export", { method: "POST", headers: { "content-type": "application/json", "x-rowick-example-key": "local-example" }, body: JSON.stringify(request), signal: context.signal });
    if (!response.ok) throw new Error(`Server export failed (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.length > 64_000_000) throw new RangeError("Server export exceeds the example download budget"); context.progress(1);
    return { filename: "server-analysis.xlsx", mimeType: response.headers.get("content-type") ?? "application/octet-stream", bytes };
  };
  const controller = createAnalyticsController({ fields: analyticsFields, getRows: () => analyticsRecords.filter((row) => !filtered || row.region === "KR"), configuration: initialAnalyticsConfiguration,
    getRevision: () => String(revision), pageSize: 4, columnPageSize: 3, limits: { maxColumns: 12 }, title: "매출 분석",
    exporters: { xlsx: createXlsxExporter({ filename: "analysis", sheetName: "매출 분석" }), json, slow, "server-xlsx": serverXlsx },
    exportColumns: [
      ...analyticsFields.map((field) => ({ ...field, ...(field.id === "amount" ? { type: "number" as const, format: "#,##0.00" } : { type: "text" as const }) })),
      { id: "money", label: "Money", type: "decimal", getValue: (row: AnalyticsRecord) => row.money }, { id: "date", label: "Date", type: "date", getValue: (row: AnalyticsRecord) => row.date },
      { id: "active", label: "Active", type: "boolean", getValue: (row: AnalyticsRecord) => row.active }, { id: "note", label: "Note", getValue: (row: AnalyticsRecord) => row.note },
      { id: "secret", label: "Private", sensitive: true, getValue: () => { throw new Error("Sensitive value getter must not run"); } },
    ],
    loadView: () => options.loadView ? options.loadView() : saved,
    saveView: (view) => { if (failStorage) { failStorage = false; throw new Error("Simulated storage quota failure"); } options.saveView?.(view); saved = view; },
    ...(options.onArtifact ? { onArtifact: options.onArtifact } : {}),
  });
  return { controller, filterKR: () => { filtered = true; revision++; controller.refresh(); }, showAll: () => { filtered = false; revision++; controller.refresh(); },
    failStorage: () => { failStorage = true; controller.saveView(); }, failNextExport: () => { failExport = true; },
    corruptView: () => { if (options.saveView) options.saveView('{"version":99}'); else saved = '{"version":99}'; },
    overflow: () => { controller.setAxes("columns", ["id"]); controller.setMetrics([...initialAnalyticsConfiguration.metrics, { id: "extra", label: "Extra", operation: "count" }]); controller.apply(); },
    dispose: controller.dispose,
  };
}
export type AnalyticsExample = ReturnType<typeof createAnalyticsExample>;
export function downloadAnalyticsArtifact(artifact: AnalyticsExportArtifact): void {
  const blob = new Blob([new Uint8Array(artifact.bytes)], { type: artifact.mimeType }), url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = artifact.filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
}
