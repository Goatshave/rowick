import { describe, expect, it } from "vitest";
import { createLocaleDateCodec, createLocaleNumberCodec, LocaleCodecError } from "../src/locale";
import { createRowEditingController } from "../src/row-editing";
import { createRowEditingForm } from "../src/editing-form";
import { parseEditorValue, type EditorField } from "../src/editors";
const locales = ["en-US", "de-DE", "fr-FR", "ko-KR", "ja-JP", "hi-IN", "ar-EG"];

describe("explicit exact locale codecs", () => {
  it("snapshots codec options so later caller mutations cannot change field interpretation", () => {
    const options = { locale: "ar-EG", allowAsciiDigits: false, allowNegative: false };
    const codec = createLocaleNumberCodec(options); options.allowAsciiDigits = true; options.allowNegative = true;
    expect(codec.parse("123")).toMatchObject({ valid: false, code: "invalid-input" }); expect(codec.parse("-١")).toMatchObject({ valid: false, code: "negative-not-allowed" });
    const dates = { locale: "ar-EG", allowAsciiDigits: false }, calendar = createLocaleDateCodec(dates); dates.allowAsciiDigits = true;
    const latin = calendar.format("2024-02-29").replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
    expect(calendar.parse(latin)).toMatchObject({ valid: false });
  });
  for (const locale of locales) describe(locale, () => {
    it.each(["900719925474099312345678901234567890.0012300", "0001.20", "+001.200", "-0.00", "-123456789.123456789012345678901234567890", "0"])("roundtrips every decimal digit and sign: %s", (value) => {
      const codec = createLocaleNumberCodec({ locale }); expect(codec.parse(codec.format(value))).toEqual({ valid: true, value });
    });
    it("roundtrips explicitly declared currency/accounting without inferring its minor unit", () => {
      for (const currency of ["USD", "EUR", "JPY", "KRW"]) {
        const codec = createLocaleNumberCodec({ locale, style: "currency", currency, currencySign: "accounting", maximumFractionDigits: 20 });
        for (const value of ["-9007199254740993.12", "+0000.00", "1.23456789"]) expect(codec.parse(codec.format(value))).toEqual({ valid: true, value });
      }
    });
    it("formats/parses Gregorian dates without converting an actual date to a timezone", () => {
      const codec = createLocaleDateCodec({ locale }); for (const value of ["2024-02-29", "0001-01-01", "2000-12-31", "9999-12-31"]) expect(codec.parse(codec.format(value))).toEqual({ valid: true, value });
      expect(codec.pattern).toContain("YYYY"); expect(() => codec.format("2025-02-29")).toThrow(LocaleCodecError); expect(() => codec.format("2024-02-29T00:00:00Z")).toThrow(LocaleCodecError);
    });
    it("supports explicit Number schema while rejecting a lossy conversion", () => {
      const codec = createLocaleNumberCodec({ locale, valueType: "number" });
      expect(codec.parse(codec.format(1234.5))).toEqual({ valid: true, value: 1234.5 }); expect(Object.is(codec.parse(codec.format(-0)).valid && (codec.parse(codec.format(-0)) as { value: number }).value, -0)).toBe(true);
      const exact = createLocaleNumberCodec({ locale }); expect(codec.parse(exact.format("0.10000000000000000001"))).toMatchObject({ valid: false, code: "precision" });
      expect(codec.parse(exact.format("9007199254740993"))).toMatchObject({ valid: false, code: "unsafe-number" });
    });
  });

  it("validates complete locale grouping instead of deleting separators", () => {
    const us = createLocaleNumberCodec({ locale: "en-US" });
    for (const value of ["1,2,3", "12,34", ",123", "1,,234", "123,", "1,234.5,6", "1.234,56", "12 345.67"]) expect(us.parse(value)).toMatchObject({ valid: false });
    expect(us.parse("1,234,567.80")).toEqual({ valid: true, value: "1234567.80" }); expect(us.parse("1234567.80")).toEqual({ valid: true, value: "1234567.80" });
    const indian = createLocaleNumberCodec({ locale: "hi-IN" }); expect(indian.parse("12,34,567.80")).toEqual({ valid: true, value: "1234567.80" }); expect(indian.parse("1,234,567.80")).toMatchObject({ valid: false, code: "invalid-grouping" });
  });
  it("supports required/forbidden grouping and explicit space-equivalent parsing", () => {
    const required = createLocaleNumberCodec({ locale: "en-US", grouping: "required" }); expect(required.parse("1234")).toMatchObject({ valid: false, code: "invalid-grouping" }); expect(required.parse("123")).toMatchObject({ valid: true });
    const forbidden = createLocaleNumberCodec({ locale: "de-DE", grouping: "forbidden" }); expect(forbidden.format("12345.00")).toBe("12345,00"); expect(forbidden.parse("12.345,00")).toMatchObject({ valid: false });
    const strict = createLocaleNumberCodec({ locale: "fr-FR" }), spaces = createLocaleNumberCodec({ locale: "fr-FR", spaceGrouping: "space-equivalent" });
    expect(strict.parse("1 234,50")).toMatchObject({ valid: false }); expect(spaces.parse("1 234,50")).toEqual({ valid: true, value: "1234.50" }); expect(spaces.parse("1  234,50")).toMatchObject({ valid: false });
  });
  it("does not accept a different currency, wrong accounting placement or omitted required currency", () => {
    const codec = createLocaleNumberCodec({ locale: "en-US", style: "currency", currency: "USD", currencySign: "accounting" });
    expect(codec.parse("($1,234.50)")).toEqual({ valid: true, value: "-1234.50" });
    for (const value of ["€1,234.50", "$-1,234.50", "1,234.50", "($1,234.50", "$1,234.50)"]) expect(codec.parse(value)).toMatchObject({ valid: false });
    const optional = createLocaleNumberCodec({ locale: "en-US", style: "currency", currency: "USD", currencyInput: "optional" }); expect(optional.parse("1,234.50")).toEqual({ valid: true, value: "1234.50" });
  });
  it("accepts only explicitly permitted digit scripts and known affix presentation marks", () => {
    const arabic = createLocaleNumberCodec({ locale: "ar-EG" }); expect(arabic.parse("١٬٢٣٤٫٥٠")).toEqual({ valid: true, value: "1234.50" }); expect(arabic.parse("1٬234٫50")).toMatchObject({ valid: false });
    const ascii = createLocaleNumberCodec({ locale: "ar-EG", allowAsciiDigits: true }); expect(ascii.parse("1٬234٫50")).toEqual({ valid: true, value: "1234.50" }); expect(ascii.parse("١٬234٫50")).toMatchObject({ valid: false });
    const negative = arabic.format("-1234.50"); expect(arabic.parse(negative.replace(/[\u061c\u200e\u200f]/g, ""))).toEqual({ valid: true, value: "-1234.50" });
    expect(arabic.parse("١٢\u202e٣")).toMatchObject({ valid: false }); expect(arabic.parse("١\u200f٢٣")).toMatchObject({ valid: false });
    const devanagari = createLocaleNumberCodec({ locale: "hi-IN", numberingSystem: "deva" }); expect(devanagari.parse(devanagari.format("1234567.80"))).toEqual({ valid: true, value: "1234567.80" });
  });
  it("rejects signed zero/negative input only when the field explicitly requests it", () => {
    expect(createLocaleNumberCodec({ locale: "en-US", negativeZero: "reject" }).parse("-0.00")).toMatchObject({ valid: false, code: "negative-zero" });
    expect(createLocaleNumberCodec({ locale: "en-US", allowNegative: false }).parse("-1.00")).toMatchObject({ valid: false, code: "negative-not-allowed" });
    const numeric = createLocaleNumberCodec({ locale: "en-US", valueType: "number", integer: true, min: 1.5, max: 4 }); expect(numeric.parse("2")).toEqual({ valid: true, value: 2 }); expect(numeric.parse("2.5")).toMatchObject({ valid: false });
  });
  it("bounds digits/fractions/input and refuses scientific or nonfinite localized input", () => {
    const codec = createLocaleNumberCodec({ locale: "en-US", maximumIntegerDigits: 5, maximumFractionDigits: 2 });
    expect(codec.parse("123456")).toMatchObject({ valid: false, code: "precision" }); expect(codec.parse("1.234")).toMatchObject({ valid: false, code: "precision" });
    for (const value of ["1e3", "Infinity", "NaN", "0x10", "1_000", " 123 ", "1.", ""]) expect(codec.parse(value)).toMatchObject({ valid: false });
    expect(codec.parse("1".repeat(2049))).toMatchObject({ valid: false, code: "input-too-long" });
  });
  it("uses an explicit locale/date pattern and never guesses two-digit years or ambiguous alternate separators", () => {
    const us = createLocaleDateCodec({ locale: "en-US" }), german = createLocaleDateCodec({ locale: "de-DE" });
    expect(us.parse("01/02/2003")).toEqual({ valid: true, value: "2003-01-02" }); expect(german.parse("01.02.2003")).toEqual({ valid: true, value: "2003-02-01" });
    for (const value of ["01/02/03", "2024-02-29", "02/29/2025", "00/01/2024", "01/01/0000", "01/01/2024T00:00Z"]) expect(us.parse(value)).toMatchObject({ valid: false, code: "invalid-date" });
    expect(german.parse("01/02/2003")).toMatchObject({ valid: false }); const arabic = createLocaleDateCodec({ locale: "ar-EG", allowAsciiDigits: true }); expect(arabic.parse("٢٩/02/٢٠٢٤")).toMatchObject({ valid: false });
  });
  it.each([
    { locale: "zz-ZZ" }, { locale: "not_a_locale" }, { locale: "en-US", numberingSystem: "roman" }, { locale: "en-US", maximumFractionDigits: 1001 },
    { locale: "en-US", style: "currency", currency: "usd" }, { locale: "en-US", style: "currency" }, { locale: "en-US", currency: "USD" },
  ])("rejects unsupported locale/number policies %#", (options) => expect(() => createLocaleNumberCodec(options as never)).toThrow(LocaleCodecError));
  it("rejects non-Gregorian date requests and retains input timezone neutrality", () => {
    expect(() => createLocaleDateCodec({ locale: "ja-JP-u-ca-japanese" })).toThrow(/Gregorian/);
    const original = process.env.TZ; try { const codec = createLocaleDateCodec({ locale: "ko-KR" }); const value = codec.format("2024-01-01"); process.env.TZ = "America/Los_Angeles"; expect(codec.format("2024-01-01")).toBe(value); process.env.TZ = "Asia/Seoul"; expect(codec.parse(value)).toEqual({ valid: true, value: "2024-01-01" }); }
    finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
  });
  it("supports multi-code-unit Unicode positional digits without splitting them", () => {
    const number = createLocaleNumberCodec({ locale: "en-US", numberingSystem: "mathsans" }), date = createLocaleDateCodec({ locale: "en-US", numberingSystem: "mathsans" });
    expect(number.parse(number.format("0001234.500"))).toEqual({ valid: true, value: "0001234.500" }); expect(date.parse(date.format("2024-02-29"))).toEqual({ valid: true, value: "2024-02-29" });
  });
  it("rejects ignored Intl knobs and applies explicit numeric bounds without metadata rounding", () => {
    expect(() => createLocaleNumberCodec({ locale: "en-US", notation: "compact" } as never)).toThrow(/supported/);
    expect(() => createLocaleDateCodec({ locale: "en-US", calendar: "buddhist" } as never)).toThrow(/supported/);
    expect(() => createLocaleNumberCodec({ locale: "en-US", min: 1 } as never)).toThrow(/Number schema/);
    expect(() => createLocaleNumberCodec({ locale: "en-US", valueType: "number", integer: true, min: 1.2, max: 1.5 })).toThrow(/no allowed value/);
    const codec = createLocaleNumberCodec({ locale: "de-DE", valueType: "number", min: 0, max: 2 }); expect(codec.parse("2,01")).toMatchObject({ valid: false, code: "unsafe-number" }); expect(codec.parse("1,50")).toEqual({ valid: true, value: 1.5 });
  });
});

function localeForm(fields: readonly EditorField[]) {
  let record = { id: "a", reference: "00123", money: "9007199254740993.12", date: "2024-02-29", number: 1 };
  const editor = createRowEditingController({ getRow: () => record, getRowId: (row) => row.id, getValue: (row, id) => row[id as keyof typeof row],
    applyValues: (row, values) => ({ ...row, ...values }), accept: (_id, row) => { record = row; } });
  const form = createRowEditingForm(editor, fields); editor.begin("a");
  return { editor, form, getRecord: () => record, dispose: () => { form.dispose(); editor.dispose(); } };
}
describe("field-owned locale parser and formatter pairs", () => {
  it("leaves an existing formatter-only field's ASCII editing behavior unchanged", () => {
    const source = localeForm([{ id: "money", label: "Money", kind: "currency", format: () => "display-only currency" }]);
    try { expect(source.form.getState().rows[0]?.fields[0]?.input).toBe("9007199254740993.12"); source.form.setInput("a", "money", "1,20"); expect(source.form.getState().invalidFieldCount).toBe(1); }
    finally { source.dispose(); }
  });
  it("roundtrips an explicitly localized exact currency field while preserving text IDs", async () => {
    const codec = createLocaleNumberCodec({ locale: "de-DE", style: "currency", currency: "EUR" });
    const source = localeForm([{ id: "reference", label: "ID", kind: "text" }, { id: "money", label: "Money", kind: "currency", scale: 2, parse: codec.parse, format: (value) => codec.format(value as string) }]);
    try {
      expect(source.form.getState().rows[0]?.fields[1]?.input).toBe(codec.format("9007199254740993.12")); source.form.setInput("a", "reference", "00000123");
      source.form.setInput("a", "money", codec.format("999999999999999999999.12")); expect(await source.form.save("a")).toMatchObject({ status: "success" });
      expect(source.getRecord()).toMatchObject({ reference: "00000123", money: "999999999999999999999.12" });
    } finally { source.dispose(); }
  });
  it("uses localized Gregorian text input only with an explicit parser and formatter", async () => {
    const codec = createLocaleDateCodec({ locale: "fr-FR" }), source = localeForm([{ id: "date", label: "Calendar", kind: "text", parse: codec.parse, format: (value) => codec.format(value as string) }]);
    try { expect(source.form.getState().rows[0]?.fields[0]?.input).toBe("29/02/2024"); source.form.setInput("a", "date", "31/12/2026"); await source.form.save("a"); expect(source.getRecord().date).toBe("2026-12-31"); }
    finally { source.dispose(); }
  });
  it("retains invalid localized raw input and never applies it to canonical data", async () => {
    const codec = createLocaleNumberCodec({ locale: "hi-IN" }), source = localeForm([{ id: "money", label: "Amount", kind: "decimal", parse: codec.parse, format: (value) => codec.format(value as string) }]);
    try { source.form.setInput("a", "money", "1,234,567.80"); expect(await source.form.save("a")).toMatchObject({ status: "invalid-input" }); expect(source.form.getState().rows[0]?.fields[0]?.input).toBe("1,234,567.80"); expect(source.getRecord().money).toBe("9007199254740993.12"); }
    finally { source.dispose(); }
  });
  it("keeps explicit parser results subject to field schema, options, precision and signed-zero rules", () => {
    expect(parseEditorValue({ id: "n", label: "N", kind: "number", parse: () => ({ valid: true, value: "1" }) }, "1").valid).toBe(false);
    expect(parseEditorValue({ id: "n", label: "N", kind: "number", min: 2, parse: () => ({ valid: true, value: 1 }) }, "1").valid).toBe(false);
    expect(parseEditorValue({ id: "n", label: "N", kind: "currency", scale: 2, parse: () => ({ valid: true, value: "1.234" }) }, "1").valid).toBe(false);
    expect(parseEditorValue({ id: "n", label: "N", kind: "select", choices: [{ value: "off", label: "Off", disabled: true }], parse: () => ({ valid: true, value: "off" }) }, "1").valid).toBe(false);
    const result = parseEditorValue({ id: "n", label: "N", kind: "number", parse: () => ({ valid: true, value: -0 }) }, "-0"); expect(result.valid && Object.is(result.value, -0)).toBe(true);
  });
  it("reports formatter/parser errors in the form rather than throwing a render-time exception", async () => {
    const source = localeForm([{ id: "money", label: "Money", kind: "decimal", parse: () => { throw new Error("Parser feedback"); }, format: () => { throw new Error("Formatter feedback"); } }]);
    try { expect(source.form.getState()).toMatchObject({ invalidFieldCount: 1 }); expect(source.form.getState().rows[0]?.fields[0]?.error).toBe("Formatter feedback"); expect(await source.form.save("a")).toMatchObject({ status: "invalid-input" });
      source.form.setInput("a", "money", "1"); expect(source.form.getState().rows[0]?.fields[0]?.error).toBe("Parser feedback"); }
    finally { source.dispose(); }
  });
});
