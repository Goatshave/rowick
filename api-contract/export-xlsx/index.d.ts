import { AnalyticsExporter } from '@rowick/data/analytics';

interface XlsxExporterOptions {
    readonly filename?: string;
    readonly sheetName?: string;
    readonly maxBytes?: number;
    readonly maxCells?: number;
    readonly freezeHeaders?: boolean;
}
/** Typed OOXML workbook; never emits formulas, links, macros, external relationships or embedded objects. */
declare function createXlsxExporter(options?: XlsxExporterOptions): AnalyticsExporter;

export { type XlsxExporterOptions, createXlsxExporter };
