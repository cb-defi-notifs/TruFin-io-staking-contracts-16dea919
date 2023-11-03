import { ethers, upgrades, network } from "hardhat";
const fs = require("fs");
const envfile = require("envfile");

import {
    QUADRATA_PASSPORT,
    QUADRATA_READER,
    VERITE_REGISTRY,
    BLACKLISTED_COUNTRIES,
} from "../constants/constants";

// Helpers

const writeEnv = (k, v) => {
    let parsedFile = envfile.parse(fs.readFileSync(".env").toString());
    parsedFile[k] = v;
    let configString = envfile.stringify(parsedFile);
    fs.writeFileSync(".env", configString);
    console.log(`Saved value ${v} to key ${k} in .env file`);
}

// Main

async function main() {
    const chainID = network.config.chainId;

    console.log(chainID);

    let w = new ethers.Wallet(await network.config.accounts[0]);
    console.log(w.address);

    // specify constructor args
    const args = [
        QUADRATA_PASSPORT[chainID],
        QUADRATA_READER[chainID],
        VERITE_REGISTRY[chainID],
        BLACKLISTED_COUNTRIES.map(
            country => ethers.utils.keccak256(ethers.utils.toUtf8Bytes(country))
        ),
    ];

    console.log(args);

    // load whitelist proxy and await deployment
    const whitelistFactory = await ethers.getContractFactory("MasterWhitelist");
    const whitelist = await upgrades.deployProxy(whitelistFactory, args);

    console.log(whitelist);

    await whitelist.deployed();

    // log deployed address and verification instructions
    console.log(`Whitelist deployed at ${whitelist.address}`);
    console.log(`Verify with: npx hardhat verify ${whitelist.address} --network ${network.name}`);
    // console.log(`Verify with: npx hardhat verify ${whitelist.address} --network ${network.name} --constructor-args scripts/whitelist-args/${network.name}.ts`); // TODO: will be made dynamic in future

    // store whitelist address in env
    writeEnv("WHITELIST_ADDRESS_GOERLI", whitelist.address);
    // for now just storing one, later add a deployments.json file which stores an address by chain id
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
