import { ethers, upgrades } from "hardhat";

// This script will only update the json files in the .openzeppelin folder.
async function main() {
    if (process.env.IMPLEMENTATION === undefined) {
        throw Error("Must define environment variable IMPLEMENTATION address.");
    }

    // load the contract
    const contract = await ethers.getContractFactory("MasterWhitelist");

    // `forceImport` used to update the json file
    await upgrades.forceImport(
        process.env.IMPLEMENTATION,
        contract
    );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
