import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const BloodDonationModule = buildModule("BloodDonationModule", (m) => {
  // Tells Hardhat to grab the compiled "BloodDonation" contract and deploy it
  const bloodDonation = m.contract("BloodDonation");

  return { bloodDonation };
});

export default BloodDonationModule;