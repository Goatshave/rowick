/** Locations are preorder input positions, never product IDs or row payloads. */
export function registerId(id: unknown, positions: Map<string, number>, kind: "row" | "column"): asserts id is string {
  const position = positions.size;
  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError(`Rowick: ${kind} ID at position ${position} must be a non-empty string`);
  }
  const previous = positions.get(id);
  if (previous !== undefined) {
    throw new TypeError(`Rowick: duplicate ${kind} ID at positions ${previous} and ${position}`);
  }
  positions.set(id, position);
}

/** Separate scope keeps the temporary registry out of retained row closures. */
export function validateRowIds(rows: readonly { id: unknown }[]): void {
  const seen = new Set<string>();
  for (let position = 0; position < rows.length; position += 1) {
    const id = rows[position]!.id;
    if (typeof id !== "string" || id.length === 0) {
      throw new TypeError(`Rowick: row ID at position ${position} must be a non-empty string`);
    }
    if (id.startsWith("__group__")) {
      throw new TypeError(`Rowick: reserved row ID at position ${position}; use a product namespace`);
    }
    seen.add(id);
    if (seen.size !== position + 1) {
      const previous = rows.findIndex((row) => row.id === id);
      throw new TypeError(`Rowick: duplicate row ID at positions ${previous} and ${position}`);
    }
  }
}
