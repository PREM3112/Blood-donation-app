// app/contractConfig.ts

// 1. Your deployed contract address on Ethereum Sepolia
export const CONTRACT_ADDRESS = "0xB282978eCe9fE7589f7CFcdd766aB7d2Ee973ADf";

// 2. The Alchemy Sepolia RPC URL
export const RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/alch_rQZRROPAVz-kLUT0V9aBf";

// 3. Your contract ABI
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
        "name": "name",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "bloodGroups",
        "type": "string"
      }
    ],
    "name": "BloodBankRegistered",
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
        "name": "name",
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
        "internalType": "string",
        "name": "bloodGroups",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "inventoryLevels",
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
        "name": "_name",
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
      },
      {
        "internalType": "string",
        "name": "_bloodGroups",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "_inventoryLevels",
        "type": "string"
      }
    ],
    "name": "registerBloodBank",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];