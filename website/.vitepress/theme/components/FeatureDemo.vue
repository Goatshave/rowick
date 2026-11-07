<script setup lang="ts">
import { computed } from 'vue';
import type { Framework, Feature } from '../examples/framework-projects';
import { useData, withBase } from 'vitepress';
import { exampleNavigation } from './example-navigation';
import FrameworkPreview from './FrameworkPreview.vue';
import ExampleWorkbench from './ExampleWorkbench.vue';
import catalog from '../../../.generated/catalog.json';
const props = defineProps<{
  feature:
    | 'sorting'
    | 'filtering'
    | 'selection'
    | 'pagination'
    | 'editing'
    | 'columns'
    | 'export';
}>();
const { isDark } = useData();
function sourceFiles(feature: Feature, framework: Framework) {
  return catalog.projects[feature][framework].map((file) => ({
    name: file.name,
    source: catalog.sources[file.sourceKey as keyof typeof catalog.sources],
  }));
}
const sources = computed(
  () =>
    Object.fromEntries(
      (['react', 'vue', 'svelte'] as Framework[]).map((framework) => [
        framework,
        sourceFiles(props.feature, framework),
      ]),
    ) as Record<Framework, { name: string; source: string }[]>,
);
</script>
<template>
  <nav class="example-navigation" aria-label="Feature examples">
    <a :href="withBase('/examples')" class="example-back" aria-label="All examples"
      >Examples</a
    >
    <div class="example-tabs">
      <a
        v-for="example in exampleNavigation"
        :key="example.id"
        :href="withBase(`/examples/${example.id}`)"
        :aria-current="feature === example.id ? 'page' : undefined"
        >{{ example.label }}</a
      >
    </div>
  </nav>
  <ExampleWorkbench :projects="sources" :label="`${feature} example`">
    <template #default="{ framework }"
      ><FrameworkPreview
        :framework="framework"
        :feature="feature"
        :theme="isDark ? 'dark' : 'light'"
    /></template>
  </ExampleWorkbench>
</template>
<style scoped>
.example-navigation {
  display: flex;
  align-items: center;
  gap: 24px;
  margin: 28px 0 20px;
  min-width: 0;
  border-bottom: 1px solid var(--vp-c-divider);
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}
.example-navigation a {
  text-decoration: none;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 22px;
  font-weight: 500;
  white-space: nowrap;
}
.example-back {
  padding-block: 13px;
}
.example-tabs {
  display: flex;
  align-items: stretch;
  gap: 24px;
  overflow-x: auto;
  min-width: 0;
  scrollbar-width: thin;
}
.example-tabs a {
  padding-block: 13px;
  border-bottom: 2px solid transparent;
}
.example-tabs a[aria-current='page'] {
  color: var(--vp-c-text-1);
  border-bottom-color: var(--vp-c-brand-1);
}
.example-tabs a:hover,
.example-back:hover {
  color: var(--vp-c-brand-1);
}
.example-navigation a:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -3px;
}

@media (max-width: 639px) {
  .example-navigation {
    align-items: stretch;
    flex-direction: column;
    gap: 0;
  }
  .example-back {
    padding-bottom: 0;
  }
  .example-tabs {
    gap: 20px;
  }
}
</style>
