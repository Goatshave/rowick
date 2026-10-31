type LocaleInputErrorCode = "unsupported-locale" | "unsupported-numbering-system" | "invalid-options" | "invalid-input" | "invalid-grouping" | "invalid-currency" | "input-too-long" | "precision" | "unsafe-number" | "negative-not-allowed" | "negative-zero" | "invalid-date";
declare class LocaleCodecError extends TypeError {
    readonly code: LocaleInputErrorCode;
    constructor(code: LocaleInputErrorCode, message: string);
}
type LocaleParseResult<T> = {
    readonly valid: true;
    readonly value: T;
} | {
    readonly valid: false;
    readonly code: LocaleInputErrorCode;
    readonly message: string;
};
interface LocaleValueCodec<T> {
    readonly locale: string;
    readonly numberingSystem: string;
    readonly pattern: string;
    readonly format: (value: T) => string;
    readonly parse: (input: unknown) => LocaleParseResult<T>;
}
interface LocaleCodecOptions {
    locale: string;
    numberingSystem?: string;
    allowAsciiDigits?: boolean;
    maximumInputLength?: number;
}
interface LocaleDecimalOptions extends LocaleCodecOptions {
    valueType?: "decimal";
    style?: "decimal" | "currency";
    currency?: string;
    currencyDisplay?: "code" | "symbol" | "narrowSymbol";
    currencySign?: "standard" | "accounting";
    currencyInput?: "required" | "optional";
    grouping?: "optional" | "required" | "forbidden";
    spaceGrouping?: "exact" | "space-equivalent";
    maximumIntegerDigits?: number;
    maximumFractionDigits?: number;
    allowNegative?: boolean;
    negativeZero?: "preserve" | "reject";
}
interface LocaleNumericOptions extends Omit<LocaleDecimalOptions, "valueType"> {
    valueType: "number";
    integer?: boolean;
    min?: number;
    max?: number;
}
type LocaleNumberCodecOptions = LocaleDecimalOptions | LocaleNumericOptions;
declare function createLocaleNumberCodec(options: LocaleDecimalOptions): LocaleValueCodec<string>;
declare function createLocaleNumberCodec(options: LocaleNumericOptions): LocaleValueCodec<number>;
interface LocaleDateCodecOptions extends LocaleCodecOptions {
}
declare function createLocaleDateCodec(options: LocaleDateCodecOptions): LocaleValueCodec<string>;

export { LocaleCodecError, type LocaleDateCodecOptions, type LocaleInputErrorCode, type LocaleNumberCodecOptions, type LocaleParseResult, type LocaleValueCodec, createLocaleDateCodec, createLocaleNumberCodec };
