import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdir, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

function dependency(parent, name) {
  for (const directory of parent.resolve.paths(name) ?? []) {
    const manifest = join(directory, name, "package.json");
    if (existsSync(manifest)) return createRequire(realpathSync(manifest));
  }
  throw new Error(`Installed dependency is missing: ${name}`);
}

const workspace = createRequire(new URL("../../examples/nuxt-server-export/package.json", import.meta.url));
const nitro = ["nuxt", "@nuxt/nitro-server", "nitropack"].reduce(dependency, workspace);
const tracer = dependency(nitro, "@vercel/nft");
const archiver = dependency(nitro, "archiver");
const archiveUtils = dependency(archiver, "archiver-utils");
const reader = dependency(archiver, "readdir-glob");

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "rowick-installed-globs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ["assets/a.txt", "assets/b.json", "assets/nested/c.txt", "assets/.hidden.txt", "assets/skip/no.txt"]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), path);
  }
  return root;
}

test("Nitro's installed tracer and archive glob consumers preserve async and sync matching", async (t) => {
  const cwd = fixture(t);
  const patterns = ["assets/**/*.txt", "!assets/skip/**"];
  assert.deepEqual(archiveUtils("archiver-utils").file.expand({ cwd, dot: true }, patterns).sort(), [
    "assets/.hidden.txt", "assets/a.txt", "assets/nested/c.txt",
  ]);
  assert.deepEqual((await tracer("glob").glob("assets/**/*.txt", { cwd, dot: true, ignore: "assets/skip/**" })).sort(), [
    "assets/.hidden.txt", "assets/a.txt", "assets/nested/c.txt",
  ]);
});

test("Nitro's installed archive reader preserves minimatch filters, dot files and skipped directories", async (t) => {
  const cwd = fixture(t);
  const matches = await new Promise((resolve, reject) => {
    const paths = [];
    reader("readdir-glob")(cwd, {
      pattern: "*.txt", matchBase: true, dot: true, nodir: true,
      ignore: "**/a.txt", skip: "**/skip",
    }).on("match", (entry) => paths.push(entry.relative.replaceAll("\\", "/")))
      .on("error", reject).on("end", () => resolve(paths.sort()));
  });
  assert.deepEqual(matches, ["assets/.hidden.txt", "assets/nested/c.txt"]);
});

test("installed glob stops traversal when an in-flight directory read completes after cancellation", async (t) => {
  const cwd = fixture(t);
  const controller = new AbortController();
  const reason = new Error("cancelled directory traversal");
  let reads = 0;
  const result = tracer("glob").glob("**/*", {
    cwd, signal: controller.signal,
    fs: {
      readdir(path, options, callback) {
        reads++;
        readdir(path, options, (error, entries) => {
          controller.abort(reason);
          callback(error, entries);
        });
      },
    },
  });
  await assert.rejects(result, (error) => error === reason);
  // Let already-scheduled callbacks finish before checking for unintended reads.
  await new Promise((resolve) => setImmediate(() => setImmediate(resolve)));
  assert.equal(reads, 1);
});

test("installed minimatch bounds globstar/parent preprocessing before pairwise optimization", () => {
  const script = `
    const assert = require("node:assert/strict");
    const { Minimatch } = require(process.argv[1]);
    const pattern = Array.from({ length: 12 }, (_, i) => "**/../a" + i + "/b" + i).join("/") + "/file.txt";
    const matcher = new Minimatch(pattern, { optimizationLevel: 2, braceExpandMax: 32 });
    assert.ok(matcher.globParts.length <= 32);
    assert.equal(new Minimatch("**/*.txt", { optimizationLevel: 2 }).match("assets/nested/c.txt"), true);
    assert.equal(new Minimatch("**/*.txt", { optimizationLevel: 2 }).match("assets/b.json"), false);
  `;
  // A regression must fail within a bounded child process rather than hang CI.
  execFileSync(process.execPath, ["-e", script, reader.resolve("minimatch")], { timeout: 5_000, stdio: "pipe" });
});
