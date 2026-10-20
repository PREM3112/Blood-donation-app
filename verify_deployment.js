const { ethers } = require("ethers");
const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();

function normalizeBytecode(value) {
  if (
    typeof value !== "string" ||
    !/^0x(?:[0-9a-fA-F]{2})+$/.test(value)
  ) {
    throw new Error("Missing, empty, or invalid runtime bytecode.");
  }

  return value.toLowerCase();
}

function firstDifference(local, deployed) {
  const length = Math.min(local.length, deployed.length);

  for (let i = 2; i < length; i += 2) {
    if (local.slice(i, i + 2) !== deployed.slice(i, i + 2)) {
      return (i - 2) / 2;
    }
  }

  return local.length === deployed.length ? null : (length - 2) / 2;
}

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL?.trim();

  if (!rpcUrl) {
    throw new Error("SEPOLIA_RPC_URL is missing from your .env file.");
  }

  const targetDir = path.join(
    __dirname,
    "Prem_R_Thesis_Evidence_Archive",
    "1_Smart_Contracts"
  );

  const addressesPath = path.join(targetDir, "deployed_addresses.json");

  if (!fs.existsSync(addressesPath)) {
    throw new Error(`File not found: ${addressesPath}`);
  }

  const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));

  const hybridAddress = addresses["BloodDonationModule#BloodDonation"];

  if (!hybridAddress || !ethers.isAddress(hybridAddress)) {
    throw new Error("Valid hybrid address missing from deployed_addresses.json.");
  }

  const targets = [
    {
      name: "BloodDonation",
      address: hybridAddress,
      addressSource: "deployed_addresses.json",
    },
    {
      name: "BloodDonationBaseline",
      address: "0x5a9D64b0158fa3c4df12f9f1730dB326CA624BAf",
      addressSource: "Previously supplied benchmark transaction records",
    },
  ];

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  try {
    const network = await provider.getNetwork();

    if (network.chainId !== 11155111n) {
      throw new Error("Wrong network. Expected Sepolia, chain ID 11155111.");
    }

    // Both contracts are checked at the same recorded block.
    const blockNumber = await provider.getBlockNumber();
    const block = await provider.getBlock(blockNumber);

    if (!block) {
      throw new Error("Could not retrieve the verification block.");
    }

    const report = {
      timestamp: new Date().toISOString(),
      network: "Sepolia",
      chainId: network.chainId.toString(),
      blockNumber,
      blockHash: block.hash,
      method: "Exact runtime bytecode comparison; no metadata removed.",
      contracts: [],
    };

    // Unique filename preserves earlier verification reports.
    const reportPath = path.join(
      targetDir,
      `deployment_linkage_report_${Date.now()}.json`
    );

    for (const target of targets) {
      const artifactPath = path.join(targetDir, `${target.name}.json`);

      console.log(`Checking ${target.name} at ${target.address}...`);

      try {
        if (!fs.existsSync(artifactPath)) {
          throw new Error(`Artifact not found: ${artifactPath}`);
        }

        const artifact = JSON.parse(
          fs.readFileSync(artifactPath, "utf8")
        );

        if (artifact.contractName !== target.name) {
          throw new Error("Artifact contract name does not match target.");
        }

        const onChainCode = await provider.getCode(
          target.address,
          blockNumber
        );

        if (onChainCode === "0x") {
          throw new Error("No contract code found at this address.");
        }

        const local = normalizeBytecode(artifact.deployedBytecode);
        const deployed = normalizeBytecode(onChainCode);
        const exactMatch = local === deployed;

        const result = {
          contract: target.name,
          address: target.address,
          addressSource: target.addressSource,
          artifactFile: `${target.name}.json`,
          buildInfoId: artifact.buildInfoId ?? null,
          verificationStatus: exactMatch
            ? "EXACT_RUNTIME_BYTECODE_MATCH"
            : "RUNTIME_BYTECODE_MISMATCH_REQUIRES_INVESTIGATION",
          localRuntimeBytes: (local.length - 2) / 2,
          onChainRuntimeBytes: (deployed.length - 2) / 2,
          localRuntimeHash: ethers.keccak256(local),
          onChainRuntimeHash: ethers.keccak256(deployed),
          firstDifferenceByte: firstDifference(local, deployed),
          localRuntimeBytecode: local,
          onChainRuntimeBytecode: deployed,
        };

        report.contracts.push(result);
        console.log(result.verificationStatus);
      } catch (error) {
        // Avoid printing provider request details containing RPC credentials.
        const message =
          error.code
            ? `Verification error: ${error.code}`
            : String(error.message || "Unknown verification error");

        report.contracts.push({
          contract: target.name,
          address: target.address,
          verificationStatus: "CHECK_FAILED",
          error: message.split(rpcUrl).join("[REDACTED_RPC_URL]"),
        });

        console.log(`${target.name}: check failed; see report.`);
      }

      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    }

    console.log(`\nReport saved to:\n${reportPath}`);

    if (
      report.contracts.some(
        item => item.verificationStatus !== "EXACT_RUNTIME_BYTECODE_MATCH"
      )
    ) {
      process.exitCode = 1;
    }
  } finally {
    provider.destroy();
  }
}

main().catch(error => {
  const rpcUrl = process.env.SEPOLIA_RPC_URL?.trim();
  let message = error.code
    ? `Setup failed: ${error.code}`
    : String(error.message || "Verification failed.");

  if (rpcUrl) {
    message = message.split(rpcUrl).join("[REDACTED_RPC_URL]");
  }

  console.error(message);
  process.exitCode = 1;
});