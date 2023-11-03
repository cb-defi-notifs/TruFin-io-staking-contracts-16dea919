/** Helper file exporting a testing fixture for fresh deployments. */

import { ethers, upgrades } from "hardhat";
import * as constants from "../helpers/constants";
import { AddressZero } from "@ethersproject/constants";
import { setTokenBalancesAndApprove } from "./state-interaction";
import { parseEther } from "./math";

export const deployment = async () => {
  // load deployed contracts

  const token = await ethers.getContractAt(
    constants.STAKING_TOKEN_ABI[constants.DEFAULT_CHAIN_ID],
    constants.STAKING_TOKEN_ADDRESS[constants.DEFAULT_CHAIN_ID]
  );

  const validatorShare = await ethers.getContractAt(
    constants.VALIDATOR_SHARE_ABI[constants.DEFAULT_CHAIN_ID],
    constants.VALIDATOR_SHARE_CONTRACT_ADDRESS[constants.DEFAULT_CHAIN_ID]
  );

  const stakeManager = await ethers.getContractAt(
    constants.STAKE_MANAGER_ABI[constants.DEFAULT_CHAIN_ID],
    constants.STAKE_MANAGER_CONTRACT_ADDRESS[constants.DEFAULT_CHAIN_ID]
  );

  // load signers, balances set to 10k ETH in hardhat config file
  const [deployer, treasury, one, two, three, four, five, six, seven] = await ethers.getSigners();

  // load factories and deployer staker and whitelist

  const whitelistFactory = await ethers.getContractFactory("MasterWhitelist");

  const whitelist = await upgrades.deployProxy(whitelistFactory, [
    AddressZero, // _reader
    AddressZero, // _registry
    [], // _countryBlacklist
  ]);

  const stakerFactory = await ethers.getContractFactory("TruStakeMATICv2");

  const staker = await upgrades.deployProxy(stakerFactory, [
    token.address,
    stakeManager.address,
    validatorShare.address,
    whitelist.address,
    treasury.address,
    constants.PHI,
    constants.DIST_PHI,
    constants.CAP
  ]);

  // set each balance to 10M MATIC and approve it to staker
  await setTokenBalancesAndApprove(
    token,
    [treasury, one, two, three, four, five, six],
    staker.address,
    parseEther(10e6)
  );

  // add all users to whitelist
  for (let user of [deployer, treasury, one, two, three, four, five]) {
    await whitelist.connect(deployer).addUserToWhitelist(user.address);
  }

  return {
    deployer, treasury, one, two, three, four, five, six,  // accounts
    token, validatorShare, stakeManager, whitelist, staker // contracts
  }
};
