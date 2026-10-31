import { assertExportText, sanitizeExportFilename, validateExportMerges, type AnalyticsExportCell, type AnalyticsExportDocument, type AnalyticsExporter } from "@rowick/data/analytics";

export interface XlsxExporterOptions { readonly filename?: string; readonly sheetName?: string; readonly maxBytes?: number; readonly maxCells?: number; readonly freezeHeaders?: boolean; }
const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const encode = new TextEncoder();
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;").replace(/\r/g, "&#13;");
// Excel's ST_Xstring uses _xHHHH_. Escape literal leading underscores before XML.
const xstring = (value: string) => escape(value.replace(/_x[0-9a-fA-F]{4}_/g, (match) => "_x005F_" + match.slice(1)));
const abortFailure = () => new DOMException("XLSX export cancelled", "AbortError");
function columnName(index: number): string { let result = ""; for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + (value - 1) % 26) + result; return result; }
function sheetName(input: string): string {
  const sanitized = input.replace(/[\[\]:*?/\\]/g, " ").replace(/^'+|'+$/g, "").trim(); let result = "";
  for (const character of sanitized) { if (result.length + character.length > 31) break; result += character; }
  result = result.replace(/^'+|'+$/g, "").trim() || "Sheet1"; assertExportText(result); return result;
}
/** Excel's 1900 epoch deliberately leaves serial 60 unused (the nonexistent 1900-02-29). */
function dateSerial(value: string): number {
  const day = value.slice(0, 10), timestamp = Date.parse(value.length === 10 ? value + "T00:00:00.000Z" : value);
  const year = Number(day.slice(0, 4)), month = Number(day.slice(5, 7)), date = Number(day.slice(8)), leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value) || !Number.isFinite(timestamp) || day < "1900-01-01" || day > "9999-12-31" || month < 1 || month > 12 || date < 1 || date > days[month - 1]! || value.length > 10 && new Date(value).toISOString().replace(".000Z", "Z") !== value.replace(".000Z", "Z")) throw new TypeError("XLSX dates require valid 1900–9999 UTC/calendar values");
  return (timestamp - Date.UTC(1899, 11, 31)) / 86_400_000 + (day >= "1900-03-01" ? 1 : 0);
}
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => { let value = index; for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xEDB88320 ^ value >>> 1 : value >>> 1; return value >>> 0; });
function crc32(bytes: Uint8Array) { let value = 0xFFFFFFFF; for (const byte of bytes) value = crcTable[(value ^ byte) & 255]! ^ value >>> 8; return (value ^ 0xFFFFFFFF) >>> 0; }
/** Fixed, trusted part paths only; store mode avoids compression dependencies and zip bombs. */
async function zip(parts: readonly { name: string; text: string }[], maximum: number, signal: AbortSignal): Promise<Uint8Array> {
  const files: { name: Uint8Array; bytes: Uint8Array; checksum: number; offset: number }[] = []; let offset = 0, centralBytes = 0;
  for (const part of parts) {
    if (signal.aborted) throw abortFailure();
    if (!/^[A-Za-z0-9_./\[\]-]+$/.test(part.name) || part.name.startsWith("/") || part.name.split("/").includes("..")) throw new TypeError("Invalid XLSX package part path");
    const name = encode.encode(part.name), bytes = encode.encode(part.text);
    if (name.length > 65_535 || bytes.length > 0xFFFFFFFF || offset + 30 + name.length + bytes.length + centralBytes + 46 + name.length + 22 > maximum) throw new RangeError("XLSX byte budget reached");
    files.push({ name, bytes, checksum: crc32(bytes), offset }); offset += 30 + name.length + bytes.length; centralBytes += 46 + name.length;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (files.length > 65_535 || offset + centralBytes + 22 > maximum || offset + centralBytes + 22 > 0xFFFFFFFF) throw new RangeError("XLSX exceeds ZIP32 limits");
  const output = new Uint8Array(offset + centralBytes + 22), view = new DataView(output.buffer); let position = 0;
  const u16 = (value: number) => { view.setUint16(position, value, true); position += 2; }, u32 = (value: number) => { view.setUint32(position, value, true); position += 4; };
  const append = (bytes: Uint8Array) => { output.set(bytes, position); position += bytes.length; };
  for (const file of files) {
    if (signal.aborted) throw abortFailure();
    u32(0x04034B50); u16(20); u16(0x800); u16(0); u16(0); u16(33); u32(file.checksum); u32(file.bytes.length); u32(file.bytes.length); u16(file.name.length); u16(0); append(file.name); append(file.bytes);
  }
  const centralOffset = position;
  for (const file of files) {
    u32(0x02014B50); u16(20); u16(20); u16(0x800); u16(0); u16(0); u16(33); u32(file.checksum); u32(file.bytes.length); u32(file.bytes.length); u16(file.name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(file.offset); append(file.name);
  }
  u32(0x06054B50); u16(0); u16(0); u16(files.length); u16(files.length); u32(position - centralOffset - 12); u32(centralOffset); u16(0);
  if (position !== output.length) throw new Error("XLSX ZIP directory size mismatch");
  return output;
}
function validateDocument(document: AnalyticsExportDocument, maximumCells: number) {
  const columns = document.columns.length, rows = document.headers.length + document.rows.length;
  if (!columns || columns > 16_384 || !document.headers.length || document.headers.length > 16 || rows > 1_048_576 || rows * columns > maximumCells) throw new RangeError("XLSX worksheet dimensions exceed their limits");
  for (const row of document.headers) if (row.length !== columns) throw new TypeError("XLSX header width mismatch");
  for (const row of document.rows) if (row.length !== columns) throw new TypeError("XLSX row width mismatch");
  validateExportMerges(document.merges, rows, columns, document.headers.length);
}
/** Typed OOXML workbook; never emits formulas, links, macros, external relationships or embedded objects. */
export function createXlsxExporter(options: XlsxExporterOptions = {}): AnalyticsExporter {
  const maxBytes = options.maxBytes ?? 64_000_000, maxCells = options.maxCells ?? 1_000_000;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 512_000_000 || !Number.isSafeInteger(maxCells) || maxCells < 1 || maxCells > 5_000_000) throw new TypeError("Invalid XLSX limit");
  return async (document, context) => {
    validateDocument(document, maxCells); const name = sheetName(options.sheetName ?? document.title), styles = new Map<string, number>(), strings = new Map<string, number>(); let stringCount = 0, xmlCharacters = 0;
    const hidden = new Set<string>(); for (const merge of document.merges) for (let row = merge.startRow; row < merge.startRow + merge.rowSpan; row++) for (let column = merge.startColumn; column < merge.startColumn + merge.columnSpan; column++) if (row !== merge.startRow || column !== merge.startColumn) hidden.add(`${row}:${column}`);
    const style = (cell: AnalyticsExportCell) => {
      const format = cell.type === "decimal" || cell.type === "text" ? "@" : cell.format ?? (cell.type === "date" ? "yyyy-mm-dd" : cell.type === "datetime" ? "yyyy-mm-dd hh:mm:ss.000" : undefined);
      if (format === undefined) return 0;
      assertExportText(format); if (format.length > 255) throw new TypeError("XLSX format is too long");
      if (!styles.has(format)) { if (styles.size >= 256) throw new RangeError("XLSX style limit reached"); styles.set(format, styles.size + 2); }
      return styles.get(format)!;
    };
    const shared = (value: string) => { assertExportText(value); stringCount++; if (!strings.has(value)) strings.set(value, strings.size); return strings.get(value)!; };
    const cellXML = (cell: AnalyticsExportCell, row: number, column: number, header: boolean) => {
      if (hidden.has(`${row}:${column}`)) return "";
      if (!cell || !["text", "number", "boolean", "decimal", "date", "datetime"].includes(cell.type)) throw new TypeError("Invalid XLSX cell type");
      const address = columnName(column) + (row + 1), id = header ? 1 : style(cell);
      if (cell.value === null) return `<c r="${address}" s="${id}"/>`;
      if (cell.type === "number") {
        if (typeof cell.value !== "number" || !Number.isFinite(cell.value) || Number.isInteger(cell.value) && !Number.isSafeInteger(cell.value)) throw new TypeError("Unsafe XLSX number");
        return `<c r="${address}" s="${id}" t="n"><v>${cell.value}</v></c>`;
      }
      if (cell.type === "boolean") { if (typeof cell.value !== "boolean") throw new TypeError("Invalid XLSX boolean"); return `<c r="${address}" s="${id}" t="b"><v>${cell.value ? 1 : 0}</v></c>`; }
      if (cell.type === "date" || cell.type === "datetime") { if (typeof cell.value !== "string") throw new TypeError("Invalid XLSX date"); return `<c r="${address}" s="${id}" t="n"><v>${dateSerial(cell.value)}</v></c>`; }
      if (typeof cell.value !== "string") throw new TypeError("XLSX text/decimal cells require strings");
      if (cell.type === "decimal" && !/^[+-]?\d+(?:\.\d+)?$/.test(cell.value)) throw new TypeError("Invalid XLSX exact decimal");
      return `<c r="${address}" s="${id}" t="s"><v>${shared(cell.value)}</v></c>`;
    };
    const rowXML: string[] = [];
    const appendRow = (cells: readonly AnalyticsExportCell[], index: number, header: boolean) => {
      const text = `<row r="${index + 1}">${cells.map((cell, column) => cellXML(cell, index, column, header)).join("")}</row>`;
      if ((xmlCharacters += text.length) > maxBytes) throw new RangeError("XLSX XML budget reached"); rowXML.push(text);
    };
    document.headers.forEach((row, index) => appendRow(row.map((value) => ({ type: "text", value })), index, true));
    for (let row = 0; row < document.rows.length; row++) {
      if (context.signal.aborted) throw abortFailure(); appendRow(document.rows[row]!, row + document.headers.length, false);
      if (row % 200 === 0) { context.progress(row / Math.max(1, document.rows.length) * .75); await new Promise<void>((resolve) => setTimeout(resolve, 0)); }
    }
    const numFormats = [...styles].map(([format, index]) => `<numFmt numFmtId="${164 + index - 2}" formatCode="${escape(format)}"/>`).join("");
    const cellFormats = [...styles].map(([_format, index]) => `<xf numFmtId="${164 + index - 2}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join("");
    const stylesheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${namespace}"><numFmts count="${styles.size}">${numFormats}</numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styles.size + 2}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>${cellFormats}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const merges = document.merges.length ? `<mergeCells count="${document.merges.length}">${document.merges.map((merge) => `<mergeCell ref="${columnName(merge.startColumn)}${merge.startRow + 1}:${columnName(merge.startColumn + merge.columnSpan - 1)}${merge.startRow + merge.rowSpan}"/>`).join("")}</mergeCells>` : "";
    const freeze = options.freezeHeaders === false ? "" : `<pane ySplit="${document.headers.length}" topLeftCell="A${document.headers.length + 1}" activePane="bottomLeft" state="frozen"/>`;
    const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${namespace}"><dimension ref="A1:${columnName(document.columns.length - 1)}${document.headers.length + document.rows.length}"/><sheetViews><sheetView workbookViewId="0">${freeze}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${rowXML.join("")}</sheetData>${merges}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
    const sharedStrings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="${namespace}" count="${stringCount}" uniqueCount="${strings.size}">${[...strings.keys()].map((value) => `<si><t xml:space="preserve">${xstring(value)}</t></si>`).join("")}</sst>`;
    context.progress(.8); if (context.signal.aborted) throw abortFailure();
    const parts = [
      { name: "[Content_Types].xml", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>' },
      { name: "_rels/.rels", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: "xl/workbook.xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${namespace}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="0"/><sheets><sheet name="${escape(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
      { name: "xl/_rels/workbook.xml.rels", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>' },
      { name: "xl/styles.xml", text: stylesheet }, { name: "xl/sharedStrings.xml", text: sharedStrings }, { name: "xl/worksheets/sheet1.xml", text: worksheet },
    ];
    const bytes = await zip(parts, maxBytes, context.signal); context.progress(1);
    return { filename: sanitizeExportFilename(options.filename ?? "rowick-export", "xlsx"), mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes };
  };
}
