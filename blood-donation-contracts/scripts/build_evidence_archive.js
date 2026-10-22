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
    baseline: "0x1d627277b5bc2df38b33f63f0d4cba159f24af1633c57f972fdab15d63e62fdd",
    hybrid: "0xbcae9419cbb43e9a5ba0894ea09863aca53d548f4b3b324c68424e42f6fb6290",
  },
  {
    scenario: "Measure Small 1",
    preparation: false,
    baseline: "0x677f8f826903fe5cb4067d97c29431dbddb777cab320d12ba382206303708a3d",
    hybrid: "0x3917bf0a39d08e72d509a14b2a535a94d2d104d90cca7c0f3f5c3a9cbc6d149e",
  },
  {
    scenario: "Measure Small 2",
    preparation: false,
    baseline: "0xaf5bb4c623a31a75446b601f375aea8c619003666cf4fe7ceb60ea14f3d459c5",
    hybrid: "0x8c228b19c2fe5bc3ae26d82494d71c4ccf35fd4dd9205ecdb5cdc33a03ab04cf",
  },
  {
    scenario: "Measure Small 3",
    preparation: false,
    baseline: "0xb5322e70a8cddf4498813f06970d44397c97e301edef2b9488e06224da390fac",
    hybrid: "0xd73c98940b440636d8ca46d0a2087e9283dcb4d1cf3ea4b8c8143b9d2bf7f0bf",
  },
  {
    scenario: "Prep Large",
    preparation: true,
    baseline: "0x3a3d261a16fae6f0cb84436ec8a0aab272144b6d3cb008112ed2d8dd1112da21",
    hybrid: "0xe39181f0bacb67defd5195a9aca97dd7fe2207510d93e4e0188fff66adfd2562",
  },
  {
    scenario: "Measure Large 1",
    preparation: false,
    baseline: "0xfe37e2b4caeef31f6d3436799f129e3aba7fe016e70c565c2b35399d441f8b18",
    hybrid: "0x703e97b2971eb3a1ab69376ca574fe294b0cc5ceb613be855f84f654370a1267",
  },
  {
    scenario: "Measure Large 2",
    preparation: false,
    baseline: "0x88858f4437164e0a851be110802ffa10695502300226d78320840436f043ea63",
    hybrid: "0xf10cff898bce5ff9412cbd957632d4488005b44efb0e35ccfcf83b1901dd8f55",
  },
  {
    scenario: "Measure Large 3",
    preparation: false,
    baseline: "0xd72db3de19b4e81c22af2ed02fc044a094701ed08b91722399282e9909627604",
    hybrid: "0x998d0e80594b506f3e7d22f556d38fc97790f90a70c0c28b7727bd1af17e75ac",
  },
];

const lower = (value) => String(value ?? "").toLowerCase();
const sameAddress = (a, b) => lower(a) === lower(b);

function normalizeCode(value) {
  if (typeof value !== "string") return null;

  const hex = value.startsWith("0x") ? value.slice(2) : value;

  if (!hex || hex.length % 2 || !/^[0-9a-f]+$/i.test(hex)) {
    return null;
  }

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

    if (!response.ok) {
      throw new Error(`Gateway HTTP ${response.status}`);
    }

    // The timeout covers response-body reading as well.
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
    (
      blockA === blockB &&
      BigInt(a.transactionIndex) < BigInt(b.transactionIndex)
    );
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
        "Runtime bytecode is compared exactly, without metadata stripping.",
        "Source-level equivalence of authorization checks and events requires separate review.",
        "Listed transaction ordering does not exclude unlisted intervening transactions.",
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

    writeJson(
      path.join(folder, "verified_evidence_archive.json"),
      archive
    );
  }

  try {
    fs.copyFileSync(
      fileURLToPath(import.meta.url),
      path.join(folder, "build_evidence_archive.js")
    );

    const benchmarkPath = path.join(
      process.cwd(),
      "scripts",
      "recurring_benchmark.js"
    );

    if (fs.existsSync(benchmarkPath)) {
      fs.copyFileSync(
        benchmarkPath,
        path.join(folder, "recurring_benchmark.js")
      );

      record("Benchmark script archived", "passed");
    } else {
      record(
        "Benchmark script archived",
        "unresolved",
        "scripts/recurring_benchmark.js was not found."
      );
    }

    const interfaces = {};

    for (const [kind, config] of Object.entries(CONTRACTS)) {
      try {
        const artifact = await artifacts.readArtifact(config.name);
        interfaces[kind] = new ethers.Interface(artifact.abi);

        writeJson(
          path.join(folder, `${config.name}.artifact.json`),
          artifact
        );

        const block = await provider.getBlock("latest");

        if (!block) {
          throw new Error("Could not retrieve latest block.");
        }

        const onChain = await provider.getCode(config.address, block.number);

        const exactRuntimeMatch = sameCode(
          onChain,
          artifact.deployedBytecode
        );

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
        record(
          `${config.name}: build verification`,
          "unresolved",
          safeError(error)
        );
      }

      save();
    }

    async function retrieveTransaction(kind, hash) {
      const config = CONTRACTS[kind];

      const [tx, receipt] = await Promise.all([
        provider.send("eth_getTransactionByHash", [hash]),
        provider.send("eth_getTransactionReceipt", [hash]),
      ]);

      writeJson(path.join(folder, `${hash}.json`), { tx, receipt });

      if (!tx || !receipt) {
        throw new Error("Transaction or mined receipt unavailable.");
      }

      const iface = interfaces[kind];

      if (!iface) {
        throw new Error("Local contract ABI unavailable.");
      }

      const decoded = iface.parseTransaction({
        data: tx.input,
        value: tx.value,
      });

      const block = await provider.send("eth_getBlockByNumber", [
        receipt.blockNumber,
        false,
      ]);

      const checks = {
        requestedHashMatches:
          lower(tx.hash) === lower(hash) &&
          lower(receipt.transactionHash) === lower(hash),

        chainId:
          tx.chainId != null &&
          BigInt(tx.chainId) === CHAIN_ID,

        sender:
          sameAddress(tx.from, WALLET) &&
          sameAddress(receipt.from, WALLET),

        destination:
          sameAddress(tx.to, config.address) &&
          sameAddress(receipt.to, config.address),

        successful:
          receipt.status != null &&
          BigInt(receipt.status) === 1n,

        expectedFunction:
          decoded?.signature === config.signature,

        zeroValue:
          BigInt(tx.value) === 0n,

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
          const fields = [
            "name",
            "licenseId",
            "inventoryLevels",
            "timestamp",
          ];

          row.ipfsFieldChecks = {};
          row.ipfsFieldDifferences = {};

          for (const [index, field] of fields.entries()) {
            const expected = row.baseline.inputs[index];
            const present = Object.prototype.hasOwnProperty.call(
              payload,
              field
            );

            const actual = present ? payload[field] : null;
            const matches = present && actual === expected;

            row.ipfsFieldChecks[field] = matches;

            if (!matches) {
              row.ipfsFieldDifferences[field] = {
                baseline: expected,
                ipfs: actual,
                missingFromIpfs: !present,
              };
            }
          }

          row.ipfsExactFieldMatch =
            Object.values(row.ipfsFieldChecks).every(Boolean);

          record(
            `${pair.scenario}: gateway payload matches all four fields`,
            row.ipfsExactFieldMatch ? "passed" : "failed",
            {
              fields: row.ipfsFieldChecks,
              differences: row.ipfsFieldDifferences,
            }
          );

          if (!row.ipfsExactFieldMatch) {
            console.log(
              JSON.stringify(row.ipfsFieldDifferences, null, 2)
            );
          }
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

    for (let i = 1; i < archive.pairs.length; i++) {
      const current = archive.pairs[i];

      if (current.preparation) continue;

      const previous = archive.pairs[i - 1];

      if (
        current.baseline?.passed &&
        current.hybrid?.passed &&
        previous.baseline?.passed &&
        previous.hybrid?.passed
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
            ? "passed"
            : "failed",
          current.changedInputChecks
        );
      } else {
        record(
          `${current.scenario}: changed-input check`,
          "unresolved"
        );
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
    "No transactions were sent. Review all failed/unresolved checks and limitations."
  );

  if (archive.summary.failed > 0 || archive.summary.unresolved > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Could not complete:", safeError(error));
  process.exitCode = 1;
});