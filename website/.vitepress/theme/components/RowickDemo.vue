<script setup lang="ts">
import { computed, h, nextTick, ref, shallowRef } from "vue";
import { useData } from "vitepress";
import { createColumnHelper, createDataGrid, fitColumnsToWidth, type Grid, type GridOptions, type GridState } from "@rowick/vue-ui";

interface Project {
  id: string;
  name: string;
  owner: string;
  team: string;
  status: string;
  budget: number;
}

const sampleRows: Project[] = [
  { id: "p1", name: "Design system", owner: "Mina Park", team: "Design", status: "In progress", budget: 2400 },
  { id: "p2", name: "Customer portal", owner: "Alex Chen", team: "Product", status: "In review", budget: 4800 },
  { id: "p3", name: "Analytics dashboard", owner: "Joon Kim", team: "Engineering", status: "In progress", budget: 3600 },
  { id: "p4", name: "Brand refresh", owner: "Sofia Rossi", team: "Design", status: "Complete", budget: 1800 },
  { id: "p5", name: "API integration", owner: "Theo Martin", team: "Engineering", status: "Planned", budget: 5200 },
  { id: "p6", name: "Onboarding flow", owner: "Ara Lee", team: "Product", status: "In review", budget: 2100 },
  { id: "p7", name: "Search experience", owner: "Alex Chen", team: "Product", status: "Planned", budget: 3200 },
  { id: "p8", name: "Component library", owner: "Mina Park", team: "Design", status: "Complete", budget: 2800 },
  { id: "p9", name: "Data pipeline", owner: "Theo Martin", team: "Engineering", status: "In progress", budget: 6400 },
  { id: "p10", name: "Mobile navigation", owner: "Ara Lee", team: "Product", status: "Planned", budget: 1600 },
  { id: "p11", name: "Accessibility review", owner: "Sofia Rossi", team: "Design", status: "In review", budget: 1900 },
  { id: "p12", name: "Release automation", owner: "Joon Kim", team: "Engineering", status: "Complete", budget: 2500 },
];

const { isDark } = useData();
const rows = ref(sampleRows.map((row) => ({ ...row })));
const frame = ref<HTMLElement | null>(null);
const gridState = ref<Partial<GridState>>({ pagination: { pageIndex: 0, pageSize: 6 } });
const views = [
  { id: "all", label: "All projects", count: 12 },
  { id: "progress", label: "In progress", count: 3 },
  { id: "design", label: "Design", count: 4 },
];
const activeView = ref("all");
const grid = shallowRef<Grid<Project> | null>(null);
const metrics = ref({ count: 12, selected: 0, allSelected: false, someSelected: false, pageIndex: 0, pageSize: 6, pageCount: 2, canPrevious: false, canNext: true });
const rangeStart = computed(() => metrics.value.count ? metrics.value.pageIndex * metrics.value.pageSize + 1 : 0);
const rangeEnd = computed(() => Math.min((metrics.value.pageIndex + 1) * metrics.value.pageSize, metrics.value.count));

const generation = ref(0);
const announcement = ref("12 sample projects. Changes stay in this page.");
const column = createColumnHelper<Project>();
const columns = [
  column.accessor("name", {
    header: "Project", size: 245, minSize: 225, enableEditing: true,
    cell: ({ grid, row, value }) => h("span", { class: "demo-project" }, [
      h("input", {
        type: "checkbox", class: "demo-checkbox rowick-checkbox", checked: grid.getIsRowSelected(row.id),
        "aria-label": `Select ${String(value)}`,
        onPointerdown: (event: Event) => event.stopPropagation(),
        onClick: (event: Event) => event.stopPropagation(),
        onDblclick: (event: Event) => event.stopPropagation(),
        onKeydown: (event: Event) => event.stopPropagation(),
        onChange: (event: Event) => grid.toggleRowSelected(row.id, (event.target as HTMLInputElement).checked),
      }),
      h("span", { class: "demo-project-copy" }, [
        h("span", { class: "demo-project-name" }, String(value)),
      ]),
    ]),
    validateEditValue: (value) => String(value).trim().length > 0 || "Enter a project name.",
  }),
  column.accessor("owner", { header: "Owner", size: 155, minSize: 130 }),
  column.accessor("team", { header: "Team", size: 125, minSize: 110 }),
  column.accessor("status", { header: "Status", size: 140, minSize: 120 }),
  column.accessor("budget", {
    header: "Budget", size: 110, minSize: 95,
    cell: ({ value }) => h("span", { class: "demo-number" }, new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value))),
  }),
];
const DataGrid = createDataGrid<Project>();
const options = computed<GridOptions<Project>>(() => ({
  data: rows.value,
  columns,
  getRowId: (row) => row.id,
  initialState: { pagination: { pageIndex: 0, pageSize: 6 } },
  onStateChange: (next) => { gridState.value = next; },
  onCellEdit: (event) => {
    if (event.phase !== "commit" || event.column.id !== "name" || event.validation?.valid === false || event.defaultPrevented) return;
    rows.value = rows.value.map((row) => row.id === event.row.id ? { ...row, name: String(event.value).trim() } : row);
    announcement.value = "Project name updated. Changes stay in this page.";
    nextTick(() => { if (grid.value) metrics.value = readMetrics(grid.value); });
  },
}));
function chooseView(id: string) {
  activeView.value = id;
  grid.value?.setColumnFilters(id === "progress" ? [{ id: "status", value: "In progress" }] : id === "design" ? [{ id: "team", value: "Design" }] : []);
}
function search(event: Event) {
  grid.value?.setGlobalFilter((event.target as HTMLInputElement).value);
}
function readMetrics(current: Grid<Project>) {
  return {
    count: current.getPrePaginationRowModel().rows.length,
    selected: current.getSelectedRowModel().rows.length,
    allSelected: current.getIsAllPageRowsSelected(),
    someSelected: current.getIsSomePageRowsSelected(),
    pageIndex: current.getState().pagination.pageIndex,
    pageSize: current.getState().pagination.pageSize,
    pageCount: current.getPageCount(),
    canPrevious: current.getCanPreviousPage(),
    canNext: current.getCanNextPage(),
  };
}
function onGridReady(instance: Grid<Project>) {
  grid.value = instance;
  const unsubscribe = instance.subscribeSelector(readMetrics, (next) => { metrics.value = next; }, {
    fireImmediately: true,
    equalityFn: (previous, next) => Object.keys(previous).every((key) => previous[key as keyof typeof previous] === next[key as keyof typeof next]),
  });
  let lastWidth = -1;
  const fit = () => {
    if (!frame.value) return;
    const width = Math.max(700, Math.floor(frame.value.clientWidth));
    if (width === lastWidth) return;
    lastWidth = width;
    fitColumnsToWidth(instance, width);
  };
  fit();
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
  if (frame.value) observer?.observe(frame.value);
  return () => {
    unsubscribe();
    observer?.disconnect();
    if (grid.value === instance) grid.value = null;
  };
}
function renderEmptyState() {
  return h("div", { class: "demo-empty" }, [
    h("strong", "No projects found"),
    h("span", "Try a different search or switch to All projects."),
    h("button", { type: "button", onClick: () => { chooseView("all"); grid.value?.setGlobalFilter(""); } }, "Clear filters"),
  ]);
}
function reset() {
  activeView.value = "all";
  rows.value = sampleRows.map((row) => ({ ...row }));
  gridState.value = { pagination: { pageIndex: 0, pageSize: 6 } };
  generation.value++;
  announcement.value = "Demo reset. All 12 original projects restored.";
}
</script>

<template>
  <section ref="frame" class="rowick-demo" data-rowick :data-rowick-theme="isDark ? 'dark' : 'light'" aria-label="Interactive Rowick example">
    <div class="demo-heading">
      <div class="demo-workspace"><strong>Projects</strong><span class="demo-label">{{ rows.length }} total records</span></div>
      <div class="demo-heading-actions"><a class="demo-source" href="#quickstart">View code <span aria-hidden="true">↗</span></a><button class="demo-reset" type="button" @click="reset">Reset example</button></div>
    </div>
    <div class="demo-toolbar">
      <div class="demo-views" role="group" aria-label="Project views">
        <button v-for="view in views" :key="view.id" type="button" :aria-pressed="activeView === view.id" @click="chooseView(view.id)">{{ view.label }}<span>{{ view.count }}</span></button>
      </div>
      <div class="demo-search">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4" stroke-linecap="round"/></svg>
        <input type="search" aria-label="Search projects" placeholder="Search projects…" :value="gridState.globalFilter ?? ''" @input="search" />
        <button v-if="gridState.globalFilter" type="button" aria-label="Clear search" @click="grid?.setGlobalFilter('')"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button>
      </div>
    </div>
    <DataGrid
      :key="generation"
      :options="options"
      :on-grid-ready="onGridReady"
      :render-empty-state="renderEmptyState"
      class="rowick-grid--enterprise"
      aria-label="Sample projects"
      :row-virtualization="false"
      :column-virtualization="false"
    />
    <div class="demo-footer">
      <div class="demo-selection">
        <label><input type="checkbox" class="demo-checkbox rowick-checkbox" :checked="metrics.allSelected" :indeterminate="metrics.someSelected && !metrics.allSelected" :disabled="!metrics.count" @change="grid?.toggleAllPageRowsSelected(($event.target as HTMLInputElement).checked)" />Select page</label>
        <span v-if="metrics.selected" class="demo-selected-count" role="status">{{ metrics.selected }} selected<button type="button" aria-label="Clear row selection" @click="grid?.resetRowSelection()">Clear</button></span>
      </div>
      <div class="demo-pagination">
        <span class="demo-range" aria-live="polite">{{ rangeStart }}–{{ rangeEnd }} of {{ metrics.count }}</span>
        <select aria-label="Projects per page" :value="metrics.pageSize" @change="grid?.setPageSize(Number(($event.target as HTMLSelectElement).value))"><option :value="6">6 / page</option><option :value="12">12 / page</option></select>
        <div class="demo-page-buttons">
          <button type="button" aria-label="Previous page" :disabled="!metrics.canPrevious" @click="grid?.previousPage()"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m10 4-4 4 4 4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <span aria-label="Current page">{{ metrics.count ? metrics.pageIndex + 1 : 0 }} / {{ metrics.count ? metrics.pageCount : 0 }}</span>
          <button type="button" aria-label="Next page" :disabled="!metrics.canNext" @click="grid?.nextPage()"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 4 4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
      </div>
    </div>
    <div class="demo-footnote"><span>Double-click a project to edit <kbd>↵</kbd> save <kbd>esc</kbd> cancel</span><span class="demo-live">Changes stay in this demo</span></div>
    <span class="demo-announcement" role="status" aria-live="polite">{{ announcement }}</span>
  </section>
</template>
