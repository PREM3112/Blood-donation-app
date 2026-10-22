import { network } from "hardhat";
import fs from "fs";

async function main() {
  const { ethers } = await network.connect();
  const exportData = JSON.parse(fs.readFileSync("capstone_evidence.json", "utf-8"));
  
  const Baseline = await ethers.getContractAt("BloodDonationBaseline", "0x773Ceb52DFBa30CC9394682a38092f90049B0D69");
  const Hybrid = await ethers.getContractAt("BloodDonation", "0x3Fd87E33BCC9108A373Ae8a2259E09BB6388aEAf");

  const evidenceLog = [];

  for (const trial of exportData.trials) {
    const isBaseline = trial.scenario.includes("Baseline");
    const contract = isBaseline ? Baseline : Hybrid;
    
    const tx = await ethers.provider.getTransaction(trial.hash);
    const receipt = await ethers.provider.getTransactionReceipt(trial.hash);
    const decoded = contract.interface.parseTransaction({ data: tx.data });

    let ipfsData = null;
    if (!isBaseline && decoded.args[0]) {
      try {
        const res = await fetch(`https://gateway.pinata.cloud/ipfs/${decoded.args[0]}`);
        ipfsData = await res.json();
      } catch (e) {
        ipfsData = "Gateway timeout / Fetch Error";
      }
    }

    evidenceLog.push({
      scenario: trial.scenario,
      hash: trial.hash,
      receipt: {
        status: receipt.status === 1 ? "Success" : "Failed",
        block: receipt.blockNumber,
        destination: receipt.to,
        gasUsed: receipt.gasUsed.toString()
      },
      decodedInputs: decoded.args.map(arg => arg.toString()),
      retrievedIPFS: ipfsData
    });
  }

  fs.writeFileSync("forensic_evidence_log.json", JSON.stringify(evidenceLog, null, 2));
  console.log("Forensic extraction saved to forensic_evidence_log.json. Send this to the reviewer.");
}

main().catch(console.error);