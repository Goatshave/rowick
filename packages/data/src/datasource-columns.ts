import type { AnyColumnDef } from "@rowick/core";
const cache = new WeakMap<object, Map<boolean, readonly unknown[]>>();
/** Remote panels never edit/locally sort a loaded subset by accident. */
export function getRemoteDataColumns<TRow>(columns: readonly AnyColumnDef<TRow>[], queryControls: boolean): readonly AnyColumnDef<TRow>[] {
  const existing = cache.get(columns)?.get(queryControls); if (existing) return existing as readonly AnyColumnDef<TRow>[];
  const ancestors = new Set<object>(); let count = 0;
  const visit = (definitions: readonly AnyColumnDef<TRow>[], depth: number): AnyColumnDef<TRow>[] => {
    if (depth > 32 || ancestors.has(definitions)) throw new TypeError("Invalid remote column hierarchy"); ancestors.add(definitions);
    try { return definitions.map((definition) => {
      if (++count > 10_000) throw new RangeError("Remote column limit exceeded");
      return Object.freeze({ ...definition, enableEditing: false,
        ...(!queryControls ? { enableSorting: false, enableFiltering: false, enableGlobalFiltering: false, enableGrouping: false } : {}),
        ...(definition.columns ? { columns: visit(definition.columns, depth + 1) } : {}) });
    }); } finally { ancestors.delete(definitions); }
  };
  const resolved = Object.freeze(visit(columns, 0));
  let modes = cache.get(columns); if (!modes) { modes = new Map(); cache.set(columns, modes); } modes.set(queryControls, resolved); return resolved;
}
