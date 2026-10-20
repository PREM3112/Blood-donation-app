require('dotenv').config();
const { ethers } = require('ethers');
const axios = require('axios');
const fs = require('fs');

const RPC_URL = process.env.SEPOLIA_RPC_URL;
const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

// 1. Your verified baseline transaction hashes (already successfully exported)
const BASELINE_TXS = [
  "0x2e6ca1239a8e84c2cc570c6e2ca0f93e633d40538c1c382b0a18b9e3c6bde9ad",
  "0xcd26df181870c9b16f4db53e0264ebf9e2c37468e653488da2a1a3919035be13",
  "0xf744d19554a2d5ec82ca50792f58598c711f432fcb11b42d84e86fc2420af2c8",
  "0xa69302f2895e855852776167bce44d1c17b7b563a36e37e78d2eb2b75708021e",
  "0x93d9eccbe8a76943103a658f91a2670f636cae18047cf3168455cd2083c577e2",
  "0xbf234949ee75eeb37524d89b1cb5e1bb08d98ef269591492e0abf992fb74f63c",
  "0x913b7b2da4832a948a19c4341370cae73b4dec28f899ff33c3c0721680cfd67c",
  "0xed905e3317d9d2a91de8519b0a456db0bb6c1181a04657f7ff687475e22e9050",
  "0xe88b34132404ccedb954305f070f9b615513693a23269ca2c411ab04cab67c99",
  "0x04ed588bf673c2db64b258a8adb4ad036eaab59de50b4d6a9be5effe906c0d82"
];

// 2. Paste your recorded hybrid transaction hashes here:
const HYBRID_TXS = [
  // Example placeholder format:
  // "0x4750a307...",
];

const BASELINE_ABI = [
  "function updateInventoryOnChain(string _name, string _licenseId, string _inventoryLevels, string _timestamp) public"
];

const HYBRID_ABI = [
  "function updateInventory(string memory _newIpfsCID) public"
];

async function runCompleteExport() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const baselineIface = new ethers.Interface(BASELINE_ABI);
  const hybridIface = new ethers.Interface(HYBRID_ABI);
  
  const report = {
    exportTimestamp: new Date().toISOString(),
    baselineReceiptsAndDecodedInputs: [],
    hybridReceiptsAndIPFSData: []
  };

  console.log("=== Processing Baseline Transactions ===");
  for (let i = 0; i < BASELINE_TXS.length; i++) {
    const txHash = BASELINE_TXS[i];
    try {
      const tx = await provider.getTransaction(txHash);
      const receipt = await provider.getTransactionReceipt(txHash);
      const parsed = baselineIface.parseTransaction({ data: tx.data });
      
      report.baselineReceiptsAndDecodedInputs.push({
        iteration: i + 1,
        txHash: txHash,
        to: receipt.to,
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
      console.log(`Baseline Run ${i + 1} processed successfully.`);
    } catch (e) {
      console.error(`Error processing baseline tx ${txHash}: ${e.message}`);
    }
  }

  console.log("\n=== Processing Hybrid Transactions & IPFS Retrieval ===");
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
      } catch (ipfsError) {
        retrievedJson = `Failed to fetch from IPFS gateway: ${ipfsError.message}`;
      }

      report.hybridReceiptsAndIPFSData.push({
        iteration: i + 1,
        txHash: txHash,
        to: receipt.to,
        status: receipt.status === 1 ? "Success" : "Failed",
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber,
        ipfsCID: ipfsCID,
        retrievedPayload: retrievedJson
      });
      console.log(`Hybrid Run ${i + 1} processed (CID: ${ipfsCID}).`);
    } catch (e) {
      console.error(`Error processing hybrid tx ${txHash}: ${e.message}`);
    }
  }

  fs.writeFileSync('complete_evidence_export.json', JSON.stringify(report, null, 2));
  console.log("\nComplete evidence export successfully saved to 'complete_evidence_export.json'.");
}

runCompleteExport();