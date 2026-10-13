require('dotenv').config();
const { ethers } = require('ethers');
const axios = require('axios');
const cheerio = require('cheerio');

// --- Configuration ---
const RPC_URL = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY; // The private key of your Oracle wallet
const PINATA_JWT = process.env.PINATA_JWT;
const CONTRACT_ADDRESS = "0x8E14797A22A6B6fC611374eeA029747fD509fcB6"; // Paste your updated contract address

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
    console.error("Pinata Upload Error:", error.message);
    return null;
  }
}

// Helper: Scrape Live e-RaktKosh Data
// Helper: Scrape Live e-RaktKosh Data
async function fetchLiveBloodStock() {
  console.log("Pinging e-RaktKosh API for Tamil Nadu hospitals...");
  const apiUrl = "https://eraktkosh.mohfw.gov.in/eraktkoshPortal/eraktkosh/blood-availability?stateCode=33&componentId=11";

  try {
    const response = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml'
      }
    });

    const $ = cheerio.load(response.data);
    const hospitalMap = {};

    // Parse the HTML table rows and group by hospital
    $('table tbody tr').each((index, element) => {
      const hospitalName = $(element).find('td').eq(1).text().trim();
      const bloodGroup = $(element).find('td').eq(2).text().trim().replace(/<[^>]*>?/gm, ''); // Clean HTML tags
      const stockAvailable = parseInt($(element).find('td').eq(3).text().trim()) || 0;

      if (hospitalName && bloodGroup) {
        if (!hospitalMap[hospitalName]) {
          // Generate a slight random offset around Chennai (13.0827, 80.2707) for the pins
          const randomLatOffset = (Math.random() - 0.5) * 0.1;
          const randomLngOffset = (Math.random() - 0.5) * 0.1;

          hospitalMap[hospitalName] = {
            id: `GOV-TN-${Object.keys(hospitalMap).length}`,
            name: hospitalName,
            latitude: 13.0827 + randomLatOffset,
            longitude: 80.2707 + randomLngOffset,
            inventoryLevels: {},
            isVerified: true,
            source: "Government API",
            lastUpdated: new Date().toLocaleTimeString()
          };
        }
        // Add the blood group to the hospital's inventory object
        hospitalMap[hospitalName].inventoryLevels[bloodGroup] = stockAvailable;
      }
    });

    const govHospitals = Object.values(hospitalMap);
    console.log(`Successfully scraped and grouped ${govHospitals.length} government hospitals.`);
    return govHospitals;
  } catch (error) {
    console.error("Oracle Fetch Error:", error.message);
    return [];
  }
}

// Main Execution
async function runOracle() {
  console.log("Starting Web3 Data Oracle...");
  const liveData = await fetchLiveBloodStock();
  
  if (liveData.length === 0) {
    console.log("No data fetched. Oracle pausing.");
    return;
  }

  // Wrap the data in a clean JSON structure
  const oraclePayload = {
    network: "Government",
    timestamp: new Date().toISOString(),
    hospitals: liveData
  };

  console.log("Uploading scraped data to IPFS via Pinata...");
  const ipfsCID = await uploadToPinata(oraclePayload);
  
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
    // Note: The wallet executing this script MUST be registered and verified on your 
    // smart contract first, otherwise the updateInventory require() statement will block it.
    const tx = await contract.updateInventory(ipfsCID);
    console.log(`Transaction submitted! Hash: ${tx.hash}`);
    await tx.wait();
    console.log("Blockchain updated successfully! The mobile app will now display live government data.");
  } catch (txError) {
    console.error("Blockchain Update Error:", txError.message);
  }
}

// Execute the loop
runOracle();