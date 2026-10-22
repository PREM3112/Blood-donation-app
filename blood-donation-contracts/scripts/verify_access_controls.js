import { network, artifacts } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const stringify = (value) =>
  JSON.stringify(
    value,
    (_, item) => (typeof item === "bigint" ? item.toString() : item),
    2
  );

const sha256 = (text) =>
  createHash("sha256").update(text).digest("hex");

// Find revert bytes in common ethers / Hardhat error structures.
function findRevertData(error) {
  const candidates = [
    error?.data,
    error?.data?.data,
    error?.data?.returnData,
    error?.error?.data,
    error?.error?.data?.data,
    error?.info?.error?.data,
    error?.info?.error?.data?.data,
    error?.cause?.data,
    error?.cause?.data?.data,
  ];

  return candidates.find(
    (value) =>
      typeof value === "string" &&
      /^0x[0-9a-fA-F]+$/.test(value) &&
      value.length >= 10
  );
}

function describeError(error) {
  return {
    code: error?.code ?? null,
    message:
      error?.shortMessage ??
      error?.message ??
      "Unknown execution error",
  };
}

async function main() {
  // Hardhat 3: ethers belongs to the network connection.
  const { ethers } = await network.connect();

  if (!ethers) {
    throw new Error(
      "The hardhat-ethers plugin is not configured in hardhat.config.js."
    );
  }

  const connectedNetwork = await ethers.provider.getNetwork();

  // This script deploys fresh contracts using local test accounts.
  if (connectedNetwork.chainId !== 31337n) {
    throw new Error(
      "This script only runs on a local Hardhat network with chain ID 31337."
    );
  }

  const signers = await ethers.getSigners();

  if (signers.length < 5) {
    throw new Error("Five local test accounts are required.");
  }

  const [
    admin,
    unregisteredBank,
    unverifiedBank,
    revokedBank,
    validBank,
  ] = signers;

  const accounts = {
    admin: await admin.getAddress(),
    unregisteredBank: await unregisteredBank.getAddress(),
    unverifiedBank: await unverifiedBank.getAddress(),
    revokedBank: await revokedBank.getAddress(),
    validBank: await validBank.getAddress(),
  };

  const outputDir = path.resolve(
    "security_evidence",
    new Date().toISOString().replace(/[:.]/g, "-")
  );

  fs.mkdirSync(outputDir, { recursive: true });

  const reportPath = path.join(outputDir, "security_report.json");

  const report = {
    startedAt: new Date().toISOString(),
    chainId: connectedNetwork.chainId.toString(),
    environment: "Local Hardhat network",
    scope: {
      deployment: "Fresh local deployments of the current artifacts",
      negativeTests: "eth_call simulation via staticCall",
      positiveTests: "Mined local transactions",
      limitations: [
        "This is not a Sepolia deployment audit.",
        "An EVM rejection is recorded with its decoded reason.",
        "Verification revocation is not a separate inactive-status test.",
        "These tests do not constitute a comprehensive security audit.",
      ],
    },
    accounts,
    contracts: [],
    tests: [],
    complete: false,
  };

  function saveReport() {
    report.summary = {
      passed: report.tests.filter((test) => test.status === "PASS").length,
      failed: report.tests.filter((test) => test.status === "FAIL").length,
      unresolved: report.tests.filter(
        (test) => test.status === "UNRESOLVED"
      ).length,
      total: report.tests.length,
    };

    fs.writeFileSync(reportPath, stringify(report));
  }

  function record(test) {
    report.tests.push(test);
    console.log(
      `${test.status}: ${test.contract} — ${test.name}`
    );

    if (test.revert?.name === "Error") {
      console.log(`  Revert reason: ${test.revert.args[0]}`);
    }

    if (test.error) {
      console.log(`  ${test.error.message}`);
    }

    saveReport();
  }

  async function mine(transactionPromise) {
    const transaction = await transactionPromise;
    const receipt = await transaction.wait();

    if (!receipt || receipt.status !== 1) {
      throw new Error(
        `Transaction did not succeed: ${transaction.hash}`
      );
    }

    return {
      hash: transaction.hash,
      receipt: receipt.toJSON(),
    };
  }

  // Require decodable revert data. RPC errors alone do not count as passes.
  async function expectRejection(contractName, contract, name, call) {
    try {
      await call();

      record({
        contract: contractName,
        name,
        method: "staticCall",
        status: "FAIL",
        error: {
          message: "The unauthorized call unexpectedly succeeded.",
        },
      });
    } catch (error) {
      const data = findRevertData(error);
      let decoded = null;

      if (data) {
        try {
          decoded = contract.interface.parseError(data);
        } catch {
          // Undecodable errors remain unresolved.
        }
      }

      // A Solidity panic is a program failure, not proof of access control.
      if (decoded?.name === "Panic") {
        record({
          contract: contractName,
          name,
          method: "staticCall",
          status: "FAIL",
          revert: {
            data,
            name: decoded.name,
            args: Array.from(decoded.args),
          },
          error: {
            message: "The call panicked instead of an access-control rejection.",
          },
        });
        return;
      }

      if (!decoded) {
        record({
          contract: contractName,
          name,
          method: "staticCall",
          status: "UNRESOLVED",
          revertData: data ?? null,
          error: describeError(error),
        });
        return;
      }

      record({
        contract: contractName,
        name,
        method: "staticCall",
        status: "PASS",
        revert: {
          data,
          name: decoded.name,
          args: Array.from(decoded.args),
        },
      });
    }
  }

  const cid =
    "bafkreibtn2mh2xzmre6iyllyk4cjzix2w5iw6q5e76s3hsog5mpzn5yife";

  const baselineInputs = [
    "City Hospital",
    "LIC12345",
    '{"O+":20}',
    "2026-10-21T12:00:00Z",
  ];

  saveReport();

  try {
    for (const contractName of [
      "BloodDonationBaseline",
      "BloodDonation",
    ]) {
      console.log(`\n--- Testing ${contractName} ---`);

      const artifact = await artifacts.readArtifact(contractName);

      fs.writeFileSync(
        path.join(outputDir, `${contractName}.artifact.json`),
        stringify(artifact)
      );

      const factory = await ethers.getContractFactory(
        contractName,
        admin
      );

      const contract = await factory.deploy();
      await contract.waitForDeployment();

      const address = await contract.getAddress();
      const deploymentReceipt =
        await contract.deploymentTransaction().wait();

      if (!deploymentReceipt || deploymentReceipt.status !== 1) {
        throw new Error(`${contractName} deployment failed.`);
      }

      const contractEvidence = {
        name: contractName,
        address,
        artifactSha256: sha256(stringify(artifact)),
        deploymentReceipt: deploymentReceipt.toJSON(),
        setupTransactions: [],
      };

      report.contracts.push(contractEvidence);
      saveReport();

      async function setup(label, transactionPromise) {
        const result = await mine(transactionPromise);
        contractEvidence.setupTransactions.push({
          label,
          ...result,
        });
        saveReport();
      }

      await setup(
        "Register unverified bank",
        contract.connect(unverifiedBank).registerBloodBank()
      );

      await setup(
        "Register bank that will be revoked",
        contract.connect(revokedBank).registerBloodBank()
      );

      await setup(
        "Verify bank before revocation",
        contract
          .connect(admin)
          .verifyBloodBank(accounts.revokedBank, true)
      );

      await setup(
        "Revoke bank verification",
        contract
          .connect(admin)
          .verifyBloodBank(accounts.revokedBank, false)
      );

      await setup(
        "Register valid bank",
        contract.connect(validBank).registerBloodBank()
      );

      await setup(
        "Verify valid bank",
        contract
          .connect(admin)
          .verifyBloodBank(accounts.validBank, true)
      );

      const updateInputs =
        contractName === "BloodDonationBaseline"
          ? baselineInputs
          : [cid];

      // Establish that the same input succeeds for an authorized account.
      let authorizedUpdatePassed = false;

      try {
        const result = await mine(
          contract.connect(validBank).updateInventory(...updateInputs)
        );

        authorizedUpdatePassed = true;

        record({
          contract: contractName,
          name: "Authorized inventory update succeeds",
          method: "Mined local transaction",
          status: "PASS",
          inputs: updateInputs,
          ...result,
        });
      } catch (error) {
        record({
          contract: contractName,
          name: "Authorized inventory update succeeds",
          status: "FAIL",
          error: describeError(error),
        });
      }

      for (const [name, signer] of [
        ["Unregistered bank update is rejected", unregisteredBank],
        ["Unverified bank update is rejected", unverifiedBank],
        ["Update after verification revocation is rejected", revokedBank],
      ]) {
        if (!authorizedUpdatePassed) {
          record({
            contract: contractName,
            name,
            status: "UNRESOLVED",
            error: {
              message:
                "Authorized control failed; cannot interpret rejection reliably.",
            },
          });
          continue;
        }

        await expectRejection(
          contractName,
          contract,
          name,
          () =>
            contract
              .connect(signer)
              .updateInventory.staticCall(...updateInputs)
        );
      }

      // Admin calls with this function succeeded during setup.
      await expectRejection(
        contractName,
        contract,
        "Non-admin verification is rejected",
        () =>
          contract
            .connect(unregisteredBank)
            .verifyBloodBank.staticCall(accounts.unverifiedBank, true)
      );
    }

    report.complete = true;
  } catch (error) {
    report.fatalError = describeError(error);
    process.exitCode = 1;
    console.error(`\nStopped: ${report.fatalError.message}`);
  } finally {
    report.finishedAt = new Date().toISOString();
    saveReport();

    console.log("\n--- TEST SUMMARY ---");
    console.log(`Passed:     ${report.summary.passed}`);
    console.log(`Failed:     ${report.summary.failed}`);
    console.log(`Unresolved: ${report.summary.unresolved}`);
    console.log(`Report:     ${reportPath}`);

    if (
      !report.complete ||
      report.summary.failed > 0 ||
      report.summary.unresolved > 0
    ) {
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(error.shortMessage ?? error.message ?? error);
  process.exitCode = 1;
});