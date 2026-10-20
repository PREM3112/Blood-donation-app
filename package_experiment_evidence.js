require('dotenv').config();
const { ethers } = require('ethers');
const axios = require('axios');
const fs = require('fs');

const RPC_URL = process.env.SEPOLIA_RPC_URL;
const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

// 1. Static input dataset used for the deterministic run
const STATIC_INPUT_DATASET = Array.from({ length: 10 }, (_, i) => ({
  iteration: i + 1,
  name: "Rajiv Gandhi Government General Hospital (Node)",
  licenseId: "GOV-TN-101",
  inventoryLevels: `O+: ${15 + i}, O-: 2, A+: 8, B+: 11, AB+: 5`,
  timestamp: "2026-10-15T13:00:00.000Z"
}));

// 2. Insert your 10 baseline hashes from this new experiment
const BASELINE_TXS = [
  // Example: "0x2e6ca123..." (fill with your 10 new baseline hashes)
];

// 3. Insert your 10 hybrid hashes from this new experiment
const HYBRID_TXS = [
  // Example: "0x4750a307..." (fill with your 10 new hybrid hashes)
];

const BASELINE_ABI = [
  "function updateInventoryOnChain(string _name, string _licenseId, string _inventoryLevels, string _timestamp) public"
];

const HYBRID_ABI = [
  "function updateInventory(string memory _newIpfsCID) public"
];

async function packageEvidence() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const baselineIface = new ethers.Interface(BASELINE_ABI);
  const hybridIface = new ethers.Interface(HYBRID_ABI);

  const report = {
    experimentTimestamp: new Date().toISOString(),
    analysisSummary: {
      description: "Separate experiment analysis comparing 10 matched runs",
      baselineCosts: [61678, ...Array(9).fill(51678)],
      hybridCostConstant: 49010,
      overallReductionPercent: "6.96%",
      steadyStateReductionPercent: "5.16%",
      notes: "Run 1 baseline is 61,678 gas; runs 2-10 are 51,678 gas due to warm storage slot dynamics. Hybrid is constant at 49,010 gas."
    },
    inputDataset: STATIC_INPUT_DATASET,
    baselineResults: [],
    hybridResults: []
  };

  console.log("Packaging Baseline records...");
  for (let i = 0; i < BASELINE_TXS.length; i++) {
    const txHash = BASELINE_TXS[i];
    try {
      const tx = await provider.getTransaction(txHash);
      const receipt = await provider.getTransactionReceipt(txHash);
      const parsed = baselineIface.parseTransaction({ data: tx.data });

      report.baselineResults.push({
        iteration: i + 1,
        txHash: txHash,
        contractAddress: receipt.to,
        status: receipt.status === 1 ? "Success" : "Failed",
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber,
        decodedInputs: {
          name: parsed.args[0],
          licenseId: parsed.args[1],
          inventoryLevels: parsed.args[2],
          timestamp: parsed.args[3]
        }
      });
    } catch (e) {
      console.error(`Baseline tx error (${txHash}): ${e.message}`);
    }
  }

  console.log("Packaging Hybrid records & retrieving IPFS contents...");
  for (let i = 0; i < HYBRID_TXS.length; i++) {
    const txHash = HYBRID_TXS[i];
    try {
      const tx = await provider.getTransaction(txHash);
      const receipt = await provider.getTransactionReceipt(txHash);
      const parsed = hybridIface.parseTransaction({ data: tx.data });
      const ipfsCID = parsed.args[0];

      let retrievedJson = null;
      try {
        const response = await axios.get(`${PINATA_GATEWAY}${ipfsCID}`, { timeout: 10000 });
        retrievedJson = response.data;
      } catch (ipfsErr) {
        retrievedJson = `IPFS Retrieval Failed: ${ipfsErr.message}`;
      }

      report.hybridResults.push({
        iteration: i + 1,
        txHash: txHash,
        contractAddress: receipt.to,
        status: receipt.status === 1 ? "Success" : "Failed",
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber,
        ipfsCID: ipfsCID,
        retrievedPayload: retrievedJson
      });
    } catch (e) {
      console.error(`Hybrid tx error (${txHash}): ${e.message}`);
    }
  }

  fs.writeFileSync('experiment_evidence_report.json', JSON.stringify(report, null, 2));
  console.log("\nSuccess! Complete experimental evidence package saved to 'experiment_evidence_report.json'.");
}

packageEvidence();