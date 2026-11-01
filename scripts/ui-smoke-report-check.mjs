import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";
import { getUiSmokeSourceState } from "./ui-smoke-source-state.mjs";
import { uiSmokeTargets } from "./ui-smoke-targets.mjs";
import { createHash } from "node:crypto";

const defaultReportFile = ".release/ui-smoke-report.json";
const defaultMaxAgeDays = 7;
const githubWorkflowDispatchInputLimit = 65_535;
const maxEncodedUiSmokeReportCharacters = 60_000;
let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`UI smoke report check failed: ${error.message}`);
  process.exit(1);
}

const reportFile = resolve(args.file);
const failures = [];
let report;
let reportText;
let source;

try {
  source = getUiSmokeSourceState();
} catch (error) {
  failures.push(`unable to capture current source state: ${error.message}`);
}

try {
  reportText = readFileSync(reportFile, "utf8");
  report = JSON.parse(reportText);
} catch (error) {
  failures.push(`${args.file}: ${formatReadError(error)}`);
}

const reportSize = reportText === undefined ? undefined : measureText(JSON.stringify(reportText));
if (reportSize !== undefined) {
  if (reportSize.characters > maxEncodedUiSmokeReportCharacters || reportSize.bytes > maxEncodedUiSmokeReportCharacters) {
    failures.push(
      `encoded UI smoke report must be at most ${maxEncodedUiSmokeReportCharacters} characters and bytes for workflow dispatch; got ${reportSize.characters} characters and ${reportSize.bytes} bytes`,
    );
  }
}

const workflowDispatchPayload = reportText === undefined || args.releaseContext === undefined
  ? undefined
  : measureText(JSON.stringify({
      version: args.releaseContext.version,
      repository_url: args.releaseContext.repositoryUrl,
      npm_tag: args.releaseContext.tag,
      confirm_publish: "publish-rowick",
      ui_smoke_report: reportText,
      bootstrap_first_publish: "true",
      initial_release_exceptions: args.allowInitialReleaseExceptions ? "true" : "false",
    }));
if (workflowDispatchPayload !== undefined) {
  if (
    workflowDispatchPayload.characters > githubWorkflowDispatchInputLimit
    || workflowDispatchPayload.bytes > githubWorkflowDispatchInputLimit
  ) {
    failures.push(
      `workflow dispatch inputs must be at most ${githubWorkflowDispatchInputLimit} characters and bytes; got ${workflowDispatchPayload.characters} characters and ${workflowDispatchPayload.bytes} bytes`,
    );
  }
}

if (report !== undefined && source !== undefined) {
  validateReport(report, source, args, failures);
}

const result = {
  reportFile,
  ready: failures.length === 0,
  source,
  allowDirty: args.allowDirty,
  maxAgeDays: args.maxAgeDays,
  maxEncodedReportCharacters: maxEncodedUiSmokeReportCharacters,
  reportCharacters: reportText?.length,
  encodedReportCharacters: reportSize?.characters,
  encodedReportBytes: reportSize?.bytes,
  workflowDispatchInputLimit: githubWorkflowDispatchInputLimit,
  workflowDispatchPayloadCharacters: workflowDispatchPayload?.characters,
  workflowDispatchPayloadBytes: workflowDispatchPayload?.bytes,
  targetCount: uiSmokeTargets.length,
  functionalCheckCount: uiSmokeTargets.reduce((count, target) => count + target.manualChecks.length, 0),
  accessibilityCheckCount: uiSmokeTargets.reduce((count, target) => count + target.accessibilityChecks.length, 0),
  initialReleaseExceptionApplied: failures.length === 0 && Boolean(report?.initialReleaseException),
  notTestedCheckCount: (Array.isArray(report?.targets) ? report.targets : []).flatMap(target => [
    ...(Array.isArray(target?.manualChecks) ? target.manualChecks : []),
    ...(Array.isArray(target?.accessibilityChecks) ? target.accessibilityChecks : []),
  ]).filter(check => check?.result === "not-tested").length,
  failures,
};

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.ready) {
  if (result.initialReleaseExceptionApplied) {
    console.log(`Initial 0.1.0 release evidence accepted with ${result.notTestedCheckCount} manual checks explicitly not tested; see docs/initial-release-validation.md.`);
  } else console.log(
    `UI smoke report check passed for ${result.targetCount} targets, ${result.functionalCheckCount} functional checks, and ${result.accessibilityCheckCount} accessibility checks.`,
  );
  console.log(`Report file: ${result.reportFile}`);
  console.log(`Source revision: ${result.source.revision}`);
  console.log(`Source fingerprint: ${result.source.fingerprint}`);
  console.log(`Encoded report size: ${result.encodedReportCharacters} characters, ${result.encodedReportBytes} bytes`);
  if (result.workflowDispatchPayloadCharacters !== undefined) {
    console.log(
      `Workflow dispatch payload: ${result.workflowDispatchPayloadCharacters}/${result.workflowDispatchInputLimit} characters, ${result.workflowDispatchPayloadBytes}/${result.workflowDispatchInputLimit} bytes`,
    );
  }
  if (result.source.dirty) {
    console.log("Development-only approval: relevant source changes are present and --allow-dirty was used.");
  }
} else {
  console.error("UI smoke report check failed:");
  console.error(`Report file: ${result.reportFile}`);
  console.error(`Expected targets: ${result.targetCount}`);
  console.error(`Expected functional checks: ${result.functionalCheckCount}`);
  console.error(`Expected accessibility checks: ${result.accessibilityCheckCount}`);
  console.error(`Maximum review age: ${result.maxAgeDays} day(s)`);
  console.error(`Maximum encoded report size: ${result.maxEncodedReportCharacters} characters and bytes`);
  console.error("");
  console.error("Failures:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
}

if (!result.ready) {
  process.exitCode = 1;
}

function validateReport(value, expectedSource, options, output) {
  if (!isRecord(value)) {
    output.push("report root must be a JSON object");
    return;
  }

  if (value.report !== "ui-smoke-inspection") {
    output.push('report must equal "ui-smoke-inspection"');
  }

  validateSource(value.source, expectedSource, options, output);
  const initialException = validateInitialException(value, expectedSource, options, output);
  validateReviewEnvironment(value.reviewEnvironment, options.maxAgeDays, output, initialException);
  validateTargets(value.targets, output, initialException);
}

function validateInitialException(report, source, options, output) {
  const exception = report.initialReleaseException;
  if (exception === undefined) return false;
  const start = output.length;
  const context = options.releaseContext;
  if (!options.allowInitialReleaseExceptions || source.workspaceVersion !== "0.1.0" ||
      context?.version !== "0.1.0" || context?.tag !== "latest" ||
      context?.repositoryUrl !== "git+https://github.com/Goatshave/rowick.git") {
    output.push("initial release exceptions require explicit opt-in and canonical 0.1.0/latest release context");
  }
  if (!isRecord(exception) || exception.version !== "0.1.0" || exception.approvedBy !== "fabric0de" ||
      exception.approvedOn !== report.reviewEnvironment?.date || !isNonEmptyString(exception.reason) ||
      exception.policy !== "docs/initial-release-validation.md") {
    output.push("initial release exception must record the release owner, date, reason and public 0.1.0 policy");
  }
  try {
    const digest = createHash("sha256").update(readFileSync("docs/initial-release-validation.md")).digest("hex");
    if (exception?.policySha256 !== digest) output.push("initial release exception policy hash must match the public committed policy");
  } catch { output.push("initial release exception public policy must exist"); }
  if (!Array.isArray(report.observations) || report.observations.length === 0 ||
      report.observations.some(item => !isRecord(item) || !isNonEmptyString(item.scope) || !isNonEmptyString(item.evidence))) {
    output.push("initial release evidence must preserve concrete observed results separately from untested checks");
  }
  return output.length === start;
}

function validateSource(value, expected, options, output) {
  if (!isRecord(value)) {
    output.push("source must be a JSON object");
    return;
  }

  for (const field of ["revision", "workspaceVersion", "fingerprint", "fileCount"]) {
    if (value[field] !== expected[field]) {
      output.push(`source.${field} must match the current UI source state`);
    }
  }

  if (value.dirty !== expected.dirty) {
    output.push("source.dirty must match the current UI source state");
  }
  if (!options.allowDirty && (value.dirty === true || expected.dirty)) {
    output.push("release approval requires a clean relevant source tree; regenerate after committing UI source changes");
  }
}

function validateReviewEnvironment(value, maxAgeDays, output, initialException = false) {
  const fields = [
    ["reviewer", "reviewer"],
    ["date", "date"],
    ["operatingSystem", "operating system"],
    ["browser", "browser"],
    ["browserZoom", "browser zoom"],
    ["viewport", "viewport"],
    ["screenReader", "screen reader"],
    ["forcedColorsOrHighContrast", "forced-colors/high-contrast setup"],
  ];

  if (!isRecord(value)) {
    output.push("reviewEnvironment must be a JSON object");
    return;
  }

  for (const [field, label] of fields) {
    if (!isNonEmptyString(value[field])) {
      output.push(`reviewEnvironment.${field} (${label}) is required`);
    }
  }

  if (isNonEmptyString(value.browserZoom) && value.browserZoom.trim() !== "200%" && !(initialException && value.browserZoom === "not-tested")) {
    output.push('reviewEnvironment.browserZoom must equal "200%"');
  }
  if (isNonEmptyString(value.viewport) && value.viewport.trim() !== "390 CSS px" && !(initialException && value.viewport === "not-tested")) {
    output.push('reviewEnvironment.viewport must equal "390 CSS px"');
  }

  if (isNonEmptyString(value.date)) {
    const reviewDate = parseIsoDate(value.date.trim());
    if (!reviewDate) {
      output.push("reviewEnvironment.date must use a valid YYYY-MM-DD date");
    } else {
      const today = localCalendarDayAsUtc(new Date());
      const ageDays = Math.floor((today.getTime() - reviewDate.getTime()) / 86_400_000);
      if (ageDays < 0) {
        output.push("reviewEnvironment.date cannot be in the future");
      } else if (ageDays > maxAgeDays) {
        output.push(`reviewEnvironment.date must be no more than ${maxAgeDays} day(s) old`);
      }
    }
  }
}

function validateTargets(value, output, initialException = false) {
  if (!Array.isArray(value)) {
    output.push("targets must be an array");
    return;
  }

  const expectedFrameworks = new Set(uiSmokeTargets.map((target) => target.framework));
  const seenFrameworks = new Set();

  for (const target of value) {
    const framework = isRecord(target) && typeof target.framework === "string" ? target.framework : undefined;
    if (!framework) {
      output.push("every target must include a framework");
      continue;
    }
    if (seenFrameworks.has(framework)) {
      output.push(`${framework}: target is duplicated`);
    }
    seenFrameworks.add(framework);
    if (!expectedFrameworks.has(framework)) {
      output.push(`${framework}: target is not part of the current UI smoke contract`);
    }
  }

  for (const expected of uiSmokeTargets) {
    const matches = value.filter((target) => isRecord(target) && target.framework === expected.framework);
    if (matches.length === 0) {
      output.push(`${expected.framework}: target is required`);
      continue;
    }
    validateTarget(matches[0], expected, output, initialException);
  }
}

function validateTarget(value, expected, output, initialException = false) {
  const prefix = expected.framework;

  if (value.url !== expected.url) {
    output.push(`${prefix}: URL must match the current smoke target ${expected.url}`);
  }
  if (!sameValue(value.smokeCheck, expected.smokeCheck)) {
    output.push(`${prefix}: smokeCheck must match the current smoke target contract`);
  }
  if (!sameValue(value.stateCheck, expected.stateCheck)) {
    output.push(`${prefix}: stateCheck must match the current smoke target contract`);
  }
  if (!sameValue(value.workflowCheck, expected.workflowCheck)) {
    output.push(`${prefix}: workflowCheck must match the current smoke target contract`);
  }

  validatePassedEvidence(value, prefix, output, initialException);
  validateCheckCollection(value.manualChecks, expected.manualChecks, `${prefix} functional checks`, output, initialException);
  validateCheckCollection(value.accessibilityChecks, expected.accessibilityChecks, `${prefix} accessibility checks`, output, initialException);
  if (initialException && value.result === "pass" && [value.manualChecks, value.accessibilityChecks]
    .some(items => Array.isArray(items) && items.some(item => item?.result !== "pass"))) {
    output.push(`${prefix}: a partially tested target cannot be recorded as pass`);
  }
}

function validateCheckCollection(value, expectedChecks, prefix, output, initialException = false) {
  if (!Array.isArray(value)) {
    output.push(`${prefix}: checks must be an array`);
    return;
  }

  if (value.length !== expectedChecks.length) {
    output.push(`${prefix}: expected ${expectedChecks.length} checks but found ${value.length}`);
  }

  for (let index = 0; index < expectedChecks.length; index += 1) {
    const item = value[index];
    const itemPrefix = `${prefix}[${index + 1}]`;
    if (!isRecord(item)) {
      output.push(`${itemPrefix}: check result must be a JSON object`);
      continue;
    }
    if (item.check !== expectedChecks[index]) {
      output.push(`${itemPrefix}: check text must match the current UI smoke contract`);
    }
    validatePassedEvidence(item, itemPrefix, output, initialException);
  }
}

function validatePassedEvidence(value, prefix, output, initialException = false) {
  if (value.result !== "pass" && !(initialException && value.result === "not-tested")) {
    output.push(`${prefix}: result must be "pass"; got ${JSON.stringify(value.result)}`);
  }
  if (!isNonEmptyString(value.evidence)) {
    output.push(`${prefix}: evidence is required`);
  }
}

function parseArgs(argv) {
  const parsed = {
    allowDirty: false,
    file: defaultReportFile,
    json: false,
    maxAgeDays: defaultMaxAgeDays,
    repositoryUrl: undefined,
    tag: undefined,
    version: undefined,
    allowInitialReleaseExceptions: process.env.ROWICK_INITIAL_RELEASE_EXCEPTIONS === "true",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    } else if (arg === "--allow-dirty") {
      parsed.allowDirty = true;
    } else if (arg === "--allow-initial-release-exceptions") {
      parsed.allowInitialReleaseExceptions = true;
    } else if (arg === "--file") {
      parsed.file = requireArgValue(argv, index, "--file");
      index += 1;
    } else if (arg?.startsWith("--file=")) {
      parsed.file = arg.slice("--file=".length);
      requireNonEmpty(parsed.file, "--file");
    } else if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--max-age-days") {
      parsed.maxAgeDays = parseNonNegativeInteger(requireArgValue(argv, index, "--max-age-days"), "--max-age-days");
      index += 1;
    } else if (arg?.startsWith("--max-age-days=")) {
      parsed.maxAgeDays = parseNonNegativeInteger(arg.slice("--max-age-days=".length), "--max-age-days");
    } else if (arg === "--repository-url") {
      parsed.repositoryUrl = requireArgValue(argv, index, "--repository-url");
      index += 1;
    } else if (arg?.startsWith("--repository-url=")) {
      parsed.repositoryUrl = arg.slice("--repository-url=".length);
      requireNonEmpty(parsed.repositoryUrl, "--repository-url");
    } else if (arg === "--tag") {
      parsed.tag = requireArgValue(argv, index, "--tag");
      index += 1;
    } else if (arg?.startsWith("--tag=")) {
      parsed.tag = arg.slice("--tag=".length);
      requireNonEmpty(parsed.tag, "--tag");
    } else if (arg === "--version") {
      parsed.version = requireArgValue(argv, index, "--version");
      index += 1;
    } else if (arg?.startsWith("--version=")) {
      parsed.version = arg.slice("--version=".length);
      requireNonEmpty(parsed.version, "--version");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const releaseValues = [parsed.version, parsed.repositoryUrl, parsed.tag];
  const releaseValueCount = releaseValues.filter((value) => value !== undefined).length;
  if (releaseValueCount !== 0 && releaseValueCount !== releaseValues.length) {
    throw new Error("--version, --repository-url, and --tag must be provided together");
  }
  parsed.releaseContext = releaseValueCount === releaseValues.length
    ? { version: parsed.version, repositoryUrl: parsed.repositoryUrl, tag: parsed.tag }
    : undefined;

  return parsed;
}

function requireArgValue(argv, index, name) {
  const value = argv[index + 1];
  requireNonEmpty(value, name);
  return value;
}

function requireNonEmpty(value, name) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
}

function parseNonNegativeInteger(value, name) {
  requireNonEmpty(value, name);
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} requires a non-negative integer`);
  }
  return Number.parseInt(value, 10);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : undefined;
}

function localCalendarDayAsUtc(value) {
  return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
}

function sameValue(left, right) {
  return isDeepStrictEqual(left, right);
}

function measureText(value) {
  return {
    characters: value.length,
    bytes: Buffer.byteLength(value, "utf8"),
  };
}

function formatReadError(error) {
  if (error?.code === "ENOENT") {
    return "report file does not exist";
  }
  if (error instanceof SyntaxError) {
    return `report file is not valid JSON: ${error.message}`;
  }
  return error?.message ?? String(error);
}
