# Corrected AI evaluator

This standalone Node.js script replaces the evaluation workflow, not app/geminiService.ts. Keep the original scripts and earlier CSV as historical evidence. No API requests were made while preparing this package.

## Setup (Windows)
1. Extract this folder inside your project. Keep evaluate_ai.cjs, dataset.json and prompt.txt together.
2. Open a terminal in the project root (where your existing .env lives).
3. Install dotenv if not already installed: npm install dotenv
4. Run: node ai_evidence_corrected/evaluate_ai.cjs
   This validates the dataset count and prints usage without making API calls.
5. When quota is available, start or resume:
   node ai_evidence_corrected/evaluate_ai.cjs --run

The script reads GEMINI_API_KEY, or your existing EXPO_PUBLIC_GEMINI_API_KEY, from the project-root .env. Do not publish keys. Optional environment variables EVIDENCE_DEVICE and EVIDENCE_NETWORK record your actual workstation and connection; no device/network values are invented.

Requires Node.js 20+. No ts-node or tsx required. Do not replace your app service with the mistakenly named geminiService(1).ts.

## Resume and quota
Requests are separated by at least 15 seconds. An HTTP or network failure stops the run after saving it. There are no immediate repeated requests. For 429/server errors a cooldown is saved using structured retryDelay or Retry-After, with a 60-second minimum; this does NOT guarantee daily quota is available after that interval. Check AI Studio before resuming, especially for a daily quota error.

Run the same command again to resume. Completed model responses are skipped whether correct, incorrect, or invalid JSON. Unresolved API calls can be retried and all attempts are retained. Attempts count actual calls; retries = attempts minus one. An interrupted in-flight call is marked outcome unknown when resumed.

A lock prevents concurrent runs. If the process was forcibly terminated, verify that no evaluator remains running before deleting ai_evidence_output/running.lock. Preserve the evidence.json file. Close results.csv in Excel while running to avoid file-lock errors.

Changing the script, dataset, or prompt prevents resuming the old experiment. Archive the whole output folder before starting an experiment with changed settings. Do not silently pool experiments with different protocols.

## Outputs
ai_evidence_output/evidence.json: raw response bodies, request times, API elapsed times, attempt history, model/configuration, runtime/environment, dataset/script hashes, per-field scores and summary.
ai_evidence_output/results.csv: one row per query, actual/expected output, outcome, attempts, retries and last attempt time.

The previous five passes are NOT silently imported: the older CSV lacks full raw responses, session metadata and prompt provenance. Preserve them as pilot data. This corrected runner starts a separately documented experiment and resumes its own saved results.

## Scientific scope
Read LABEL_REVIEW.md before claiming final accuracy. The original expected labels are preserved, not endorsed or changed to match predictions. The summary explicitly labels scores provisional.

API latency includes network transmission, provider processing, response transfer, parsing and validation; it excludes deliberate waits, retries between calls, mobile UI, maps, speech, IPFS and blockchain. It is not pure model inference time or end-to-end app latency. Use attempt-level records for successful versus failed timing analyses.

The prompt/model/settings follow generate_ai_evidence(1).ts (gemini-2.5-flash, temperature 0.1). This runner checks the four response fields, permits null quantity/bloodGroup, and requires raw JSON without stripping markdown. This stricter validation differs from the earlier evaluator and must be disclosed. Low temperature does not guarantee deterministic output.

Validation performed: syntax check, no-call startup, and offline schema/scoring checks. Live API behavior depends on your account, model access and quotas. This package contains no generated experimental responses.
