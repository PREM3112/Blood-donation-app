import { network } from "hardhat";
import fs from "fs";

async function main() {
  const { ethers } = await network.connect();
  const signerAddress = "0x54A2479b0aba6801Ad48DD2B46c686DD28ED9294";

  const baselineAddress = "0x773Ceb52DFBa30CC9394682a38092f90049B0D69";
  const hybridAddress = "0x3Fd87E33BCC9108A373Ae8a2259E09BB6388aEAf";

  const Baseline = await ethers.getContractAt("BloodDonationBaseline", baselineAddress);
  const Hybrid = await ethers.getContractAt("BloodDonation", hybridAddress);

  const txList = [
    { desc: "Baseline Initial Write", hash: "0x8fc9b1d7f1263e25ffd07a5120c98a013302a77654d3dac848313d41a6325360", contract: Baseline },
    { desc: "Hybrid Initial Write", hash: "0x9b529f51ed6e77ebd97213d977e116254103e9d1549655808f5f527ef97f7e47", contract: Hybrid },
    { desc: "Baseline Subsequent Update (Small)", hash: "0x01599d6418d2c4cdde715618dd04b7c3fb2b9676f51773883ff1e5d75fb71baa", contract: Baseline },
    { desc: "Hybrid Subsequent Update (Small)", hash: "0x955a92bbc0d7ace671d512cc8b28eaea1fd9313ce978a42b380cefbe3a8b6892", contract: Hybrid },
    { desc: "Baseline Subsequent Update (Large)", hash: "0xf21d25242119d6403c080ce8e0683a78ebdaa784ed8b562b6f3a7d6920503836", contract: Baseline },
    { desc: "Hybrid Subsequent Update (Large)", hash: "0xd92adf954f8629ef60b99930f7addfdc46019a3fe34601673445cbff2d5c01ee", contract: Hybrid }
  ];

  for (const txInfo of txList) {
    console.log(`\n======================================================`);
    console.log(`${txInfo.desc} | Hash: ${txInfo.hash}`);
    
    const receipt = await ethers.provider.getTransactionReceipt(txInfo.hash);
    const tx = await ethers.provider.getTransaction(txInfo.hash);
    
    // 1. Raw Receipts (Exact Gas Used)
    console.log(`\n1. EXACT GAS USED: ${receipt.gasUsed.toString()} units`);
    
    // 2. Decoded Inputs
    const decoded = txInfo.contract.interface.parseTransaction({ data: tx.data });
    console.log(`2. DECODED INPUTS:`);
    decoded.fragment.inputs.forEach((param, index) => {
      console.log(`   - ${param.name}: ${decoded.args[index]}`);
    });

    // 3. Retrieved IPFS Contents (Hybrid Only)
    if (txInfo.contract.target === hybridAddress) {
        const cid = decoded.args[0];
        console.log(`3. RETRIEVED IPFS CONTENT for CID: ${cid}`);
        try {
            const ipfsRes = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
            if (ipfsRes.ok) {
                console.log(`   Data: ${await ipfsRes.text()}`);
            } else {
                console.log(`   [Gateway timeout - manually verify CID ${cid} on ipfs.io]`);
            }
        } catch(e) {
            console.log(`   [Fetch error - manually verify CID ${cid} on ipfs.io]`);
        }
    }

    // 4. Historical Storage Evidence
    if (txInfo.desc.includes("Initial Write")) {
        const blockBefore = receipt.blockNumber - 1;
        const abiCoder = new ethers.AbiCoder();
        // Storage Slot 2 corresponds to mapping(address => InventoryData) public inventories
        const slotHash = ethers.keccak256(abiCoder.encode(["address", "uint256"], [signerAddress, 2]));
        const storageState = await ethers.provider.getStorage(txInfo.contract.target, slotHash, blockBefore);
        
        console.log(`4. HISTORICAL STORAGE STATE (Block ${blockBefore}):`);
        console.log(`   Storage at inventories[msg.sender]: ${storageState}`);
        console.log(`   (0x000... proves the slot was completely empty before execution)`);
    }
  }

  // 5. Bytecode Matching Export
  console.log(`\n======================================================`);
  console.log(`5. BYTECODE EXPORT`);
  const baselineCode = await ethers.provider.getCode(baselineAddress);
  const hybridCode = await ethers.provider.getCode(hybridAddress);
  
  fs.writeFileSync("baseline_onchain_bytecode.txt", baselineCode);
  fs.writeFileSync("hybrid_onchain_bytecode.txt", hybridCode);
  console.log(`On-chain bytecodes exported to 'baseline_onchain_bytecode.txt' and 'hybrid_onchain_bytecode.txt'.`);
}

main().catch((error) => {
  console.error("Extraction failed:", error.shortMessage ?? error.message ?? error);
  process.exitCode = 1;
});