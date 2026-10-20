# Decentralized Blood Donation Network
**Thesis Evidence & Reproducibility Archive**

**Author:** Prem R  
**Date:** October 2026  

## Overview
This archive contains the raw data, execution scripts, and cryptographic proofs supporting the technical claims made in the final year project thesis, "Decentralized Blood Donation Network." It provides the committee with full transparency into the methodology, execution environments, and results for the smart contract gas optimizations, AI dispatcher accuracy, system latency, and security audits.

For security purposes, all private cryptographic keys, Pinata JWTs, and Gemini API keys have been sanitized and replaced with placeholders in the source scripts.

---

## Directory Structure & Contents

### `1_Smart_Contracts/`
Contains the raw Solidity source code and the cryptographic compiler artifact.
*   `BloodDonation.sol`: The optimized hybrid IPFS/On-chain smart contract.
*   `BloodDonationBaseline.sol`: The standard on-chain baseline contract used for benchmarking.
*   `build-info.json`: The Hardhat cryptographic build artifact proving the contracts were compiled using `solc 0.8.20` targeting the `shanghai` EVM with 200 optimizer runs prior to Sepolia deployment.

### `2_Gas_Verification/`
Contains the scripts and logs proving the claimed gas reduction.
*   `run_and_export_benchmark.js`: The ethers.js execution script that runs the 10-iteration matched benchmark between the baseline and hybrid contracts.
*   `experiment_evidence_report.json`: The output logs detailing the transaction hashes, gas used per iteration, and the calculated **5.16% overall gas reduction**.

### `3_AI_Evaluation/`
Contains the dataset and evaluation logic for the Gemini-powered emergency dispatcher.
*   `generate_ai_evidence.ts`: The standalone TypeScript execution engine utilizing the Gemini 2.5 Flash model with a strict temperature of 0.1 for deterministic JSON extraction.
*   `ai_accuracy_logs.csv`: The complete 50-query dataset, mapping raw user inputs (ambiguous phrasing, missing quantities, varying urgencies) to the expected JSON, actual JSON output, pass/fail status, and retry counts.

### `4_Latency_Metrics/`
Contains the real-world performance logs of the mobile application.
*   `latency_metrics.txt`: The formatted execution logs of 5 distinct trials, measuring the exact milliseconds from user interaction to map UI state updates. Tests were conducted on physical hardware (Oppo F23 5G) utilizing a live cellular network (Jio 5G).

### `5_Security_Audit/`
Contains the vulnerability testing suite.
*   `security_tests.js`: The Hardhat/Chai test suite designed to exploit unauthorized access and unverified data injection.
*   `security_audit.log`: The test runner output proving that all 4 critical vulnerability pathways were successfully blocked by the contract's modifier architecture.

---

## Reproducibility Requirements
To execute the Node.js or TypeScript scripts locally, reviewers will need:
1. Node.js v18+ 
2. A valid `.env` file containing an active `GEMINI_API_KEY`, `PINATA_JWT`, and Sepolia `PRIVATE_KEY`.
3. The `ethers`, `axios`, and `dotenv` npm packages installed.