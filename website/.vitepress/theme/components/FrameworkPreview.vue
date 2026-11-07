<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { withBase } from 'vitepress';
import type { Feature, Framework } from '../examples/framework-projects';
const props = defineProps<{
  framework: Framework;
  feature: Feature;
  theme: 'light' | 'dark';
}>();
const visited = ref<Framework[]>([props.framework]);
const frames = new Map<Framework, HTMLIFrameElement>();
const heights = ref<Partial<Record<Framework, number>>>({});
const ready = ref<Partial<Record<Framework, boolean>>>({});
const names = { react: 'React', vue: 'Vue', svelte: 'Svelte' };
function heightFor(framework: Framework) {
  return heights.value[framework] ?? 520;
}
const currentHeight = computed(() => heightFor(props.framework));
watch(
  () => props.framework,
  (value) => {
    if (!visited.value.includes(value)) visited.value.push(value);
  },
);
watch(
  () => props.theme,
  () => {
    ready.value = {};
    heights.value = {};
  },
);
function bindFrame(framework: Framework, element: unknown) {
  if (element) frames.set(framework, element as HTMLIFrameElement);
  else frames.delete(framework);
}
function report(event: MessageEvent) {
  if (
    event.origin !== window.location.origin ||
    event.data?.type !== 'rowick-example-size'
  )
    return;
  for (const [framework, frame] of frames) {
    if (event.source !== frame.contentWindow) continue;
    const height = event.data.height;
    if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
      heights.value = {
        ...heights.value,
        [framework]: Math.min(2000, Math.max(220, height)),
      };
      ready.value = { ...ready.value, [framework]: true };
    }
  }
}
onMounted(() => window.addEventListener('message', report));
onBeforeUnmount(() => window.removeEventListener('message', report));
</script>
<template>
  <div
    class="framework-preview"
    :style="{ minHeight: `${currentHeight}px` }"
    :data-framework="framework"
  >
    <p v-if="!ready[framework]" class="preview-loading" role="status">
      Loading {{ names[framework] }} example…
    </p>
    <iframe
      v-for="item in visited"
      v-show="item === framework"
      :key="`${feature}-${item}-${theme}`"
      :ref="(element) => bindFrame(item, element)"
      :title="`${names[item]} ${feature} live preview`"
      :src="withBase(`/playground/${item}/${feature}/index.html?theme=${theme}`)"
      :style="{ height: `${heights[item] ?? 520}px` }"
      loading="eager"
    />
  </div>
</template>
<style scoped>
.framework-preview {
  position: relative;
  width: 100%;
  background: var(--vp-c-bg);
}
.framework-preview iframe {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
}
.preview-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0 !important;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 13px;
  pointer-events: none;
  z-index: 1;
}
</style>
