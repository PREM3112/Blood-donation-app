import contractArtifact from "../constants/BloodDonationABI.json";

// The compiled JSON artifact contains an "abi" field array
const contractABI = contractArtifact.abi;
const contractAddress = "0xB282978eCe9fE7589f7CFcdd766aB7d2Ee973ADf";

// Example instantiation with ethers v6:
// const bloodDonationContract = new ethers.Contract(contractAddress, contractABI, provider);