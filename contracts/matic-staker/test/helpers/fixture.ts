/** Helper file exporting a testing fixture for fresh deployments. */

import { ethers, upgrades } from "hardhat";
import { smock } from '@defi-wonderland/smock';
import * as constants from "../helpers/constants";
import { AddressZero } from "@ethersproject/constants";
import { setTokenBalancesAndApprove } from "./state-interaction";
import { parseEther } from "./math";

export const deployment = async () => {
  // load deployed contracts

  const token = await ethers.getContractAt(
    constants.STAKING_TOKEN_ABI,
    constants.STAKING_TOKEN_ADDRESS[constants.DEFAULT_CHAIN_ID]
  );

  const validatorShare = await ethers.getContractAt(
    constants.VALIDATOR_SHARE_ABI,
    constants.VALIDATOR_SHARE_CONTRACT_ADDRESS[constants.DEFAULT_CHAIN_ID]
  );

  const validatorShare2 = await ethers.getContractAt(
    constants.VALIDATOR_SHARE_ABI,
    constants.VALIDATOR_SHARE_2_CONTRACT_ADDRESS[constants.DEFAULT_CHAIN_ID]
  );

  const stakeManager = await ethers.getContractAt(
    constants.STAKE_MANAGER_ABI,
    constants.STAKE_MANAGER_CONTRACT_ADDRESS[constants.DEFAULT_CHAIN_ID]
  );

  // load signers, balances set to 10k ETH in hardhat config file
  const [deployer, treasury, one, two, three, four, five, six, seven] = await ethers.getSigners();

  // mock whitelist
  const whitelist = await smock.fake(constants.WHITELIST_ABI);

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


  // make it the default validator
  await staker.setDefaultValidator(validatorShare.address);

  // set each balance to 10M MATIC and approve it to staker
  await setTokenBalancesAndApprove(
    token,
    [treasury, one, two, three, four, five, six],
    staker.address,
    parseEther(10e6)
  );

  // add all users to whitelist
  whitelist.isUserWhitelisted.returns((params : [string]) => {
    return [deployer, treasury, one, two, three, four, five].map(it => it.address).includes(params[0])
  });

  return {
    deployer, treasury, one, two, three, four, five, six,  // accounts
    token, validatorShare, validatorShare2, stakeManager, whitelist, staker // contracts
  }
};
