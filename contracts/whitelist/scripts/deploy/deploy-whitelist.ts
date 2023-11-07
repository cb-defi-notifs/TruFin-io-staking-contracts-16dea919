import { ethers, upgrades, network } from "hardhat";
const clc = require("cli-color");

const contractName = "MasterWhitelist";

// This script will deploy the contract implementation, proxy and proxy admin.
async function main() {

  const chainID = network.config.chainId;
  console.log(`Chain ID: ${chainID}`);

  // Get a deployer address.
  let deployerWallet = new ethers.Wallet(await network.config.accounts[0]);
  console.log(`Deployer address: ${deployerWallet.address}`);

  // Load the contract proxy and await deployment.
  const contractFactory = await ethers.getContractFactory(contractName);
  const contract = await upgrades.deployProxy(contractFactory);
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
