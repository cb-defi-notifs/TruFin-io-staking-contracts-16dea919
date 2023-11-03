import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import { utils } from "ethers";
import "hardhat-gas-reporter";
require("dotenv").config();
require("hardhat-contract-sizer");
require('hardhat-abi-exporter');

export const pks = [
  process.env.PK0,
  process.env.PK1,
  process.env.PK2,
  process.env.PK3,
  process.env.PK4,
  process.env.PK5,
  process.env.PK6,
  process.env.PK7
];

export default {
  mocha: {
    timeout: 120000
  },
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 125
      }
    }
  },
  networks: {
    goerli: {
      url: process.env.GOERLI_URI,
      chainId: 5,
      // gas: 180_000_000, // 200_000_000
      // gasLimit: 180_000_000, // 200_000_000
      // gasPrice: 8_000_000_000, // 400_000_000_000
      accounts: pks
    },
    mumbai: {
      url: process.env.MUMBAI_URI,
      chainId: 80001,
      // gas: 180_000_000,
      // gasPrice: 8_000_000_000,
      accounts: pks
    },
    mainnet: {
      url: process.env.MAINNET_URI,
      chainId: 1,
      gas: 5_000_000,
      gasPrice: 40_000_000_000,
      accounts: pks
    },
    hardhat: {
      forking: {
        //Due to RPC error using Mainnet URI
        url: process.env.MAINNET_URI,
        // url: process.env.ETHEREUM_ALCHEMY,
        // block before checkpoint submitted
        blockNumber: 17485579,
      },
      accounts: pks.map((pk) => ({
        privateKey: pk,
        balance: utils.parseEther("10000").toString()
      }))
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  gasReporter: {
    // enabled: true,
  },
  abiExporter: {
    path: '../../abis/matic-staker',
    runOnCompile: true,
    clear: true,
    flat: true,
    only: [':TruStakeMATICv2'],
    spacing: 2,
    format: "json" // minimal
  }
};
