// fetch_and_verify.cjs
require("dotenv").config({ quiet: true });
const { ethers } = require("ethers");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const INPUT = process.argv[2] || "experiment_evidence_report.json";
const OUTPUT_DIR = `verification_${Date.now()}`;

const BASELINE_ADDRESS =
  "0x5a9D64b0158fa3c4df12f9f1730dB326CA624BAf";
const HYBRID_ADDRESS =
  "0x8E14797A22A6B6fC611374eeA029747fD509fcB6";

const baselineABI = new ethers.Interface([
  "function updateInventoryOnChain(string,string,string,string)"
]);
const hybridABI = new ethers.Interface([
  "function updateInventory(string)"
]);

const FIELDS = ["name", "licenseId", "inventoryLevels", "timestamp"];
const sameAddress = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.toLowerCase() === b.toLowerCase();

function save(name, data) {
  fs.writeFileSync(
    path.join(OUTPUT_DIR, name),
    JSON.stringify(
      data,
      (_, value) => typeof value === "bigint" ? value.toString() : value,
      2
    )
  );
}

// Avoid printing RPC URLs or credentials from error objects.
function safeError(error) {
  return error.response
    ? `HTTP ${error.response.status}`
    : String(error.code || error.name || "UnknownError");
}

async function retry(fn) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise(resolve =>
          setTimeout(resolve, 1000 * (attempt + 1))
        );
      }
    }
  }
  throw lastError;
}

async function fetchPairRecord(provider, hash) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash || "")) {
    throw new Error("Missing or invalid transaction hash");
  }

  const [transaction, receipt] = await Promise.all([
    retry(() => provider.getTransaction(hash)),
    retry(() => provider.getTransactionReceipt(hash))
  ]);

  if (!transaction || !receipt) {
    throw new Error("Transaction or mined receipt not available");
  }

  return {
    transaction: transaction.toJSON(),
    receipt: receipt.toJSON(),
    tx: transaction,
    rc: receipt
  };
}

async function retrieveJSON(cid) {
  // This experiment uses CIDv0 strings.
  if (!/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid)) {
    throw new Error("Unexpected CID format for this experiment");
  }

  const gateways = [
    process.env.IPFS_GATEWAY,
    "https://gateway.pinata.cloud/ipfs/",
    "https://ipfs.io/ipfs/"
  ].filter(Boolean);

  const failures = [];

  for (const gateway of [...new Set(gateways)]) {
    const url = `${gateway.replace(/\/?$/, "/")}${cid}`;
    try {
      const response = await axios.get(url, {
        timeout: 20000,
        responseType: "text",
        transformResponse: [value => value],
        maxContentLength: 2 * 1024 * 1024
      });

      const text = response.data;
      const json = JSON.parse(text);
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error("Expected JSON object");
      }

      return {
        url,
        retrievedAt: new Date().toISOString(),
        text,
        json,
        priorFailures: failures
      };
    } catch (error) {
      failures.push({ gateway, error: safeError(error) });
    }
  }

  const error = new Error("All IPFS gateways failed");
  error.failures = failures;
  throw error;
}

function statistics(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = values.length;
  const total = values.reduce((sum, value) => sum + value, 0);
  const mean = total / n;
  return {
    n,
    totalGas: total,
    meanGas: mean,
    medianGas: n % 2
      ? sorted[Math.floor(n / 2)]
      : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    populationStandardDeviation: Math.sqrt(
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n
    ),
    minGas: sorted[0],
    maxGas: sorted[n - 1]
  };
}

async function checkDeployment(provider, hash, expectedAddress, label) {
  if (!hash) {
    return {
      status: "NOT_PROVIDED",
      note: `Set ${label}_DEPLOY_TX to check the deployment receipt.`
    };
  }

  try {
    const record = await fetchPairRecord(provider, hash);
    const checks = {
      successful: record.rc.status === 1,
      directCreationTransaction: record.tx.to === null,
      createdExpectedContract: sameAddress(
        record.rc.contractAddress, expectedAddress
      )
    };

    save(`${label.toLowerCase()}_deployment.json`, {
      transaction: record.transaction,
      receipt: record.receipt,
      checks
    });

    return {
      txHash: hash,
      checks,
      passed: Object.values(checks).every(Boolean),
      note: "Checks direct creation only; factory deployments need separate tracing."
    };
  } catch (error) {
    return { status: "ERROR", error: safeError(error) };
  }
}

async function main() {
  if (!process.env.SEPOLIA_RPC_URL) {
    throw new Error("Set SEPOLIA_RPC_URL in .env");
  }
  if (!fs.existsSync(INPUT)) {
    throw new Error(`Input file not found: ${INPUT}`);
  }

  const input = JSON.parse(
    fs.readFileSync(INPUT, "utf8").replace(/^\uFEFF/, "")
  );
  const rows = input.linkedRows;

  if (!Array.isArray(rows) || rows.length !== 10) {
    throw new Error("Input must contain exactly 10 linkedRows");
  }

  const hashes = rows.flatMap(row => [
    row.baseline?.txHash, row.hybrid?.txHash
  ]);
  if (
    hashes.some(hash => !/^0x[0-9a-fA-F]{64}$/.test(hash || "")) ||
    new Set(hashes.map(hash => hash.toLowerCase())).size !== 20
  ) {
    throw new Error("Expected 20 valid, distinct transaction hashes");
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const request = new ethers.FetchRequest(process.env.SEPOLIA_RPC_URL);
  request.timeout = 20000;
  const provider = new ethers.JsonRpcProvider(request);

  const report = {
    startedAt: new Date().toISOString(),
    inputFile: INPUT,
    verificationScope:
      "RPC transaction/receipt checks and HTTPS gateway JSON comparison. " +
      "Not a local cryptographic verification of IPFS DAG blocks, " +
      "deployed-source equivalence, or storage-state equivalence.",
    rows: [],
    deployments: {}
  };

  try {
    const network = await provider.getNetwork();
    if (network.chainId !== 11155111n) {
      throw new Error("RPC is not connected to Ethereum Sepolia");
    }
    report.chainId = network.chainId.toString();

    for (let index = 0; index < rows.length; index++) {
      const source = rows[index];
      const result = {
        iteration: source.iteration,
        baselineHash: source.baseline.txHash,
        hybridHash: source.hybrid.txHash,
        passed: false
      };

      console.log(`Checking pair ${index + 1}/10...`);

      try {
        const [base, hybrid] = await Promise.all([
          fetchPairRecord(provider, source.baseline.txHash),
          fetchPairRecord(provider, source.hybrid.txHash)
        ]);

        // Preserve evidence even if later decoding or retrieval fails.
        save(`pair_${index + 1}_chain.json`, {
          baseline: {
            transaction: base.transaction,
            receipt: base.receipt
          },
          hybrid: {
            transaction: hybrid.transaction,
            receipt: hybrid.receipt
          }
        });

        const args = baselineABI.decodeFunctionData(
          "updateInventoryOnChain", base.tx.data
        );
        const cid = hybridABI.decodeFunctionData(
          "updateInventory", hybrid.tx.data
        )[0];

        const decodedInputs = Object.fromEntries(
          FIELDS.map((field, i) => [field, args[i]])
        );

        result.baselineGas = base.rc.gasUsed.toString();
        result.hybridGas = hybrid.rc.gasUsed.toString();
        result.decodedInputs = decodedInputs;
        result.decodedCID = cid;

        const retrieval = await retrieveJSON(cid);
        fs.writeFileSync(
          path.join(OUTPUT_DIR, `pair_${index + 1}_ipfs.json`),
          retrieval.text
        );

        result.retrieval = {
          url: retrieval.url,
          retrievedAt: retrieval.retrievedAt,
          priorFailures: retrieval.priorFailures
        };
        result.retrievedIpfsJson = retrieval.json;

        const fieldMatches = Object.fromEntries(
          FIELDS.map(field => [
            field, decodedInputs[field] === retrieval.json[field]
          ])
        );
        result.fieldMatches = fieldMatches;

        result.checks = {
          baselineSuccessful: base.rc.status === 1,
          hybridSuccessful: hybrid.rc.status === 1,
          baselineDestination: sameAddress(base.tx.to, BASELINE_ADDRESS),
          hybridDestination: sameAddress(hybrid.tx.to, HYBRID_ADDRESS),
          baselineReceiptDestination: sameAddress(
            base.rc.to, BASELINE_ADDRESS
          ),
          hybridReceiptDestination: sameAddress(
            hybrid.rc.to, HYBRID_ADDRESS
          ),
          baselineBlockConsistent: base.tx.blockHash === base.rc.blockHash,
          hybridBlockConsistent: hybrid.tx.blockHash === hybrid.rc.blockHash,
          baselineGasMatchesExport:
            result.baselineGas === String(source.baseline.gasUsed),
          hybridGasMatchesExport:
            result.hybridGas === String(source.hybrid.gasUsed),
          cidMatchesExport: cid === source.hybrid.decodedCID,
          decodedInputsMatchExport: FIELDS.every(
            field =>
              decodedInputs[field] === source.baseline.decodedInputs?.[field]
          ),
          retrievedFieldsMatchExport: FIELDS.every(
            field =>
              retrieval.json[field] ===
              source.hybrid.retrievedIpfsJson?.[field]
          ),
          pairedPayloadFieldsMatch: Object.values(fieldMatches).every(Boolean)
        };

        result.passed = Object.values(result.checks).every(Boolean);
        console.log(
          `  ${result.passed ? "PASS" : "MISMATCH"} | ` +
          `Baseline ${result.baselineGas} | Hybrid ${result.hybridGas}`
        );
      } catch (error) {
        result.error = safeError(error);
        result.gatewayFailures = error.failures || [];
        console.log("  INCOMPLETE: see saved verification report");
      }

      report.rows.push(result);
      save("verification_report.json", report);
    }

    report.deployments.baseline = await checkDeployment(
      provider,
      process.env.BASELINE_DEPLOY_TX?.trim(),
      BASELINE_ADDRESS,
      "BASELINE"
    );
    report.deployments.hybrid = await checkDeployment(
      provider,
      process.env.HYBRID_DEPLOY_TX?.trim(),
      HYBRID_ADDRESS,
      "HYBRID"
    );

    const passed = report.rows.filter(row => row.passed).length;
    report.summary = {
      totalPairs: rows.length,
      passedPairs: passed,
      failedOrIncompletePairs: rows.length - passed
    };

    // Do not silently calculate a headline result from a passing subset.
    if (passed === rows.length) {
      const baseline = statistics(
        report.rows.map(row => Number(row.baselineGas))
      );
      const hybrid = statistics(
        report.rows.map(row => Number(row.hybridGas))
      );
      report.summary.metrics = {
        baseline,
        hybrid,
        meanGasSavedPerUpdate: baseline.meanGas - hybrid.meanGas,
        reductionPercent:
          100 * (baseline.totalGas - hybrid.totalGas) / baseline.totalGas
      };
    }

    report.completedAt = new Date().toISOString();
    save("verification_report.json", report);

    console.log(`\nPairs passed: ${passed}/${rows.length}`);
    console.log(`Files saved in: ${OUTPUT_DIR}`);
    console.log("Deployment status is recorded separately.");
    if (passed !== rows.length) process.exitCode = 1;
  } finally {
    provider.destroy();
  }
}

main().catch(error => {
  // Print setup errors without dumping sensitive provider objects.
  const safeMessages = [
    "Set SEPOLIA_RPC_URL in .env",
    "Input must contain exactly 10 linkedRows",
    "Expected 20 valid, distinct transaction hashes",
    "RPC is not connected to Ethereum Sepolia"
  ];
  console.error(
    safeMessages.includes(error.message) ||
    error.message?.startsWith("Input file not found:")
      ? error.message
      : `Stopped: ${safeError(error)}. Check the input file and RPC connection.`
  );
  process.exitCode = 1;
});