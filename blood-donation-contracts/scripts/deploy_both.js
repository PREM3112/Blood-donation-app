import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const { ethers } = await network.connect();
  const chain = await ethers.provider.getNetwork();

  if (chain.chainId !== 11155111n) {
    throw new Error("Wrong network: expected Sepolia (11155111).");
  }

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const directory = path.resolve("deployment_evidence", runId);
  fs.mkdirSync(directory, { recursive: true });

  const save = (name, value) => {
    fs.writeFileSync(
      path.join(directory, name),
      JSON.stringify(
        value,
        (_, item) => typeof item === "bigint" ? item.toString() : item,
        2
      )
    );
  };

  async function deploy(contractName) {
    console.log(`Deploying ${contractName}...`);

    const factory = await ethers.getContractFactory(contractName);
    const contract = await factory.deploy();
    const tx = contract.deploymentTransaction();

    if (!tx) throw new Error("Deployment transaction unavailable.");

    // Save the hash immediately, even if waiting later fails.
    save(`${contractName}_submitted.json`, {
      contractName,
      transactionHash: tx.hash,
      chainId: chain.chainId.toString(),
    });

    console.log(`Transaction: ${tx.hash}`);

    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new Error(`${contractName} deployment failed.`);
    }

    await contract.waitForDeployment();
    const address = await contract.getAddress();

    save(`${contractName}_receipt.json`, receipt);

    const result = {
      contractName,
      address,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      deploymentGas: receipt.gasUsed.toString(),
    };

    save(`${contractName}_deployment.json`, result);
    console.log(`${contractName}: ${address}`);

    return result;
  }

  const baseline = await deploy("BloodDonationBaseline");
  const hybrid = await deploy("BloodDonation");

  save("deployed_addresses.json", {
    Baseline: baseline.address,
    Hybrid: hybrid.address,
    chainId: chain.chainId.toString(),
    timestamp: new Date().toISOString(),
    baseline,
    hybrid,
  });

  console.log(`Deployment evidence saved to: ${directory}`);
}

main().catch((error) => {
  let message = String(
    error?.shortMessage ?? error?.message ?? error
  );

  // Remove credentials and RPC URLs before printing.
  for (const secret of [
    process.env.PRIVATE_KEY,
    process.env.SEPOLIA_RPC_URL,
  ]) {
    if (secret) message = message.split(secret).join("[REDACTED]");
  }

  message = message
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[REDACTED_URL]")
    .replace(/\b(?:0x)?[a-fA-F0-9]{64}\b/g, "[REDACTED_HEX]");

  console.error("Deployment error code:", error?.code ?? "Unavailable");
  console.error("Deployment error:", message);
  process.exitCode = 1;
});