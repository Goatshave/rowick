export type LocaleInputErrorCode = "unsupported-locale" | "unsupported-numbering-system" | "invalid-options" | "invalid-input" |
  "invalid-grouping" | "invalid-currency" | "input-too-long" | "precision" | "unsafe-number" | "negative-not-allowed" | "negative-zero" | "invalid-date";
export class LocaleCodecError extends TypeError {
  readonly code: LocaleInputErrorCode;
  constructor(code: LocaleInputErrorCode, message: string) { super(message); this.name = "LocaleCodecError"; this.code = code; }
}
export type LocaleParseResult<T> = { readonly valid: true; readonly value: T } |
  { readonly valid: false; readonly code: LocaleInputErrorCode; readonly message: string };
export interface LocaleValueCodec<T> {
  readonly locale: string; readonly numberingSystem: string; readonly pattern: string;
  readonly format: (value: T) => string; readonly parse: (input: unknown) => LocaleParseResult<T>;
}
interface LocaleCodecOptions {
  locale: string; numberingSystem?: string; allowAsciiDigits?: boolean; maximumInputLength?: number;
}
interface LocaleDecimalOptions extends LocaleCodecOptions {
  valueType?: "decimal"; style?: "decimal" | "currency"; currency?: string;
  currencyDisplay?: "code" | "symbol" | "narrowSymbol"; currencySign?: "standard" | "accounting";
  currencyInput?: "required" | "optional"; grouping?: "optional" | "required" | "forbidden";
  spaceGrouping?: "exact" | "space-equivalent"; maximumIntegerDigits?: number; maximumFractionDigits?: number;
  allowNegative?: boolean; negativeZero?: "preserve" | "reject";
}
interface LocaleNumericOptions extends Omit<LocaleDecimalOptions, "valueType"> {
  valueType: "number"; integer?: boolean; min?: number; max?: number;
}
export type LocaleNumberCodecOptions = LocaleDecimalOptions | LocaleNumericOptions;
interface DigitProfile {
  locale: string; numberingSystem: string; digits: readonly string[];
  encode: (ascii: string) => string; decode: (input: string) => string;
}
const presentation = /[\u061c\u200e\u200f]/g;
const fail = (code: LocaleInputErrorCode, message: string): never => { throw new LocaleCodecError(code, message); };
const bound = (value: number | undefined, fallback: number, minimum: number, maximum: number) => {
  const result = value ?? fallback; if (!Number.isSafeInteger(result) || result < minimum || result > maximum) fail("invalid-options", "Locale codec limit is outside its supported range"); return result;
};
const regexp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function optionKeys(value: object, allowed: readonly string[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).some((key) => typeof key !== "string" || !allowed.includes(key)) ||
    Object.values(Object.getOwnPropertyDescriptors(value)).some((descriptor) => !Object.hasOwn(descriptor, "value"))) fail("invalid-options", "Declare only the supported locale codec options");
}
function supportedLocale(options: LocaleCodecOptions, date = false): string {
  try {
    if (typeof options.locale !== "string" || !options.locale.length || options.locale.length > 100) fail("unsupported-locale", "Choose an explicit supported locale");
    const locale = Intl.getCanonicalLocales(options.locale)[0]!;
    const supported = date ? Intl.DateTimeFormat.supportedLocalesOf([locale], { localeMatcher: "lookup" }) : Intl.NumberFormat.supportedLocalesOf([locale], { localeMatcher: "lookup" });
    if (!supported.length) fail("unsupported-locale", "This locale is not supported by this runtime");
    if (date && new Intl.Locale(locale).calendar && new Intl.Locale(locale).calendar !== "gregory") fail("invalid-options", "Calendar input supports only the Gregorian calendar");
    return locale;
  } catch (error) { if (error instanceof LocaleCodecError) throw error; return fail("unsupported-locale", "Choose a well-formed supported locale"); }
}
function digitProfile(options: LocaleCodecOptions, date = false): DigitProfile {
  const locale = supportedLocale(options, date);
  if (options.numberingSystem !== undefined && (typeof options.numberingSystem !== "string" || !/^[a-z0-9]{3,8}$/.test(options.numberingSystem)) || options.allowAsciiDigits !== undefined && typeof options.allowAsciiDigits !== "boolean") fail("invalid-options", "Invalid numbering system or digit policy");
  let formatter: Intl.NumberFormat;
  try { formatter = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 0, ...(options.numberingSystem ? { numberingSystem: options.numberingSystem } : {}) }); }
  catch { return fail("unsupported-numbering-system", "This numbering system is not supported"); }
  const numberingSystem = formatter.resolvedOptions().numberingSystem;
  const requested = options.numberingSystem ?? new Intl.Locale(locale).numberingSystem;
  if (requested && requested !== numberingSystem) fail("unsupported-numbering-system", "This numbering system is not supported");
  const digits = Array.from({ length: 10 }, (_, value) => formatter.formatToParts(value).filter((part) => part.type === "integer").map((part) => part.value).join(""));
  if (new Set(digits).size !== 10 || digits.some((digit) => [...digit].length !== 1)) fail("unsupported-numbering-system", "The locale does not use a supported positional decimal digit set");
  const decoded = new Map(digits.map((digit, index) => [digit, String(index)]));
  return { locale: formatter.resolvedOptions().locale, numberingSystem, digits: Object.freeze(digits), encode: (ascii) => [...ascii].map((digit) => digits[Number(digit)]!).join(""),
    decode: (input) => {
      let family: "ascii" | "locale" | undefined, result = "";
      for (const digit of input) {
        let mapped = decoded.get(digit), current: "ascii" | "locale" = "locale";
        if (mapped === undefined && options.allowAsciiDigits && /^[0-9]$/.test(digit)) { mapped = digit; current = "ascii"; }
        if (mapped === undefined) fail("invalid-input", "Use digits from the declared locale");
        if (family !== undefined && family !== current) fail("invalid-input", "Do not mix digit scripts in one value");
        family = current; result += mapped;
      }
      return result;
    } };
}
function parsed<T>(work: () => T): LocaleParseResult<T> {
  try { return Object.freeze({ valid: true, value: work() }); }
  catch (error) { return Object.freeze({ valid: false, code: error instanceof LocaleCodecError ? error.code : "invalid-input", message: error instanceof LocaleCodecError ? error.message : "Input does not match this locale" }); }
}
interface Decimal { sign: "" | "+" | "-"; whole: string; fraction: string; }
function decimalParts(value: string): Decimal {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return fail("invalid-input", "Use an explicit finite decimal value");
  return { sign: match[1] as Decimal["sign"], whole: match[2]!, fraction: match[3] ?? "" };
}
function numberDecimal(value: number): string {
  if (Object.is(value, -0)) return "-0";
  const string = String(value), match = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(string); if (!match) return string;
  const digits = match[2]! + (match[3] ?? ""), offset = match[2]!.length + Number(match[4]);
  return match[1]! + (offset <= 0 ? `0.${"0".repeat(-offset)}${digits}` : offset >= digits.length ? digits + "0".repeat(offset - digits.length) : `${digits.slice(0, offset)}.${digits.slice(offset)}`);
}
function normalizedDecimal(value: string): string {
  const parts = decimalParts(value), whole = parts.whole.replace(/^0+/, "") || "0", fraction = parts.fraction.replace(/0+$/, "");
  return `${parts.sign === "-" ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
interface Affix { prefix: string; suffix: string; sign: Decimal["sign"]; }
function affix(formatter: Intl.NumberFormat, value: number, sign: Decimal["sign"]): Affix {
  const parts = formatter.formatToParts(value), first = parts.findIndex((part) => part.type === "integer"), last = parts.length - 1 - [...parts].reverse().findIndex((part) => part.type === "integer");
  if (first < 0) return fail("unsupported-numbering-system", "The locale has no supported decimal pattern");
  return { prefix: parts.slice(0, first).map((part) => part.value).join(""), suffix: parts.slice(last + 1).map((part) => part.value).join(""), sign };
}
export function createLocaleNumberCodec(options: LocaleDecimalOptions): LocaleValueCodec<string>;
export function createLocaleNumberCodec(options: LocaleNumericOptions): LocaleValueCodec<number>;
export function createLocaleNumberCodec(options: LocaleNumberCodecOptions): LocaleValueCodec<string> | LocaleValueCodec<number> {
  optionKeys(options, ["locale", "numberingSystem", "allowAsciiDigits", "maximumInputLength", "valueType", "style", "currency", "currencyDisplay", "currencySign", "currencyInput", "grouping", "spaceGrouping", "maximumIntegerDigits", "maximumFractionDigits", "allowNegative", "negativeZero", "integer", "min", "max"]);
  options = Object.freeze({ ...options });
  const profile = digitProfile(options), maximumInput = bound(options.maximumInputLength, 2048, 16, 4096);
  const maximumInteger = bound(options.maximumIntegerDigits, 128, 1, 256), maximumFraction = bound(options.maximumFractionDigits, 100, 0, 1000);
  const grouping = options.grouping ?? "optional", style = options.style ?? "decimal";
  if (options.valueType !== undefined && !["decimal", "number"].includes(options.valueType) || options.allowNegative !== undefined && typeof options.allowNegative !== "boolean" ||
    !["optional", "required", "forbidden"].includes(grouping) || !["decimal", "currency"].includes(style) ||
    options.spaceGrouping !== undefined && !["exact", "space-equivalent"].includes(options.spaceGrouping) ||
    options.currencyInput !== undefined && !["optional", "required"].includes(options.currencyInput) ||
    options.negativeZero !== undefined && !["preserve", "reject"].includes(options.negativeZero) ||
    options.currencyDisplay !== undefined && !["code", "symbol", "narrowSymbol"].includes(options.currencyDisplay) ||
    options.currencySign !== undefined && !["standard", "accounting"].includes(options.currencySign)) fail("invalid-options", "Unsupported locale number policy");
  if (style === "currency" && (typeof options.currency !== "string" || !/^[A-Z]{3}$/.test(options.currency))) fail("invalid-currency", "Declare one uppercase three-letter currency code");
  if (style !== "currency" && (options.currency !== undefined || options.currencySign !== undefined || options.currencyDisplay !== undefined || options.currencyInput !== undefined)) fail("invalid-options", "Currency options require currency style");
  if (options.valueType === "number" && ((options.min !== undefined && !Number.isFinite(options.min)) || (options.max !== undefined && !Number.isFinite(options.max)) ||
    options.min !== undefined && options.max !== undefined && options.min > options.max)) fail("invalid-options", "Invalid numeric bounds");
  if (options.valueType !== "number" && ["integer", "min", "max"].some((key) => Object.hasOwn(options, key)) || options.valueType === "number" && options.integer !== undefined && typeof options.integer !== "boolean") fail("invalid-options", "Numeric bounds require an explicit Number schema");
  const baseOptions: Intl.NumberFormatOptions = { style, minimumFractionDigits: 0, maximumFractionDigits: 0, numberingSystem: profile.numberingSystem,
    ...(style === "currency" ? { currency: options.currency!, currencyDisplay: options.currencyDisplay ?? "symbol", currencySign: options.currencySign ?? "standard" } : {}) };
  const plain = new Intl.NumberFormat(profile.locale, { ...baseOptions, useGrouping: false });
  const grouped = new Intl.NumberFormat(profile.locale, { ...baseOptions, useGrouping: true });
  const positive = affix(plain, 1, ""), negative = affix(plain, -1, "-"), plus = affix(new Intl.NumberFormat(profile.locale, { ...baseOptions, useGrouping: false, signDisplay: "always" }), 1, "+");
  const groupParts = grouped.formatToParts(123456789012345678901234567890n), integers = groupParts.filter((part) => part.type === "integer").map((part) => [...part.value].length);
  const group = groupParts.find((part) => part.type === "group")?.value ?? "";
  const decimal = new Intl.NumberFormat(profile.locale, { numberingSystem: profile.numberingSystem, useGrouping: false, minimumFractionDigits: 1, maximumFractionDigits: 1 }).formatToParts(1.1).find((part) => part.type === "decimal")?.value;
  if (!decimal || decimal === group || groupParts.some((part) => part.type === "group" && part.value !== group)) fail("unsupported-numbering-system", "Unsupported numeric separators");
  const primary = integers.at(-1) ?? 3, secondary = integers.length > 2 ? integers.at(-2)! : primary;
  let minimumGrouping = Infinity; for (let length = 1; length <= 16; length++) if (grouped.formatToParts(BigInt(`1${"0".repeat(length - 1)}`)).some((part) => part.type === "group")) { minimumGrouping = length; break; }
  const spacesEquivalent = options.spaceGrouping === "space-equivalent" && /^[\u0020\u00a0\u202f]$/.test(group);
  const spaces = (value: string) => spacesEquivalent ? value.replace(/[\u0020\u00a0\u202f]/g, " ") : value;
  const decimalSeparator = decimal!;
  const inputGroup = spaces(group), inputDecimal = spaces(decimalSeparator);
  const groupedWhole = (whole: string, separator = group) => {
    if (!separator || whole.length < minimumGrouping) return whole;
    const chunks: string[] = []; let end = whole.length, size = primary;
    while (end > size) { chunks.unshift(whole.slice(end - size, end)); end -= size; size = secondary; } chunks.unshift(whole.slice(0, end)); return chunks.join(separator);
  };
  const validate = (value: string) => {
    if (value.length > maximumInput) fail("input-too-long", "Value exceeds the locale codec input limit");
    const parts = decimalParts(value);
    if (parts.whole.length > maximumInteger || parts.fraction.length > maximumFraction) fail("precision", "Value exceeds the declared digit or decimal-place limit");
    if (parts.sign === "-" && options.allowNegative === false) fail("negative-not-allowed", "Negative values are not allowed in this field");
    if (parts.sign === "-" && !/[1-9]/.test(parts.whole + parts.fraction) && options.negativeZero === "reject") fail("negative-zero", "Negative zero is not allowed in this field");
    return parts;
  };
  const numeric = (canonical: string): number => {
    const value = Number(canonical);
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER || options.valueType === "number" && options.integer && !Number.isSafeInteger(value)) fail("unsafe-number", "Number is outside its finite safe range");
    if (normalizedDecimal(numberDecimal(value)) !== normalizedDecimal(canonical)) fail("precision", "Converting this value to Number would lose decimal digits");
    if (options.valueType === "number" && ((options.min !== undefined && value < options.min) || (options.max !== undefined && value > options.max))) fail("unsafe-number", "Number is outside its allowed range");
    return value;
  };
  const format = (value: string | number): string => {
    if (options.valueType === "number" ? typeof value !== "number" : typeof value !== "string") fail("invalid-input", "Value does not match the declared decimal/Number schema");
    const canonical = typeof value === "number" ? numberDecimal(value) : value, parts = validate(canonical);
    if (options.valueType === "number") numeric(canonical);
    const template = parts.sign === "-" ? negative : parts.sign === "+" ? plus : positive;
    const whole = grouping === "forbidden" ? parts.whole : groupedWhole(parts.whole);
    const output = template.prefix + whole.split(group || "\u0000").map(profile.encode).join(group) + (parts.fraction ? decimalSeparator + profile.encode(parts.fraction) : "") + template.suffix;
    if (output.length > maximumInput) fail("input-too-long", "Formatted value exceeds the locale codec input limit"); return output;
  };
  let templates = [positive, negative, plus];
  if (style === "currency" && options.currencyInput === "optional") {
    const decimalOptions = { style: "decimal", numberingSystem: profile.numberingSystem, useGrouping: false, maximumFractionDigits: 0 } as const;
    const raw = new Intl.NumberFormat(profile.locale, decimalOptions); templates.push(affix(raw, 1, ""), affix(raw, -1, "-"), affix(new Intl.NumberFormat(profile.locale, { ...decimalOptions, signDisplay: "always" }), 1, "+"));
  }
  templates = templates.flatMap((template) => [template, { ...template, prefix: template.prefix.replace(presentation, ""), suffix: template.suffix.replace(presentation, "") }]);
  const unique = new Map(templates.map((template) => [`${template.sign}\u0000${spaces(template.prefix)}\u0000${spaces(template.suffix)}`, { ...template, prefix: spaces(template.prefix), suffix: spaces(template.suffix) }]));
  const parse = (input: unknown): LocaleParseResult<string | number> => parsed(() => {
    if (typeof input !== "string") return fail("invalid-input", "Enter a localized number as text");
    if (input.length > maximumInput) return fail("input-too-long", "Input exceeds the locale codec limit");
    const source = spaces(input), matches = new Set<string>(); let lastError: unknown;
    for (const template of unique.values()) {
      if (!source.startsWith(template.prefix) || !source.endsWith(template.suffix) || source.length <= template.prefix.length + template.suffix.length) continue;
      try {
        const body = source.slice(template.prefix.length, template.suffix.length ? -template.suffix.length : undefined), pieces = body.split(inputDecimal);
        if (pieces.length > 2 || !pieces[0] || pieces.length === 2 && !pieces[1]) fail("invalid-input", "Enter a complete localized decimal value");
        const rawWhole = pieces[0]!, hasGroup = Boolean(inputGroup && rawWhole.includes(inputGroup));
        if (grouping === "forbidden" && hasGroup) fail("invalid-grouping", "Grouping is not allowed in this field");
        const chunks = hasGroup ? rawWhole.split(inputGroup) : [rawWhole]; if (chunks.some((chunk) => !chunk)) fail("invalid-grouping", "Grouping separators are misplaced");
        const fraction = pieces[1] ?? ""; if (inputGroup && fraction.includes(inputGroup)) fail("invalid-grouping", "Grouping is not allowed after the decimal separator");
        // Decode all digits together, so mixing ASCII/local digits across a
        // group or fraction is rejected rather than normalized silently.
        const digits = profile.decode(chunks.join("") + fraction), fractionLength = [...fraction].length;
        const whole = fractionLength ? digits.slice(0, -fractionLength) : digits, canonicalFraction = fractionLength ? digits.slice(-fractionLength) : "";
        const expectedGrouped = groupedWhole(whole, inputGroup);
        if (hasGroup && chunks.map((chunk) => profile.decode(chunk)).join(inputGroup) !== expectedGrouped || grouping === "required" && whole.length >= minimumGrouping && !hasGroup) fail("invalid-grouping", "Use the locale's complete grouping pattern");
        const canonical = template.sign + whole + (canonicalFraction ? `.${canonicalFraction}` : ""); validate(canonical); matches.add(canonical);
      } catch (error) { lastError = error; }
    }
    if (!matches.size) { if (lastError) throw lastError; return fail(style === "currency" ? "invalid-currency" : "invalid-input", "Input does not match the declared locale and currency pattern"); }
    if (matches.size !== 1) return fail("invalid-input", "Input has an ambiguous locale interpretation");
    const canonical = [...matches][0]!; return options.valueType === "number" ? numeric(canonical) : canonical;
  });
  const sample = "1234567".slice(0, Math.min(maximumInteger, 7)) + (maximumFraction && !(options.valueType === "number" && options.integer) ? `.${"12".slice(0, Math.min(maximumFraction, 2))}` : "");
  let example: string | number = sample;
  if (options.valueType === "number") {
    const minimum = options.integer ? Math.ceil(options.min ?? -Number.MAX_SAFE_INTEGER) : options.min ?? -Number.MAX_SAFE_INTEGER;
    const maximum = options.integer ? Math.floor(options.max ?? Number.MAX_SAFE_INTEGER) : options.max ?? Number.MAX_SAFE_INTEGER;
    if (minimum > maximum) fail("invalid-options", "Numeric bounds contain no allowed value");
    example = Math.min(maximum, Math.max(minimum, Number(sample)));
  }
  const codec = Object.freeze({ locale: profile.locale, numberingSystem: profile.numberingSystem, pattern: format(example), format, parse });
  return options.valueType === "number" ? codec as LocaleValueCodec<number> : codec as LocaleValueCodec<string>;
}

export interface LocaleDateCodecOptions extends LocaleCodecOptions {}
function isoDate(value: unknown): { year: string; month: string; day: string } {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail("invalid-date", "Use a four-digit Gregorian year and a calendar date without a time or timezone");
  const [year, month, day] = value.split("-") as [string, string, string], y = Number(year), m = Number(month), d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0), days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > days[m - 1]!) return fail("invalid-date", "Enter a valid Gregorian calendar date");
  return { year, month, day };
}
export function createLocaleDateCodec(options: LocaleDateCodecOptions): LocaleValueCodec<string> {
  optionKeys(options, ["locale", "numberingSystem", "allowAsciiDigits", "maximumInputLength"]);
  options = Object.freeze({ ...options });
  const profile = digitProfile(options, true), maximumInput = bound(options.maximumInputLength, 128, 16, 512);
  const formatter = new Intl.DateTimeFormat(profile.locale, { calendar: "gregory", numberingSystem: profile.numberingSystem, timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" });
  // Only the invariant sample uses Date. Actual user dates are never converted
  // to an instant, UTC or the machine's timezone.
  const parts = formatter.formatToParts(new Date("2006-11-22T12:00:00Z"));
  if (parts.some((part) => !["year", "month", "day", "literal"].includes(part.type)) || ["year", "month", "day"].some((type) => parts.filter((part) => part.type === type).length !== 1)) fail("invalid-options", "Unsupported Gregorian date pattern");
  const names = parts.filter((part) => part.type !== "literal").map((part) => part.type as "year" | "month" | "day");
  const allowedDigits = [...new Set([...profile.digits, ...(options.allowAsciiDigits ? [..."0123456789"] : [])])].map(regexp).join("|");
  const patternFor = (stripPresentation: boolean) => new RegExp("^" + parts.map((part) => part.type === "literal" ? regexp(stripPresentation ? part.value.replace(presentation, "") : part.value) : `((?:${allowedDigits}){${part.type === "year" ? 4 : 2}})`).join("") + "$", "u");
  const patterns = [patternFor(false), patternFor(true)];
  const format = (value: string): string => { const date = isoDate(value); return parts.map((part) => part.type === "literal" ? part.value : profile.encode(date[part.type as keyof typeof date])).join(""); };
  const parse = (input: unknown): LocaleParseResult<string> => parsed(() => {
    if (typeof input !== "string") return fail("invalid-date", "Enter a localized calendar date as text");
    if (input.length > maximumInput) return fail("input-too-long", "Date input exceeds its limit");
    const match = patterns.map((pattern) => pattern.exec(input)).find(Boolean); if (!match) return fail("invalid-date", "Use the displayed date pattern with a four-digit year");
    profile.decode(match.slice(1).join("")); const values = Object.fromEntries(names.map((name, index) => [name, profile.decode(match[index + 1]!)]));
    const canonical = `${values.year}-${values.month}-${values.day}`; isoDate(canonical); return canonical;
  });
  return Object.freeze({ locale: profile.locale, numberingSystem: profile.numberingSystem,
    pattern: parts.map((part) => part.type === "literal" ? part.value : part.type === "year" ? "YYYY" : part.type === "month" ? "MM" : "DD").join(""), format, parse });
}
