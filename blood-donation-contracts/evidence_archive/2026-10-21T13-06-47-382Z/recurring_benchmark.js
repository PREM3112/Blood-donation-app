import { network } from "hardhat";
import fs from "fs";

async function main() {
  const { ethers } = await network.connect();
  const [signer] = await ethers.getSigners();
  console.log(`Running Final Corrected Benchmark from: ${signer.address}\n`);

  const Baseline = await ethers.getContractAt("BloodDonationBaseline", "0x773Ceb52DFBa30CC9394682a38092f90049B0D69", signer);
  const Hybrid = await ethers.getContractAt("BloodDonation", "0x3Fd87E33BCC9108A373Ae8a2259E09BB6388aEAf", signer);

  // 1. Static Baseline Data (Mathematically matched to your JSON uploads)
  const name = "City Hospital";
  const lic = "LIC12345";
  
  const smallLevels_prep = JSON.stringify({ "O+": 20 });
  const time_small_prep = "2026-10-21T12:00:00Z";
  const smallLevels_measure = JSON.stringify({ "O+": 25 });
  const time_small_measure = "2026-10-21T12:05:00Z";

  const largeLevels_prep = JSON.stringify({ "O+": 11, "O-": 4, "A+": 14, "A-": 2, "B+": 7, "B-": 3, "AB+": 4, "AB-": 1 });
  const time_large_prep = "2026-10-21T12:00:00Z";
  const largeLevels_measure = JSON.stringify({ "O+": 15, "O-": 6, "A+": 10, "A-": 4, "B+": 9, "B-": 1, "AB+": 5, "AB-": 2 });
  const time_large_measure = "2026-10-21T12:05:00Z";

  // 2. Hybrid Payloads (The 59-character CIDv1s you generated)
  const cidSmallPrep =
  "bafkreibtn2mh2xzmre6iyllyk4cjzix2w5iw6q5e76s3hsog5mpzn5yife";

const cidSmallMeasure =
  "bafkreidd2bsrkl4xzlfuwzs6rcr36csv7m3euqxhaweohx2rv6nuj56oei";

const cidLargePrep =
  "bafkreicoqx3ztrbx3jmc67uwi26yytikwpajwnhwyiwtzaz4mxvz6su3wu";

const cidLargeMeasure =
  "bafkreicwculxoqwqq5rhfceri2y4djumaagbfo7cr7odrqhbulzc6ncj4m";

  const evidenceData = { 
    verifier: "Changed-Value Multi-Trial Benchmark", 
    wallet: signer.address, 
    trials: [] 
  };

  // Helper to log and store evidence
  async function executeAndLog(contract, method, args, scenarioDesc) {
    const tx = await contract[method](...args);
    const receipt = await tx.wait();
    console.log(`${scenarioDesc} Gas: ${receipt.gasUsed.toString()}`);
    evidenceData.trials.push({
      scenario: scenarioDesc,
      hash: receipt.hash,
      inputs: args,
      gasUsed: receipt.gasUsed.toString()
    });
  }

  console.log("--- PHASE 1: SMALL-TO-SMALL RECURRING UPDATES ---");
  await executeAndLog(Baseline, "updateInventory", [name, lic, smallLevels_prep, time_small_prep], "Prep Small Baseline");
  await executeAndLog(Hybrid, "updateInventory", [cidSmallPrep], "Prep Small Hybrid");

  // Alternate payloads to force EVM "changed-value" state writes
  const smallBaselineArgs = [
    [name, lic, smallLevels_measure, time_small_measure],
    [name, lic, smallLevels_prep, time_small_prep],
    [name, lic, smallLevels_measure, time_small_measure]
  ];
  const smallHybridArgs = [ [cidSmallMeasure], [cidSmallPrep], [cidSmallMeasure] ];

  for(let i=0; i<3; i++) {
    await executeAndLog(Baseline, "updateInventory", smallBaselineArgs[i], `Measure Small Baseline Trial ${i+1}`);
    await executeAndLog(Hybrid, "updateInventory", smallHybridArgs[i], `Measure Small Hybrid Trial ${i+1}`);
  }

  console.log("\n--- PHASE 2: LARGE-TO-LARGE RECURRING UPDATES ---");
  await executeAndLog(Baseline, "updateInventory", [name, lic, largeLevels_prep, time_large_prep], "Prep Large Baseline");
  await executeAndLog(Hybrid, "updateInventory", [cidLargePrep], "Prep Large Hybrid");

  // Alternate payloads to force EVM "changed-value" state writes
  const largeBaselineArgs = [
    [name, lic, largeLevels_measure, time_large_measure],
    [name, lic, largeLevels_prep, time_large_prep],
    [name, lic, largeLevels_measure, time_large_measure]
  ];
  const largeHybridArgs = [ [cidLargeMeasure], [cidLargePrep], [cidLargeMeasure] ];

  for(let i=0; i<3; i++) {
    await executeAndLog(Baseline, "updateInventory", largeBaselineArgs[i], `Measure Large Baseline Trial ${i+1}`);
    await executeAndLog(Hybrid, "updateInventory", largeHybridArgs[i], `Measure Large Hybrid Trial ${i+1}`);
  }

  fs.writeFileSync("final_capstone_evidence.json", JSON.stringify(evidenceData, null, 2));
  console.log("\n✅ Benchmark complete. Fully decoded inputs, hashes, and changed-value gas costs saved to 'final_capstone_evidence.json'.");
}

main().catch(console.error);