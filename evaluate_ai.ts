import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

type Expected = {
  bloodGroup: string | null;
  quantity: number | null;
  urgency: "LOW" | "MEDIUM" | "HIGH";
};

type Test = {
  id: number;
  input: string;
  expected: Expected;
};

const tests: Test[] = [];

function add(
  input: string,
  bloodGroup: string | null,
  quantity: number | null,
  urgency: Expected["urgency"]
) {
  tests.push({
    id: tests.length + 1,
    input,
    expected: { bloodGroup, quantity, urgency },
  });
}

// 1–16: All eight blood groups, with clear urgency.
for (const group of ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]) {
  add(`Need 2 units of ${group}.`, group, 2, "MEDIUM");
  add(
    `Emergency: need 3 units of ${group} immediately.`,
    group, 3, "HIGH"
  );
}

// 17–26: Quantities and wording variations.
add("Need five units of O positive.", "O+", 5, "MEDIUM");
add("Please send a dozen units of A negative.", "A-", 12, "MEDIUM");
add("Need half a dozen units of AB negative.", "AB-", 6, "MEDIUM");
add("Requesting twenty units of B positive.", "B+", 20, "MEDIUM");
add("Need one unit of A positive.", "A+", 1, "MEDIUM");
add("Please send 7 units of B negative.", "B-", 7, "MEDIUM");
add("Looking for 4 units of AB positive.", "AB+", 4, "MEDIUM");
add("Need 10 units of O negative.", "O-", 10, "MEDIUM");
add("Request: A+, quantity 6 units.", "A+", 6, "MEDIUM");
add("Please arrange 9 units of B+.", "B+", 9, "MEDIUM");

// 27–34: Explicit urgency labels.
add("Non-urgent request for 2 units of O-.", "O-", 2, "LOW");
add("Routine request for 3 units of A+.", "A+", 3, "LOW");
add("Informational inquiry: is AB+ available?", "AB+", null, "LOW");
add("Non-urgent: need 1 unit of B-.", "B-", 1, "LOW");
add("Emergency: need 4 units of AB- now.", "AB-", 4, "HIGH");
add("Urgently send 5 units of O+ immediately.", "O+", 5, "HIGH");
add("Emergency: require 2 units of A-.", "A-", 2, "HIGH");
add("Need 6 units of B+ right now, immediately.", "B+", 6, "HIGH");

// 35–42: Missing information, ambiguity and multiple groups.
add("Need 2 units of blood.", null, 2, "MEDIUM");
add("Need O- blood.", "O-", null, "MEDIUM");
add("Need 3 units of O type blood.", null, 3, "MEDIUM");
add("Need blood from all blood groups.", "All", null, "MEDIUM");
add("Need 4 units of O- and 2 units of A+.", null, null, "MEDIUM");
add("Need blood.", null, null, "MEDIUM");
add("Emergency: need blood immediately.", null, null, "HIGH");
add("Non-urgent request for AB- blood.", "AB-", null, "LOW");

// 43–50: Unrelated and veterinary requests.
add("Order a pizza.", null, null, "LOW");
add("What is the weather today?", null, null, "LOW");
add("Book a train ticket.", null, null, "LOW");
add("Tell me a joke.", null, null, "LOW");
add("Need blood for my dog.", null, null, "LOW");
add("Find a blood donor for my cat.", null, null, "LOW");
add("Please repair my laptop.", null, null, "LOW");
add("Where can I buy a phone charger?", null, null, "LOW");

const hash = (text: string) =>
  createHash("sha256").update(text).digest("hex");

const sleep = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

const groups = new Set([
  "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "All",
]);

function schemaValid(value: any): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value.bloodGroup === null || groups.has(value.bloodGroup)) &&
    (
      value.quantity === null ||
      (Number.isInteger(value.quantity) && value.quantity > 0)
    ) &&
    ["LOW", "MEDIUM", "HIGH"].includes(value.urgency) &&
    typeof value.replyMessage === "string"
  );
}

function safeError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  const key = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (key) message = message.split(key).join("[REDACTED]");
  return message;
}

function csvCell(value: unknown): string {
  const text = value == null
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

async function main() {
  if (tests.length !== 50) throw new Error("Expected exactly 50 tests.");

  const servicePath = path.resolve("app/geminiService.ts");

  if (!fs.existsSync(servicePath)) {
    throw new Error(`Service not found: ${servicePath}`);
  }

  const serviceSource = fs.readFileSync(servicePath, "utf8");
  const serviceHash = hash(serviceSource);
  const datasetHash = hash(JSON.stringify(tests));

  // Review the dataset without calling Gemini.
  if (process.argv.includes("--review")) {
    fs.writeFileSync(
      "ai_dataset_review.json",
      JSON.stringify(tests, null, 2)
    );
    console.log("Saved ai_dataset_review.json. No API calls made.");
    return;
  }

  if (!process.argv.includes("--run")) {
    console.log("Review dataset: npx tsx evaluate_ai.ts --review");
    console.log("Start testing: npx tsx evaluate_ai.ts --run");
    console.log(
      "Resume: npx tsx evaluate_ai.ts --run --resume ai_evidence/RUN/report.json"
    );
    return;
  }

  if (!process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim()) {
    throw new Error("EXPO_PUBLIC_GEMINI_API_KEY is missing from .env");
  }

  const resumeIndex = process.argv.indexOf("--resume");
  const resumeFile = resumeIndex >= 0
    ? process.argv[resumeIndex + 1]
    : undefined;

  if (resumeIndex >= 0 && !resumeFile) {
    throw new Error("Provide the report.json path after --resume.");
  }

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = resumeFile
    ? path.resolve(resumeFile)
    : path.resolve("ai_evidence", runId, "report.json");

  const directory = path.dirname(reportPath);
  fs.mkdirSync(directory, { recursive: true });

  let report: any;

  if (resumeFile) {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

    if (
      report.serviceSha256 !== serviceHash ||
      report.datasetSha256 !== datasetHash
    ) {
      throw new Error(
        "Service or dataset changed. Start a new experiment; do not mix versions."
      );
    }
  } else {
    report = {
      experiment: "Exploratory 50-query text extraction evaluation",
      startedAt: new Date().toISOString(),
      servicePath: "app/geminiService.ts",
      serviceSha256: serviceHash,
      datasetSha256: datasetHash,
      modelFromSource:
        serviceSource.match(/const MODEL\s*=\s*["']([^"']+)["']/)?.[1]
        ?? "See service source",
      nodeVersion: process.version,
      timingBoundary: "Immediately before parser call to return or exception",
      policy: {
        automaticRetries: false,
        quotaFailure: "Save and stop; explicit resume permitted",
        incorrectAnswer: "Record once; never retry to obtain a pass",
        otherFailure: "Record as terminal for this experiment",
      },
      dataset: tests,
      rows: tests.map(test => ({
        ...test,
        status: "pending",
        attempts: [],
        actual: null,
        checks: null,
      })),
    };
  }

  const count = (predicate: (row: any) => boolean) =>
    report.rows.filter(predicate).length;

  function save() {
    const valid = count(row => row.status === "completed");
    const exact = count(row => row.checks?.exactMatch === true);
    const attempted = count(row => row.attempts.length > 0);

    const percent = (a: number, b: number) =>
      b ? Number((100 * a / b).toFixed(2)) : null;

    report.updatedAt = new Date().toISOString();
    report.summary = {
      plannedQueries: tests.length,
      attemptedQueries: attempted,
      validCompletedResponses: valid,
      exactMatches: exact,
      terminalFailures: count(row => row.status === "failed"),
      quotaBlockedQueries: count(row => row.status === "quota_blocked"),
      pendingQueries: count(row => row.status === "pending"),
      completionPercent: percent(valid, tests.length),
      exactMatchPercentAmongValid: percent(exact, valid),
      overallSuccessfulExtractionPercent: percent(exact, tests.length),
      bloodGroupAccuracyAmongValid: percent(
        count(row => row.checks?.bloodGroup === true), valid
      ),
      quantityAccuracyAmongValid: percent(
        count(row => row.checks?.quantity === true), valid
      ),
      urgencyAccuracyAmongValid: percent(
        count(row => row.checks?.urgency === true), valid
      ),
      totalRecordedAttempts: report.rows.reduce(
        (sum: number, row: any) => sum + row.attempts.length, 0
      ),
      complete: report.rows.every(
        (row: any) => ["completed", "failed"].includes(row.status)
      ),
    };

    const temporary = `${reportPath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(report, null, 2));
    fs.renameSync(temporary, reportPath);

    const columns = [
      "queryId", "input", "expected", "actual", "status",
      "schemaValid", "bloodGroupCorrect", "quantityCorrect",
      "urgencyCorrect", "exactMatch", "attempts", "retries",
      "lastAttemptDurationMs", "lastError",
    ];

    const rows = report.rows.map((row: any) => {
      const last = row.attempts[row.attempts.length - 1];

      return [
        row.id, row.input, row.expected, row.actual, row.status,
        row.checks?.schemaValid,
        row.checks?.bloodGroup,
        row.checks?.quantity,
        row.checks?.urgency,
        row.checks?.exactMatch,
        row.attempts.length,
        Math.max(0, row.attempts.length - 1),
        last?.durationMs,
        last?.error,
      ].map(csvCell).join(",");
    });

    fs.writeFileSync(
      path.join(directory, "results.csv"),
      [columns.join(","), ...rows].join("\n")
    );
  }

  // The actual app parser is imported; no duplicate test-only prompt.
  const service = await import(pathToFileURL(servicePath).href);
  const parseQuery =
    service.parseQueryWithGemini ??
    service.default?.parseQueryWithGemini;

  if (typeof parseQuery !== "function") {
    throw new Error("Service does not export parseQueryWithGemini.");
  }

  const delayMs = Number(process.env.AI_EVAL_DELAY_MS ?? "15000");
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error("AI_EVAL_DELAY_MS must be a nonnegative number.");
  }

  save();
  console.log(`Evidence folder: ${directory}`);

  for (const row of report.rows) {
    if (["completed", "failed"].includes(row.status)) continue;

    // An interrupted request might already have reached the API.
    // Do not silently submit it again.
    if (row.status === "in_progress") {
      row.status = "failed";
      row.attempts[row.attempts.length - 1].error =
        "Interrupted attempt; outcome unknown.";
      row.attempts[row.attempts.length - 1].status = "interrupted";
      save();
      continue;
    }

    const attempt: any = {
      number: row.attempts.length + 1,
      startedAt: new Date().toISOString(),
      status: "in_progress",
    };

    row.attempts.push(attempt);
    row.status = "in_progress";
    save();

    const started = performance.now();

    try {
      const actual = await parseQuery(row.input);
      attempt.durationMs = Number((performance.now() - started).toFixed(2));
      attempt.status = "returned";
      attempt.actual = actual;
      row.actual = actual;

      const valid = schemaValid(actual);

      row.checks = {
        schemaValid: valid,
        bloodGroup: valid && actual.bloodGroup === row.expected.bloodGroup,
        quantity: valid && actual.quantity === row.expected.quantity,
        urgency: valid && actual.urgency === row.expected.urgency,
      };

      row.checks.exactMatch =
        row.checks.bloodGroup &&
        row.checks.quantity &&
        row.checks.urgency;

      row.status = valid ? "completed" : "failed";

      if (!valid) attempt.error = "Returned object failed schema validation.";

      console.log(
        `[${row.id}/50] ${
          !valid ? "INVALID RESPONSE" :
          row.checks.exactMatch ? "MATCH" : "MISMATCH"
        } | ${attempt.durationMs} ms`
      );
    } catch (error) {
      attempt.durationMs = Number((performance.now() - started).toFixed(2));
      attempt.error = safeError(error);
      attempt.status = "error";

      // Covers the wording used by your uploaded geminiService.ts.
      const quotaError =
        /429|request limit reached|quota|resource_exhausted/i.test(attempt.error);

      row.status = quotaError ? "quota_blocked" : "failed";

      console.log(`[${row.id}/50] ${row.status}: ${attempt.error}`);
      save();

      if (quotaError) {
        console.log("Stopped safely. Resolve quota before explicitly resuming.");
        break;
      }
    }

    save();
    await sleep(delayMs);
  }

  save();
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report: ${reportPath}`);
}

main().catch(error => {
  console.error(safeError(error));
  process.exitCode = 1;
});