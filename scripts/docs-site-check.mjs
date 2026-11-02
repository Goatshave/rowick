import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const base = "/rowick/";
const excluded = /^(?:maintainers(?:\/|$)|(?:README|maintaining|release|verification|dependency-security)(?:\.html|\/|$))/;
const excludedTitles = ["Verification guide for maintainers", "Release Readiness", "Maintainer guides"];

/** Validate the actual Pages artifact, including the generated local search index. */
export function checkDocumentationSite(directory) {
  const root = path.resolve(directory);
  const errors = [];
  const files = readdirSync(root, { recursive: true, withFileTypes: true });
  const html = [];
  for (const entry of files) {
    const file = path.join(entry.parentPath, entry.name);
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (entry.isSymbolicLink()) errors.push(`Pages artifact contains a symbolic link: ${relative}`);
    if (!entry.isFile()) continue;
    if (excluded.test(relative)) errors.push(`Maintainer-only route was built: ${relative}`);
    if (relative.endsWith(".html")) html.push(relative);
    if (/\.(?:html|js|json)$/.test(relative)) {
      const content = readFileSync(file, "utf8");
      for (const title of excludedTitles) {
        if (content.includes(title)) errors.push(`Maintainer content appears in ${relative}: ${title}`);
      }
    }
  }
  for (const required of ["index.html", "getting-started.html", "examples.html", "404.html"]) {
    if (!existsSync(path.join(root, required))) errors.push(`Required page is missing: ${required}`);
  }
  let references = 0;
  for (const page of html) {
    const content = readFileSync(path.join(root, page), "utf8");
    for (const match of content.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) {
      const value = match[1].replaceAll("&amp;", "&");
      const url = new URL(value, `https://docs.invalid${base}${page}`);
      if (url.origin !== "https://docs.invalid") continue;
      references++;
      if (!url.pathname.startsWith(base)) {
        errors.push(`${page}: reference leaves the project base: ${value}`);
        continue;
      }
      const target = decodeURIComponent(url.pathname.slice(base.length));
      if (excluded.test(target)) errors.push(`${page}: reference points to an excluded route: ${value}`);
      const candidates = target.endsWith("/") || !target
        ? [path.join(root, target, "index.html")]
        : [path.join(root, target), path.join(root, `${target}.html`), path.join(root, target, "index.html")];
      if (!candidates.some((file) => existsSync(file) && statSync(file).isFile())) {
        errors.push(`${page}: local page or asset is missing: ${value}`);
      }
    }
  }
  if (errors.length) throw new Error(`Documentation artifact check failed:\n${errors.join("\n")}`);
  return { pages: html.length, references, maintainerContentExcluded: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const directory = process.argv[2] ?? path.resolve(import.meta.dirname, "../website/.vitepress/dist");
  console.log(JSON.stringify(checkDocumentationSite(directory), null, 2));
}
