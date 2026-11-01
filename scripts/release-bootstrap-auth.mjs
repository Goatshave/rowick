import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function validateBootstrapTarget(env) {
  const enabled = env.BOOTSTRAP_FIRST_PUBLISH ?? '';
  if (enabled === '' || enabled === 'false') return false;
  if (enabled !== 'true') throw new Error('bootstrap_first_publish must be true or false');
  if (env.RELEASE_VERSION !== '0.1.0' || env.NPM_TAG !== 'latest') {
    throw new Error('First-publication authentication is restricted to 0.1.0 with tag latest');
  }
  if (env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_REPOSITORY !== 'Goatshave/rowick' ||
      env.REPOSITORY_URL !== 'git+https://github.com/Goatshave/rowick.git') {
    throw new Error('First-publication authentication requires the canonical Rowick main branch');
  }
  return true;
}

export function readBootstrapPackages(root) {
  const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (rootManifest.version !== '0.1.0') throw new Error('Workspace version must be 0.1.0');
  const packages = readdirSync(join(root, 'packages'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => JSON.parse(readFileSync(join(root, 'packages', entry.name, 'package.json'), 'utf8')))
    .filter(manifest => manifest.private !== true);
  if (packages.length !== 12) throw new Error('First publication requires all twelve public Rowick packages');
  const names = new Set();
  for (const manifest of packages) {
    if (!/^@rowick\/[a-z0-9-]+$/.test(manifest.name) || manifest.version !== '0.1.0' ||
        manifest.publishConfig?.access !== 'public' || names.has(manifest.name)) {
      throw new Error('First publication requires unique public @rowick/* packages at 0.1.0');
    }
    names.add(manifest.name);
  }
  return [...names].sort();
}

export async function requireUnpublishedPackages(names, fetchRegistry = fetch) {
  for (const name of names) {
    const response = await fetchRegistry(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(20_000),
      redirect: 'error',
    });
    // Only a registry "not found" response permits bootstrapping. Authentication,
    // rate-limit, transport and server failures must never be treated as absence.
    await response.body?.cancel();
    if (response.status !== 404) {
      throw new Error(`${name}: first publication requires registry 404; received ${response.status}. Use OIDC or review partial publication before retrying.`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (validateBootstrapTarget(process.env)) {
      const names = readBootstrapPackages(process.cwd());
      await requireUnpublishedPackages(names);
      console.log(`First-publication target verified: ${names.length} unregistered packages at 0.1.0.`);
    } else {
      console.log('Standard npm OIDC publishing selected; bootstrap authentication is disabled.');
    }
  } catch (error) {
    console.error(`First-publication preflight failed: ${error.message}`);
    process.exitCode = 1;
  }
}
