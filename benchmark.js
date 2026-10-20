require('dotenv').config();
const { ethers } = require('ethers');
const axios = require('axios');

const RPC_URL = process.env.SEPOLIA_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PINATA_JWT = process.env.PINATA_JWT;

const BASELINE_ADDRESS = "0x5a9D64b0158fa3c4df12f9f1730dB326CA624BAf";
const HYBRID_ADDRESS = process.env.BLOOD_DONATION_CONTRACT_ADDRESS;

const BASELINE_ABI = ["function updateInventoryOnChain(string _name, string _licenseId, string _inventoryLevels, string _timestamp) public"];
const HYBRID_ABI = ["function updateInventory(string memory _newIpfsCID) public"];

async function pinJsonToPinata(jsonData) {
  const url = `https://api.pinata.cloud/pinning/pinJSONToIPFS`;
  const response = await axios.post(url, jsonData, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PINATA_JWT}` }
  });
  return response.data.IpfsHash;
}

async function runBenchmark() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const baselineContract = new ethers.Contract(BASELINE_ADDRESS, BASELINE_ABI, wallet);
  const hybridContract = new ethers.Contract(HYBRID_ADDRESS, HYBRID_ABI, wallet);

  console.log("Starting Deterministic 10-Run Matched Benchmark...\n");

  for (let i = 0; i < 10; i++) {
    const iteration = i + 1;
    const inventoryStr = `O+: ${15 + i}, O-: 2, A+: 8, B+: 11, AB+: 5`;
    const timestampStr = "2026-10-15T13:00:00.000Z";
    const name = "Rajiv Gandhi Government General Hospital (Node)";
    const licenseId = "GOV-TN-101";

    console.log(`=== Run ${iteration} ===`);

    // Baseline Execution
    try {
      const txBase = await baselineContract.updateInventoryOnChain(name, licenseId, inventoryStr, timestampStr);
      const receiptBase = await txBase.wait();
      console.log(`Baseline Hash: ${txBase.hash} | Gas Used: ${receiptBase.gasUsed.toString()}`);
    } catch (e) {
      console.log(`Baseline Error: ${e.message}`);
    }

    // Hybrid Execution
    try {
      const ipfsCID = await pinJsonToPinata({ name, licenseId, inventoryLevels: inventoryStr, timestamp: timestampStr });
      const txHybrid = await hybridContract.updateInventory(ipfsCID);
      const receiptHybrid = await txHybrid.wait();
      console.log(`Hybrid Hash: ${txHybrid.hash} | CID: ${ipfsCID} | Gas Used: ${receiptHybrid.gasUsed.toString()}\n`);
    } catch (e) {
      console.log(`Hybrid Error: ${e.message}\n`);
    }
  }
}

runBenchmark();