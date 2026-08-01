import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: "0.8.20",
  networks: {
    sepolia: {
      type: "http",
      url: "https://eth-sepolia.g.alchemy.com/v2/alch_rQZRROPAVz-kLUT0V9aBf",
      accounts: ["0x97ba7fbd42c1743ab42a8eed15c927b913e1e9f769237b16e6a14b37a15be2cc"],
    },
  },
});