import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { stringify } from "yaml";
import { verifyCompatibilityVersions } from "../compatibility-versions.mjs";

const policy = JSON.parse(readFileSync(new URL("../../compatibility/versions.json", import.meta.url), "utf8"));

test("repository fixtures keep their reviewed versions in the general test suite", () => {
  assert.doesNotThrow(() => verifyCompatibilityVersions());
});

function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), "rowick-compatibility-versions-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const writeJson = (file, value) => {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), `${JSON.stringify(value)}\n`);
  };
  writeJson("compatibility/versions.json", policy);
  const lock = { lockfileVersion: "9.0", importers: {} };
  for (const [fixture, dependencies] of Object.entries(policy.fixtures)) {
    writeJson(`compatibility/${fixture}/package.json`, { private: true, dependencies });
    lock.importers[`compatibility/${fixture}`] = { dependencies: {} };
    for (const [name, version] of Object.entries(dependencies)) {
      lock.importers[`compatibility/${fixture}`].dependencies[name] = { specifier: version, version: `${version}(peer@1.0.0)` };
      writeJson(`compatibility/${fixture}/node_modules/${name}/package.json`, { name, version });
    }
  }
  const saveLock = () => writeFileSync(join(root, "pnpm-lock.yaml"), stringify(lock));
  saveLock();
  return { root, lock, saveLock, writeJson };
}

test("compatibility pins agree with manifests, peer-qualified lock entries and installed packages", (t) => {
  const { root } = workspace(t);
  assert.deepEqual(verifyCompatibilityVersions(root), { fixtures: 3, dependencies: 11 });
});

for (const [name, version] of [["svelte", "5.57.3"], ["vite", "8.3.5"]]) {
  test(`rejects a lockfile-only ${name} major upgrade with its old specifier (#5/#6 regression)`, (t) => {
    const { root, lock, saveLock } = workspace(t);
    lock.importers["compatibility/svelte-4"].dependencies[name].version = version;
    saveLock();
    assert.throws(() => verifyCompatibilityVersions(root), new RegExp(`svelte-4: ${name} lockfile must resolve`));
  });
}

test("changing both a fixture manifest and lockfile cannot silently raise the reviewed minimum", (t) => {
  const { root, lock, saveLock, writeJson } = workspace(t);
  writeJson("compatibility/vue-3.4/package.json", { private: true, dependencies: { ...policy.fixtures["vue-3.4"], vue: "3.5.44" } });
  lock.importers["compatibility/vue-3.4"].dependencies.vue = { specifier: "3.5.44", version: "3.5.44" };
  saveLock();
  assert.throws(() => verifyCompatibilityVersions(root), /vue-3.4: vue manifest must pin 3\.4\.38/);
});

test("correct manifest and lock pins do not hide a wrong installed package", (t) => {
  const { root, writeJson } = workspace(t);
  writeJson("compatibility/svelte-4/node_modules/svelte/package.json", { name: "svelte", version: "5.57.3" });
  assert.throws(() => verifyCompatibilityVersions(root), /svelte-4: svelte installed package must be svelte@4\.2\.20/);
});

test("a missing install fails closed", (t) => {
  const { root } = workspace(t);
  rmSync(join(root, "compatibility/vue-3.4/node_modules/vue"), { recursive: true });
  assert.throws(() => verifyCompatibilityVersions(root), /vue-3.4: vue@3\.4\.38 is not installed/);
});

test("missing importers and mismatched lock specifiers fail closed", (t) => {
  const { root, lock, saveLock } = workspace(t);
  delete lock.importers["compatibility/react-18"];
  lock.importers["compatibility/vue-3.4"].dependencies.vue.specifier = "^3.4.38";
  saveLock();
  assert.throws(() => verifyCompatibilityVersions(root), /react-18: react lockfile must resolve/);
  assert.throws(() => verifyCompatibilityVersions(root), /vue-3.4: vue lockfile must resolve/);
});

test("new fixtures and unreviewed dependencies require an explicit policy entry", (t) => {
  const { root, writeJson } = workspace(t);
  writeJson("compatibility/vue-3.4/package.json", { private: true, dependencies: { ...policy.fixtures["vue-3.4"], extra: "1.0.0" } });
  assert.throws(() => verifyCompatibilityVersions(root), /extra has no reviewed version pin/);
  mkdirSync(join(root, "compatibility/new-fixture"));
  assert.throws(() => verifyCompatibilityVersions(root), /Every compatibility fixture must have a reviewed version policy/);
});
