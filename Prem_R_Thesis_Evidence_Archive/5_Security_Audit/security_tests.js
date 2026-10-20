import hre from "hardhat";
import fs from "node:fs";
import assert from "node:assert/strict";

const outputDirectory = `security_results_${Date.now()}`;
fs.mkdirSync(outputDirectory, { recursive: true });

const report = {
  startedAt: new Date().toISOString(),
  environment: "Local Hardhat node",
  scope:
    "Four access-control tests on a fresh local deployment. " +
    "Rejected operations use eth_call simulation, not mined transactions. " +
    "This is not a comprehensive security audit.",
  setupTransactions: [],
  tests: [],
};

function saveReport() {
  fs.writeFileSync(
    `${outputDirectory}/security_report.json`,
    JSON.stringify(
      report,
      (_, value) =>
        typeof value === "bigint" ? value.toString() : value,
      2
    )
  );

  const lines = [
    "LOCAL ACCESS-CONTROL TEST REPORT",
    `Started: ${report.startedAt}`,
    `Contract: ${report.contractAddress || "Not deployed"}`,
    "",
    ...report.tests.map(
      test =>
        `${test.passed ? "PASS" : "FAIL"}: ${test.name}\n` +
        JSON.stringify(test, null, 2)
    ),
  ];

  if (report.fatalError) {
    lines.push(`SETUP/EXECUTION ERROR: ${report.fatalError.message}`);
  }

  fs.writeFileSync(
    `${outputDirectory}/security_audit.log`,
    lines.join("\n\n")
  );
}

function errorDetails(error) {
  return {
    code: error.code || null,
    reason: error.reason || null,
    message: error.shortMessage || error.message || String(error),
    data: typeof error.data === "string" ? error.data : null,
  };
}

function snapshot(bank) {
  return {
    ipfsCID: bank.ipfsCID ?? bank[0],
    latitude: bank.latitude ?? bank[1],
    longitude: bank.longitude ?? bank[2],
    isVerified: bank.isVerified ?? bank[3],
    isActive: bank.isActive ?? bank[4],
  };
}

async function confirmTransaction(label, promise) {
  const tx = await promise;
  const receipt = await tx.wait();

  assert.ok(receipt, `${label}: receipt missing`);
  assert.equal(receipt.status, 1, `${label}: transaction failed`);

  report.setupTransactions.push({
    label,
    hash: tx.hash,
    receipt: receipt.toJSON(),
  });

  saveReport();
  return receipt;
}

async function runTest(name, action) {
  try {
    const details = await action();
    report.tests.push({ name, passed: true, ...details });
    console.log(`PASS: ${name}`);
  } catch (error) {
    report.tests.push({
      name,
      passed: false,
      error: errorDetails(error),
    });
    console.log(`FAIL: ${name}`);
    console.log(`  ${error.shortMessage || error.message}`);
  }

  saveReport();
}

async function expectRevert(action, expectedReason, ethers) {
  let caught;

  try {
    await action();
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, "Operation unexpectedly succeeded");

  // Providers may wrap the original RPC error differently.
  const candidates = [
    caught,
    caught.error,
    caught.info?.error,
    caught.cause,
  ].filter(Boolean);

  let actualReason = null;
  let revertData = null;

  // Prefer decoding actual Solidity Error(string) return data.
  for (const candidate of candidates) {
    const dataOptions = [
      candidate.data,
      candidate.data?.data,
      candidate.data?.return,
      candidate.data?.originalError?.data,
    ];

    for (const data of dataOptions) {
      if (
        typeof data !== "string" ||
        !data.startsWith("0x08c379a0")
      ) {
        continue;
      }

      try {
        actualReason = ethers.AbiCoder.defaultAbiCoder().decode(
          ["string"],
          `0x${data.slice(10)}`
        )[0];

        revertData = data;
        break;
      } catch {
        // Continue looking for usable revert evidence.
      }
    }

    if (actualReason !== null) break;
  }

  // Fall back to an explicitly reported revert reason.
  if (actualReason === null) {
    for (const candidate of candidates) {
      const isRevertError =
        candidate.code === "CALL_EXCEPTION" ||
        candidate.code === 3 ||
        /\brevert(?:ed)?\b/i.test(candidate.message || "");

      if (
        isRevertError &&
        typeof candidate.reason === "string"
      ) {
        actualReason = candidate.reason;
        break;
      }

      const message = candidate.message || "";

      const quoted = message.match(
        /reverted with reason string\s+(['"])(.*?)\1/i
      );
      const plain = message.match(
        /execution reverted:\s*([^\r\n]+)/i
      );

      if (quoted) {
        actualReason = quoted[2];
        break;
      }

      if (plain) {
        actualReason = plain[1].trim();

        if (
          (actualReason.startsWith('"') &&
            actualReason.endsWith('"')) ||
          (actualReason.startsWith("'") &&
            actualReason.endsWith("'"))
        ) {
          actualReason = actualReason.slice(1, -1);
        }
        break;
      }
    }
  }

  assert.equal(
    actualReason,
    expectedReason,
    "Expected exact contract revert reason was not found. " +
      `Provider message: ${caught.shortMessage || caught.message}`
  );

  return {
    method: "eth_call simulation",
    expectedReason,
    actualReason,
    errorCode: caught.code ?? null,
    revertData,
    providerMessage: caught.shortMessage || caught.message,
  };
}
async function main() {
  // Connect explicitly to localhost regardless of CLI network selection.
  const connection =
    typeof hre.network.create === "function"
      ? await hre.network.create("localhost")
      : await hre.network.connect("localhost");

  try {
    const { ethers } = connection;
    assert.ok(ethers, "Hardhat ethers plugin is unavailable");

    const network = await ethers.provider.getNetwork();
    assert.equal(
      network.chainId,
      31337n,
      "Expected the local Hardhat chain (31337). Stopping."
    );

    report.chainId = network.chainId.toString();

    const signers = await ethers.getSigners();
    assert.ok(signers.length >= 3, "Three local accounts are required");

    const [admin, verifiedBank, unverifiedBank] = signers;
    const adminAddress = await admin.getAddress();
    const verifiedAddress = await verifiedBank.getAddress();
    const unverifiedAddress = await unverifiedBank.getAddress();

    report.accounts = {
      admin: adminAddress,
      verifiedBank: verifiedAddress,
      unverifiedBank: unverifiedAddress,
    };

    // Deploy the actual BloodDonation artifact from this project.
    const factory = await ethers.getContractFactory(
      "BloodDonation",
      admin
    );

    const contract = await factory.deploy();
    await contract.waitForDeployment();

    report.contractAddress = await contract.getAddress();
    const deploymentReceipt =
      await contract.deploymentTransaction().wait();

    assert.equal(deploymentReceipt.status, 1);
    report.deploymentReceipt = deploymentReceipt.toJSON();

    const artifact = await hre.artifacts.readArtifact("BloodDonation");
    fs.writeFileSync(
      `${outputDirectory}/BloodDonation.artifact.json`,
      JSON.stringify(artifact, null, 2)
    );

    report.runtimeBytecodeHash = ethers.keccak256(
      await ethers.provider.getCode(report.contractAddress)
    );

    // Real CID strings used only as opaque fixture values here.
    // These tests do not retrieve or validate IPFS content.
    const initialCID =
      "QmPoncY7fVR9jC3V1pWWwcAqUrbZaGd8YvYSye75Vvja6i";
    const updatedCID =
      "QmYSLVjQDzEZpv4LMfnhJuiWaTnuDsiH9QyKojv4tHKQc5";

    await confirmTransaction(
      "Register bank to be verified",
      contract.connect(verifiedBank).registerBloodBank(
        initialCID,
        "13.0827",
        "80.2707"
      )
    );

    await confirmTransaction(
      "Approve verified bank",
      contract.connect(admin).verifyBloodBank(verifiedAddress, true)
    );

    await confirmTransaction(
      "Register unverified bank",
      contract.connect(unverifiedBank).registerBloodBank(
        initialCID,
        "13.0827",
        "80.2707"
      )
    );

    assert.equal(
      snapshot(await contract.bloodBanks(verifiedAddress)).isVerified,
      true
    );
    assert.equal(
      snapshot(await contract.bloodBanks(unverifiedAddress)).isVerified,
      false
    );

    await runTest("1. Authorized inventory update", async () => {
      const tx = await contract
        .connect(verifiedBank)
        .updateInventory(updatedCID);

      const receipt = await tx.wait();
      assert.equal(receipt.status, 1);

      const after = snapshot(
        await contract.bloodBanks(verifiedAddress)
      );
      assert.equal(after.ipfsCID, updatedCID);

      return {
        method: "Mined local transaction and storage read",
        transactionHash: tx.hash,
        receipt: receipt.toJSON(),
        stateAfter: after,
      };
    });

    await runTest("2. Unverified bank update rejected", async () => {
      const before = snapshot(
        await contract.bloodBanks(unverifiedAddress)
      );

      const rejection = await expectRevert(
        () =>
          contract.connect(unverifiedBank)
            .updateInventory.staticCall(updatedCID),
        "Bank must be verified",
        ethers
      );

      const after = snapshot(
        await contract.bloodBanks(unverifiedAddress)
      );
      assert.deepEqual(after, before);

      return { ...rejection, stateBefore: before, stateAfter: after };
    });

    await runTest("3. Non-admin verification rejected", async () => {
      const before = snapshot(
        await contract.bloodBanks(unverifiedAddress)
      );

      const rejection = await expectRevert(
        () =>
          contract.connect(verifiedBank)
            .verifyBloodBank.staticCall(unverifiedAddress, true),
        "Only admin can call this",
        ethers
      );

      const after = snapshot(
        await contract.bloodBanks(unverifiedAddress)
      );
      assert.deepEqual(after, before);

      return { ...rejection, stateBefore: before, stateAfter: after };
    });

    // Revocation is a setup step. Its failure must not be mistaken for
    // successful rejection of the later inventory update.
    await confirmTransaction(
      "Revoke bank verification",
      contract.connect(admin).verifyBloodBank(verifiedAddress, false)
    );

    assert.equal(
      snapshot(await contract.bloodBanks(verifiedAddress)).isVerified,
      false,
      "Revocation did not change verification state"
    );

    await runTest("4. Update after revocation rejected", async () => {
      const before = snapshot(
        await contract.bloodBanks(verifiedAddress)
      );

      const rejection = await expectRevert(
        () =>
          contract.connect(verifiedBank)
            .updateInventory.staticCall(initialCID),
        "Bank must be verified",
        ethers
      );

      const after = snapshot(
        await contract.bloodBanks(verifiedAddress)
      );
      assert.deepEqual(after, before);

      return { ...rejection, stateBefore: before, stateAfter: after };
    });

    const passed = report.tests.filter(test => test.passed).length;
    report.summary = {
      plannedTests: 4,
      completedTests: report.tests.length,
      passed,
      failed: report.tests.length - passed,
      allPassed: report.tests.length === 4 && passed === 4,
    };
    report.completedAt = new Date().toISOString();
    saveReport();

    console.log(`\nPassed: ${passed}/4`);
    console.log(`Evidence saved to: ${outputDirectory}`);

    if (!report.summary.allPassed) {
      process.exitCode = 1;
    }
  } finally {
    if (typeof connection.close === "function") {
      await connection.close();
    }
  }
}

main().catch(error => {
  report.fatalError = errorDetails(error);
  report.completedAt = new Date().toISOString();
  saveReport();
  console.error("Stopped:", error.shortMessage || error.message);
  console.error(`Partial evidence saved to: ${outputDirectory}`);
  process.exitCode = 1;
});