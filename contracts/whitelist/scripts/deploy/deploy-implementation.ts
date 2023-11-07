import { ethers, network } from "hardhat";

// This script will only deploy the contract implementation, but won't update the proxy.
async function main() {
    // load the contract and await deployment
    const deployedContract = await ethers.deployContract("MasterWhitelist");
    await deployedContract.deployed();

    // log deployed address and verification instructions
    console.log(`Contract deployed at ${deployedContract.address}`);
    console.log(`Verify with: npx hardhat verify ${deployedContract.address} --network ${network.name}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
