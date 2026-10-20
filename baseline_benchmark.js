require('dotenv').config();
const { ethers } = require('ethers');

const RPC_URL = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY.trim(); 
const BASELINE_CONTRACT_ADDRESS = "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3"; 

const CONTRACT_ABI = [
  "function updateInventoryOnChain(string _name, string _licenseId, string _inventoryLevels, string _timestamp) public"
];

async function runBaselineBenchmark() {
  console.log("Starting Fully On-Chain Baseline Benchmark (10 Iterations)...");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(BASELINE_CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  const baseName = "Rajiv Gandhi Government General Hospital (Node)";
  const baseLicense = "GOV-TN-101";

  for(let i = 1; i <= 10; i++) {
    const inventory = `O+: ${14+i}, O-: 2, A+: 8, B+: 11, AB+: 5`;
    const timestamp = new Date().toISOString();
    
    try {
      const tx = await contract.updateInventoryOnChain(baseName, baseLicense, inventory, timestamp);
      const receipt = await tx.wait(); 
      console.log(`Baseline Iteration ${i} | Hash: ${tx.hash} | Gas Used: ${receipt.gasUsed.toString()}`);
    } catch (txError) {
      console.error("Blockchain Error:", txError.message);
    }
    
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  console.log("Baseline benchmark complete.");
}

runBaselineBenchmark();