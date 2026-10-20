# Corrected benchmark package

The corrected JSON is ready to use as a replacement summary of the supplied historical records. Its ten transaction rows and original export timestamp are unchanged. The previous summary is retained in correctionProvenance.

Results: baseline mean 51,678 gas; hybrid mean 49,010 gas; saving 2,668 gas/update (5.16%). Totals: 516,780 and 490,100 gas. Population standard deviation: zero in each recorded series.

## Files
- experiment_evidence_report_corrected.json: corrected historical summary, not a newly executed experiment.
- input_dataset.json: exact four-field payloads extracted from that report, including the fixed 2026-10-15 timestamp.
- run_and_export_benchmark_reconstructed.cjs: optional reproduction script, reconstructed after the experiment. Do not describe it as the authenticated original execution script.
- env.example.txt: configuration placeholders, with no credentials.

## Optional new experiment
You do not need to rerun the benchmark to use the corrected report. If reproducing it, extract these files into your project, keep the script beside input_dataset.json, and install:

```powershell
npm install ethers@6 axios dotenv
```

Copy the variable names from env.example.txt into your local .env and supply your own values. Use a funded Sepolia test wallet already registered and verified on the hybrid contract. Never publish .env or private keys. Previously disclosed keys should be replaced.

Check syntax and show usage:

```powershell
node --check run_and_export_benchmark_reconstructed.cjs
node run_and_export_benchmark_reconstructed.cjs
```

Explicitly start a NEW experiment (20 transactions if successful, plus IPFS uploads):

```powershell
node run_and_export_benchmark_reconstructed.cjs --execute
```

The script creates a unique new_benchmark_* directory and checkpoints partial results. If interrupted, inspect hashes and receipts before rerunning; it does not resume or retry transactions automatically. Future gas values are measured, not forced to match the historical figures. Retain your package-lock.json with new results.

## Evidence scope
The correction was checked for arithmetic and exact preservation of historical rows. The new script was syntax-checked; no transactions or API uploads were executed during preparation. Gateway field comparison is not independent cryptographic reconstruction of an IPFS DAG. Runtime-code hashes identify bytes but do not prove source/build equivalence.

The fixed timestamp is an experimental control, not the transaction time or proof of current inventory. Both contracts retain pre-existing state; a rerun is not a fresh-deployment experiment. Different access checks and events mean this is a comparison of the tested implementations, not isolation of storage location as the sole cause. Gas units exclude IPFS charges, model costs, fees and latency. Zero observed variance in this small deterministic workload does not imply universal constant gas costs.

Suggested paper wording: “Across ten paired updates using a fixed-timestamp dataset, the recorded baseline and hybrid transactions consumed 51,678 and 49,010 gas per update, respectively, corresponding to a 5.16% reduction for this workload.”
