require('dotenv').config();
const { ethers } = require('ethers');

// Setup
const RPC_URL = process.env.SEPOLIA_RPC_URL;
let rawPrivateKey = process.env.PRIVATE_KEY.trim();
if (!rawPrivateKey.startsWith("0x")) rawPrivateKey = `0x${rawPrivateKey}`;

// 1. Change this to match your React Native frontend config
const CONTRACT_ADDRESS = "0x16d4f3bfE789d6Ae277E0BEe2B5d415E236d72b7"; 
const ABI = ["function registerBloodBank(string _ipfsCID, string _latitude, string _longitude) public"];

async function registerHospital() {
    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(rawPrivateKey, provider);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

        console.log("Registering Vs Blood Centre on the blockchain...");
        
        // 2. Add a manual gasLimit to bypass the estimation error
        const tx = await contract.registerBloodBank(
            "QmXgHAhZZNuJyikMU4UYGTNm9W9VFUiCFRbhKXFZzrWSrT", 
            "13.0827", 
            "80.2707",
            { gasLimit: 500000 } 
        );
        
        console.log(`Transaction sent! Waiting for confirmation... Hash: ${tx.hash}`);
        await tx.wait();
        console.log("✅ Hospital Registered Successfully!");
        
    } catch (error) {
        console.error("Registration failed:", error.message);
    }
}

registerHospital();