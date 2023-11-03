import { ethers, network } from "hardhat";

async function main() {
    // load staker and await deployment
    const staker = await ethers.deployContract("TruStakeMATICv2");
    await staker.deployed();

    // log deployed address and verification instructions
    console.log(`Staker deployed at ${staker.address}`);
    console.log(`Verify with: npx hardhat verify ${staker.address} --network ${network.name}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
