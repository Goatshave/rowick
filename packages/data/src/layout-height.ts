/** Fenwick sums keep variable-height viewport queries/measurements logarithmic. */
export class LayoutHeightIndex {
  readonly #values: Float64Array;
  readonly #tree: Float64Array;
  constructor(values: readonly number[]) {
    this.#values = new Float64Array(values.length); this.#tree = new Float64Array(values.length + 1);
    values.forEach((value, index) => this.set(index, value));
  }
  get length() { return this.#values.length; }
  get total() { return this.offset(this.length); }
  size(index: number) { return this.#values[index] ?? 0; }
  set(index: number, value: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.length || !Number.isFinite(value) || value < 1 || value > 10_000) throw new RangeError("Invalid layout row measurement");
    const delta = value - this.#values[index]!; this.#values[index] = value;
    for (let position = index + 1; position < this.#tree.length; position += position & -position) this.#tree[position]! += delta;
  }
  offset(end: number) {
    let total = 0; for (let position = Math.min(Math.max(0, end), this.length); position > 0; position -= position & -position) total += this.#tree[position]!;
    return total;
  }
  find(offset: number) {
    if (!this.length) return 0;
    let index = 0, prefix = 0, step = 2 ** Math.floor(Math.log2(this.length));
    while (step) {
      const next = index + step;
      if (next <= this.length && prefix + this.#tree[next]! <= offset) { index = next; prefix += this.#tree[next]!; }
      step = Math.floor(step / 2);
    }
    return Math.min(index, this.length - 1);
  }
}
