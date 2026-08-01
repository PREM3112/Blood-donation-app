import { ethers } from "ethers";
import BloodDonationABI from "../constants/BloodDonationABI.json";

// Your deployed contract address on Sepolia
const CONTRACT_ADDRESS = "0xB282978eCe9fE7589f7CFcdd766aB7d2Ee973ADf";

// Alchemy Sepolia RPC URL
const SEPOLIA_RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/alch_rQZRROPAVz-kLUT0V9aBf";

/**
 * Get a read-only provider connected to the Sepolia testnet
 */
export const getProvider = () => {
  return new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
};

/**
 * Get a read-only instance of the BloodDonation contract
 */
export const getReadOnlyContract = () => {
  const provider = getProvider();
  return new ethers.Contract(CONTRACT_ADDRESS, BloodDonationABI.abi, provider);
};

/**
 * Get a writable instance of the contract using a user's private key or connected wallet signer.
 * Pass the user's private key (or wallet provider signer) when executing transactions.
 */
export const getSignerContract = (privateKeyOrSigner: string | ethers.Signer) => {
  const provider = getProvider();
  
  let signer: ethers.Signer;
  if (typeof privateKeyOrSigner === "string") {
    signer = new ethers.Wallet(privateKeyOrSigner, provider);
  } else {
    signer = privateKeyOrSigner;
  }

  return new ethers.Contract(CONTRACT_ADDRESS, BloodDonationABI.abi, signer);
};