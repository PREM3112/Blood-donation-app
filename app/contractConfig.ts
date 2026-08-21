// app/contractConfig.ts

// 1. Your deployed contract address on Ethereum Sepolia
export const CONTRACT_ADDRESS = "0x16d4f3bfE789d6Ae277E0BEe2B5d415E236d72b7";

// 2. The Alchemy Sepolia RPC URL
export const RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/alch_rQZRROPAVz-kLUT0V9aBf";

// 3. Your updated contract ABI matching the IPFS deployment
export const CONTRACT_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "bankAddress",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "ipfsCID",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "latitude",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "longitude",
        "type": "string"
      }
    ],
    "name": "BloodBankRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "bankAddress",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "newIpfsCID",
        "type": "string"
      }
    ],
    "name": "InventoryUpdated",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "bloodBankAddresses",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "bloodBanks",
    "outputs": [
      {
        "internalType": "string",
        "name": "ipfsCID",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "latitude",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "longitude",
        "type": "string"
      },
      {
        "internalType": "bool",
        "name": "isVerified",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "isActive",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getBloodBanks",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "",
        "type": "address[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "_ipfsCID",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "_latitude",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "_longitude",
        "type": "string"
      }
    ],
    "name": "registerBloodBank",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "_newIpfsCID",
        "type": "string"
      }
    ],
    "name": "updateInventory",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];