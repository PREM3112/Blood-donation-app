import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();
  const [signer] = await ethers.getSigners();
  console.log(`Running controlled benchmarks from: ${signer.address}\n`);

  const baselineAddress = "0x773Ceb52DFBa30CC9394682a38092f90049B0D69";
  const hybridAddress = "0x3Fd87E33BCC9108A373Ae8a2259E09BB6388aEAf";

  const Baseline = await ethers.getContractAt("BloodDonationBaseline", baselineAddress, signer);
  const Hybrid = await ethers.getContractAt("BloodDonation", hybridAddress, signer);

  console.log("--- 1. SETTING UP KNOWN STARTING STATES ---");
  const baselineStatus = await Baseline.bankStatuses(signer.address);
  if (!baselineStatus.isRegistered) {
    console.log("Authorizing Baseline...");
    let tx = await Baseline.registerBloodBank();
    await tx.wait();
    tx = await Baseline.verifyBloodBank(signer.address, true);
    await tx.wait();
  }

  const hybridStatus = await Hybrid.bankStatuses(signer.address);
  if (!hybridStatus.isRegistered) {
    console.log("Authorizing Hybrid...");
    let tx = await Hybrid.registerBloodBank();
    await tx.wait();
    tx = await Hybrid.verifyBloodBank(signer.address, true);
    await tx.wait();
  }
  console.log("Authorization and verification complete for both contracts.\n");

  // Define Mock Data
  const name = "City Hospital";
  const lic = "LIC12345";
  
  const smallInv = JSON.stringify({ "O+": 10 });
  const smallInv_v2 = JSON.stringify({ "O+": 15 });
  const largeInv = JSON.stringify({ "O+": 10, "O-": 5, "A+": 12, "A-": 3, "B+": 8, "B-": 2, "AB+": 4, "AB-": 1 });
  
  const ts1 = new Date().toISOString();
  const ts2 = new Date().toISOString();
  const ts3 = new Date().toISOString();

  // Fixed 46-character IPFS CIDs
  const cid1 = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
  const cid2 = "QmZXPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdH1";
  const cid3 = "QmAXPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdH2";

  console.log("--- 2. INITIAL WRITES (Zero to Non-Zero Slot) ---");
  console.log("Payload: Small Inventory");
  
  let tx = await Baseline.updateInventory(name, lic, smallInv, ts1);
  let receipt = await tx.wait();
  console.log(`Baseline Initial Write Gas:   ${receipt?.gasUsed.toString()}`);

  tx = await Hybrid.updateInventory(cid1);
  receipt = await tx.wait();
  console.log(`Hybrid Initial Write Gas:     ${receipt?.gasUsed.toString()}\n`);

  console.log("--- 3. SUBSEQUENT UPDATES (Non-Zero to Non-Zero Slot) ---");
  console.log("Payload: Small Inventory Update");
  
  tx = await Baseline.updateInventory(name, lic, smallInv_v2, ts2);
  receipt = await tx.wait();
  console.log(`Baseline Small Update Gas:    ${receipt?.gasUsed.toString()}`);

  tx = await Hybrid.updateInventory(cid2);
  receipt = await tx.wait();
  console.log(`Hybrid Small Update Gas:      ${receipt?.gasUsed.toString()}\n`);

  console.log("--- 4. SUBSEQUENT UPDATES (Large Payload) ---");
  console.log("Payload: Large Inventory (8 Blood Groups)");
  
  tx = await Baseline.updateInventory(name, lic, largeInv, ts3);
  receipt = await tx.wait();
  console.log(`Baseline Large Update Gas:    ${receipt?.gasUsed.toString()}`);

  tx = await Hybrid.updateInventory(cid3);
  receipt = await tx.wait();
  console.log(`Hybrid Large Update Gas:      ${receipt?.gasUsed.toString()}\n`);
  
  console.log("Benchmark complete. Save these figures for the manuscript!");
}

main().catch((error) => {
  console.error("Check failed:", error.shortMessage ?? error.message ?? "Unknown error");
  process.exitCode = 1;
});