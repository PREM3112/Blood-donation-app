require('dotenv').config();
const { ethers } = require("ethers");
const axios = require("axios");

// --- Configuration ---
const RPC_URL = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY; // MUST be the Admin Wallet private key
const CONTRACT_ADDRESS = "0x4cC35bE54c358146E7b71E58f965532193848FDd"; // Paste your updated contract address

const ABI = [
  "event BloodBankRegistered(address indexed bankAddress, string ipfsCID)",
  "function verifyBloodBank(address _bankAddress, bool _status) public"
];

// --- The Mock Government Database ---
// Only hospitals submitting one of these licenses will be auto-approved
const VALID_GOVERNMENT_LICENSES = [
  "TN-MED-1001",
  "TN-MED-1002",
  "TN-MED-1003",
  "TN-MED-2026"
];

async function runAutomatedAdmin() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const adminWallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, adminWallet);

  console.log("🤖 Automated Admin Bot is listening for new hospital registrations on Sepolia...");

  // Event Listener
  contract.on("BloodBankRegistered", async (bankAddress, ipfsCID) => {
    console.log(`\n🔔 New Registration Detected! Wallet: ${bankAddress}`);
    
    try {
      console.log(`Fetching license document from IPFS: ${ipfsCID}...`);
      
      // Delay for 3 seconds to allow Pinata's public gateways to index the new upload
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${ipfsCID}`;
      const response = await axios.get(ipfsUrl);
      const hospitalData = response.data;
      
      const submittedLicense = hospitalData.licenseId;
      console.log(`Hospital submitted license: ${submittedLicense}`);

      // Verification Logic
      if (VALID_GOVERNMENT_LICENSES.includes(submittedLicense)) {
        console.log("✅ License is VALID! Approving on the blockchain...");
        
        const tx = await contract.verifyBloodBank(bankAddress, true);
        console.log(`Transaction sent. Hash: ${tx.hash}`);
        await tx.wait();
        
        console.log(`🎉 Hospital Approved! They are now live on the network map.`);
      } else {
        console.log("❌ FAKE LICENSE DETECTED! Rejecting application...");
        // The bot ignores it, leaving it unverified on the blockchain
      }

    } catch (error) {
      console.error("Error processing registration:", error.message);
    }
  });
}

runAutomatedAdmin();