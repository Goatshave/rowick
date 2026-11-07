<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue';
import { useData } from 'vitepress';
import SourceIcon from './SourceIcon.vue';
import type { Framework, SourceFile } from '../examples/framework-projects';
const props = defineProps<{
  projects: Record<Framework, SourceFile[]>;
  label: string;
}>();
const { isDark } = useData();
const view = ref('preview');
const framework = ref<Framework>('vue');
const activePath = ref('');
const status = ref('');
const wrap = ref(false);
const highlighted = ref('');
const mounted = ref(false);
const id = `example-${useId()}`;
const frameworkNames = { react: 'React', vue: 'Vue', svelte: 'Svelte' };
const files = computed<SourceFile[]>(() => props.projects[framework.value]);
const file = computed(
  () => files.value.find((item) => item.name === activePath.value) ?? files.value[0]!,
);
const codeFiles = computed(() =>
  files.value.filter((item) => !item.name.includes('/styles/')),
);
const styleFiles = computed(() =>
  files.value.filter((item) => item.name.includes('/styles/')),
);
function selectView(value: string) {
  view.value = value;
  status.value = '';
}
function selectFile(path: string) {
  activePath.value = path;
  status.value = '';
}
function selectFramework(value: Framework) {
  framework.value = value;
  activePath.value = '';
  status.value = '';
}
async function navigateViews(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const tabs = event.currentTarget as HTMLElement;
  selectView(
    event.key === 'Home'
      ? 'preview'
      : event.key === 'End'
        ? 'code'
        : view.value === 'code'
          ? 'preview'
          : 'code',
  );
  await nextTick();
  tabs.querySelector<HTMLButtonElement>(`[aria-selected=true]`)?.focus();
}
function navigateFiles(event: KeyboardEvent) {
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const buttons = Array.from(
    (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>(
      'details[open] > .file-list > button',
    ),
  );
  const current = buttons.indexOf(event.target as HTMLButtonElement);
  if (current < 0) return;
  event.preventDefault();
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
          buttons.length;
  buttons[next]?.focus();
}
async function copy() {
  const target = file.value;
  try {
    await navigator.clipboard.writeText(target.source);
    if (file.value === target) status.value = `Copied ${target.name.split('/').pop()}.`;
  } catch {
    status.value = 'Copy is unavailable. Select the code and copy it manually.';
  }
}
let request = 0;
watch([file, view, mounted], async () => {
  const current = ++request;
  highlighted.value = '';
  if (!mounted.value || view.value !== 'code') return;
  try {
    const { highlight } = await import('../examples/highlight');
    const html = await highlight(file.value.source, file.value.name);
    if (request === current) highlighted.value = html;
  } catch {
    /* The selectable plain source remains available if highlighting fails. */
  }
});
onMounted(() => {
  mounted.value = true;
});
watch(
  () => props.label,
  () => {
    view.value = 'preview';
    activePath.value = '';
    status.value = '';
  },
);
</script>
<template>
  <div class="example-workbench" :data-workbench-theme="isDark ? 'dark' : 'light'">
    <div class="workbench-bar">
      <div
        class="workbench-tabs"
        role="tablist"
        :aria-label="`${label} view`"
        @keydown="navigateViews"
      >
        <button
          :id="`${id}-preview-tab`"
          role="tab"
          :aria-selected="view === 'preview'"
          :aria-controls="`${id}-preview`"
          :tabindex="view === 'preview' ? 0 : -1"
          @click="selectView('preview')"
        >
          Preview
        </button>
        <button
          :id="`${id}-code-tab`"
          role="tab"
          :aria-selected="view === 'code'"
          :aria-controls="`${id}-code`"
          :tabindex="view === 'code' ? 0 : -1"
          @click="selectView('code')"
        >
          Code
        </button>
      </div>
      <div class="framework-switch" role="group" aria-label="Example framework">
        <button
          v-for="(name, key) in frameworkNames"
          :key="key"
          :aria-pressed="framework === key"
          @click="selectFramework(key)"
        >
          {{ name }}
        </button>
      </div>
    </div>
    <div
      v-show="view === 'preview'"
      :id="`${id}-preview`"
      role="tabpanel"
      :aria-labelledby="`${id}-preview-tab`"
    >
      <slot :framework="framework" />
    </div>
    <section
      v-if="view === 'code'"
      :id="`${id}-code`"
      class="workbench-code"
      role="tabpanel"
      :aria-labelledby="`${id}-code-tab`"
    >
      <nav class="file-explorer" aria-label="Example files" @keydown="navigateFiles">
        <div class="explorer-title">
          FILES <span>{{ frameworkNames[framework] }}</span>
        </div>
        <details open>
          <summary>
            <SourceIcon class="folder-chevron" kind="chevron" /><SourceIcon
              class="folder-icon"
              kind="folder"
            /><span>src</span>
          </summary>
          <div class="file-list">
            <button
              v-for="item in codeFiles"
              :key="item.name"
              :aria-current="file.name === item.name ? 'true' : undefined"
              @click="selectFile(item.name)"
            >
              <SourceIcon class="file-icon" kind="code" />{{
                item.name.split('/').pop()
              }}
            </button>
          </div>
          <details class="styles-folder">
            <summary>
              <SourceIcon class="folder-chevron" kind="chevron" /><SourceIcon
                class="folder-icon"
                kind="folder"
              /><span>styles</span>
            </summary>
            <div class="file-list">
              <button
                v-for="item in styleFiles"
                :key="item.name"
                :aria-current="file.name === item.name ? 'true' : undefined"
                @click="selectFile(item.name)"
              >
                <SourceIcon class="file-icon" kind="style" />{{
                  item.name.split('/').pop()
                }}
              </button>
            </div>
          </details>
        </details>
      </nav>
      <div class="code-editor">
        <div class="editor-toolbar">
          <span class="file-path">{{ file.name }}</span
          ><label><input v-model="wrap" type="checkbox" />Wrap</label
          ><button @click="copy">Copy</button>
        </div>
        <div
          :key="file.name"
          class="code-scroll"
          :data-code-theme="isDark ? 'dark' : 'light'"
          :class="{ 'wrap-code': wrap }"
          tabindex="0"
          :aria-label="`${file.name} source code`"
        >
          <div v-if="highlighted" class="highlighted-code" v-html="highlighted" />
          <pre v-else><code>{{ file.source }}</code></pre>
        </div>
        <div class="editor-status" role="status">
          <span>{{ status || `${frameworkNames[framework]} · TypeScript` }}</span
          ><span>{{ file.source.trimEnd().split('\n').length }} lines</span>
        </div>
      </div>
    </section>

    <div class="workbench-runtime">
      <span class="runtime-dot" aria-hidden="true"></span
      ><span>{{ frameworkNames[framework] }} example</span
      ><span class="runtime-detail">Preview and code share the same source</span>
    </div>
  </div>
</template>
<style scoped>
.example-workbench {
  --wb-panel: #f7f8fa;
  --wb-editor: #fbfcfd;
  --wb-line: #e2e5e9;
  --wb-muted: #6b7280;
  --wb-ink: #242a32;
  margin-bottom: 32px;
  min-width: 0;
  border: 1px solid var(--wb-line);
  border-radius: 12px;
  overflow: hidden;
  background: var(--vp-c-bg);
  box-shadow: 0 4px 20px -12px #10182822;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.example-workbench[data-workbench-theme='dark'] {
  --wb-panel: #1c2027;
  --wb-editor: #151920;
  --wb-line: #303640;
  --wb-muted: #9ca5b3;
  --wb-ink: #e2e7ef;
}
.workbench-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  min-height: 58px;
  padding: 0 18px;
  border-bottom: 1px solid var(--wb-line);
  background: var(--vp-c-bg);
}
.workbench-tabs {
  display: flex;
  align-self: stretch;
  gap: 24px;
}
.workbench-tabs button {
  position: relative;
  padding: 16px 2px;
  border-bottom: 2px solid transparent;
  color: var(--wb-muted);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 22px;
  cursor: pointer;
}
.workbench-tabs button[aria-selected='true'] {
  color: var(--wb-ink);
  border-bottom-color: var(--vp-c-brand-1);
}
.framework-switch {
  display: flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--wb-line);
  border-radius: 7px;
  background: var(--wb-panel);
}
.framework-switch button {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 12px;
  border-radius: 4px;
  color: var(--wb-muted);
  font: inherit;
  font-size: 12px;
  line-height: 22px;
  cursor: pointer;
}
.framework-switch button[aria-pressed='true'] {
  color: var(--wb-ink);
  background: var(--vp-c-bg-elv);
  box-shadow: 0 1px 3px #0002;
}
.workbench-code {
  display: grid;
  grid-template-columns: 188px minmax(0, 1fr);
  overflow: hidden;
  background: var(--wb-editor);
}
.file-explorer {
  min-width: 0;
  padding: 16px 0;
  background: var(--wb-panel);
  border-right: 1px solid var(--wb-line);
  font-size: 12px;
}
.explorer-title {
  display: flex;
  justify-content: space-between;
  padding: 2px 16px 16px;
  color: var(--wb-muted);
  font-size: 10px;
  letter-spacing: 0.06em;
  font-weight: 600;
}
.explorer-title span {
  font-weight: 400;
  letter-spacing: 0;
}
.file-explorer summary {
  display: flex;
  align-items: center;
  gap: 6px;
  list-style: none;
  cursor: pointer;
  padding: 6px 14px;
  color: var(--wb-muted);
  user-select: none;
}
.file-explorer summary::-webkit-details-marker {
  display: none;
}
.folder-chevron {
  width: 12px;
  height: 12px;
  flex: none;
  transition: transform 0.15s;
}
.file-explorer details[open] > summary > .folder-chevron {
  transform: rotate(90deg);
}
.folder-icon {
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--wb-muted);
}
.file-list {
  display: flex;
  flex-direction: column;
}
.file-list button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px 8px 24px;
  color: var(--wb-muted);
  text-align: left;
  font: inherit;
  cursor: pointer;
  border-left: 2px solid transparent;
}
.file-list button:hover {
  background: var(--vp-c-default-soft);
}
.file-list button[aria-current='true'] {
  background: var(--vp-c-brand-soft);
  border-left-color: var(--vp-c-brand-1);
  color: var(--wb-ink);
}
.file-icon {
  width: 17px;
  height: 17px;
  flex: none;
  color: var(--wb-muted);
}
.file-list button[aria-current='true'] .file-icon {
  color: var(--vp-c-brand-1);
}
.styles-folder {
  margin-left: 12px;
}
.styles-folder .file-list button {
  padding-left: 10px;
  font-size: 11px;
}
.code-editor {
  min-width: 0;
}
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 43px;
  padding: 7px 18px;
  border-bottom: 1px solid var(--wb-line);
  background: var(--vp-c-bg);
  font-size: 12px;
}
.file-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--vp-font-family-mono);
  color: var(--wb-muted);
}
.editor-toolbar label {
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  font-size: 11px;
  color: var(--wb-muted);
  cursor: pointer;
}
.editor-toolbar input {
  accent-color: var(--vp-c-brand-1);
}
.editor-toolbar button {
  padding: 3px 10px;
  border: 1px solid var(--wb-line);
  border-radius: 5px;
  color: var(--wb-ink);
  background: var(--wb-panel);
  cursor: pointer;
}
.code-scroll {
  height: 520px;
  overflow: auto;
  background: var(--wb-editor);
  tab-size: 2;
}
.code-scroll pre,
.code-scroll :deep(pre) {
  width: max-content;
  min-width: 100%;
  box-sizing: border-box;
  margin: 0 !important;
  padding: 20px 24px !important;
  border-radius: 0 !important;
  background: transparent !important;
  font: 13px/1.85 var(--vp-font-family-mono);
}
.code-scroll code,
.code-scroll :deep(code) {
  display: block;
  padding: 0 !important;
  background: transparent !important;
  color: var(--wb-ink);
  font: inherit;
  white-space: pre;
}
.code-scroll :deep(.shiki code) {
  counter-reset: source-line;
}
.code-scroll :deep(.shiki .line)::before {
  counter-increment: source-line;
  content: counter(source-line);
  display: inline-block;
  width: 3ch;
  margin-right: 24px;
  text-align: right;
  color: var(--wb-muted);
  opacity: 0.6;
  font-size: 11px;
  user-select: none;
}
.code-scroll :deep(.shiki span) {
  color: var(--shiki-light);
}
.code-scroll[data-code-theme='dark'] :deep(.shiki span) {
  color: var(--shiki-dark);
}
.wrap-code pre,
.wrap-code :deep(pre) {
  width: auto;
}
.wrap-code code,
.wrap-code :deep(code) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.editor-status {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  min-height: 34px;
  padding: 8px 18px;
  border-top: 1px solid var(--wb-line);
  color: var(--wb-muted);
  font-size: 11px;
}
.workbench-runtime {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 18px;
  border-top: 1px solid var(--wb-line);
  color: var(--wb-muted);
  font-size: 11px;
  background: var(--vp-c-bg);
}
.runtime-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
}
.runtime-detail {
  margin-left: auto;
}
.example-workbench button:focus-visible,
.file-explorer summary:focus-visible,
.code-scroll:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -3px;
}
@media (max-width: 700px) {
  .workbench-code {
    grid-template-columns: 152px minmax(0, 1fr);
  }
  .file-list button {
    padding-left: 14px;
    font-size: 11px;
  }
  .styles-folder {
    margin-left: 6px;
  }
  .explorer-title {
    padding-inline: 12px;
  }
  .editor-toolbar {
    gap: 8px;
    padding-inline: 10px;
  }
  .runtime-detail {
    display: none;
  }
}
@media (max-width: 479px) {
  .workbench-bar {
    padding-inline: 12px;
    gap: 8px;
  }
  .workbench-tabs {
    gap: 14px;
  }
  .framework-switch button {
    padding: 3px 7px;
    font-size: 11px;
  }
  .workbench-code {
    grid-template-columns: 1fr;
  }
  .file-explorer {
    border-right: 0;
    border-bottom: 1px solid var(--wb-line);
    max-height: 180px;
    overflow: auto;
  }
  .code-scroll {
    height: 420px;
  }
}
</style>
