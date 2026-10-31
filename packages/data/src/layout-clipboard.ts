export const LAYOUT_CLIPBOARD_MIME = "application/x-rowick-ranges+json";
export interface LayoutClipboardBlock { readonly values: readonly (readonly string[])[]; }
export interface LayoutClipboardPayload { readonly version: 1; readonly blocks: readonly LayoutClipboardBlock[]; }
const maxText = 1_000_000, maxCells = 10_000;
export function parseLayoutClipboardPayload(serialized: string): LayoutClipboardPayload {
  if (serialized.length > maxText) throw new RangeError("Clipboard payload is too large");
  const payload = JSON.parse(serialized) as LayoutClipboardPayload;
  if (!payload || payload.version !== 1 || Object.keys(payload).some((key) => key !== "version" && key !== "blocks") || !Array.isArray(payload.blocks) || !payload.blocks.length || payload.blocks.length > 32) throw new TypeError("Invalid clipboard range payload");
  let cells = 0;
  const blocks = payload.blocks.map((block) => {
    if (!block || Object.keys(block).some((key) => key !== "values") || !Array.isArray(block.values) || !block.values.length || !Array.isArray(block.values[0]) || !block.values[0].length) throw new TypeError("Invalid clipboard range block");
    const width = block.values[0].length;
    const values = block.values.map((row: unknown) => {
      if (!Array.isArray(row) || row.length !== width || row.some((value) => typeof value !== "string") || (cells += row.length) > maxCells) throw new TypeError("Invalid clipboard cells or limit");
      return Object.freeze([...row]);
    });
    return Object.freeze({ values: Object.freeze(values) });
  });
  return Object.freeze({ version: 1, blocks: Object.freeze(blocks) });
}
export function layoutClipboardText(blocks: readonly LayoutClipboardBlock[], escapeFormulas = true): string {
  const cell = (value: string) => {
    const safe = escapeFormulas && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[\t\r\n"]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  return blocks.map((block) => block.values.map((row) => row.map(cell).join("\t")).join("\n")).join("\n\n");
}
/** Strict quoted TSV, including empty cells and embedded CR/LF. */
export function parseLayoutClipboardText(text: string): LayoutClipboardBlock {
  if (typeof text !== "string" || text.length > maxText) throw new RangeError("Clipboard text is too large");
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false, afterQuote = false, count = 0;
  const pushCell = () => { if (++count > maxCells) throw new RangeError("Clipboard cell limit exceeded"); row.push(cell); cell = ""; afterQuote = false; };
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (quoted) { if (character === '"') { if (text[index + 1] === '"') { cell += '"'; index++; } else { quoted = false; afterQuote = true; } } else cell += character; continue; }
    if (character === '"' && !cell.length && !afterQuote) { quoted = true; continue; }
    if (character === "\t") { pushCell(); continue; }
    if (character === "\n" || character === "\r") { pushCell(); rows.push(row); row = []; if (character === "\r" && text[index + 1] === "\n") index++; continue; }
    if (afterQuote) throw new TypeError("Invalid text after closing clipboard quote");
    cell += character;
  }
  if (quoted) throw new TypeError("Unterminated clipboard quote");
  pushCell(); row.length && rows.push(row);
  if (/[\r\n]$/.test(text) && rows.at(-1)?.length === 1 && rows.at(-1)?.[0] === "") rows.pop();
  const width = Math.max(0, ...rows.map((row) => row.length));
  if (rows.length * width > maxCells) throw new RangeError("Clipboard padded cell limit exceeded");
  return { values: rows.map((row) => [...row, ...Array<string>(width - row.length).fill("")]) };
}
