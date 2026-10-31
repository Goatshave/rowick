import type { AnalyticsExportDocument } from "@rowick/data/analytics";
export function workbookFixture(): AnalyticsExportDocument {
  return { title: "한글 매출", scope: "pivot", columns: ["name", "amount", "active", "date", "decimal", "timestamp"].map((id) => ({ id, label: id, headers: [id] })),
    headers: [["고객", "업무", "", "Date", "정밀 값", "Timestamp"], ["", "Amount", "Active", "", "", ""]],
    merges: [{ startRow: 0, startColumn: 0, rowSpan: 2, columnSpan: 1 }, { startRow: 0, startColumn: 1, rowSpan: 1, columnSpan: 2 }, { startRow: 0, startColumn: 3, rowSpan: 2, columnSpan: 1 }, { startRow: 0, startColumn: 4, rowSpan: 2, columnSpan: 1 }, { startRow: 0, startColumn: 5, rowSpan: 2, columnSpan: 1 }],
    rows: [
      [{ type: "text", value: "한글\n상호 & <tag> _x0041_\r\n보존" }, { type: "number", value: 1234.5, format: '#,##0.00" 원"' }, { type: "boolean", value: true }, { type: "date", value: "2024-02-29" }, { type: "decimal", value: "9007199254740993.123456789" }, { type: "datetime", value: "2024-02-29T12:34:56.789Z" }],
      [{ type: "text", value: '=HYPERLINK("https://example.invalid")' }, { type: "number", value: -3 }, { type: "boolean", value: false }, { type: "date", value: "1900-02-28" }, { type: "text", value: "001" }, { type: "date", value: "1900-03-01" }],
    ] };
}
