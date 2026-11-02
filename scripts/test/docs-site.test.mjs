import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { checkDocumentationSite } from "../docs-site-check.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "rowick-docs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of ["index.html", "getting-started.html", "examples.html", "404.html"]) {
    writeFileSync(path.join(root, file), '<a href="/rowick/getting-started">Guide</a><a href="https://github.com/Goatshave/rowick">Repository</a>');
  }
  return root;
}

test("Pages artifact resolves project-base pages and assets", (t) => {
  const root = fixture(t);
  mkdirSync(path.join(root, "assets"));
  writeFileSync(path.join(root, "assets", "app.js"), "export {};");
  writeFileSync(path.join(root, "examples.html"), '<script src="./assets/app.js"></script><a href="/rowick/">Home</a>');
  assert.deepEqual(checkDocumentationSite(root), { pages: 4, references: 5, maintainerContentExcluded: true });
});

test("Pages artifact rejects missing assets and references outside the project base", (t) => {
  const root = fixture(t);
  writeFileSync(path.join(root, "examples.html"), '<img src="/favicon.svg"><script src="/rowick/assets/missing.js"></script>');
  assert.throws(() => checkDocumentationSite(root), /reference leaves the project base[\s\S]*local page or asset is missing/);
});

test("Pages artifact rejects maintainer pages, links and search-index content", (t) => {
  const root = fixture(t);
  mkdirSync(path.join(root, "maintainers"));
  writeFileSync(path.join(root, "maintainers", "release.html"), "Release Readiness");
  writeFileSync(path.join(root, "examples.html"), '<a href="/rowick/maintainers/release">Release</a>');
  mkdirSync(path.join(root, "assets"));
  writeFileSync(path.join(root, "assets", "search.js"), 'export const title = "Verification guide for maintainers";');
  assert.throws(() => checkDocumentationSite(root), /Maintainer content appears[\s\S]*Maintainer-only route was built[\s\S]*excluded route/);
});

const workflow = parse(readFileSync(new URL("../../.github/workflows/docs-pages.yml", import.meta.url), "utf8"));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function verifySource(overrides = {}) {
  const outputs = {};
  const sha = "a".repeat(40);
  const script = workflow.jobs.verify.steps[0].with.script;
  await new AsyncFunction("github", "context", "core", script)({ rest: {
    git: { getRef: async () => ({ data: { object: { sha } } }) },
    actions: { listWorkflowRuns: async () => ({ data: { workflow_runs: [overrides.run ?? { status: "completed", conclusion: "success" }] } }) },
  } }, { repo: { owner: "Goatshave", repo: "rowick" }, payload: overrides.payload ?? { workflow_run: { head_sha: sha } } }, {
    notice() {}, setOutput: (key, value) => { outputs[key] = value; },
  });
  return outputs;
}

test("Pages deployment rejects failed CI and skips outdated main commits", async () => {
  assert.equal((await verifySource()).current, "true");
  assert.equal((await verifySource({ payload: { workflow_run: { head_sha: "b".repeat(40) } } })).current, "false");
  await assert.rejects(verifySource({ payload: {}, run: { status: "completed", conclusion: "failure" } }), /must pass CI/);
  await assert.rejects(verifySource({ payload: {}, run: { status: "in_progress", conclusion: null } }), /must pass CI/);
});

test("Pages publishing privileges are limited to the protected deploy job", () => {
  assert.deepEqual(workflow.on.workflow_run, { workflows: ["CI"], types: ["completed"], branches: ["main"] });
  assert.equal(workflow.on.pull_request, undefined);
  assert.match(workflow.jobs.verify.if, /head_repository.full_name == github.repository/);
  assert.match(workflow.jobs.verify.if, /workflow_run.event == 'push'/);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.deepEqual(workflow.jobs.verify.permissions, { contents: "read", actions: "read" });
  assert.equal(workflow.jobs.build.permissions, undefined);
  assert.equal(workflow.jobs.deploy.environment.name, "github-pages");
  assert.deepEqual(workflow.jobs.deploy.permissions, { contents: "read", pages: "write", "id-token": "write" });
  assert.ok(workflow.jobs.build.steps.some((step) => step.run === "pnpm docs:check"));
});
