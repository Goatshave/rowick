import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../../.github/workflows/labels.yml", import.meta.url), "utf8");
const catalog = JSON.parse(readFileSync(new URL("../../.github/labels.json", import.meta.url), "utf8"));
const script = workflow.split("          script: |\n")[1]?.replace(/^            /gm, "");
assert.ok(script, "label synchronization script must exist");
const execute = new (async function () {}).constructor("require", "github", "context", "core", script);

function fixture({ labels = catalog, existing = [], lookupError } = {}) {
  const stored = new Map(existing.map((label) => [label.name, { ...label }]));
  const writes = [];
  const repo = { owner: "example", repo: "rowick" };
  const api = {
    getLabel: async ({ owner, repo: name, name: label }) => {
      assert.deepEqual({ owner, repo: name }, repo);
      if (lookupError) throw lookupError;
      if (!stored.has(label)) throw Object.assign(new Error("Not found"), { status: 404 });
      return { data: stored.get(label) };
    },
    createLabel: async (input) => {
      writes.push({ operation: "create", ...input });
      stored.set(input.name, { name: input.name, color: input.color, description: input.description });
    },
    updateLabel: async (input) => {
      assert.ok(stored.has(input.name));
      writes.push({ operation: "update", ...input });
      stored.set(input.name, { ...stored.get(input.name), color: input.color, description: input.description });
    },
  };
  return {
    stored,
    writes,
    run: () => execute((name) => {
      assert.equal(name, "node:fs");
      return { readFileSync: (path, encoding) => {
        assert.equal(path, ".github/labels.json");
        assert.equal(encoding, "utf8");
        return JSON.stringify(labels);
      } };
    }, { rest: { issues: api } }, { repo }, { info() {} }),
  };
}

test("label setup creates catalog labels while preserving unrelated labels", async () => {
  const unrelated = { name: "product-owned", color: "ffffff", description: "Keep this label." };
  const state = fixture({ existing: [unrelated] });
  await state.run();
  assert.deepEqual(state.writes.map((write) => write.operation), catalog.map(() => "create"));
  assert.deepEqual(state.stored.get(unrelated.name), unrelated);
  for (const label of catalog) assert.deepEqual(state.stored.get(label.name), label);
});

test("label setup is idempotent when definitions already match", async () => {
  const state = fixture({ existing: catalog });
  await state.run();
  await state.run();
  assert.deepEqual(state.writes, []);
});

test("label setup only updates changed catalog metadata", async () => {
  const state = fixture({ existing: catalog.map((label, index) => index === 0 ? { ...label, color: "ffffff", description: "Old description" } : label) });
  await state.run();
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0].operation, "update");
  assert.deepEqual(state.stored.get(catalog[0].name), catalog[0]);
});

test("label setup propagates API permission failures without creating labels", async () => {
  const error = Object.assign(new Error("Forbidden"), { status: 403 });
  const state = fixture({ lookupError: error });
  await assert.rejects(state.run(), (actual) => actual === error);
  assert.deepEqual(state.writes, []);
});

test("invalid or duplicate catalog entries are rejected before mutations", async () => {
  for (const labels of [[], [{ ...catalog[0], color: 123456 }], [{ ...catalog[0], color: "invalid" }],
    [{ ...catalog[0], description: "x".repeat(101) }], [{ ...catalog[0], name: " " }],
    [catalog[0], { ...catalog[0], name: catalog[0].name.toUpperCase() }]]) {
    const state = fixture({ labels });
    await assert.rejects(state.run(), /catalog|definition/);
    assert.deepEqual(state.writes, []);
  }
});

test("archived catalog labels fail visibly instead of reporting usable defaults", async () => {
  const state = fixture({ labels: [catalog[0]], existing: [{ ...catalog[0], archived_at: "2026-10-30T00:00:00Z" }] });
  await assert.rejects(state.run(), /Restore the archived managed label/);
  assert.deepEqual(state.writes, []);
});
