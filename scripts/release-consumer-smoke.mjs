import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const scriptDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`Release consumer smoke failed: ${error.message}`);
  process.exit(1);
}

const rootPackage = readJson(join(root, "package.json"));
const version = args.version ?? rootPackage.version;
const workspace = realpathSync(mkdtempSync(join(tmpdir(), "rowick-consumer-smoke-")));
const consumerRoot = join(workspace, "consumer");
const tarballDirectory = args.tarballDir ? resolve(root, args.tarballDir) : join(workspace, "tarballs");
const checks = [];

try {
  if (!isSemver(version)) {
    throw new TypeError(`version must be valid semver; got ${JSON.stringify(version)}`);
  }

  if (!args.tarballDir) {
    run(process.execPath, [
      join(scriptDirectory, "release-stage.mjs"),
      "--version",
      version,
      "--out-dir",
      tarballDirectory,
      "--repository-url",
      "git+https://github.com/Goatshave/rowick.git",
    ]);
    checks.push("stage");
  }

  const tarballs = readTarballs(tarballDirectory, version);
  mkdirSync(join(consumerRoot, "src"), { recursive: true });
  writeConsumerFiles(consumerRoot);
  if (args.upgradeFrom) {
    if (version === args.upgradeFrom) throw new TypeError("upgrade target version must differ from the baseline");
    installBaseline(consumerRoot, args.upgradeFrom); checks.push("upgrade-baseline-install");
  }
  installConsumer(consumerRoot, tarballs);
  checks.push("install");

  run(process.execPath, [
    "--input-type=module",
    "--eval",
    [
      'const { createGrid, createServerMutationCoordinator, createColumnFilterMatcher, createServerSelection } = await import("@rowick/core")',
      'const { readFile } = await import("node:fs/promises")',
      'const coreURL = import.meta.resolve("@rowick/core")',
      'const coreCode = await readFile(new URL(coreURL), "utf8")',
      'const mapName = coreCode.split("//# sourceMappingURL=")[1]?.trim().split(String.fromCharCode(10))[0]',
      'if (!mapName) throw new Error("Installed core source map reference is missing")',
      'const sourceMap = JSON.parse(await readFile(new URL(mapName, coreURL), "utf8"))',
      'if (sourceMap.version !== 3 || !sourceMap.sourcesContent?.some((content) => content.includes("function createGrid"))) throw new Error("Installed core source map is invalid")',
      'const { prepareRowTransaction, commitRowTransaction } = await import("@rowick/data")',
      'const localGrid = createGrid({ data: [{ id: "a", value: 1 }], columns: [{ accessorKey: "value" }], getRowId: (row) => row.id })',
      'const transaction = prepareRowTransaction(localGrid, { update: [{ id: "a", data: { id: "a", value: 2 } }], add: [{ data: { id: "b", value: 3 } }] })',
      'if (localGrid.getOptions().data.length !== 1) throw new Error("Installed transaction preparation mutated source")',
      'commitRowTransaction(localGrid, transaction)',
      'if (localGrid.getCoreRowModel().rows.length !== 2 || localGrid.getCoreRowModel().rowsById.a.getValue("value") !== 2) throw new Error("Installed transaction contract failed")',
      'localGrid.reconcileState()',
      'const remoteGrid = createGrid({ data: [], columns: [], manualPagination: true, hasNextPage: true })',
      'if (remoteGrid.getPageCount() !== -1 || !remoteGrid.getCanNextPage()) throw new Error("Installed unknown-total pagination contract failed")',
      'const saves = createServerMutationCoordinator({ getKey: () => "cell", mutate: (value) => value })',
      'const saved = await saves.run("installed mutation")',
      'if (saved.status !== "success" || saved.data !== "installed mutation") throw new Error("Installed mutation contract failed")',
      'saves.dispose()',
      'if (!createColumnFilterMatcher({ type: "number-range", min: 1, max: 2 })(2)) throw new Error("Installed typed filter contract failed")',
      'const selected = createServerSelection({ query: { status: "Open" }, getQueryKey: (query) => query.status })',
      'selected.selectAllMatching(); selected.setRowSelected("excluded", false)',
      'if (selected.getIsRowSelected("excluded") || !selected.getIsRowSelected("another")) throw new Error("Installed server selection contract failed")',
      'selected.dispose()',
      'await import("@rowick/primitives")',
      'await import("@rowick/virtual")',
      'await import("@rowick/theme/tokens")',
      'await import("@rowick/react")',
      'await import("@rowick/react-ui")',
      'const { createRowEditingController, createRowEditingForm } = await import("@rowick/data/editing")',
      'let record = { id: "a", value: "Installed editing" }',
      'const rowEditor = createRowEditingController({ getRow: () => record, getRowId: (row) => row.id, getValue: (row, column) => row[column], applyValues: (row, values) => ({ ...row, ...values }), accept: (_id, row) => { record = row } })',
      'const editingForm = createRowEditingForm(rowEditor, [{ id: "value", label: "Value", kind: "text" }]); rowEditor.begin("a")',
      'const { createElement } = await import("react"); const { renderToStaticMarkup } = await import("react-dom/server")',
      'const { RowEditingPanel: ReactEditingPanel } = await import("@rowick/react-ui/editing")',
      'if (!renderToStaticMarkup(createElement(ReactEditingPanel, { form: editingForm })).includes("Installed editing")) throw new Error("Installed React editing SSR failed")',
      'await import("@rowick/vue")',
      'await import("@rowick/vue-ui")',
      'const { h, createSSRApp } = await import("vue"); const { renderToString } = await import("vue/server-renderer")',
      'const { RowEditingPanel: VueEditingPanel } = await import("@rowick/vue-ui/editing")',
      'if (!(await renderToString(createSSRApp({ render: () => h(VueEditingPanel, { form: editingForm, idPrefix: "installed-editor" }) }))).includes("Installed editing")) throw new Error("Installed Vue editing SSR failed")',
      'editingForm.setInput("a", "value", "Saved editing"); const edited = await editingForm.save("a")',
      'if (edited.status !== "success" || record.value !== "Saved editing") throw new Error("Installed row editing failed")',
      'editingForm.dispose(); rowEditor.dispose()',
      'await import("@rowick/svelte")',
    ].join(";"),
  ], { cwd: consumerRoot });
  checks.push("esm-imports");

  run("npm", ["exec", "--", "tsc", "--project", "tsconfig.json"], { cwd: consumerRoot });
  checks.push("types");

  run("npm", ["exec", "--", "vite", "build", "--config", "vite.config.mjs"], { cwd: consumerRoot });
  checks.push("svelte-build");

  run("npm", ["exec", "--", "vite", "build", "--config", "vite.config.mjs", "--ssr", "src/SSR.svelte", "--outDir", "ssr-dist"], { cwd: consumerRoot });
  checks.push("svelte-ssr-build");

  run(process.execPath, ["src/features.mjs", args.compatibility], { cwd: consumerRoot });
  checks.push("optional-features-ssr-xlsx");

  const result = { passed: true, version, compatibility: args.compatibility, upgradeFrom: args.upgradeFrom, packageCount: tarballs.length, checks };
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`Release consumer smoke passed for ${tarballs.length} packages at ${version}: ${checks.join(", ")}.`);
} catch (error) {
  const result = {
    passed: false,
    version,
    packageCount: existsSync(tarballDirectory) ? readdirSync(tarballDirectory).filter((name) => name.endsWith(".tgz")).length : 0,
    checks,
    error: formatCommandError(error),
  };
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.error(`Release consumer smoke failed: ${result.error}`);
  process.exitCode = 1;
} finally {
  if (!args.keepTemp) rmSync(workspace, { recursive: true, force: true });
  else console.error(`Consumer smoke workspace retained at ${workspace}`);
}

function parseArgs(argv) {
  const parsed = { json: false, keepTemp: false, tarballDir: undefined, version: undefined, compatibility: "current", upgradeFrom: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--json") parsed.json = true;
    else if (arg === "--keep-temp") parsed.keepTemp = true;
    else if (arg === "--tarball-dir") parsed.tarballDir = requireValue(argv, ++index, "--tarball-dir");
    else if (arg.startsWith("--tarball-dir=")) parsed.tarballDir = requireInlineValue(arg, "--tarball-dir");
    else if (arg === "--version") parsed.version = requireValue(argv, ++index, "--version");
    else if (arg.startsWith("--version=")) parsed.version = requireInlineValue(arg, "--version");
    else if (arg === "--compatibility") parsed.compatibility = requireValue(argv, ++index, "--compatibility");
    else if (arg.startsWith("--compatibility=")) parsed.compatibility = requireInlineValue(arg, "--compatibility");
    else if (arg === "--upgrade-from") parsed.upgradeFrom = requireValue(argv, ++index, "--upgrade-from");
    else if (arg.startsWith("--upgrade-from=")) parsed.upgradeFrom = requireInlineValue(arg, "--upgrade-from");
    else throw new TypeError(`unknown argument ${arg}`);
  }
  if (!["current", "minimum"].includes(parsed.compatibility)) throw new TypeError("--compatibility must be current or minimum");
  if (parsed.upgradeFrom !== undefined && !isSemver(parsed.upgradeFrom)) throw new TypeError("--upgrade-from must be a valid semver version");
  return parsed;
}

function requireValue(argv, index, label) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new TypeError(`${label} requires a value`);
  return value;
}

function requireInlineValue(arg, label) {
  const value = arg.slice(label.length + 1);
  if (!value) throw new TypeError(`${label} requires a value`);
  return value;
}

function readTarballs(directory, expectedVersion) {
  if (!existsSync(directory)) throw new TypeError(`tarball directory does not exist: ${directory}`);
  const files = readdirSync(directory).filter((name) => name.endsWith(".tgz")).sort();
  const expectedPackages = readdirSync(join(root, "packages")).map((directory) => readJson(join(root, "packages", directory, "package.json")))
    .filter((manifest) => !manifest.private).map((manifest) => manifest.name);
  if (files.length !== expectedPackages.length) throw new TypeError(`expected ${expectedPackages.length} staged tarballs, found ${files.length}`);
  const remaining = new Set(expectedPackages);

  return files.map((name) => {
    const tarball = join(directory, name);
    const manifest = JSON.parse(execFileSync("tar", ["-xOf", tarball, "package/package.json"], { encoding: "utf8" }));
    if (!remaining.delete(manifest.name)) throw new TypeError(`unexpected or duplicate staged package ${manifest.name}`);
    if (manifest.version !== expectedVersion) {
      throw new TypeError(`${manifest.name ?? name} version must be ${expectedVersion}, got ${manifest.version}`);
    }
    return tarball;
  });
}

function consumerPeers() {
  return args.compatibility === "minimum" ? [
    "react@18.3.1", "react-dom@18.3.1", "@types/react@18.3.12", "@types/react-dom@18.3.1",
    "vue@3.4.38", "svelte@4.2.20", "typescript@5.7.2", "vite@5.4.21", "@sveltejs/vite-plugin-svelte@3.1.2",
  ] : ["react@19.2.8", "react-dom@19.2.8", "@types/react@19.2.18", "@types/react-dom@19.2.3",
    "vue@3.5.41", "svelte@5.56.8", "typescript@5.9.3", "vite@6.4.3", "@sveltejs/vite-plugin-svelte@5.1.1"];
}

function installBaseline(directory, baseline) {
  const names = readdirSync(join(root, "packages")).map((directory) => readJson(join(root, "packages", directory, "package.json")))
    .filter((manifest) => !manifest.private).map((manifest) => manifest.name);
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock", ...names.map((name) => `${name}@${baseline}`), ...consumerPeers()], { cwd: directory });
  for (const name of names) if (readJson(join(directory, "node_modules", name, "package.json")).version !== baseline) throw new Error(`Baseline ${name} was not installed`);
  run(process.execPath, ["--input-type=module", "--eval", 'const { createGrid } = await import("@rowick/core"); const grid = createGrid({data:[{id:"baseline",name:"Existing record"}],columns:[{accessorKey:"name"}],getRowId:row=>row.id}); if(grid.getCoreRowModel().rows[0].getValue("name")!=="Existing record") throw new Error("Baseline grid failed")'], { cwd: directory });
}

function installConsumer(directory, tarballs) {
  run("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--no-package-lock",
    ...tarballs,
    ...consumerPeers(),
  ], { cwd: directory });
  for (const name of readdirSync(join(directory, "node_modules", "@rowick"))) {
    if (readJson(join(directory, "node_modules", "@rowick", name, "package.json")).version !== version) throw new Error(`Installed ${name} version does not match the staged target`);
  }
}

function writeConsumerFiles(directory) {
  for (const name of ["feature-model.mjs", "features.mjs", "features.tsx", "Features.svelte", "SSR.svelte"]) writeFileSync(join(directory, "src", name), readFileSync(join(scriptDirectory, "fixtures", "release-consumer", name)));
  writeFileSync(join(directory, "package.json"), `${JSON.stringify({ name: "rowick-external-consumer", private: true, type: "module" }, null, 2)}\n`);
  writeFileSync(join(directory, "tsconfig.json"), `${JSON.stringify({
    compilerOptions: {
      strict: true,
      noEmit: true,
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      jsx: "react-jsx",
      skipLibCheck: false,
    },
    include: ["src/consumer.tsx", "src/features.tsx"],
  }, null, 2)}\n`);
  writeFileSync(join(directory, "src", "consumer.tsx"), `
import { createColumnHelper, createGrid, createServerMutationCoordinator, createServerSelection, type CellContext, type CellEditorContext, type ServerMutationState, type TypedColumnFilterValue } from "@rowick/core";
import { prepareRowTransaction, commitRowTransaction, type RowTransaction } from "@rowick/data";
import { createRowEditingController, createRowEditingForm } from "@rowick/data/editing";
import { RowEditingPanel as ReactEditingPanel } from "@rowick/react-ui/editing";
import { createRowEditingPanel } from "@rowick/vue-ui/editing";
import type { RowEditingPanelProps as SvelteEditingProps } from "@rowick/svelte-ui/editing";
import { getGridProps } from "@rowick/primitives";
import { DataGrid as ReactDataGrid, parseGridPreferences, type GridPreferencesMigration } from "@rowick/react-ui";
import { createSvelteDataGridRenderer, type DataGridProps as SvelteDataGridProps } from "@rowick/svelte-ui";
import { createRowickThemeStyle } from "@rowick/theme/tokens";
import { createDataGrid, type DataGridProps as VueDataGridProps } from "@rowick/vue-ui";

interface Row { id: string; name: string }
const rows: Row[] = [{ id: "1", name: "Installed" }];
const editing = createRowEditingController<Row>({ getRow: (id) => rows.find((row) => row.id === id), getRowId: (row) => row.id,
  getValue: (row, column) => row[column as keyof Row], applyValues: (row, values) => ({ ...row, ...values }), accept: () => {} });
const editingForm = createRowEditingForm(editing, [{ id: "name", label: "Name", kind: "text" }]);
export const reactEditor = <ReactEditingPanel form={editingForm} />;
export const VueEditor = createRowEditingPanel<Row>();
export const svelteEditorProps: SvelteEditingProps<Row> = { form: editingForm, idPrefix: "installed-editor" };
const column = createColumnHelper<Row>();
const columns = [column.accessor("name", { header: "Name" })];
const grid = createGrid({ columns, data: rows, getRowId: (row) => row.id });
const transaction: RowTransaction<Row> = { add: [{ data: { id: "2", name: "Added" } }] };
commitRowTransaction(grid, prepareRowTransaction(grid, transaction));
grid.reconcileState();
const remoteGrid = createGrid({ columns, data: rows, manualPagination: true, hasNextPage: true, hasPreviousPage: false });
getGridProps(remoteGrid);
export const typedFilter: TypedColumnFilterValue = { type: "set", values: ["Installed"] };
createServerSelection({ query: { filter: typedFilter }, getQueryKey: (query) => JSON.stringify(query) });
const saves = createServerMutationCoordinator<string, Row, Row>({ getKey: (row) => row.id, mutate: (row) => Promise.resolve(row) });
export const saveState: ServerMutationState<Row, Row> = saves.getState("1");
getGridProps(grid, { ariaLabel: "External consumer" });
createRowickThemeStyle({ accent: "#087f5b" });
const migrations: readonly GridPreferencesMigration[] = [{ fromVersion: 0, toVersion: 1, migrate: () => ({ version: 1, density: "standard", state: {} }) }];
parseGridPreferences('{"version":0}', { migrations });
export const reactGrid = <ReactDataGrid columns={columns} data={rows} getRowId={(row) => row.id} localization={{ noRows: "No external rows", pageStatusUnknown: (page) => "Page " + page }} renderToolbar={({ rows }) => <span>{rows.length}</span>} renderCell={({ value }) => <strong>{String(value)}</strong>} renderEditor={(context) => <button onClick={() => context.commit(context.value)}>Save</button>} />;
export const VueGrid = createDataGrid<Row>();
export const vueGridProps: VueDataGridProps<Row> = { options: { columns, data: rows, getRowId: (row) => row.id }, localization: { noRows: "No external rows" }, renderToolbar: ({ rows }) => String(rows.length), renderCell: ({ value }) => String(value), renderEditor: (context) => context.isActive() ? String(context.value) : null };
export const svelteGridProps: SvelteDataGridProps<Row> = { options: { columns, data: rows, getRowId: (row) => row.id }, localization: { noRows: "No external rows" }, renderCell: createSvelteDataGridRenderer<CellContext<Row, unknown>>({}), renderEditor: createSvelteDataGridRenderer<CellEditorContext<Row>>({}) };
`);
  writeFileSync(join(directory, "index.html"), '<div id="app"></div><script type="module" src="/src/main.ts"></script>\n');
  writeFileSync(join(directory, "src", "main.ts"), args.compatibility === "minimum" ? 'import App from "./App.svelte"; new App({ target: document.getElementById("app")! });\n' : 'import App from "./App.svelte"; import { mount } from "svelte"; mount(App, { target: document.getElementById("app")! });\n');
  writeFileSync(join(directory, "src", "App.svelte"), `<script lang="ts">
  import { createColumnHelper, type GridOptions } from "@rowick/core";
  import DataGrid from "@rowick/svelte-ui/DataGrid.svelte";
  import { RowEditingPanel } from "@rowick/svelte-ui/editing";
  import { createRowEditingController, createRowEditingForm } from "@rowick/data/editing";
  import Features from "./Features.svelte";
  import "@rowick/theme/css";
  import "@rowick/svelte-ui/css";
  import "@rowick/svelte-ui/editing.css";
  interface Row { id: string; name: string }
  const column = createColumnHelper<Row>();
  let record: Row = { id: "a", name: "Installed editing" };
  const editing = createRowEditingController<Row>({ getRow: () => record, getRowId: (row) => row.id, getValue: (row) => row.name,
    applyValues: (row, values) => ({ ...row, ...values }), accept: (_id, row) => { record = row; } });
  const form = createRowEditingForm(editing, [{ id: "name", label: "Name", kind: "text" }]);
  editing.begin("a");
  const options: GridOptions<Row> = {
    columns: [column.accessor("name", { header: "Name", filterType: "set", filterOptions: [{ value: "Installed" }] })],
    data: [{ id: "1", name: "Installed" }],
    getRowId: (row) => row.id,
  };
</script>
<DataGrid ariaLabel="External Svelte consumer" localization={{ noRows: "No external rows" }} columnFilterControls renderEmptyState={({ visibleColumns }) => \`No rows in \${visibleColumns.length} columns\`} {options} />
<RowEditingPanel {form} idPrefix="installed-editor" />
<Features />
`);
  writeFileSync(join(directory, "vite.config.mjs"), `
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
export default { root: ${JSON.stringify(directory)}, plugins: [svelte({ preprocess: vitePreprocess() })], ssr: { external: ["svelte"], noExternal: ["@rowick/svelte-ui"] }, build: { outDir: "dist", emptyOutDir: true } };
`);
}

function run(command, commandArgs, options = {}) {
  execFileSync(command, commandArgs, { cwd: options.cwd ?? root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isSemver(value) {
  return typeof value === "string" && /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

function formatCommandError(error) {
  if (!(error instanceof Error)) return String(error);
  const stdout = typeof error.stdout === "string" ? error.stdout.trim() : "";
  const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";
  const detail = [stdout, stderr].filter(Boolean).join("\n");
  return detail ? `${error.message}\n${detail}` : error.message;
}
