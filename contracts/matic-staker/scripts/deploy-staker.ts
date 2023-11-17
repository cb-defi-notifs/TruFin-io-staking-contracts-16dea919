import { ethers, upgrades, network } from "hardhat";
import { writeEnv } from "../../../helpers/deploy-utils"
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
    // await upgrades.forceImport(
    //     "0x8d991FaD08B57bF3541D1911Df82B3ee12c59052",
    //     stakerFactory
    // );

    // const staker = await upgrades.deployProxy(stakerFactory, args, { useDeployedImplementation: true });

    const staker = await upgrades.deployProxy(stakerFactory, args);

    console.log(staker);

    await staker.deployed();

    // log deployed address and verification instructions
    console.log(`Staker deployed at ${staker.address}`);
    console.log(`Verify with: npx hardhat verify ${staker.address} --network ${network.name}`);
    // console.log(`Verify with: npx hardhat verify ${staker.address} ${args.join(" ")} --network ${network.name}`);

    if(network.name === "goerli"){
      // store staker address in env
      writeEnv("STAKER_GOERLI", staker.address);
    }
    if(network.name === "mainnet"){
      // store staker address in env
      writeEnv("STAKER_MAINNET", staker.address);
    }
    // for now just storing one, later add a deployments.json file which stores an address by chain id
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
