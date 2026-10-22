import { network, artifacts } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHAIN_ID = 11155111n;
const WALLET = "0x54A2479b0aba6801Ad48DD2B46c686DD28ED9294";

const CONTRACTS = {
  baseline: {
    name: "BloodDonationBaseline",
    address: "0x773Ceb52DFBa30CC9394682a38092f90049B0D69",
    signature: "updateInventory(string,string,string,string)",
  },
  hybrid: {
    name: "BloodDonation",
    address: "0x3Fd87E33BCC9108A373Ae8a2259E09BB6388aEAf",
    signature: "updateInventory(string)",
  },
};

const PAIRS = [
  {
    scenario: "Prep Small",
    preparation: true,
    baseline: "0xbac228655e6906fe41be152d3e30749088b74cdd35a4109c69d8f4a5e36b716c",
    hybrid: "0x7ce4f1d0f9127ebadfe248f56e865cebe3c1c9009d9f442b21a9faa6f1397d36",
  },
  {
    scenario: "Measure Small 1",
    preparation: false,
    baseline: "0xb59a5a57cfcaedd4c767ae0e174d4623375bcf8b699daf26aebdd9c14e0e685a",
    hybrid: "0x4034dd6f2aba0270bef0b75bb562a953697ecd777aef008250ac4735bc4f3f8b",
  },
  {
    scenario: "Measure Small 2",
    preparation: false,
    baseline: "0x740295ad45a59d7f50575e8e76232797de7905ed7fb27569a8a0271055187908",
    hybrid: "0x6a58bf4a5a8814059ec97405e0301e6312af34a365955a5d051019df6b559eea",
  },
  {
    scenario: "Measure Small 3",
    preparation: false,
    baseline: "0x7cfcbb543712498d8b098ae94a0905c7239ffec58413d07d2978177946d6635c",
    hybrid: "0xace9600b24b9f4eb71d03b2c245f2796586d90c0351fb4539eb205b7f3898226",
  },
  {
    scenario: "Prep Large",
    preparation: true,
    baseline: "0x2ce8edf5433f99866c60ec3c2e0736973fe1f1fb9d64892c3e8edfe8550e950e",
    hybrid: "0x7d649c316393383afef07ec0830a27b142b1fdade4fa681186aa0f5ede8ca482",
  },
  {
    scenario: "Measure Large 1",
    preparation: false,
    baseline: "0x239c754582dd0df027ffed86836b20e64b295a1ca54e76c198c8e0e755206773",
    hybrid: "0xbcfd451eb2f55d5f1cbb2c09d2abb3a18085a3d6e8b310d41e8c995879dc13ab",
  },
  {
    scenario: "Measure Large 2",
    preparation: false,
    baseline: "0x512ed349372aac0c52210431d150f9d5f89e8c155b6b713329e4b465649460ae",
    hybrid: "0x01a82efd96a3a43d6fbfbe4a385518ad75ea569f3eb0d39e5e64a32d3a8bfbbb",
  },
  {
    scenario: "Measure Large 3",
    preparation: false,
    baseline: "0x8d613fafac6679ca54298698abab892c82e5a951626bc24e5f3c684c5e1b9651",
    hybrid: "0xd52f0e5f466b738dfbf2a7b9a209f4caacd95fbb7fbba0964c6fa856114a5506",
  },
];

const lower = (value) => String(value ?? "").toLowerCase();
const sameAddress = (a, b) => lower(a) === lower(b);

function normalizeCode(value) {
  if (typeof value !== "string") return null;
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (!hex || hex.length % 2 || !/^[0-9a-f]+$/i.test(hex)) return null;
  return `0x${hex.toLowerCase()}`;
}

function sameCode(a, b) {
  const normalized = normalizeCode(a);
  return normalized !== null && normalized === normalizeCode(b);
}

function writeJson(filename, data) {
  fs.writeFileSync(
    filename,
    JSON.stringify(
      data,
      (_, value) => typeof value === "bigint" ? value.toString() : value,
      2
    )
  );
}

function safeError(error) {
  // Avoid printing RPC URLs or credentials embedded in provider errors.
  return String(error?.shortMessage ?? error?.message ?? "Unknown error")
    .replace(/https?:\/\/[^\s"'<>]+/g, "[URL redacted]")
    .slice(0, 500);
}

function jsonFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory()
      ? jsonFiles(filename)
      : entry.name.endsWith(".json") ? [filename] : [];
  });
}

// Associate compiler input with output by filename, then require
// exact creation-bytecode AND runtime-bytecode matches to the artifact.
function findBuildMatches(artifact, directory) {
  const matches = [];

  for (const filename of jsonFiles(directory)) {
    let info;
    try {
      info = JSON.parse(fs.readFileSync(filename, "utf8"));
    } catch {
      continue;
    }

    if (!info.input?.sources || !info.input?.settings) continue;

    let output = info.output;
    let outputFile = null;

    if (!output) {
      outputFile = filename.replace(/\.json$/, ".output.json");
      if (!fs.existsSync(outputFile)) continue;

      try {
        const document = JSON.parse(fs.readFileSync(outputFile, "utf8"));
        output = document.output ?? document;
      } catch {
        continue;
      }
    }

    const sourceName =
      info.userSourceNameMap?.[artifact.sourceName] ?? artifact.sourceName;

    const compiled = output.contracts?.[sourceName]?.[artifact.contractName];

    if (
      compiled &&
      info.input.sources[sourceName] &&
      sameCode(compiled.evm?.bytecode?.object, artifact.bytecode) &&
      sameCode(
        compiled.evm?.deployedBytecode?.object,
        artifact.deployedBytecode
      )
    ) {
      matches.push({
        inputFile: filename,
        outputFile,
        sourceName,
        compilerVersion: info.solcLongVersion ?? info.solcVersion ?? null,
        settings: info.input.settings,
      });
    }
  }

  return matches;
}

async function fetchJson(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Gateway HTTP ${response.status}`);

    // Read the body before clearing the timeout.
    const rawText = await response.text();
    const payload = JSON.parse(rawText);

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Gateway returned an unexpected JSON structure.");
    }

    return { rawText, payload };
  } finally {
    clearTimeout(timer);
  }
}

function comesBefore(a, b) {
  const blockA = BigInt(a.blockNumber);
  const blockB = BigInt(b.blockNumber);

  return blockA < blockB ||
    (blockA === blockB &&
      BigInt(a.transactionIndex) < BigInt(b.transactionIndex));
}

async function main() {
  const { ethers } = await network.connect();
  const provider = ethers.provider;

  const connected = await provider.getNetwork();
  if (connected.chainId !== CHAIN_ID) {
    throw new Error("Wrong network. Run with --network sepolia.");
  }

  const folder = path.join(
    process.cwd(),
    "evidence_archive",
    new Date().toISOString().replace(/[:.]/g, "-")
  );

  fs.mkdirSync(folder, { recursive: true });

  const archive = {
    metadata: {
      createdAt: new Date().toISOString(),
      chainId: CHAIN_ID.toString(),
      wallet: WALLET,
      contracts: CONTRACTS,
      limitations: [
        "Gateway JSON matching is not independent cryptographic CID verification.",
        "Exact runtime matching is checked without metadata stripping.",
        "Source-level equivalence of checks and events requires separate review.",
        "Ordering and input changes do not exclude unlisted intervening transactions.",
        "Historical starting-state verification is not performed by this script.",
      ],
    },
    checks: [],
    contracts: {},
    pairs: [],
    ipfsObjects: {},
  };

  function record(name, status, details = null) {
    archive.checks.push({ name, status, details });
    console.log(`[${status.toUpperCase()}] ${name}`);
  }

  function save() {
    archive.summary = {
      passed: archive.checks.filter((c) => c.status === "passed").length,
      failed: archive.checks.filter((c) => c.status === "failed").length,
      unresolved: archive.checks.filter((c) => c.status === "unresolved").length,
    };

    writeJson(path.join(folder, "verified_evidence_archive.json"), archive);
  }

  try {
    // Preserve the verifier itself.
    fs.copyFileSync(
      fileURLToPath(import.meta.url),
      path.join(folder, "build_evidence_archive.js")
    );

    // Preserve the actual benchmark script if present.
    const benchmarkPath = path.join(
      process.cwd(), "scripts", "final_recurring_benchmark.js"
    );

    if (fs.existsSync(benchmarkPath)) {
      fs.copyFileSync(
        benchmarkPath,
        path.join(folder, "final_recurring_benchmark.js")
      );
      record("Benchmark script archived", "passed");
    } else {
      record(
        "Benchmark script archived",
        "unresolved",
        "scripts/final_recurring_benchmark.js was not found."
      );
    }

    const interfaces = {};

    for (const [kind, config] of Object.entries(CONTRACTS)) {
      try {
        const artifact = await artifacts.readArtifact(config.name);
        interfaces[kind] = new ethers.Interface(artifact.abi);

        writeJson(path.join(folder, `${config.name}.artifact.json`), artifact);

        const block = await provider.getBlock("latest");
        if (!block) throw new Error("Could not retrieve latest block.");

        const onChain = await provider.getCode(config.address, block.number);
        const exactRuntimeMatch = sameCode(onChain, artifact.deployedBytecode);

        const builds = findBuildMatches(
          artifact,
          path.join(process.cwd(), "artifacts", "build-info")
        );

        archive.contracts[kind] = {
          address: config.address,
          comparisonBlock: block.number,
          comparisonBlockHash: block.hash,
          exactRuntimeMatch,
          onChainBytecode: onChain,
          artifactRuntimeBytecode: artifact.deployedBytecode,
          matchingBuilds: builds,
        };

        record(
          `${config.name}: exact runtime bytecode`,
          exactRuntimeMatch ? "passed" : "failed"
        );

        record(
          `${config.name}: unique matching compiler build`,
          builds.length === 1 ? "passed" : "unresolved",
          { matchingBuildCount: builds.length }
        );

        for (let i = 0; i < builds.length; i++) {
          const build = builds[i];

          fs.copyFileSync(
            build.inputFile,
            path.join(folder, `${config.name}.build-${i}.json`)
          );

          if (build.outputFile) {
            fs.copyFileSync(
              build.outputFile,
              path.join(folder, `${config.name}.build-${i}.output.json`)
            );
          }
        }
      } catch (error) {
        record(`${config.name}: build verification`, "unresolved", safeError(error));
      }

      save();
    }

    async function retrieveTransaction(kind, hash) {
      const config = CONTRACTS[kind];

      const [tx, receipt] = await Promise.all([
        provider.send("eth_getTransactionByHash", [hash]),
        provider.send("eth_getTransactionReceipt", [hash]),
      ]);

      // Preserve whatever the RPC returned, even if later checks fail.
      writeJson(path.join(folder, `${hash}.json`), { tx, receipt });

      if (!tx || !receipt) {
        throw new Error("Transaction or mined receipt unavailable.");
      }

      const iface = interfaces[kind];
      if (!iface) throw new Error("Local contract ABI unavailable.");

      const decoded = iface.parseTransaction({
        data: tx.input,
        value: tx.value,
      });

      const block = await provider.send("eth_getBlockByNumber", [
        receipt.blockNumber, false,
      ]);

      const checks = {
        requestedHashMatches:
          lower(tx.hash) === lower(hash) &&
          lower(receipt.transactionHash) === lower(hash),
        chainId: tx.chainId != null && BigInt(tx.chainId) === CHAIN_ID,
        sender:
          sameAddress(tx.from, WALLET) &&
          sameAddress(receipt.from, WALLET),
        destination:
          sameAddress(tx.to, config.address) &&
          sameAddress(receipt.to, config.address),
        successful: BigInt(receipt.status) === 1n,
        expectedFunction: decoded?.signature === config.signature,
        zeroValue: BigInt(tx.value) === 0n,
        blockAgreement:
          lower(tx.blockHash) === lower(receipt.blockHash) &&
          lower(block?.hash) === lower(receipt.blockHash) &&
          BigInt(tx.blockNumber) === BigInt(receipt.blockNumber) &&
          BigInt(tx.transactionIndex) === BigInt(receipt.transactionIndex),
      };

      return {
        hash,
        rawTransaction: tx,
        rawReceipt: receipt,
        blockTimestamp: block?.timestamp ?? null,
        signature: decoded?.signature ?? null,
        inputs: decoded ? Array.from(decoded.args, String) : null,
        gasUsed: BigInt(receipt.gasUsed).toString(),
        checks,
        passed: Object.values(checks).every(Boolean),
      };
    }

    const orderedTransactions = [];

    for (const pair of PAIRS) {
      console.log(`\nChecking ${pair.scenario}`);

      const row = {
        scenario: pair.scenario,
        preparation: pair.preparation,
      };

      archive.pairs.push(row);

      // Fetch both sides even if one is unavailable.
      const results = await Promise.allSettled([
        retrieveTransaction("baseline", pair.baseline),
        retrieveTransaction("hybrid", pair.hybrid),
      ]);

      for (const [index, kind] of ["baseline", "hybrid"].entries()) {
        const result = results[index];

        if (result.status === "fulfilled") {
          row[kind] = result.value;
          orderedTransactions.push(result.value);

          record(
            `${pair.scenario}: ${kind} transaction`,
            result.value.passed ? "passed" : "failed",
            result.value.checks
          );
        } else {
          row[kind] = { error: safeError(result.reason) };
          record(
            `${pair.scenario}: ${kind} transaction`,
            "unresolved",
            row[kind].error
          );
        }
      }

      if (row.baseline?.passed && row.hybrid?.passed) {
        const cid = row.hybrid.inputs[0];

        try {
          if (!/^[a-zA-Z0-9]+$/.test(cid)) {
            throw new Error("Unexpected CID characters.");
          }

          if (!archive.ipfsObjects[cid]) {
            const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
            const fetched = await fetchJson(url);

            archive.ipfsObjects[cid] = {
              url,
              retrievedAt: new Date().toISOString(),
              ...fetched,
              cryptographicCidVerification: "not performed",
            };
          }

          const payload = archive.ipfsObjects[cid].payload;
          const fields = ["name", "licenseId", "inventoryLevels", "timestamp"];

          row.ipfsFieldChecks = Object.fromEntries(
            fields.map((field, index) => [
              field,
              payload[field] === row.baseline.inputs[index],
            ])
          );

          row.ipfsExactFieldMatch =
            Object.values(row.ipfsFieldChecks).every(Boolean);

          record(
            `${pair.scenario}: gateway payload matches all four fields`,
            row.ipfsExactFieldMatch ? "passed" : "failed",
            row.ipfsFieldChecks
          );
        } catch (error) {
          row.ipfsError = safeError(error);
          record(
            `${pair.scenario}: IPFS retrieval/comparison`,
            "unresolved",
            row.ipfsError
          );
        }
      } else {
        record(
          `${pair.scenario}: IPFS comparison`,
          "unresolved",
          "Skipped because transaction checks did not pass."
        );
      }

      save();
    }

    // Compare actual blockchain positions with the supplied experiment order.
    if (orderedTransactions.length === PAIRS.length * 2) {
      const ordered = orderedTransactions.every((tx, index) =>
        index === 0 ||
        comesBefore(
          orderedTransactions[index - 1].rawReceipt,
          tx.rawReceipt
        )
      );

      record(
        "All 16 transactions follow the listed experiment order",
        ordered ? "passed" : "failed"
      );
    } else {
      record("Complete transaction ordering", "unresolved");
    }

    // Check that measured inputs differ from the preceding listed pair.
    for (let i = 1; i < archive.pairs.length; i++) {
      const current = archive.pairs[i];
      if (current.preparation) continue;

      const previous = archive.pairs[i - 1];

      if (
        current.baseline?.passed && current.hybrid?.passed &&
        previous.baseline?.passed && previous.hybrid?.passed
      ) {
        current.changedInputChecks = {
          inventoryChanged:
            current.baseline.inputs[2] !== previous.baseline.inputs[2],
          timestampChanged:
            current.baseline.inputs[3] !== previous.baseline.inputs[3],
          cidChanged:
            current.hybrid.inputs[0] !== previous.hybrid.inputs[0],
        };

        record(
          `${current.scenario}: changed inputs versus preceding listed pair`,
          Object.values(current.changedInputChecks).every(Boolean)
            ? "passed" : "failed",
          current.changedInputChecks
        );
      } else {
        record(`${current.scenario}: changed-input check`, "unresolved");
      }
    }
  } catch (error) {
    record("Archive processing", "unresolved", safeError(error));
  } finally {
    save();
  }

  console.log("\nCheck summary:", archive.summary);
  console.log("Evidence saved to:", folder);
  console.log(
    "No transactions were sent. Review failed/unresolved checks and stated limitations."
  );

  if (archive.summary.failed || archive.summary.unresolved) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Could not complete:", safeError(error));
  process.exitCode = 1;
});