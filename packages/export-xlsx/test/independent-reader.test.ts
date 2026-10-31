import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createXlsxExporter } from "../src";
import { workbookFixture } from "./fixture";
it("opens typed values, Unicode, formats and merged headers with independent openpyxl", async () => {
  const result = await createXlsxExporter()(workbookFixture(), { signal: new AbortController().signal, progress: () => {} });
  if (process.env.ROWICK_XLSX_REFERENCE_PATH) writeFileSync(process.env.ROWICK_XLSX_REFERENCE_PATH, result.bytes);
  const python = process.env.ROWICK_XLSX_READER_PYTHON ?? "python3";
  const script = `import base64,datetime,io,json,sys,zipfile
from openpyxl import load_workbook
data=base64.b64decode(sys.stdin.read())
z=zipfile.ZipFile(io.BytesIO(data)); assert z.testzip() is None
w=load_workbook(io.BytesIO(data),data_only=False); s=w.active
assert s['A3'].value=='한글\\n상호 & <tag> _x0041_\\r\\n보존'
assert s['B3'].value==1234.5 and s['B3'].data_type=='n'
assert s['B3'].number_format=='#,##0.00" 원"'
assert s['C3'].value is True and s['C4'].value is False
assert s['D3'].value==datetime.datetime(2024,2,29)
assert s['D3'].number_format=='yyyy-mm-dd'
assert s['E3'].value=='9007199254740993.123456789' and s['E3'].data_type=='s'
assert s['F3'].value==datetime.datetime(2024,2,29,12,34,56,789000)
assert s['A4'].value=='=HYPERLINK("https://example.invalid")' and s['A4'].data_type=='s'
assert s['D4'].value==datetime.datetime(1900,2,28) and s['F4'].value==datetime.datetime(1900,3,1)
assert s['E4'].value=='001'
assert str(s.freeze_panes)=='A3'
assert 'B1:C1' in set(map(str,s.merged_cells.ranges))
assert s.title=='한글 매출'
print(json.dumps({'rows':s.max_row,'columns':s.max_column,'reader':'openpyxl','zip_crc':'passed'}))`;
  const evidence = JSON.parse(execFileSync(python, ["-c", script], { input: Buffer.from(result.bytes).toString("base64"), encoding: "utf8" }));
  expect(evidence).toEqual({ rows: 4, columns: 6, reader: "openpyxl", zip_crc: "passed" });
});
