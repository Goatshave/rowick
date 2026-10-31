import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { evaluateAudit } from "../dependency-audit.mjs";

const policy = JSON.parse(readFileSync(new URL("../../security/audit-exceptions.json", import.meta.url), "utf8"));
const deepmergeExceptions = policy.exceptions.filter((item) => item.advisory === "GHSA-gcqx-w48m-w2h4");
const expectedPaths = [
  "compatibility/svelte-4 > @sveltejs/vite-plugin-svelte@3.1.2 > deepmerge@4.3.1",
  "examples/nuxt-server-export > nuxt@4.6.3 > @nuxt/nitro-server@4.6.3 > nitropack@2.13.5 > @rollup/plugin-node-resolve@16.0.3 > deepmerge@4.3.1",
  "examples/svelte-grouped > @sveltejs/vite-plugin-svelte@7.3.1 > deepmerge@4.3.1",
  "examples/svelte-server-grouping > @sveltejs/vite-plugin-svelte@7.3.1 > deepmerge@4.3.1",
  "examples/svelte-server-side > @sveltejs/vite-plugin-svelte@7.3.1 > deepmerge@4.3.1",
  "examples/svelte-server-tree > @sveltejs/vite-plugin-svelte@7.3.1 > deepmerge@4.3.1",
  "examples/sveltekit-server-export > @sveltejs/adapter-node@6.0.0 > @sveltejs/kit@3.1.0 > @sveltejs/vite-plugin-svelte@7.3.1 > deepmerge@4.3.1",
  "examples/sveltekit-server-export > @sveltejs/kit@3.1.0 > @sveltejs/vite-plugin-svelte@7.3.1 > deepmerge@4.3.1",
  "examples/sveltekit-server-export > @sveltejs/vite-plugin-svelte@7.3.1 > deepmerge@4.3.1",
];

function resolveChain(path) {
  const [workspace, ...dependencies] = path.split(" > ");
  let require = createRequire(new URL(`../../${workspace}/package.json`, import.meta.url));
  let resolved;
  for (const dependency of dependencies) {
    const name = dependency.slice(0, dependency.lastIndexOf("@"));
    const version = dependency.slice(dependency.lastIndexOf("@") + 1);
    const manifestPath = resolvePackage(require, name);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.name, name, path);
    assert.equal(manifest.version, version, path);
    resolved = name === "deepmerge" ? require.resolve(name) : resolvePackage(require, name);
    require = createRequire(resolved);
  }
  return resolved;
}

function resolvePackage(require, name) {
  // ESM-only tooling can hide both its require entry and package.json export.
  // Follow its actual installed node_modules search path, including pnpm symlinks.
  for (const directory of require.resolve.paths(name) ?? []) {
    const manifest = join(directory, name, "package.json");
    if (existsSync(manifest)) return realpathSync(manifest);
  }
  throw new Error(`Installed dependency is missing: ${name}`);
}

const entries = [...new Set(expectedPaths.map(resolveChain))];
const require = createRequire(import.meta.url);
const implementations = entries.flatMap((entry, index) => [
  { name: `installed CJS ${index + 1}`, merge: require(entry) },
  { name: `installed UMD ${index + 1}`, merge: require(join(dirname(entry), "umd.js")) },
]);

test("all nine reviewed chains resolve the installed version-scoped pnpm patch", () => {
  assert.deepEqual(deepmergeExceptions.map((item) => item.path).sort(), [...expectedPaths].sort());
  const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.pnpm.patchedDependencies["deepmerge@4.3.1"], "patches/deepmerge@4.3.1.patch");
  for (const entry of entries) {
    assert.match(entry, /deepmerge@4\.3\.1_patch_hash=/);
    assert.equal(JSON.parse(readFileSync(join(dirname(entry), "../package.json"), "utf8")).version, "4.3.1");
  }
});

for (const { name, merge } of implementations) {
  test(`${name}: own __proto__ in targets, null-prototype sources and recursive merges cannot poison returned prototypes`, () => {
    const payload = () => JSON.parse('{"__proto__":{"untrustedInheritedValue":true}}');
    const nullSource = Object.assign(Object.create(null), payload());
    const results = [
      merge(payload(), {}),
      merge(Object.create(null), nullSource),
      merge(payload(), payload()),
      merge({ child: payload() }, { child: { safe: true } }).child,
    ];
    for (const result of results) {
      assert.equal(Object.getPrototypeOf(result), Object.prototype);
      assert.equal(result.untrustedInheritedValue, undefined);
      assert.deepEqual(Object.getOwnPropertyDescriptor(result, "__proto__"), {
        value: { untrustedInheritedValue: true }, enumerable: true, writable: true, configurable: true,
      });
    }
    assert.equal(Object.hasOwn(Object.prototype, "untrustedInheritedValue"), false);
    assert.deepEqual(merge([], [payload()]), [{}]);
    assert.deepEqual(merge.all([payload(), { safe: true }]), { safe: true });
    const inheritedSource = Object.create({ inherited: true });
    inheritedSource.safe = 1;
    assert.deepEqual(merge({}, inheritedSource), { safe: 1 });
    // Preserve upstream's refusal to merge source keys inherited by an ordinary target.
    assert.deepEqual(merge({}, payload()), {});
  });

  test(`${name}: arrays, symbols, null values, clone options and custom merge preserve normal behavior`, () => {
    const symbol = Symbol("option");
    const target = { nested: { left: 1 }, list: [{ a: 1 }], value: null, [symbol]: { a: 1 } };
    const source = { nested: { right: 2 }, list: [{ b: 2 }], value: 3, [symbol]: { b: 2 } };
    const result = merge(target, source);
    assert.deepEqual(result, {
      nested: { left: 1, right: 2 }, list: [{ a: 1 }, { b: 2 }], value: 3, [symbol]: { a: 1, b: 2 },
    });
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.notEqual(result.nested, target.nested);
    assert.notEqual(result.list[0], target.list[0]);
    assert.deepEqual(target.nested, { left: 1 });
    assert.deepEqual(source.nested, { right: 2 });
    assert.deepEqual(merge({ list: [1] }, { list: [2] }, { arrayMerge: (_left, right) => right }), { list: [2] });
    assert.deepEqual(merge({ count: 2 }, { count: 3 }, {
      isMergeableObject: (value) => value !== null && (typeof value === "object" || typeof value === "number"),
      customMerge: (key) => key === "count" ? (left, right) => left + right : undefined,
    }), { count: 5 });
    const original = { nested: { keep: 1 } };
    assert.equal(merge({}, original, { clone: false }).nested, original.nested);
    assert.deepEqual(merge.all([{ a: 1 }, { b: 2 }]), { a: 1, b: 2 });
    assert.throws(() => merge.all({}), /array/);
  });
}

test("deepmerge exception does not accept new roots, nested paths, versions or advisories and expires", () => {
  const report = (path, version = "4.3.1", advisory = "GHSA-gcqx-w48m-w2h4") => ({
    metadata: { vulnerabilities: { low: 1, moderate: 0, high: 0, critical: 0 } },
    advisories: { 1: { github_advisory_id: advisory, module_name: "deepmerge", severity: "low", findings: [{ version, paths: [path] }] } },
  });
  for (const path of expectedPaths) assert.equal(evaluateAudit(report(path), policy, "2026-10-30").passed, true);
  for (const path of [
    "examples/product > deepmerge@4.3.1",
    expectedPaths[0].replace(" > deepmerge", " > unrelated@1.0.0 > deepmerge"),
    expectedPaths[0].replace(/( > [^ ]+@[^ ]+)( > )/, "$1-unreviewed$2"),
  ]) assert.equal(evaluateAudit(report(path), policy, "2026-10-30").passed, false);
  assert.equal(evaluateAudit(report(expectedPaths[0], "4.3.2"), policy, "2026-10-30").passed, false);
  assert.equal(evaluateAudit(report(expectedPaths[0], "4.3.1", "GHSA-newx-newx-newx"), policy, "2026-10-30").passed, false);
  assert.throws(() => evaluateAudit(report(expectedPaths[0]), policy, "2026-11-22"), /expired/);
});

test("Nuxt's installed seroval fixes script delimiters and untrusted typed-array constructors", () => {
  const workspace = createRequire(new URL("../../examples/nuxt-server-export/package.json", import.meta.url));
  const nuxt = createRequire(resolvePackage(workspace, "nuxt"));
  const builder = createRequire(resolvePackage(nuxt, "@nuxt/vite-builder"));
  const version = builder("seroval/package.json").version.split(".").map(Number);
  assert.ok(version[0] > 1 || (version[0] === 1 && (version[1] > 6 || (version[1] === 6 && version[2] >= 11))));
  const { serialize } = builder("seroval");
  const pattern = new RegExp("</script><script>untrusted</script>", "i");
  const regexOutput = serialize(pattern);
  assert.doesNotMatch(regexOutput, /<\/script/i);
  const restoredPattern = runInNewContext(regexOutput);
  assert.equal(restoredPattern.source, pattern.source);
  assert.equal(restoredPattern.flags, pattern.flags);
  const array = new Uint8Array([3, 4]);
  Object.defineProperty(array, "constructor", { value: { name: "SEROVAL_UNTRUSTED_CONSTRUCTOR" } });
  const output = serialize(array);
  assert.doesNotMatch(output, /SEROVAL_UNTRUSTED_CONSTRUCTOR/);
  const restoredArray = runInNewContext(output, { atob });
  assert.equal(Object.prototype.toString.call(restoredArray), "[object Uint8Array]");
  assert.deepEqual([...restoredArray], [3, 4]);
});
