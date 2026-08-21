require('dotenv').config();
const { ethers } = require('ethers');

// 1. Configuration & Keys
const RPC_URL = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const PINATA_JWT = (process.env.PINATA_JWT || process.env.EXPO_PUBLIC_PINATA_JWT || "").trim().replace(/^["']|["']$/g, '');
let rawPrivateKey = (process.env.PRIVATE_KEY || "").trim().replace(/^["']|["']$/g, '');

if (rawPrivateKey && !rawPrivateKey.startsWith("0x")) {
    rawPrivateKey = `0x${rawPrivateKey}`;
}

// Hardcoded contract address to bypass .env caching issues
const CONTRACT_ADDRESS = "0x16d4f3bfE789d6Ae277E0BEe2B5d415E236d72b7";
const CONTRACT_ABI = ["function updateInventory(string _newIpfsCID) public"];

// 2. Fetch REAL Live Blood Stock for ALL OF TAMIL NADU
async function fetchLiveBloodStock() {
    console.log("Pinging e-RaktKosh API for ALL Tamil Nadu hospitals...");
    
    const apiUrl = "https://eraktkosh.mohfw.gov.in/eraktkoshPortal/eraktkosh/blood-availability?stateCode=33&componentId=11";

    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        console.log(`✅ Successfully fetched ${data.length} hospitals across the state!`);
        return data;
    } catch (error) {
        console.error("API Fetch failed:", error.message);
        return [];
    }
}

// 3. Upload Statewide Master File to IPFS
async function uploadToIPFS(metadata) {
    if (!PINATA_JWT) throw new Error("PINATA_JWT is missing from your .env file!");
    console.log("Uploading Master JSON file to IPFS...");
    
    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${PINATA_JWT}` },
        body: JSON.stringify({ pinataContent: metadata })
    });
    
    const data = await res.json();
    if (!data.IpfsHash) throw new Error("Pinata failed to return an IPFS Hash.");
    return data.IpfsHash;
}

// 4. Update Sepolia Smart Contract
async function updateBlockchain(ipfsCID) {
    if (!rawPrivateKey || rawPrivateKey === "0x") throw new Error("PRIVATE_KEY is missing from your .env file!");
    console.log(`Pushing new CID to Sepolia: ${ipfsCID}`);
    
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(rawPrivateKey, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
    
    const tx = await contract.updateInventory(ipfsCID, { gasLimit: 500000 });
    console.log(`Transaction broadcasted. Waiting for block confirmation... Hash: ${tx.hash}`);
    await tx.wait();
    console.log(`✅ Smart Contract Updated Successfully!`);
}

// 5. Main Execution (Statewide Batch Update)
async function runOracle() {
    try {
        const liveStock = await fetchLiveBloodStock();
        
        if (liveStock.length > 0) {
            console.log("Formatting statewide data for IPFS...");
            
            const cleanStatewideData = liveStock.map(hospital => {
                let stockAvailable = "No stock available";
                if (hospital.components && hospital.components['Whole Blood'] && hospital.components['Whole Blood'].available_WithQty) {
                    stockAvailable = hospital.components['Whole Blood'].available_WithQty;
                }

                return {
                    name: hospital.hospitalname ? hospital.hospitalname.trim() : "Unknown",
                    phone: hospital.hospitalcontact ? hospital.hospitalcontact.replace('Phone: ', '').split(',')[0].trim() : "N/A",
                    inventoryLevels: stockAvailable, 
                    lastUpdated: hospital.entrydate
                };
            });

            const newCID = await uploadToIPFS(cleanStatewideData);
            await updateBlockchain(newCID);
            console.log("Oracle successfully pushed statewide data to the blockchain!");
        } else {
            console.log("No hospitals found or API is down.");
        }
    } catch (error) {
        console.error("Execution Failed:", error.message);
    }
}

runOracle();