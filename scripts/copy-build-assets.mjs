import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sharedStyles = ['index', 'editing', 'filtering', 'analytics', 'layout'];
const components = ['DataGrid', 'RenderValue', 'ColumnFilter', 'RowEditingPanel', 'ServerDataPanel', 'AnalyticsPanel', 'LayoutGrid', 'FilterPanel'];
const declarations = ['DataGrid', 'RowEditingPanel', 'ServerDataPanel', 'AnalyticsPanel', 'LayoutGrid', 'FilterPanel'];
const styles = (source, names) => names.map(name => [source + '/' + name + '.css', name + '.css']);
const assets = {
  theme: [['src/index.css', 'index.css']],
  'react-ui': styles('src', [...sharedStyles, 'virtual']),
  'vue-ui': styles('../react-ui/src', sharedStyles),
  'svelte-ui': [
    ...styles('../react-ui/src', sharedStyles),
    ...components.map(name => ['src/' + name + '.svelte', name + '.svelte']),
    ...declarations.map(name => ['src/' + name + '.svelte.d.ts', name + '.svelte.d.ts']),
  ],
};

export function copyBuildAssets(name, packagesRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../packages')) {
  if (!Object.hasOwn(assets, name)) throw new Error('Unknown package asset set: ' + name);
  const directory = join(packagesRoot, name);
  mkdirSync(join(directory, 'dist'), { recursive: true });
  for (const [source, destination] of assets[name]) {
    copyFileSync(join(directory, source), join(directory, 'dist', destination));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  copyBuildAssets(process.argv[2]);
}
