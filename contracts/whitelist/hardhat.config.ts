import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";

require("dotenv").config({path: '../../.env'});
require('hardhat-contract-sizer');
require('hardhat-abi-exporter');

export default {
  solidity: "0.8.19",
  settings: {
    optimizer: {
      enabled: false,
      runs: 1000,
    },
  },
  networks: {
    goerli: {
      url: process.env.GOERLI_RPC,
      chainId: 5,
      // gas: 180_000_000,
      // gasPrice: 40_000_000_000,
      accounts: [process.env.DEPLOYER_PK],
    },
    mumbai: {
      url: process.env.MUMBAI_RPC,
      chainId: 80001,
      // gas: 180_000_000,
      // gasPrice: 8_000_000_000,
      accounts: [process.env.DEPLOYER_PK],
    },
    mainnet: {
      url: process.env.MAINNET_RPC,
      chainId: 1,
      // gas: 2_200_000,
      // gasPrice: 6_000_000_000,
      accounts: [process.env.DEPLOYER_PK],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API,
  },
  gasReporter: {
    // enabled: true,
  },
  abiExporter: {
    path: '../../abis/whitelist',
    runOnCompile: true,
    clear: true,
    flat: true,
    only: [':MasterWhitelist'],
    spacing: 2,
    format: "json" // minimal
  }
};
