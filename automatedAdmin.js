const { ethers } = require("ethers");
const axios = require("axios");

// 1. Setup your connection and Admin Wallet
const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
const PRIVATE_KEY = "15a02477807dd484062dc9eeccb7f03ef0ca9730059b61c6e229544f9d57c1f2"; // The wallet that deployed the contract
const CONTRACT_ADDRESS = "0x8E14797A22A6B6fC611374eeA029747fD509fcB6";

// The exact ABI of the two functions/events we need
const ABI = [
  "event BloodBankRegistered(address indexed bankAddress, string ipfsCID)",
  "function verifyBloodBank(address _bankAddress, bool _status) public"
];

// 2. Your Mock "Government Database" of valid licenses
const VALID_GOVERNMENT_LICENSES = [
  "TN-MED-1001",
  "TN-MED-1002",
  "TN-MED-1003"
];

async function runAutomatedAdmin() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const adminWallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, adminWallet);

  console.log("🤖 Automated Admin Bot is listening for new hospitals...");

  // 3. Listen for the moment a new hospital registers on the blockchain
  contract.on("BloodBankRegistered", async (bankAddress, ipfsCID) => {
    console.log(`\n🔔 New Registration Detected! Wallet: ${bankAddress}`);
    
    try {
      // 4. Fetch the off-chain data from Pinata to see their License ID
      console.log(`Fetching license document from IPFS: ${ipfsCID}...`);
      const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${ipfsCID}`;
      const response = await axios.get(ipfsUrl);
      const hospitalData = response.data;
      
      const submittedLicense = hospitalData.licenseId;
      console.log(`Hospital submitted license: ${submittedLicense}`);

      // 5. Cross-reference with the Government Database
      if (VALID_GOVERNMENT_LICENSES.includes(submittedLicense)) {
        console.log("✅ License is VALID! Approving on the blockchain...");
        
        // Execute the approval transaction automatically
        const tx = await contract.verifyBloodBank(bankAddress, true);
        await tx.wait();
        
        console.log(`🎉 Hospital Approved! Transaction Hash: ${tx.hash}`);
      } else {
        console.log("❌ FAKE LICENSE DETECTED! Rejecting application...");
        // You can either leave them unverified, or explicitly set to false
      }

    } catch (error) {
      console.error("Error processing registration:", error);
    }
  });
}

runAutomatedAdmin();