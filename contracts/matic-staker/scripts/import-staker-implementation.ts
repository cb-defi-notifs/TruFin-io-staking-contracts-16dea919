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

// Main

async function main() {
    if (process.env.IMPLEMENTATION === undefined) {
        throw Error("Must define environment variable IMPLEMENTATION address.");
    }

    const chainID = network.config.chainId;

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

    // load staker proxy and await deployment

    const stakerFactory = await ethers.getContractFactory("TruStakeMATICv2");

    // `forceImport` used to update the networks.json file
    await upgrades.forceImport(
        process.env.IMPLEMENTATION,
        stakerFactory
    );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
