import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { AddressZero } from "@ethersproject/constants";
import { deployment } from "../helpers/fixture";
import {getBalanceStorageIndex,getAddressMappingStorageIndex} from "../helpers/state-interaction";
import * as helpers from "@nomicfoundation/hardhat-network-helpers";
import * as constants from "../helpers/constants";

const parseEther = ethers.utils.parseEther;

describe("Staker", () => {
    let deployer, treasury, one, two, three, // accounts
    token, validatorShare, stakeManager, whitelist, staker; // contracts

  beforeEach(async () => {
    ({
      deployer, treasury, one, two, three,
      token, validatorShare, stakeManager, whitelist, staker
    } = await helpers.loadFixture(deployment));
  });

    describe(`Inflation attack check`, async () => {
        it(`Basic inflation attack`, async () => {
            // Initial value is 1e18, not 1 thanks to limitations in 1 Matic deposit.
            const initialValue = parseEther("1");
            const attackValue = parseEther("10000");
            const depositValue = parseEther("10000");
            await staker.connect(one).deposit(initialValue);
            await token.connect(one).transfer(staker.address, attackValue);
            await staker.connect(two).deposit(depositValue);
            expect(await staker.balanceOf(one.address)).to.equal(initialValue);
            // The victim didn't receive zero shares
            expect(await staker.balanceOf(two.address)).to.be.greaterThan(0);
        });
    });
});
