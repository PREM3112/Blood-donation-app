require('dotenv').config();
const { ethers } = require('ethers');
const axios = require('axios');

// --- Configuration ---
const RPC_URL = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY.trim(); // Private key of the approved Hospital wallet
const PINATA_JWT = process.env.PINATA_JWT.trim();
const CONTRACT_ADDRESS = "0x8E14797A22A6B6fC611374eeA029747fD509fcB6"; 

const CONTRACT_ABI = [
  "function updateInventory(string memory _newIpfsCID) public"
];

// Helper: Upload data to Pinata IPFS
async function uploadToPinata(jsonData) {
  try {
    const response = await axios.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      { pinataContent: jsonData },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PINATA_JWT}`
        }
      }
    );
    return response.data.IpfsHash;
  } catch (error) {
    console.error("Pinata Upload Error:", error.response ? error.response.data : error.message);
    return null;
  }
}

// Main Execution
async function runOracle() {
  console.log("Starting Web3 Data Oracle...");

  // Match the exact schema expected by app/index.tsx
  const nodePayload = {
    name: "Rajiv Gandhi Government General Hospital (Node)",
    licenseId: "GOV-TN-101",
    bloodGroups: "O+, O-, A+, B+, AB+",
    inventoryLevels: "O+: 14, O-: 2, A+: 8, B+: 11, AB+: 5",
    registeredAt: new Date().toISOString(),
    lastUpdated: new Date().toLocaleTimeString()
  };

  console.log("Uploading formatted node inventory to IPFS via Pinata...");
  const ipfsCID = await uploadToPinata(nodePayload);
  
  if (!ipfsCID) {
    console.log("Failed to get IPFS CID. Aborting on-chain update.");
    return;
  }
  
  console.log(`Uploaded! IPFS CID: ${ipfsCID}`);
  console.log("Pushing new data hash to Sepolia blockchain...");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  try {
    const tx = await contract.updateInventory(ipfsCID);
    console.log(`Transaction submitted! Hash: ${tx.hash}`);
    await tx.wait();
    console.log("Blockchain updated successfully! Live stock ready for app display.");
  } catch (txError) {
    console.error("Blockchain Update Error:", txError.message);
  }
}

// Execute
runOracle();