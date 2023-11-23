import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-gas-reporter";
require("dotenv").config({path: '../../.env'});
require("hardhat-contract-sizer");
require('hardhat-abi-exporter');


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
      url: process.env.GOERLI_RPC,
      chainId: 5,
      // gas: 180_000_000, // 200_000_000
      // gasLimit: 180_000_000, // 200_000_000
      // gasPrice: 8_000_000_000, // 400_000_000_000
      accounts: [process.env.DEPLOYER_PK]
    },
    mumbai: {
      url: process.env.MUMBAI_RPC,
      chainId: 80001,
      // gas: 180_000_000,
      // gasPrice: 8_000_000_000,
      accounts: [process.env.DEPLOYER_PK]
    },
    mainnet: {
      url: process.env.MAINNET_RPC,
      chainId: 1,
      gas: 5_000_000,
      gasPrice: 40_000_000_000,
      accounts: [process.env.DEPLOYER_PK]
    },
    hardhat: {
      forking: {
        //Due to RPC error using Mainnet RPC
        url: process.env.MAINNET_RPC,
        // block before checkpoint submitted
        blockNumber: 17485579,
      },
      accounts: {
        privateKey: [process.env.DEPLOYER_PK],
      }
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API
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
