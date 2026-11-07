export type Framework = 'react' | 'vue' | 'svelte';
export type Feature =
  | 'sorting'
  | 'filtering'
  | 'selection'
  | 'pagination'
  | 'editing'
  | 'columns'
  | 'export';
export type SourceFile = { name: string; source: string };
export type ExampleAssets = {
  model: string;
  editor: string;
  styles: string;
  editorStyles: string;
  helpers: string;
  controls: string;
  theme: string;
  grid: string;
  templates: Record<string, string>;
};
function markup(framework: Framework) {
  const vue = framework === 'vue',
    react = framework === 'react';
  const className = react ? 'className' : 'class';
  const prop = (name: string, value: string) =>
    vue ? `:${name}="${value}"` : `${name}={${value}}`;
  const event = (name: string, expression: string) =>
    vue
      ? `@${name}="${expression}"`
      : `${react ? ({ click: 'onClick', input: 'onChange', change: 'onChange' } as const)[name as 'click' | 'input' | 'change'] : 'on' + name}={${expression.includes('event.') ? 'event' : '()'} => ${expression}}`;
  const value = vue
    ? '($event.target as HTMLInputElement).value'
    : 'event.currentTarget.value';
  const checked = vue
    ? '($event.target as HTMLInputElement).checked'
    : 'event.currentTarget.checked';
  const text = (value: string) => (vue ? `{{${value}}}` : `{${value}}`);
  const button = (label: string, expression: string, attributes = '') =>
    `<button ${attributes} ${event('click', expression)}>${label}</button>`;
  const check = (label: string, property: string, expression: string, extra = '') =>
    `<label class="sample-check"><input type="checkbox" ${className}="rowick-checkbox" ${prop('checked', property)} ${extra} ${event('change', expression)}/>${label}</label>`.replace(
      'class="sample-check"',
      `${className}="sample-check"`,
    );
  function toolbar(feature: Feature) {
    if (feature === 'sorting')
      return (
        button(
          'Highest score first',
          "model.sort('score')",
          prop('aria-pressed', "state.sortPreset==='score'"),
        ) +
        button(
          'Team, then score',
          "model.sort('team')",
          prop('aria-pressed', "state.sortPreset==='team'"),
        ) +
        button('Clear sorting', "model.sort('')", `${className}="sample-quiet"`)
      );
    if (feature === 'filtering' || feature === 'export')
      return (
        `<label ${className}="sample-search">Search<input type="search" placeholder="Search people…" ${prop('value', 'state.search')} ${event('input', `model.filter('search',${value})`)}/></label><label>Team<select ${prop('value', 'state.team')} ${event('change', `model.filter('team',${value})`)}><option value="">All teams</option><option>Design</option><option>Engineering</option><option>Product</option></select></label>` +
        (feature === 'filtering'
          ? `<label>Minimum score<input type="number" min="0" max="100" placeholder="Any" ${prop('value', 'state.minimum')} ${event('input', `model.filter('minimum',${value})`)}/></label>`
          : button('Preview CSV', 'model.previewCsv()') +
            button(
              'Download CSV',
              'model.download()',
              `${className}="sample-primary" ${prop('disabled', '!state.count')}`,
            ))
      );
    if (feature === 'selection') {
      const mixed = vue
        ? prop('indeterminate', 'state.some && !state.all')
        : react
          ? 'ref={element=>{if(element)element.indeterminate=state.some && !state.all;}}'
          : 'use:mixed={state.some && !state.all}';
      return (
        check(
          'Select current page',
          'state.all',
          `model.selectPage(${checked})`,
          mixed,
        ) +
        button(
          'Clear selection',
          'model.clearSelection()',
          `${className}="sample-quiet" ${prop('disabled', '!state.selected.length')}`,
        ) +
        `<span>${text('state.selected.length')} selected</span>`
      );
    }
    if (feature === 'pagination')
      return `<label>Rows per page<select ${prop('value', 'state.size')} ${event('change', `model.pageSize(Number(${value}))`)}>${[2, 4, 8].map((size) => `<option ${prop('value', String(size))}>${size}</option>`).join('')}</select></label>`;
    if (feature === 'editing')
      return (
        `<span>Double-click to edit · Enter or Tab to save · Esc to cancel</span>` +
        button('Edit first row', 'model.editFirst()', `${className}="sample-primary"`)
      );
    return (
      check('Show score', 'state.scoreVisible', `model.showScore(${checked})`) +
      check('Pin name to left', 'state.namePinned', `model.pinName(${checked})`)
    );
  }
  const pager = `<div>${button('←', 'model.previous()', `aria-label="Previous page" ${prop('disabled', '!state.previous')}`)}<span>Page ${text('state.count?state.page+1:0')} / ${text('state.count?state.pages:0')}</span>${button('→', 'model.next()', `aria-label="Next page" ${prop('disabled', '!state.next')}`)}</div>`;
  return { toolbar, pager };
}
export function createExampleProject(
  framework: Framework,
  feature: Feature,
  assets: ExampleAssets,
): SourceFile[] {
  const extension =
    framework === 'react' ? 'tsx' : framework === 'vue' ? 'vue' : 'svelte';
  const templateKey = `App.${framework === 'react' ? 'react.tsx' : framework}.txt`;
  let source = assets.templates[templateKey]!;
  const selection = feature === 'selection',
    editing = feature === 'editing';
  const component = selection ? 'RowCheckbox' : editing ? 'CellEditor' : '';
  const componentFile =
    framework === 'react'
      ? `${component}.react.tsx.txt`
      : `${component}.${framework}.txt`;
  const imports = component
    ? `import ${component} from './${component}${framework === 'react' ? '' : '.' + extension}';${editing ? "\nimport './styles/editor.css';" : ''}`
    : '';
  let props = '',
    functions = '';
  if (selection) {
    if (framework === 'react')
      props = `renderCell={context=>context.column.id==='id'?<RowCheckbox context={context} selected={state.selected.includes(context.row.id)}/>:String(context.value??'')}`;
    else if (framework === 'vue') {
      props = ':render-cell="renderCell"';
      functions =
        "function renderCell(context:CellContext<Person,unknown>){return context.column.id==='id'?h(RowCheckbox,{context,selected:state.value.selected.includes(context.row.id)}):String(context.value??'');}";
    } else {
      props =
        "renderCell={context=>context.column.id==='id'?createSvelteDataGridRenderer(RowCheckbox,{selected:state.selected.includes(context.row.id)})(context):String(context.value??'')}";
      functions =
        'function mixed(element:HTMLInputElement,value:boolean){element.indeterminate=value;return{update(next:boolean){element.indeterminate=next;}};}';
    }
  }
  if (editing) {
    if (framework === 'react')
      props =
        'renderEditor={context=><CellEditor key={`${context.row.id}:${context.column.id}`} context={context} onValidation={model.setError}/>}';
    else if (framework === 'vue') {
      props = ':render-editor="renderEditor"';
      functions =
        'function renderEditor(context:CellEditorContext<Person>){return h(CellEditor,{key:`${context.row.id}:${context.column.id}`,context,onValidation:model.setError});}';
    } else {
      props = 'renderEditor={editorRenderer}';
      functions =
        'const editorRenderer=createSvelteDataGridRenderer(CellEditor,{onValidation:model.setError});';
    }
  }
  const ui = markup(framework);
  const replacements: Record<string, string> = {
    FEATURE: feature,
    TOOLBAR: ui.toolbar(feature),
    PAGER: ['selection', 'pagination', 'export'].includes(feature) ? ui.pager : '',
    FOOTER_NOTE: editing
      ? 'Double-click to edit · ID is read-only'
      : 'Local sample data',
    INSPECT_LABEL: editing ? 'Inspect saved data' : 'Inspect grid state',
    RENDER_IMPORTS: imports,
    RENDER_PROPS: props,
    RENDER_FUNCTIONS: functions,
  };
  for (const [key, value] of Object.entries(replacements))
    source = source.replaceAll(`__${key}__`, value);
  const main =
    framework === 'react'
      ? "import {createRoot} from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('app')!).render(<App/>);"
      : framework === 'vue'
        ? "import {createApp} from 'vue';\nimport App from './App.vue';\ncreateApp(App).mount('#app');"
        : "import {mount} from 'svelte';\nimport App from './App.svelte';\nmount(App,{target:document.getElementById('app')!});";
  return [
    { name: `src/App.${extension}`, source },
    { name: `src/main.${framework === 'react' ? 'tsx' : 'ts'}`, source: main },
    { name: 'src/model.ts', source: assets.model },
    {
      name: 'src/people.ts',
      source: assets.helpers.replace("from '@rowick/vue-ui'", "from '@rowick/core'"),
    },
    ...(component
      ? [
          {
            name: `src/${component}.${extension}`,
            source: assets.templates[componentFile]!,
          },
        ]
      : []),
    ...(editing
      ? [
          { name: 'src/inline-editor.ts', source: assets.editor },
          { name: 'src/styles/editor.css', source: assets.editorStyles },
        ]
      : []),
    {
      name: 'src/theme.ts',
      source:
        "export const theme:'light'|'dark'=new URLSearchParams(window.location.search).get('theme')==='dark'?'dark':'light';",
    },
    { name: 'src/styles/example.css', source: assets.styles },
    {
      name: 'src/styles/controls.css',
      source: assets.controls
        .replaceAll('.fx', '.sample')
        .replaceAll('.rowick-demo', '.sample'),
    },
    { name: 'src/styles/rowick-theme.css', source: assets.theme },
    { name: 'src/styles/rowick-grid.css', source: assets.grid },
  ];
}
