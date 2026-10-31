# @rowick/export-xlsx

Optional Rowick XLSX exporter, part of the unpublished Rowick 0.1.0 candidate.

```sh
npm install @rowick/export-xlsx @rowick/data @rowick/core
```

```ts
import { createAnalyticsExportJob } from "@rowick/data/analytics";
import { createXlsxExporter } from "@rowick/export-xlsx";

const job = createAnalyticsExportJob({ rows, columns, scope: "filtered" }, {
  exporter: createXlsxExporter({ filename: "orders", sheetName: "Orders" }),
});
const file = await job.start(); // Uint8Array, filename and XLSX MIME type.
// Save file.bytes using the product's download/file-writing integration.
```

The writer emits a real ZIP/OOXML workbook with shared strings, typed numeric and
boolean cells, number/date formats, merged group headers, optional body merges
and frozen headers. Formula-like strings remain strings. Exact decimal strings
remain text so Excel cannot round them to binary64 precision. Dates use the 1900
system, skip its nonexistent leap day and require explicit calendar/UTC input.

The runtime has no third-party dependencies beyond the optional Rowick data
contract. ZIP uses uncompressed store mode with CRC32 and UTF-8 flags. This makes
files larger than compressed XLSX but bounds encoding work and avoids a ZIP
dependency. Defaults: 64 MB ZIP/XML budget, one million total worksheet cells,
256 custom formats, 32,767 characters per cell, one sheet. ZIP32, Excel row/column
and merged-range limits are enforced. No formulas, links, macros, images or file
reader/importer are implemented. A ZIP archive supplied by a user is never read.

The implementation follows [ECMA-376](https://ecma-international.org/publications-and-standards/standards/ecma-376/),
Microsoft's [cell representation](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.cell),
[escaped string rules](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/bd0aa042-434a-4ca7-b25f-4e1fd25a954d)
and [1900 date system compatibility](https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/wrongly-assumes-1900-is-leap-year).
Independent `zipfile`/`openpyxl` checks validate generated artifacts. Actual
Excel/Numbers manual opening is a separate pending release acceptance check.
