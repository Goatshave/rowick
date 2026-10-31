import { isISOCalendarDate } from "./column-filter";

export type FilterScalar = string | number | boolean | null;
export type FilterValueType = "text" | "number" | "decimal" | "date" | "boolean";
export type FilterOperator = "eq" | "neq" | "contains" | "not-contains" | "starts-with" | "ends-with" |
  "gt" | "gte" | "lt" | "lte" | "between" | "in" | "not-in" | "is-empty" | "is-not-empty";
export interface FilterColumnPolicy { readonly id: string; readonly type: FilterValueType; readonly operators?: readonly FilterOperator[]; }
export interface FilterCondition {
  readonly kind: "condition";
  readonly columnId: string;
  readonly operator: FilterOperator;
  readonly value?: FilterScalar | readonly FilterScalar[];
  readonly caseSensitive?: boolean;
}
export interface FilterGroup { readonly kind: "group"; readonly operator: "and" | "or"; readonly children: readonly FilterNode[]; }
export type FilterNode = FilterCondition | FilterGroup;
export interface FilterExpression { readonly version: 1; readonly root: FilterNode | null; }
export interface FilterExpressionLimits { readonly maxNodes?: number; readonly maxDepth?: number; readonly maxTextLength?: number; readonly maxSetSize?: number; }
const equality: readonly FilterOperator[] = ["eq", "neq", "in", "not-in", "is-empty", "is-not-empty"];
const ordered: readonly FilterOperator[] = [...equality, "gt", "gte", "lt", "lte", "between"];
const operators: Record<FilterValueType, readonly FilterOperator[]> = {
  text: [...ordered, "contains", "not-contains", "starts-with", "ends-with"], number: ordered, decimal: ordered, date: ordered, boolean: equality,
};
export function getFilterOperators(type: FilterValueType): readonly FilterOperator[] {
  if (!Object.hasOwn(operators, type)) throw new TypeError("Unknown filter value type");
  return Object.freeze([...operators[type]]);
}
const calendar = (value: unknown): value is string => isISOCalendarDate(value) && Number(value.slice(0, 4)) > 0;
const decimal = (value: unknown): value is string => typeof value === "string" && /^[+-]?\d+(?:\.\d+)?$/.test(value);
const hasType = (value: unknown, type: FilterValueType): value is FilterScalar => value === null ||
  (type === "number" ? typeof value === "number" && Number.isFinite(value) : type === "boolean" ? typeof value === "boolean" :
    type === "date" ? calendar(value) : type === "decimal" ? decimal(value) : typeof value === "string");
function record(value: unknown, allowed: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).some((key) => typeof key !== "string" || !allowed.includes(key)) ||
    Object.values(Object.getOwnPropertyDescriptors(value)).some((descriptor) => !Object.hasOwn(descriptor, "value"))) throw new TypeError("Invalid filter expression object");
}
function policies(columns: readonly FilterColumnPolicy[]) {
  const result = new Map<string, FilterColumnPolicy>();
  for (const column of columns) {
    if (!column || typeof column.id !== "string" || !column.id.length || result.has(column.id) || !Object.hasOwn(operators, column.type)) throw new TypeError("Invalid filter column policy");
    if (column.operators && (!Array.isArray(column.operators) || new Set(column.operators).size !== column.operators.length || column.operators.some((operator) => !operators[column.type].includes(operator)))) throw new TypeError("Invalid filter operators");
    if (column.id.length > 1_000) throw new TypeError("Filter column ID is too long");
    result.set(column.id, Object.freeze({ id: column.id, type: column.type, ...(column.operators ? { operators: Object.freeze([...column.operators]) } : {}) }));
  }
  return result;
}
/** Validates untrusted JSON/programmatic input and returns a bounded immutable copy. */
export function validateFilterExpression(input: unknown, columns: readonly FilterColumnPolicy[], limits: FilterExpressionLimits = {}): FilterExpression {
  const columnById = policies(columns);
  const limit = (value: number | undefined, fallback: number, max: number) => {
    const resolved = value ?? fallback; if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > max) throw new TypeError("Invalid filter expression limit"); return resolved;
  };
  const maxNodes = limit(limits.maxNodes, 200, 1_000), maxDepth = limit(limits.maxDepth, 8, 16);
  const maxText = limit(limits.maxTextLength, 1_000, 10_000), maxSet = limit(limits.maxSetSize, 200, 1_000);
  record(input, ["version", "root"]);
  if (input.version !== 1 || !Object.hasOwn(input, "root")) throw new TypeError("Unsupported filter expression version or root");
  const ancestors = new Set<object>(); let count = 0, valueCount = 0, literalCharacters = 0;
  const arrayValues = (value: unknown, max: number): unknown[] => {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max || Reflect.ownKeys(value).some((key) => key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)))) throw new TypeError("Invalid filter array");
    for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, index)!, "value")) throw new TypeError("Invalid sparse/accessor filter array");
    return value;
  };
  const visit = (value: unknown, depth: number): FilterNode => {
    if (++count > maxNodes || depth > maxDepth) throw new RangeError("Filter expression is too large");
    record(value, ["kind", "operator", "children", "columnId", "value", "caseSensitive"]);
    if (ancestors.has(value)) throw new TypeError("Cyclic filter expression");
    ancestors.add(value);
    try {
      if (value.kind === "group") {
        record(value, ["kind", "operator", "children"]);
        if (value.operator !== "and" && value.operator !== "or") throw new TypeError("Invalid filter group");
        return Object.freeze({ kind: "group", operator: value.operator, children: Object.freeze(arrayValues(value.children, maxNodes).map((child) => visit(child, depth + 1))) });
      }
      record(value, ["kind", "columnId", "operator", "value", "caseSensitive"]);
      const column = typeof value.columnId === "string" ? columnById.get(value.columnId) : undefined;
      if (value.kind !== "condition" || !column || !(column.operators ?? operators[column.type]).includes(value.operator as FilterOperator)) throw new TypeError("Unknown or forbidden filter column/operator");
      const operator = value.operator as FilterOperator;
      if (value.caseSensitive !== undefined && (column.type !== "text" || typeof value.caseSensitive !== "boolean")) throw new TypeError("Invalid filter case sensitivity");
      const result: FilterCondition = { kind: "condition", columnId: column.id, operator, ...(value.caseSensitive !== undefined ? { caseSensitive: value.caseSensitive as boolean } : {}) };
      if (operator === "is-empty" || operator === "is-not-empty") {
        if (Object.hasOwn(value, "value")) throw new TypeError("Empty checks do not take a filter value");
        return Object.freeze(result);
      }
      const validScalar = (scalar: unknown): scalar is FilterScalar => {
        if (++valueCount > 2_000 || (typeof scalar === "string" && (literalCharacters += scalar.length) > 16_000)) throw new RangeError("Filter literal budget exceeded");
        return hasType(scalar, column.type) && (typeof scalar !== "string" || scalar.length <= maxText);
      };
      if (["in", "not-in", "between"].includes(operator)) {
        const members = arrayValues(value.value, maxSet);
        if (!members.every(validScalar) ||
          (operator === "between" && (members.length !== 2 || members.some((scalar) => scalar === null) || compare(members[0], members[1], column.type, value.caseSensitive === true) > 0))) throw new TypeError("Invalid filter list/range");
        return Object.freeze({ ...result, value: Object.freeze([...members]) as readonly FilterScalar[] });
      }
      if (!validScalar(value.value) || ((operator !== "eq" && operator !== "neq") && value.value === null)) throw new TypeError("Invalid filter value");
      return Object.freeze({ ...result, value: value.value });
    } finally { ancestors.delete(value); }
  };
  const expression: FilterExpression = Object.freeze({ version: 1, root: input.root === null ? null : visit(input.root, 1) });
  if (JSON.stringify(expression).length > 262_144) throw new RangeError("Filter expression JSON is too large");
  return expression;
}

/** Locale-independent exact decimal comparison; never converts the decimal to Number. */
function decimalParts(value: string) {
  const negative = value.startsWith("-"), [integer = "", fraction = ""] = value.replace(/^[+-]/, "").split(".");
  const whole = integer.replace(/^0+/, "") || "0", tail = fraction.replace(/0+$/, "");
  return { negative: negative && (whole !== "0" || tail.length > 0), whole, tail };
}
function compare(left: unknown, right: unknown, type: FilterValueType, caseSensitive: boolean): number {
  if (type === "decimal") {
    const a = decimalParts(left as string), b = decimalParts(right as string);
    if (a.negative !== b.negative) return a.negative ? -1 : 1;
    const size = Math.max(a.tail.length, b.tail.length), af = a.tail.padEnd(size, "0"), bf = b.tail.padEnd(size, "0");
    const order = a.whole.length !== b.whole.length ? a.whole.length - b.whole.length : a.whole !== b.whole ? (a.whole < b.whole ? -1 : 1) : af === bf ? 0 : af < bf ? -1 : 1;
    return a.negative ? -order : order;
  }
  const a = type === "text" && !caseSensitive ? (left as string).toLowerCase() : left as string | number;
  const b = type === "text" && !caseSensitive ? (right as string).toLowerCase() : right as string | number;
  return a === b ? 0 : a < b ? -1 : 1;
}
export function compileFilterExpression(expression: unknown, columns: readonly FilterColumnPolicy[], limits?: FilterExpressionLimits): (getValue: (columnId: string) => unknown) => boolean {
  const validated = validateFilterExpression(expression, columns, limits), columnById = policies(columns);
  const compile = (node: FilterNode): ((getValue: (columnId: string) => unknown) => boolean) => {
    if (node.kind === "group") {
      const children = node.children.map(compile);
      return node.operator === "and" ? (getValue) => children.every((child) => child(getValue)) : (getValue) => children.some((child) => child(getValue));
    }
    const column = columnById.get(node.columnId)!, sensitive = node.caseSensitive === true;
    const equals = (a: FilterScalar, b: FilterScalar) => a === null || b === null ? a === b : column.type === "boolean" ? a === b : compare(a, b, column.type, sensitive) === 0;
    const members = Array.isArray(node.value) ? node.value as readonly FilterScalar[] : [];
    return (getValue) => {
      const source = getValue(node.columnId), value = source == null ? null : source;
      if (node.operator === "is-empty") return value === null || value === "";
      if (node.operator === "is-not-empty") return value !== null && value !== "";
      if (!hasType(value, column.type)) return false;
      if (node.operator === "eq") return equals(value, node.value as FilterScalar);
      if (node.operator === "neq") return !equals(value, node.value as FilterScalar);
      if (node.operator === "in" || node.operator === "not-in") {
        const found = members.some((member) => equals(value, member)); return node.operator === "in" ? found : !found;
      }
      if (value === null) return false;
      if (node.operator === "between") return compare(value, members[0], column.type, sensitive) >= 0 && compare(value, members[1], column.type, sensitive) <= 0;
      if (["contains", "not-contains", "starts-with", "ends-with"].includes(node.operator)) {
        const text = sensitive ? value as string : (value as string).toLowerCase(), query = sensitive ? node.value as string : (node.value as string).toLowerCase();
        return node.operator === "contains" ? text.includes(query) : node.operator === "not-contains" ? !text.includes(query) : node.operator === "starts-with" ? text.startsWith(query) : text.endsWith(query);
      }
      const order = compare(value, node.value, column.type, sensitive);
      return node.operator === "gt" ? order > 0 : node.operator === "gte" ? order >= 0 : node.operator === "lt" ? order < 0 : order <= 0;
    };
  };
  return validated.root ? compile(validated.root) : () => true;
}
export function serializeFilterExpression(expression: unknown, columns: readonly FilterColumnPolicy[]): string {
  return JSON.stringify(validateFilterExpression(expression, columns));
}
export function parseFilterExpression(serialized: string, columns: readonly FilterColumnPolicy[]): FilterExpression {
  if (typeof serialized !== "string" || serialized.length > 262_144) throw new RangeError("Filter expression JSON is too large");
  return validateFilterExpression(JSON.parse(serialized), columns);
}

/** Self-excluding facets remove only predicates for the requested column. */
export function excludeFilterColumn(expression: unknown, columnId: string, columns: readonly FilterColumnPolicy[]): FilterExpression {
  if (!columns.some((column) => column.id === columnId)) throw new TypeError("Unknown facet column");
  const validated = validateFilterExpression(expression, columns);
  const prune = (node: FilterNode): FilterNode | null => {
    if (node.kind === "condition") return node.columnId === columnId ? null : node;
    const children = node.children.map(prune).filter((child): child is FilterNode => child !== null);
    if (!children.length && node.children.length) return null;
    return Object.freeze({ ...node, children: Object.freeze(children) });
  };
  return Object.freeze({ version: 1, root: validated.root ? prune(validated.root) : null });
}
