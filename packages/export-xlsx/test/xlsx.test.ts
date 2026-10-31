import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createXlsxExporter } from "../src";
import { workbookFixture } from "./fixture";
const context = () => ({ signal: new AbortController().signal, progress: (_fraction: number) => {} });
const unpack = (bytes: Uint8Array): Record<string, string> => JSON.parse(execFileSync("python3", ["-c", "import base64,io,json,sys,zipfile\nz=zipfile.ZipFile(io.BytesIO(base64.b64decode(sys.stdin.read())))\nassert z.testzip() is None\nassert all(i.compress_type==0 and i.flag_bits&0x800 for i in z.infolist())\nprint(json.dumps({i.filename:z.read(i).decode('utf-8') for i in z.infolist()}))"], { input: Buffer.from(bytes).toString("base64"), encoding: "utf8", maxBuffer: 10_000_000 }));
describe("optional typed XLSX writer", () => {
  it("writes valid independent ZIP32 parts with UTF-8 and CRC integrity", async () => {
    const result = await createXlsxExporter()(workbookFixture(), context()), parts = unpack(result.bytes);
    expect(Object.keys(parts)).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/sharedStrings.xml", "xl/worksheets/sheet1.xml"]);
    expect(result.mimeType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); expect(result.filename).toBe("rowick-export.xlsx");
    expect(parts["xl/workbook.xml"]).toContain('date1904="0"'); expect(parts["xl/sharedStrings.xml"]).toContain("한글");
  });
  it("uses explicit numeric/boolean/string types and never emits formulas or hyperlinks", async () => {
    const parts = unpack((await createXlsxExporter()(workbookFixture(), context())).bytes), sheet = parts["xl/worksheets/sheet1.xml"]!;
    expect(sheet).toContain('r="B3" s="'); expect(sheet).toContain('t="n"><v>1234.5</v>'); expect(sheet).toContain('t="b"><v>1</v>');
    expect(sheet).not.toContain("<f>"); expect(sheet).not.toContain("hyperlink"); expect(parts["xl/sharedStrings.xml"]).toContain("=HYPERLINK");
    expect(parts["xl/sharedStrings.xml"]).toContain("9007199254740993.123456789"); expect(parts["xl/sharedStrings.xml"]).toContain("_x005F_x0041_");
  });
  it("preserves number/date formats, grouped headers, freeze panes and the 1900 leap-day offset", async () => {
    const parts = unpack((await createXlsxExporter()(workbookFixture(), context())).bytes), sheet = parts["xl/worksheets/sheet1.xml"]!;
    expect(parts["xl/styles.xml"]).toContain("#,##0.00&quot; 원&quot;"); expect(parts["xl/styles.xml"]).toContain("yyyy-mm-dd");
    expect(sheet).toContain('ref="B1:C1"'); expect(sheet).toContain('ref="A1:A2"'); expect(sheet).toContain('topLeftCell="A3"');
    expect(sheet).toContain('<v>59</v>'); expect(sheet).toContain('<v>61</v>');
  });
  it("sanitizes sheet/filename text without creating external part paths", async () => {
    const result = await createXlsxExporter({ filename: "../unsafe\\name", sheetName: "'[]:Bad?/Sheet*Name\\'" })(workbookFixture(), context()), parts = unpack(result.bytes);
    expect(result.filename).not.toMatch(/[\\/]/); expect(parts["xl/workbook.xml"]).not.toContain("Bad?/Sheet"); expect(Object.keys(parts)).not.toContain("../unsafe");
  });
  it("masks covered body cells even when a direct document contains values beneath a merge", async () => {
    const fixture = workbookFixture(); const result = await createXlsxExporter()({ ...fixture, merges: [...fixture.merges, { startRow: 2, startColumn: 0, rowSpan: 1, columnSpan: 2 }] }, context()), parts = unpack(result.bytes);
    expect(parts["xl/worksheets/sheet1.xml"]).not.toContain('r="B3"');
  });
  it.each(["1900-02-29", "2024-02-30", "2024-01-01T25:00:00Z", "2024-01-01T00:00:00+09:00", "1899-12-31"])("rejects invalid or implicit-timezone date %s", async (value) => {
    const fixture = workbookFixture(); await expect(createXlsxExporter()({ ...fixture, rows: [[{ type: "date", value }, ...fixture.rows[0]!.slice(1)]] }, context())).rejects.toThrow(/date/);
  });
  it("enforces dimensions, merge validity, XML text, byte and cell budgets", async () => {
    const fixture = workbookFixture();
    await expect(createXlsxExporter({ maxBytes: 100 })(fixture, context())).rejects.toThrow(/budget/);
    await expect(createXlsxExporter({ maxCells: 2 })(fixture, context())).rejects.toThrow(/dimensions/);
    await expect(createXlsxExporter()({ ...fixture, merges: [{ startRow: 0, startColumn: 0, rowSpan: 10, columnSpan: 1 }] }, context())).rejects.toThrow(/outside/);
    await expect(createXlsxExporter()({ ...fixture, rows: [[{ type: "text", value: "bad\u0000" }, ...fixture.rows[0]!.slice(1)]] }, context())).rejects.toThrow(/illegal XML/);
    await expect(createXlsxExporter()({ ...fixture, rows: [[{ type: "number", value: Number.MAX_SAFE_INTEGER + 1 }, ...fixture.rows[0]!.slice(1)]] }, context())).rejects.toThrow(/Unsafe/);
  });
  it("checks cancellation before encoding and yields while writing many rows", async () => {
    const fixture = workbookFixture(), abort = new AbortController(), progress: number[] = [];
    const pending = createXlsxExporter()({ ...fixture, rows: Array.from({ length: 500 }, () => fixture.rows[0]!) }, { signal: abort.signal, progress: (fraction) => { progress.push(fraction); abort.abort(); } });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" }); expect(progress.length).toBeGreaterThan(0);
    const cancelled = new AbortController(); cancelled.abort(); await expect(createXlsxExporter()(fixture, { signal: cancelled.signal, progress: () => {} })).rejects.toMatchObject({ name: "AbortError" });
  });
  it("writes the last supported Excel column and rejects worksheet/style overflow", async () => {
    const fixture = workbookFixture(), columns = Array.from({ length: 16_384 }, (_, index) => ({ id: String(index), label: "H", headers: ["H"] }));
    const parts = unpack((await createXlsxExporter()({ ...fixture, columns, headers: [Array<string>(columns.length).fill("H")], rows: [], merges: [] }, context())).bytes);
    expect(parts["xl/worksheets/sheet1.xml"]).toContain('r="AA1"'); expect(parts["xl/worksheets/sheet1.xml"]).toContain('r="XFD1"');
    await expect(createXlsxExporter()({ ...fixture, columns: [...columns, columns[0]!] }, context())).rejects.toThrow(/dimensions/);
    await expect(createXlsxExporter()({ ...fixture, rows: new Array(1_048_576) }, context())).rejects.toThrow(/dimensions/);
    const styles = Array.from({ length: 257 }, (_, index) => ({ type: "number" as const, value: 1, format: `"format${index}"` }));
    await expect(createXlsxExporter()({ ...fixture, columns: columns.slice(0, styles.length), headers: [Array<string>(styles.length).fill("H")], rows: [styles], merges: [] }, context())).rejects.toThrow(/style limit/);
  });
});
