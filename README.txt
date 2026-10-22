RESUME THE ORIGINAL AI EXPERIMENT AT QUERY 22

Extract ai_resume_original into the blood-donation-app project root, outside
its existing app directory. Do not replace your current app/geminiService.ts.

From Windows Command Prompt:
  cd "C:\final year project\blood-donation-app\ai_resume_original"
  npx --yes --package=tsx tsx resume.ts

The launcher reads ../backend/.env and requires GEMINI_API_KEY there.
For a different backend environment location:
  npx --yes --package=tsx tsx resume.ts "C:\path\to\backend\.env"

This is a Node-only historical evaluation. It calls Google directly, so the
backend server need not be running. The compatibility environment alias exists
only in this Node process: do not add it to the mobile application's environment.
The parent project must have dotenv installed (as in the supplied evaluator).

Original parser SHA-256:
606c714cf7cac53180187ceee7d4c532176b2080a7dc9e7d9cf0f02b52910f1d
Dataset SHA-256:
fb9e208078fb8f476149477310970aed0d13d2f4aae0154631b8e2e3b00fff98

The original parser was recovered from repository commit
a66bfec8e0a6493431be0490fdf787a85cf5b366 with CRLF line endings.
Both hashes remain enforced by the unchanged evaluate_ai.ts.
Do not edit or reformat app/geminiService.ts inside this folder.

report_before_resume.json is an untouched copy of your uploaded report.
report.json is the working copy. The 21 completed responses are skipped.
Query 22's earlier quota failure is retained; a new attempt is appended.
Queries 23–50 then run. Failures and mismatches are recorded, not discarded.
If quota stops the run, use the same command again after resolving quota.
Outputs: report.json and results.csv in this isolated folder.

The launcher supplies a replacement credential without changing the parser.
No API request was executed while preparing this package. Model availability
and quota have not been tested. Record the resumption date and credential/project
change (without the key) in the experiment notes; a hosted model alias may change
over time. Do not describe completion of this historical evaluation as validation
of the new backend parser, which has a different prompt and urgency schema.
