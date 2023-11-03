import { ethers, network, upgrades } from "hardhat";

async function main() {
    const stakerFactory = await ethers.getContractFactory("TruStakeMATICv2");
    const staker = await upgrades.upgradeProxy(process.env.STAKER_ADDRESS, stakerFactory);
    // see note at writeEnv in deploy-staker.ts

    console.log("Staker deployment upgraded");
    console.log("Delete `cache` and `artifacts` before attempting to verify");
    console.log(`Re-verify with: npx hardhat verify ${staker.address} --network ${network.name}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
