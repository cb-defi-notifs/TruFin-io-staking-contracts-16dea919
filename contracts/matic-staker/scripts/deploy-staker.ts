import { ethers, upgrades, network } from "hardhat";
import {
  STAKING_TOKEN_ADDRESS,
  STAKE_MANAGER_CONTRACT_ADDRESS,
  VALIDATOR_SHARE_CONTRACT_ADDRESS,
  WHITELIST_ADDRESS,
  TREASURY_ADDRESS,
  PHI,
  DIST_PHI,
} from "../constants/constants";
const clc = require("cli-color");

const contractName = "TruStakeMATICv2";

// This script will deploy the contract implementation, proxy and proxy admin.
async function main() {

  const chainID = network.config.chainId;
  console.log(`Chain ID: ${chainID}`);

  // specify constructor args
  const args = [
    STAKING_TOKEN_ADDRESS[chainID],
    STAKE_MANAGER_CONTRACT_ADDRESS[chainID],
    VALIDATOR_SHARE_CONTRACT_ADDRESS[chainID],
    WHITELIST_ADDRESS[chainID],
    TREASURY_ADDRESS[chainID],
    PHI,
    DIST_PHI,
  ];
  console.log(args);

  // Load the contract proxy and await deployment.
  const contractFactory = await ethers.getContractFactory(contractName);
  const contract = await upgrades.deployProxy(contractFactory, args);
  await contract.deployed();

  console.log(contract);

  // Log the deployed address and verification instructions.
  console.log(`${contractName} deployed at ${contract.address}`);
  console.log(`Verify with:`);
  console.log(clc.blackBright(`npx hardhat verify ${contract.address} --network ${network.name}`));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
