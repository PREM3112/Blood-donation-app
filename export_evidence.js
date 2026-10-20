require('dotenv').config();
const { ethers } = require('ethers');
const axios = require('axios');
const fs = require('fs');

const RPC_URL = process.env.SEPOLIA_RPC_URL;
const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

// Define the exact transaction hashes from your benchmark logs
const BASELINE_TXS = [
  "0x2e6ca1239a8e84c2cc570c6e2ca0f93e633d40538c1c382b0a18b9e3c6bde9ad", // Run 1 (Init - 905014 gas)
  "0xcd26df181870c9b16f4db53e0264ebf9e2c37468e653488da2a1a3919035be13", // Run 2 (61678 gas)
  "0xf744d19554a2d5ec82ca50792f58598c711f432fcb11b42d84e86fc2420af2c8", // Run 3
  "0xa69302f2895e855852776167bce44d1c17b7b563a36e37e78d2eb2b75708021e", // Run 4
  "0x93d9eccbe8a76943103a658f91a2670f636cae18047cf3168455cd2083c577e2", // Run 5
  "0xbf234949ee75eeb37524d89b1cb5e1bb08d98ef269591492e0abf992fb74f63c", // Run 6
  "0x913b7b2da4832a948a19c4341370cae73b4dec28f899ff33c3c0721680cfd67c", // Run 7
  "0xed905e3317d9d2a91de8519b0a456db0bb6c1181a04657f7ff687475e22e9050", // Run 8
  "0xe88b34132404ccedb954305f070f9b615513693a23269ca2c411ab04cab67c99", // Run 9
  "0x04ed588bf673c2db64b258a8adb4ad036eaab59de50b4d6a9be5effe906c0d82"  // Run 10
];

const BASELINE_ABI = [
  "function updateInventoryOnChain(string _name, string _licenseId, string _inventoryLevels, string _timestamp) public"
];

async function exportEvidence() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const iface = new ethers.Interface(BASELINE_ABI);
  
  const report = {
    timestamp: new Date().toISOString(),
    baselineReceiptsAndDecodedInputs: [],
    ipfsRetrievals: []
  };

  console.log("Fetching and verifying baseline transaction receipts and inputs...");
  for (let i = 0; i < BASELINE_TXS.length; i++) {
    const txHash = BASELINE_TXS[i];
    const tx = await provider.getTransaction(txHash);
    const receipt = await provider.getTransactionReceipt(txHash);
    
    let decodedArgs = null;
    try {
      const parsed = iface.parseTransaction({ data: tx.data });
      decodedArgs = {
        name: parsed.args[0],
        licenseId: parsed.args[1],
        inventoryLevels: parsed.args[2],
        timestamp: parsed.args[3]
      };
    } catch (e) {
      decodedArgs = "Could not decode transaction data";
    }

    report.baselineReceiptsAndDecodedInputs.push({
      iteration: i + 1,
      txHash: txHash,
      to: receipt.to,
      status: receipt.status === 1 ? "Success" : "Failed",
      gasUsed: receipt.gasUsed.toString(),
      blockNumber: receipt.blockNumber,
      decodedInputs: decodedArgs
    });
    console.log(`Processed Baseline Run ${i + 1} | Gas Used: ${receipt.gasUsed.toString()}`);
  }

  // Save to file
  fs.writeFileSync('evidence_export.json', JSON.stringify(report, null, 2));
  console.log("\nSuccess! Evidence export saved to 'evidence_export.json'.");
}

// Call the correct function name
exportEvidence();