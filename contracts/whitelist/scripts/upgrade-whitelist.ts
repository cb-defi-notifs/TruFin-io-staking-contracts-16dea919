import { ethers, upgrades } from "hardhat";
// require("dotenv").config();

async function main() {
    console.log(process.env.WHITELIST_ADDRESS_GOERLI);
    // see note at writeEnv in deploy-whitelist.ts

    const whitelistFactory = await ethers.getContractFactory("MasterWhitelist");
    await upgrades.upgradeProxy(process.env.WHITELIST_ADDRESS_GOERLI, whitelistFactory);

    console.log("Whitelist deployment upgraded");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
