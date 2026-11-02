<script setup lang="ts">
import { computed, ref } from "vue";
import { withBase } from "vitepress";

type Framework = "React" | "Vue" | "Svelte";
const selected = ref<Framework>("React");
const frameworks: Framework[] = ["React", "Vue", "Svelte"];
const examples: Record<Framework, { filename: string; lines: string[] }> = {
  React: {
    filename: "PeopleGrid.tsx",
    lines: [
      "import '@rowick/theme/css';",
      "import '@rowick/react-ui/css';",
      "import { createColumnHelper, DataGrid }",
      "  from '@rowick/react-ui';",
      "",
      "type Person = { id: string; name: string };",
      "const column = createColumnHelper<Person>();",
      "const data = [{ id: 'p1', name: 'Mina' }];",
      "const columns = [",
      "  column.accessor('name', { header: 'Name' }),",
      "];",
      "",
      "export function PeopleGrid() {",
      "  return <DataGrid",
      "    data={data} columns={columns}",
      "    getRowId={(row) => row.id}",
      "  />;",
      "}",
    ],
  },
  Vue: {
    filename: "PeopleGrid.vue",
    lines: [
      '<script setup lang="ts">',
      "import '@rowick/theme/css';",
      "import '@rowick/vue-ui/css';",
      "import { createColumnHelper, createDataGrid }",
      "  from '@rowick/vue-ui';",
      "",
      "type Person = { id: string; name: string };",
      "const column = createColumnHelper<Person>();",
      "const DataGrid = createDataGrid<Person>();",
      "const options = {",
      "  data: [{ id: 'p1', name: 'Mina' }],",
      "  columns: [column.accessor('name', { header: 'Name' })],",
      "  getRowId: (row: Person) => row.id,",
      "};",
      "</" + "script>",
      "",
      "<template>",
      "  <DataGrid :options=\"options\" />",
      "</template>",
    ],
  },
  Svelte: {
    filename: "PeopleGrid.svelte",
    lines: [
      '<script lang="ts">',
      "  import '@rowick/theme/css';",
      "  import '@rowick/svelte-ui/css';",
      "  import { createColumnHelper, DataGrid }",
      "    from '@rowick/svelte-ui';",
      "",
      "  type Person = { id: string; name: string };",
      "  const column = createColumnHelper<Person>();",
      "  const options = {",
      "    data: [{ id: 'p1', name: 'Mina' }],",
      "    columns: [column.accessor('name', { header: 'Name' })],",
      "    getRowId: (row: Person) => row.id,",
      "  };",
      "</" + "script>",
      "",
      "<DataGrid {options} />",
    ],
  },
};
const example = computed(() => examples[selected.value]);
const command = computed(() => "npm install @rowick/" + selected.value.toLowerCase() + "-ui @rowick/theme");
const message = ref("");
async function copy(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    message.value = label + " copied";
  } catch {
    message.value = "Select the text to copy it.";
  }
}
</script>

<template>
  <div class="quickstart-panel">
    <div class="code-frameworks" role="group" aria-label="Quick start framework"><button v-for="framework in frameworks" :key="framework" type="button" :aria-pressed="selected === framework" :class="{ active: selected === framework }" @click="selected = framework; message = ''">{{ framework }}</button><a :href="withBase('/' + selected.toLowerCase() + '-ui')" :aria-label="selected + ' integration guide'"><span>Guide</span> ↗</a></div>
    <div class="code-install"><span aria-hidden="true">$</span><code>{{ command }}</code><button type="button" aria-label="Copy install command" @click="copy(command, 'Install command')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg></button></div>
    <div class="code-file"><span><span class="file-dot" aria-hidden="true"></span>{{ example.filename }}</span><button type="button" @click="copy(example.lines.join('\n'), 'Code')">Copy code <span aria-hidden="true">⧉</span></button></div>
    <pre class="quickstart-code"><code><span v-for="(line, index) in example.lines" :key="index" class="code-line" :class="{'code-line-import': line.includes('@rowick/')}"><span class="line-number" aria-hidden="true">{{ index + 1 }}</span><span>{{ line || ' ' }}</span>{{ '\n' }}</span></code></pre>
    <div class="code-footer"><span>Published packages · v0.1.0</span><span role="status" aria-live="polite">{{ message || 'TypeScript ready' }}</span></div>
  </div>
</template>
