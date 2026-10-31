import { getE2ePort, getE2eUrl } from "./e2e-ports.mjs";

export const manualFeatureChecks = [
  "At /editing, save consecutive drafts with exact large decimal/currency values and leading-zero IDs; verify invalid input retention, undo/redo, delayed acknowledgements, conflict/retry and cancellation without overwriting newer edits.",
  "At /filtering, combine nested conditions, dates, enums and facet search; verify invalid expressions, clear/reset, loading/error recovery and consistent client/server results without filtering only the loaded page.",
  "At /server-data, check page/offset/cursor and child navigation, unknown totals, bounded caching, query-change cancellation, read retry, all-query exclusions, lost bulk-response retry and persisted recovery after server restart.",
  "At the base route, check column resize/reorder/pin and group/tree expansion; at /layout, check row pin/details/merges/row reorder, editing/scrolling, focus and RTL. Confirm row reorder explicitly rejects sorted, grouped, tree and server modes.",
  "At /layout, use the real system clipboard with Excel and Numbers for rich HTML/TSV copy/paste; check multiline text, leading-zero IDs, exact amounts and formula-like text. Verify paste accepts valid cells and skips invalid/read-only cells, cut rejects atomically, and undo/redo matches.",
  "At /analytics, change grouping/pivot/aggregate inputs and server queries; verify bounded results, cancellation, error/retry and stale-response rejection while preserving the accepted view.",
  "At /analytics, download XLSX and open it in both real Excel and Numbers; record application versions and verify no repair warning, typed dates/numbers, exact text IDs/large amounts, formula-like text, headers and summaries. Parser-only checks do not satisfy this item.",
  "At /locale, check en-US/de-DE/fr-FR/ko-KR/ja-JP/hi-IN/ar-EG number/currency/date input, exact precision and leading zeros; reject malformed grouping, unsafe Number values and invalid dates, retaining raw input and blocking locale changes during composition.",
];

export const manualAccessibilityChecks = [
  "Use a screen reader to enter the grid and confirm its label, row and column counts, header names, and focused cell values are announced.",
  "Use only the keyboard to move through toolbar controls and the grid, open and close menus, edit a cell, and confirm focus stays visible and follows a logical order.",
  "At 200% browser zoom and at a 390 CSS pixel viewport, confirm controls reflow without overlap or clipped commands and the grid remains horizontally scrollable.",
  "With forced colors or a high-contrast theme enabled, confirm focus, selection, disabled controls, validation, loading, and error states remain distinguishable.",
  "Use actual Korean and Japanese OS IMEs at /editing, /layout and /locale on macOS and Windows; record OS/IME versions, candidate selection/cancel, Enter, Tab/blur, compositionstart before first input, delayed saves and reopened values. Synthetic composition is not evidence.",
  "Use VoiceOver with real Safari on macOS at /editing, /filtering, /server-data, /layout, /analytics and /locale; record versions and verify focus, error/loading/retry announcements, counts/unknown ranks, dialogs, hierarchy, RTL and keyboard completion.",
  "Use NVDA with a real Windows browser at /editing, /filtering, /server-data, /layout, /analytics and /locale; record NVDA/OS/browser versions and verify focus, validation/loading/retry announcements, hierarchy, unknown ranks and RTL keyboard operation.",
  "Use real touch and pen hardware on the base route and /editing, /layout and /locale; record device/OS/browser, verify base column controls, layout row pin/details/reorder, editing/scrolling and keyboard alternatives. Viewport/pointer emulation is not evidence.",
  "At all six optional routes, repeat keyboard-only operation, actual 200% browser zoom, 390 CSS px reflow and platform high contrast; verify visible focus, error recovery, rich-clipboard alternatives and RTL/Bidi text without clipped controls or lost drafts.",
];

export const zoomEquivalentViewport = {
  width: 640,
  height: 450,
  deviceScaleFactor: 2,
};

export const productThemeTokenCheck = {
  light: {
    accent: "#155eef",
    focus: "#0e9384",
    radiusLarge: "8px",
  },
  dark: {
    accent: "#84adff",
    focus: "#5fe9d0",
    radiusLarge: "8px",
  },
};

export const productHeaderControlCheck = {
  directPinningControls: false,
  actionMenu: true,
};

export const reactSemanticMarkerChecks = [
  {
    columnId: "status",
    values: [
      { rowId: "INV-0001", text: "Paid", className: "product-cell--status-paid" },
      { rowId: "INV-0002", text: "Sent", className: "product-cell--status-sent" },
      { rowId: "INV-0003", text: "Draft", className: "product-cell--status-draft" },
      { rowId: "INV-0004", text: "Overdue", className: "product-cell--status-overdue" },
    ],
  },
  {
    columnId: "risk",
    values: [
      { rowId: "INV-0001", text: "Low", className: "product-cell--risk-low" },
      { rowId: "INV-0002", text: "Medium", className: "product-cell--risk-medium" },
      { rowId: "INV-0003", text: "High", className: "product-cell--risk-high" },
    ],
  },
];

export const groupedSemanticMarkerChecks = [
  {
    columnId: "risk",
    values: [
      { rowId: "REG-001", text: "Low", className: "product-cell--risk-low" },
      { rowId: "REG-002", text: "Medium", className: "product-cell--risk-medium" },
      { rowId: "REG-003", text: "High", className: "product-cell--risk-high" },
    ],
  },
];

export const uiSmokeTargets = [
  {
    framework: "React",
    url: "http://127.0.0.1:4193/",
    port: 4193,
    buildCommands: [
      ["--filter", "@rowick/react-ui", "build"],
      ["--filter", "@rowick/example-react-basic", "build"],
    ],
    previewCommand: ["--filter", "@rowick/example-react-basic", "preview", "--port", "4193"],
    smokeCheck: {
      gridLabel: "Invoices",
      primaryColumnId: "customer",
      primaryColumnLabel: "Customer",
      managedColumnCount: "Visible 10 / 10",
      productThemeTokens: productThemeTokenCheck,
      headerControls: productHeaderControlCheck,
      semanticMarkers: reactSemanticMarkerChecks,
      minimumDeepScrollRowIndex: 100,
      maxRenderedRowCount: 80,
      zoomEquivalentViewport,
    },
    stateCheck: {
      editableRowId: "INV-0001",
      editableColumnId: "customer",
      invalidEditValue: "No",
      validationMessage: "Customer must be at least 3 characters",
      loadingText: "Refreshing invoices...",
      errorText: "Invoice service is unavailable.",
    },
    workflowCheck: {
      searchQuery: "Northwind",
      filteredRowId: "INV-0002",
      validEditValue: "Acme Labs Reviewed",
      originalEditValue: "Acme Labs",
      preferenceColumnId: "owner",
      preferenceColumnLabel: "Owner",
    },
    manualChecks: [
      "Confirm the grid shell renders with visible rows and cells.",
      "Confirm the Customer column header is visible.",
      "Confirm Paid, Sent, Draft, Overdue, and Low, Medium, High remain readable and have distinct semantic markers.",
      "Confirm Column management starts collapsed, opens from Manage columns, and reads Visible 10 / 10.",
      "Scroll near the bottom and confirm rows update while fewer than 80 virtual rows remain mounted.",
      "Use Export CSV and confirm the browser starts a CSV download.",
      "Complete search, ascending sort, valid edit, Owner-column persistence after reload, and Reset preferences as one uninterrupted workflow.",
      ...manualFeatureChecks,
    ],
    accessibilityChecks: [...manualAccessibilityChecks],
  },
  {
    framework: "Vue",
    url: "http://127.0.0.1:4194/",
    port: 4194,
    buildCommands: [
      ["--filter", "@rowick/vue-ui", "build"],
      ["--filter", "@rowick/example-vue-grouped", "build"],
    ],
    previewCommand: ["--filter", "@rowick/example-vue-grouped", "preview", "--port", "4194"],
    smokeCheck: {
      gridLabel: "Regional forecasts",
      primaryColumnId: "city",
      primaryColumnLabel: "City",
      managedColumnCount: "Visible 8 / 8",
      productThemeTokens: productThemeTokenCheck,
      headerControls: productHeaderControlCheck,
      semanticMarkers: groupedSemanticMarkerChecks,
      minimumDeepScrollRowIndex: 100,
      maxRenderedRowCount: 80,
      zoomEquivalentViewport,
    },
    stateCheck: {
      editableRowId: "REG-001",
      editableColumnId: "city",
      invalidEditValue: "No",
      validationMessage: "City must be at least 3 characters",
      loadingText: "Refreshing forecasts...",
      errorText: "Forecast service is unavailable.",
    },
    workflowCheck: {
      searchQuery: "Tokyo",
      filteredRowId: "REG-002",
      validEditValue: "Seoul Reviewed",
      originalEditValue: "Seoul",
      preferenceColumnId: "owner",
      preferenceColumnLabel: "Owner",
    },
    manualChecks: [
      "Confirm the grid shell renders with visible grouped rows and cells.",
      "Confirm the City column header is visible.",
      "Confirm Low, Medium, and High remain readable and have distinct semantic markers.",
      "Confirm Column management starts collapsed, opens from Manage columns, and reads Visible 8 / 8.",
      "Scroll near the bottom and confirm rows update while fewer than 80 virtual rows remain mounted.",
      "Use Export CSV and confirm the browser starts a CSV download.",
      "Complete search, ascending sort, valid edit, Owner-column persistence after reload, and Reset preferences as one uninterrupted workflow.",
      ...manualFeatureChecks,
    ],
    accessibilityChecks: [...manualAccessibilityChecks],
  },
  {
    framework: "Svelte",
    url: "http://127.0.0.1:4195/",
    port: 4195,
    buildCommands: [
      ["--filter", "@rowick/svelte-ui", "build"],
      ["--filter", "@rowick/example-svelte-grouped", "build"],
    ],
    previewCommand: ["--filter", "@rowick/example-svelte-grouped", "preview", "--port", "4195"],
    smokeCheck: {
      gridLabel: "Regional forecasts",
      primaryColumnId: "city",
      primaryColumnLabel: "City",
      managedColumnCount: "Visible 8 / 8",
      productThemeTokens: productThemeTokenCheck,
      headerControls: productHeaderControlCheck,
      semanticMarkers: groupedSemanticMarkerChecks,
      minimumDeepScrollRowIndex: 100,
      maxRenderedRowCount: 80,
      zoomEquivalentViewport,
    },
    stateCheck: {
      editableRowId: "REG-001",
      editableColumnId: "city",
      invalidEditValue: "No",
      validationMessage: "City must be at least 3 characters",
      loadingText: "Refreshing forecasts...",
      errorText: "Forecast service is unavailable.",
    },
    workflowCheck: {
      searchQuery: "Tokyo",
      filteredRowId: "REG-002",
      validEditValue: "Seoul Reviewed",
      originalEditValue: "Seoul",
      preferenceColumnId: "owner",
      preferenceColumnLabel: "Owner",
    },
    manualChecks: [
      "Confirm the grid shell renders with visible grouped rows and cells.",
      "Confirm the City column header is visible.",
      "Confirm Low, Medium, and High remain readable and have distinct semantic markers.",
      "Confirm Column management starts collapsed, opens from Manage columns, and reads Visible 8 / 8.",
      "Scroll near the bottom and confirm rows update while fewer than 80 virtual rows remain mounted.",
      "Use Export CSV and confirm the browser starts a CSV download.",
      "Complete search, ascending sort, valid edit, Owner-column persistence after reload, and Reset preferences as one uninterrupted workflow.",
      ...manualFeatureChecks,
    ],
    accessibilityChecks: [...manualAccessibilityChecks],
  },
];

export const defaultUiSmokeOpenWaitTimeoutMs = 30_000;

export function formatPnpmCommand(command) {
  return `pnpm ${command.join(" ")}`;
}

export function formatUiSmokeOpenCommand(target) {
  return `pnpm preview:smoke-ui -- --framework ${target.framework} --open`;
}

export function getPlaywrightUiSmokeTargets(environment = process.env) {
  return uiSmokeTargets.map((target) => {
    const port = getE2ePort(target.port, environment);
    return {
      ...target,
      url: getE2eUrl(target.port, "/", environment),
      port,
      previewCommand: target.previewCommand.map((part, index, command) => (
        command[index - 1] === "--port" ? String(port) : part
      )),
    };
  });
}

export function createPlaywrightWebServers(environment = process.env) {
  return getPlaywrightUiSmokeTargets(environment).map((target) => ({
    command: [
      ...target.buildCommands.map(formatPnpmCommand),
      formatPnpmCommand(target.previewCommand),
    ].join(" && "),
    url: target.url.replace(/\/$/, ""),
    reuseExistingServer: false,
    timeout: 120_000,
  }));
}
