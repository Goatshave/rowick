import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const website = path.join(root, 'website');
const require = createRequire(path.join(website, 'package.json'));
const generated = path.join(website, '.generated');
const publicDir = path.join(generated, 'public');
const sourceDir = path.join(website, '.vitepress/theme');
const compiled = ts.transpileModule(
  await fs.readFile(path.join(sourceDir, 'examples/framework-projects.ts'), 'utf8'),
  {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  },
).outputText;
const { createExampleProject } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
const read = (file) => fs.readFile(path.join(root, file), 'utf8');
const assets = Object.fromEntries(
  await Promise.all(
    Object.entries({
      model: 'website/.vitepress/theme/examples/example-model.ts',
      editor: 'website/.vitepress/theme/examples/inline-editor.ts',
      styles: 'website/.vitepress/theme/examples/example.css',
      editorStyles: 'website/.vitepress/theme/examples/editor.css',
      helpers: 'website/.vitepress/theme/examples/people.ts',
      controls: 'website/.vitepress/theme/demo-controls.css',
      theme: 'packages/theme/src/index.css',
      grid: 'packages/react-ui/src/index.css',
    }).map(async ([key, file]) => [key, await read(file)]),
  ),
);
const templatesDir = path.join(sourceDir, 'examples/templates');
assets.templates = Object.fromEntries(
  await Promise.all(
    (await fs.readdir(templatesDir)).map(async (name) => [
      name,
      await fs.readFile(path.join(templatesDir, name), 'utf8'),
    ]),
  ),
);
const prettierModule = await import(require.resolve('prettier'));
const prettier = prettierModule.default ?? prettierModule;
const svelteFormatterModule = await import(require.resolve('prettier-plugin-svelte'));
const svelteFormatter = svelteFormatterModule.default ?? svelteFormatterModule;
const formatCache = new Map();
const catalog = { projects: {}, sources: {} };
async function formatFile(file) {
  const parser = file.name.endsWith('.svelte')
    ? 'svelte'
    : file.name.endsWith('.vue')
      ? 'vue'
      : file.name.endsWith('.css')
        ? 'css'
        : 'typescript';
  const key = parser + ':' + file.source;
  if (!formatCache.has(key))
    formatCache.set(
      key,
      await prettier.format(file.source, {
        parser,
        plugins: parser === 'svelte' ? [svelteFormatter] : [],
        tabWidth: 2,
        useTabs: false,
        vueIndentScriptAndStyle: true,
        singleQuote: true,
        printWidth: 88,
      }),
    );
  return { ...file, source: formatCache.get(key) };
}
await fs.mkdir(publicDir, { recursive: true });
await fs.cp(path.join(root, 'assets/brand'), publicDir, { recursive: true });
const { build } = await import(require.resolve('vite'));
const features = [
  'sorting',
  'filtering',
  'selection',
  'pagination',
  'editing',
  'columns',
  'export',
];
// This host code only measures the embedded app. All UI files come from the
// same catalog used by the code viewer; no preview-only UI is injected.
const host = `
const report = () => {
  if (document.body.clientWidth === 0) return;
  parent.postMessage({type:'rowick-example-size',height:Math.ceil(document.body.getBoundingClientRect().height)}, location.origin);
};
new ResizeObserver(report).observe(document.body);
addEventListener('load', report);
`;
for (const framework of ['react', 'vue', 'svelte']) {
  const projectRoot = path.join(generated, 'sources', framework);
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, 'package.json'),
    JSON.stringify({ name: `rowick-${framework}-previews`, type: 'module' }),
  );
  // Resolve package imports using the documentation's pinned dependencies.
  const linked = path.join(projectRoot, 'node_modules');
  try {
    await fs.symlink(path.join(website, 'node_modules'), linked, 'dir');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const entries = {};
  for (const feature of features) {
    const dir = path.join(projectRoot, feature);
    await fs.rm(dir, { recursive: true, force: true });
    const files = await Promise.all(
      createExampleProject(framework, feature, assets).map(formatFile),
    );
    catalog.projects[feature] ??= {};
    catalog.projects[feature][framework] = files.map((file) => {
      const sourceKey = createHash('sha256').update(file.source).digest('hex');
      catalog.sources[sourceKey] = file.source;
      return { name: file.name, sourceKey };
    });
    for (const file of files) {
      const target = path.join(dir, file.name);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, file.source);
    }
    await fs.writeFile(path.join(dir, 'preview-host.js'), host);
    entries[feature] = path.join(dir, 'index.html');
    await fs.writeFile(
      entries[feature],
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rowick ${framework} ${feature} example</title><style>html,body{margin:0;padding:0;background:transparent}body{overflow-x:hidden}</style></head><body><div id="app"></div><script type="module" src="./src/main.${framework === 'react' ? 'tsx' : 'ts'}"></script><script type="module" src="./preview-host.js"></script></body></html>`,
    );
  }
  if (framework === 'react') {
    const roots = features.flatMap((feature) =>
      ['App.tsx', 'main.tsx', 'model.ts', 'people.ts', 'theme.ts'].map((file) =>
        path.join(projectRoot, feature, 'src', file),
      ),
    );
    const options = {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'],
    };
    const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(roots, options));
    if (diagnostics.length)
      throw new Error(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCurrentDirectory: () => root,
          getCanonicalFileName: (file) => file,
          getNewLine: () => '\n',
        }),
      );
  }
  const plugin =
    framework === 'vue'
      ? (await import(require.resolve('@vitejs/plugin-vue'))).default
      : framework === 'react'
        ? (await import(require.resolve('@vitejs/plugin-react'))).default
        : (await import(require.resolve('@sveltejs/vite-plugin-svelte'))).svelte;
  await build({
    root: projectRoot,
    configFile: false,
    base: './',
    plugins: [plugin()],
    logLevel: 'warn',
    resolve: { dedupe: framework === 'react' ? ['react', 'react-dom'] : [framework] },
    build: {
      outDir: path.join(publicDir, 'playground', framework),
      emptyOutDir: true,
      rollupOptions: { input: entries },
    },
  });
  console.log(`Built ${features.length} ${framework} documentation examples.`);
}

await fs.writeFile(path.join(generated, 'catalog.json'), JSON.stringify(catalog));
