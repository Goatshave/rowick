import { useEffect, useState } from "react";
import { DataGrid } from "@rowick/react-ui";
import { RowEditingPanel } from "@rowick/react-ui/editing";
import "@rowick/react-ui/editing.css";
import { createLocaleExample, localeExampleLocales, type LocaleExample } from "@rowick/example-shared-server/locale-client";
export default function Locale() {
  const [example, setExample] = useState<LocaleExample>(), [, redraw] = useState(0);
  useEffect(() => { const session = createLocaleExample(), stop = session.subscribe(() => redraw((value) => value + 1)); setExample(session); return () => { stop(); session.dispose(); }; }, []);
  if (!example) return <main><h1>Locale input</h1></main>;
  const samples = example.getSamples();
  return <main dir={example.getDirection()} style={{ padding: 24, overflowWrap: "anywhere" }}><h1>Locale input</h1><p>Explicit locale parsing preserves exact canonical values. Composition events here are automated fixtures; real OS IME checks remain separate.</p>
    <label htmlFor="locale-picker">Locale</label><select id="locale-picker" value={example.getLocale()} onChange={(event) => { example.setLocale(event.currentTarget.value); event.currentTarget.value = example.getLocale(); }}>{localeExampleLocales.map((locale) => <option key={locale} value={locale}>{locale}</option>)}</select>
    <button type="button" onClick={example.edit}>Edit record</button><button type="button" onClick={() => example.setLocale("zz-ZZ")}>Try unsupported locale</button>
    <p role="status" aria-label="Locale result">{example.getMessage()}</p>
    <output aria-label="Decimal sample">{samples.decimal}</output><output aria-label="Money sample">{samples.money}</output><output aria-label="Number sample">{samples.number}</output><output aria-label="Date sample">{samples.date}</output>
    <output aria-label="Large decimal sample">{samples.largeDecimal}</output><output aria-label="Large money sample">{samples.largeMoney}</output>
    <p>Calendar pattern: <bdi>{samples.datePattern}</bdi></p><p><bdi>{example.getProjectedRows()[0]?.name}</bdi></p>
    <DataGrid ariaLabel="Locale records" data={example.getProjectedRows()} columns={example.getColumns()} getRowId={(row) => row.id} style={{ height: "200px" }} />
    <output aria-label="Canonical accepted values"><bdi dir="ltr">{JSON.stringify(example.getRows())}</bdi></output>
    <RowEditingPanel form={example.getForm()} labels={example.getLabels()} />
  </main>;
}
