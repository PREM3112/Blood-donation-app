import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatIgnitionEthers from "@nomicfoundation/hardhat-ignition-ethers";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

export default defineConfig({
  plugins: [hardhatEthers, hardhatIgnitionEthers],

  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "shanghai",
    },
  },

  networks: {
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },

    // Sepolia is included only when its RPC URL is configured.
    ...(process.env.SEPOLIA_RPC_URL
      ? {
          sepolia: {
            type: "http" as const,
            chainType: "l1" as const,
            url: process.env.SEPOLIA_RPC_URL,
            accounts: process.env.PRIVATE_KEY?.trim()
              ? [process.env.PRIVATE_KEY.trim()]
              : [],
          },
        }
      : {}),
  },
});