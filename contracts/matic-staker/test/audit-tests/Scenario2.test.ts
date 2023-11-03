import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { AddressZero } from "@ethersproject/constants";
import * as helpers from "@nomicfoundation/hardhat-network-helpers";
import * as constants from "../helpers/constants";

const chainId = 1;

const parseEther = ethers.utils.parseEther;
const formatEther = ethers.utils.formatEther;
const toBN = ethers.BigNumber.from;
const ZERO_ADDRESS = ethers.constants.AddressZero;

// needed because solidity div always rounds down
const expectDivEqual = (a: any, b: any) => expect(a - b).to.be.oneOf([0, 1]);

const getAddressMappingStorageIndex = (address, mappingIndex) =>
    ethers.utils.solidityKeccak256(
        ["uint256", "uint256"],
        [address, mappingIndex]
    );

const getBalanceStorageIndex = (address: String) =>
    getAddressMappingStorageIndex(address, 0);

const setTokenBalancesAndApprove = async (token, users, recipient, amount) => {
    const index = getBalanceStorageIndex(users[0].address);
    const callBalance = await token.balanceOf(users[0].address);
    const storageBalance = ethers.BigNumber.from(
        await helpers.getStorageAt(token.address, index)
    );
    expect(storageBalance).to.equal(callBalance);

    for (let user of users) {
        // get balance storage index
        const userIndex = getBalanceStorageIndex(user.address);

        // set balance to amount
        await helpers.setStorageAt(token.address, userIndex, amount);

        // approve amount to recipient
        await token.connect(user).approve(recipient, amount);
    }
};

describe("Scenario -- Check storage after allocate/deallocate/reallocate", () => {
    let deployer, treasury, user1, user2;
    let token, validatorShare, stakeManager, whitelist, staker;
    let snapshot: any;

    before(async () => {
        // load deployed contracts
        token = await ethers.getContractAt(
            constants.STAKING_TOKEN_ABI[chainId],
            constants.STAKING_TOKEN_ADDRESS[chainId]
        );
        validatorShare = await ethers.getContractAt(
            constants.VALIDATOR_SHARE_ABI[chainId],
            constants.VALIDATOR_SHARE_CONTRACT_ADDRESS[chainId]
        );
        stakeManager = await ethers.getContractAt(
            constants.STAKE_MANAGER_ABI[chainId],
            constants.STAKE_MANAGER_CONTRACT_ADDRESS[chainId]
        );

        // load signers, balances set to 10k ETH in hardhat config file
        [deployer, treasury, user1, user2] = await ethers.getSigners();

        // load factories and deployer staker and whitelist
        whitelist = await ethers
            .getContractFactory("MasterWhitelist")
            .then((whitelistFactory) =>
                upgrades.deployProxy(whitelistFactory, [
                    AddressZero, // _reader
                    AddressZero, // _registry
                    [], // _countryBlacklist
                ])
            );

        staker = await ethers
            .getContractFactory("TruStakeMATICv2")
            .then((stakerFactory) =>
                upgrades.deployProxy(stakerFactory, [
                    token.address,
                    stakeManager.address,
                    validatorShare.address,
                    whitelist.address,
                    treasury.address,
                    constants.PHI,
                    constants.DIST_PHI,
                    constants.CAP,
                ])
            );

        // set each balance to 10k MATIC and approve it to staker
        await setTokenBalancesAndApprove(
            token,
            [user1, user2, deployer],
            staker.address,
            parseEther("1000000")
        );

        // add users to whitelist
        await whitelist.connect(deployer).addUserToWhitelist(deployer.address);
        await whitelist.connect(deployer).addUserToWhitelist(treasury.address);
        await whitelist.connect(deployer).addUserToWhitelist(user1.address);
        await whitelist.connect(deployer).addUserToWhitelist(user2.address);
    });

    describe(`Flow`, async () => {
        it(`Deposit as user1, deployer`, async () => {
            await staker.deposit(parseEther("100000"), deployer.address);
            await staker.connect(user1).deposit(parseEther("1000"), user1.address);
        });

        it(`Allocate user1 -> user2`, async () => {
            await staker.connect(user1).allocate(parseEther("500"), user2.address, false);
            const sharePrice = await staker.sharePrice();

            expect(await staker.getDistributors(user2.address, false)).to.deep.equal([user1.address]);
            expect(await staker.getRecipients(user1.address, false)).to.deep.equal([user2.address]);
            expect(await staker.allocations(user1.address, user2.address, false)).to.deep.equal([parseEther("500"), sharePrice[0], sharePrice[1]]);
            expect(await staker.totalAllocated(user1.address, false)).to.deep.equal([parseEther("500"), sharePrice[0], sharePrice[1]]);
        });

        it(`Allocate user1 -> deployer`, async () => {
            await staker.connect(user1).allocate(parseEther("500"), deployer.address, false);
            const sharePrice = await staker.sharePrice();

            expect(await staker.getDistributors(deployer.address, false)).to.deep.equal([user1.address]);
            expect(await staker.getRecipients(user1.address, false)).to.deep.equal([user2.address, deployer.address]);
            expect(await staker.allocations(user1.address, deployer.address, false)).to.deep.equal([parseEther("500"), sharePrice[0], sharePrice[1]]);
            expect(await staker.totalAllocated(user1.address, false)).to.deep.equal([parseEther("1000"), parseEther("10000000000000000000000000"), parseEther("10000000")]);
        });

        it(`Deallocate half user1 -> user2`, async () => {
            await staker.connect(user1).deallocate(parseEther("250"), user2.address, false);
            const sharePrice = await staker.sharePrice();

            expect(await staker.getDistributors(user2.address, false)).to.deep.equal([user1.address]);
            expect(await staker.getRecipients(user1.address, false)).to.deep.equal([user2.address, deployer.address]);
            expect(await staker.allocations(user1.address, user2.address, false)).to.deep.equal([parseEther("250"), sharePrice[0], sharePrice[1]]);
            expect(await staker.totalAllocated(user1.address, false)).to.deep.equal([parseEther("750"), parseEther("100000000000000000000000").mul(75), parseEther("7500000")]);
        });

        it(`Deallocate last half user1 -> user2`, async () => {
            await staker.connect(user1).deallocate(parseEther("250"), user2.address, false);

            expect(await staker.getDistributors(user2.address, false)).to.deep.equal([]);
            expect(await staker.getRecipients(user1.address, false)).to.deep.equal([deployer.address]);
            expect(await staker.allocations(user1.address, user2.address, false)).to.deep.equal([0, 0, 0]);
            expect(await staker.totalAllocated(user1.address, false)).to.deep.equal([parseEther("500"), parseEther("10000000000000000000000000").div(2), parseEther("5000000")]);
        });

        it(`Reallocate user1 (deployer -> user2)`, async () => {
            await staker.connect(user1).reallocate(deployer.address, user2.address);
            const sharePrice = await staker.sharePrice();

            expect(await staker.getDistributors(user2.address, false)).to.deep.equal([user1.address]);
            expect(await staker.getRecipients(user1.address, false)).to.deep.equal([user2.address]);
            expect(await staker.allocations(user1.address, user2.address, false)).to.deep.equal([parseEther("500"), sharePrice[0], sharePrice[1]]);
            expect(await staker.allocations(user1.address, deployer.address, false)).to.deep.equal([0, 0, 0]);
            expect(await staker.totalAllocated(user1.address, false)).to.deep.equal([parseEther("500"), parseEther("10000000000000000000000000").div(2), parseEther("5000000")]);
        });

        it(`Allocate user1 -> deployer again`, async () => {
            await staker.connect(user1).allocate(parseEther("250"), deployer.address, false);
            const sharePrice = await staker.sharePrice();

            expect(await staker.getDistributors(deployer.address, false)).to.deep.equal([user1.address]);
            expect(await staker.getRecipients(user1.address, false)).to.deep.equal([user2.address, deployer.address]);
            expect(await staker.allocations(user1.address, deployer.address, false)).to.deep.equal([parseEther("250"), sharePrice[0], sharePrice[1]]);
            expect(await staker.totalAllocated(user1.address, false)).to.deep.equal([parseEther("750"), parseEther("100000000000000000000000").mul(75), parseEther("7500000")]);
        });

        it(`Reallocate user1 (user2 -> deployer)`, async () => {
            await staker.connect(user1).reallocate(user2.address, deployer.address);

            expect(await staker.getDistributors(user2.address, false)).to.deep.equal([]);
            expect(await staker.getDistributors(deployer.address, false)).to.deep.equal([user1.address]);
            expect(await staker.getRecipients(user1.address, false)).to.deep.equal([deployer.address]);
            expect(await staker.allocations(user1.address, user2.address, false)).to.deep.equal([0, 0, 0]);
            expect(await staker.allocations(user1.address, deployer.address, false)).to.deep.equal([parseEther("750"), parseEther("100000000000000000000000").mul(75), parseEther("7500000")]);
            expect(await staker.totalAllocated(user1.address, false)).to.deep.equal([parseEther("750"), parseEther("100000000000000000000000").mul(75), parseEther("7500000")]);
        });
    });
});
