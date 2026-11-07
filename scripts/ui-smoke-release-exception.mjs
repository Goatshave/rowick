import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const policies = [
  { field: "initialReleaseException", flag: "allowInitialReleaseExceptions", version: "0.1.0", policy: "docs/initial-release-validation.md", label: "initial release" },
  { field: "patchReleaseException", flag: "allowPatchReleaseExceptions", version: "0.1.1", policy: "docs/0.1.1-validation.md", label: "0.1.1 patch release" },
];
const nonEmpty = value => typeof value === "string" && value.trim().length > 0;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);

/** Each owner-approved exception is confined to one version, policy and source. */
export function validateReleaseException(report, source, options, output, readPolicy = path => readFileSync(path)) {
  const present = policies.filter(policy => report[policy.field] !== undefined);
  if (present.length === 0) return false;
  if (present.length !== 1) {
    output.push("only one release validation exception may be recorded");
    return false;
  }
  const policy = present[0], exception = report[policy.field], context = options.releaseContext;
  const start = output.length;
  if (!options[policy.flag] || source.workspaceVersion !== policy.version ||
      context?.version !== policy.version || context?.tag !== "latest" ||
      context?.repositoryUrl !== "git+https://github.com/Goatshave/rowick.git") {
    output.push(`${policy.label} exceptions require explicit opt-in and canonical ${policy.version}/latest release context`);
  }
  if (!record(exception) || exception.version !== policy.version || exception.approvedBy !== "fabric0de" ||
      exception.approvedOn !== report.reviewEnvironment?.date || !nonEmpty(exception.reason) || exception.policy !== policy.policy) {
    output.push(`${policy.label} exception must record the release owner, date, reason and public ${policy.version} policy`);
  }
  try {
    const digest = createHash("sha256").update(readPolicy(policy.policy)).digest("hex");
    if (exception?.policySha256 !== digest) output.push(`${policy.label} exception policy hash must match the public committed policy`);
  } catch { output.push(`${policy.label} exception public policy must exist`); }
  if (!Array.isArray(report.observations) || report.observations.length === 0 ||
      report.observations.some(item => !record(item) || !nonEmpty(item.scope) || !nonEmpty(item.evidence))) {
    output.push(`${policy.label} evidence must preserve concrete observed results separately from untested checks`);
  }
  return output.length === start;
}
