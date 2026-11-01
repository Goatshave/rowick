import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";

const repository = fileURLToPath(new URL("../", import.meta.url));
const sections = ["dependencies", "devDependencies", "optionalDependencies"];
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

export function verifyCompatibilityVersions(root = repository) {
  const policy = readJson(join(root, "compatibility/versions.json"));
  if (policy.version !== 1 || !policy.fixtures || typeof policy.fixtures !== "object" || Array.isArray(policy.fixtures)) {
    throw new Error("Invalid compatibility version policy");
  }
  const fixtureNames = Object.keys(policy.fixtures).sort();
  const directories = readdirSync(join(root, "compatibility"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (JSON.stringify(fixtureNames) !== JSON.stringify(directories) || !fixtureNames.length) {
    throw new Error("Every compatibility fixture must have a reviewed version policy");
  }
  const lock = parse(readFileSync(join(root, "pnpm-lock.yaml"), "utf8"), { uniqueKeys: true });
  if (String(lock?.lockfileVersion) !== "9.0" || !lock.importers) {
    throw new Error("Expected a pnpm 9 lockfile with compatibility importers");
  }
  const failures = [];
  let dependencyCount = 0;
  for (const fixture of fixtureNames) {
    const expected = policy.fixtures[fixture];
    if (!expected || typeof expected !== "object" || Array.isArray(expected) || !Object.keys(expected).length) {
      throw new Error(`Invalid compatibility version policy: ${fixture}`);
    }
    const directory = join(root, "compatibility", fixture);
    const manifest = readJson(join(directory, "package.json"));
    const importer = lock.importers[`compatibility/${fixture}`];
    const declared = new Map();
    for (const section of sections) {
      for (const [name, version] of Object.entries(manifest[section] ?? {})) {
        if (name.startsWith("@rowick/") && version === "workspace:*") continue;
        if (declared.has(name)) failures.push(`${fixture}: duplicate dependency ${name}`);
        declared.set(name, { section, version });
        if (!Object.hasOwn(expected, name)) failures.push(`${fixture}: ${name} has no reviewed version pin`);
      }
    }
    if (manifest.private !== true) failures.push(`${fixture}: compatibility fixtures must remain private`);
    for (const [name, pin] of Object.entries(expected)) {
      if (!/^\d+\.\d+\.\d+$/.test(pin)) throw new Error(`Expected an exact version pin: ${fixture} ${name}`);
      dependencyCount++;
      const declaration = declared.get(name);
      if (declaration?.version !== pin) failures.push(`${fixture}: ${name} manifest must pin ${pin}, got ${declaration?.version ?? "missing"}`);
      const locked = importer?.[declaration?.section]?.[name];
      if (locked?.specifier !== pin || typeof locked.version !== "string" ||
          !(locked.version === pin || locked.version.startsWith(`${pin}(`))) {
        failures.push(`${fixture}: ${name} lockfile must resolve ${pin}, got ${locked?.version ?? "missing"}`);
      }
      try {
        const installed = readJson(join(directory, "node_modules", name, "package.json"));
        if (installed.name !== name || installed.version !== pin) {
          failures.push(`${fixture}: ${name} installed package must be ${name}@${pin}, got ${installed.name}@${installed.version}`);
        }
      } catch {
        failures.push(`${fixture}: ${name}@${pin} is not installed; run pnpm install --frozen-lockfile`);
      }
    }
  }
  if (failures.length) throw new Error(`Compatibility version verification failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  return { fixtures: fixtureNames.length, dependencies: dependencyCount };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = verifyCompatibilityVersions();
    console.log(`Verified ${result.dependencies} exact dependency versions across ${result.fixtures} compatibility fixtures.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
