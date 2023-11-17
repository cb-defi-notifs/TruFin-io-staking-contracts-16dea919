/** Testing initializing, modifiers, setters, and getters of the TruStakeMATIC vault. */

import { AddressZero } from "@ethersproject/constants";
import {
  impersonateAccount,
  loadFixture,
  stopImpersonatingAccount
} from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers, upgrades } from "hardhat";
import * as constants from "../helpers/constants";
import { deployment } from "../helpers/fixture";
import { parseEther, sharePriceEquality } from "../helpers/math";

describe("INIT", () => {
  let deployer, treasury, one, two, three, // accounts
    token, validatorShare, stakeManager, whitelist, staker; // contracts

  beforeEach(async () => {
    // reset to fixture
    ({
      deployer, treasury, one, two, three,
      token, validatorShare, stakeManager, whitelist, staker
    } = await loadFixture(deployment));
  });

  describe("INITIALISATION", () => {
    it("global variables initialised with correct values", async () => {
      expect(await staker.totalStaked()).to.equal(0);
      expect(await staker.totalRewards()).to.equal(0);
      expect(await staker.sharePrice()).to.eql([
        parseEther(1),
        BigNumber.from(1),
      ]);
      expect(await staker.validatorAddresses(0)).to.equal(validatorShare.address);
      // todo: update this with new/all global vars
    });

    it("reverts if phi is too large", async () => {
      await expect(
        ethers.getContractFactory("TruStakeMATICv2").then(
          (stakerFactory) => upgrades.deployProxy(stakerFactory, [
            token.address,
            stakeManager.address,
            validatorShare.address,
            whitelist.address,
            treasury.address,
            constants.PHI_PRECISION.add(1),
            constants.DIST_PHI,
          ])
        )
      ).to.be.revertedWithCustomError(staker, "PhiTooLarge");
    });

    it("reverts if distPhi is too large", async () => {
      await expect(
        ethers.getContractFactory("TruStakeMATICv2").then(
          (stakerFactory) => upgrades.deployProxy(stakerFactory, [
            token.address,
            stakeManager.address,
            validatorShare.address,
            whitelist.address,
            treasury.address,
            constants.PHI,
            constants.PHI_PRECISION.add(1),
          ])
        )
      ).to.be.revertedWithCustomError(staker, "DistPhiTooLarge");
    });
  });

  describe("MODIFIERS", () => {
    it("onlyWhitelist", async () => {
      // impersonate any non-whitelisted address
      await impersonateAccount(AddressZero);
      const zeroSigner = await ethers.getSigner(AddressZero);

      // attempt to call an onlyWhitelist function
      await expect(
        staker
          .connect(zeroSigner)
        ["deposit(uint256,address)"](parseEther(5000), AddressZero)
      ).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");

      // stop impersonating non-whitelisted address
      await stopImpersonatingAccount(AddressZero);
    });
  });


  describe("SETTERS - events and ownable", () => {

    it("setWhitelist", async () => {
      expect(await staker.whitelistAddress()).to.equal(whitelist.address);
      await staker.connect(deployer).setWhitelist(one.address);
      expect(await staker.whitelistAddress()).to.equal(one.address);

      await expect(
        staker.connect(one).setWhitelist(one.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("setTreasury", async () => {
      expect(await staker.treasuryAddress()).to.equal(treasury.address);
      await staker.connect(deployer).setTreasury(one.address);
      expect(await staker.treasuryAddress()).to.equal(one.address);

      await expect(
        staker.connect(one).setTreasury(one.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("setEpsilon", async () => {
      expect(await staker.epsilon()).to.equal(constants.EPSILON);
      await staker.connect(deployer).setEpsilon(constants.EPSILON.mul(2));
      expect(await staker.epsilon()).to.equal(constants.EPSILON.mul(2));

      await expect(
        staker.connect(one).setEpsilon(constants.EPSILON.mul(2))
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("setPhi", async () => {
      expect(await staker.phi()).to.equal(constants.PHI);
      await staker.connect(deployer).setPhi(constants.PHI.mul(2));
      expect(await staker.phi()).to.equal(constants.PHI.mul(2));

      // testing onlyOwner
      await expect(
        staker.connect(one).setPhi(constants.PHI.mul(2))
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("setDistPhi", async () => {
      expect(await staker.distPhi()).to.equal(constants.DIST_PHI);
      await staker.connect(deployer).setDistPhi(constants.DIST_PHI.mul(2));
      expect(await staker.distPhi()).to.equal(constants.DIST_PHI.mul(2));

      // testing onlyOwner
      await expect(
        staker.connect(one).setDistPhi(constants.DIST_PHI.mul(2))
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("owner sets epsilon", async () => {
      expect(await staker.epsilon()).to.equal(1e4);
      await staker.connect(deployer).setEpsilon(1e6);
      expect(await staker.epsilon()).to.equal(1e6);
    });

    it("non-owner setting epsilon fails", async () => {
      await expect(staker.connect(one).setEpsilon(1e6)).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("ATTACKS", () => {
    it("inflation frontrunning attack investigation", async () => {
      // Not really testing anything as the first transaction will not work (a min. of 1 MATIC
      // has now been added on deposits), but if this is run on a version of the stker contract
      // without this requirement, it can show what share price is inflated to based on different
      // initial deposit amounts.

      // Attack Description:
      // - first (malicious) user deposits 1 wei of MATIC, receives 1 wei of shares
      // - second (malicious) user (probably could be same as first) sends 10k MATIC
      //   directly to the vault, inflating the price from 1.0 to the extreme value of 1.0e22
      // - now, the next (legitimate) users who deposit 199999 MATIC will only receive
      //   1 wei of shares

      // Investigation Results:
      // - In the case of a first deposit of 1 wei, a 10k transfer will inflate the price to
      //   1e22 MATIC/TruMATIC.
      // - In the case of a 1 MATIC first deposit, it will inflate it to 1e4 MATIC/TruMATIC,
      //   which is expected.

      // Test Description:
      // one deposits 1 wei (check balances and share price)
      // two sends 10ke18 wei (check balances)
      // check that share price isn't crazy -- if it is, the contract must be changed

      const initSharePrice: [BigNumber, BigNumber] = [BigNumber.from(10).pow(18), BigNumber.from(1)];
      const depositAmount = parseEther(1); // BigNumber.from(1);

      // check initial share price and balances are zero-values
      expect(sharePriceEquality(await staker.sharePrice(), initSharePrice)).to.equal(true);
      expect(await staker.balanceOf(one.address)).to.equal(BigNumber.from(0)); // malicious user
      expect(await staker.balanceOf(two.address)).to.equal(BigNumber.from(0)); // malicious user
      expect(await staker.balanceOf(three.address)).to.equal(BigNumber.from(0)); // legitimate user

      // deposit 1 wei as first malicious user (one)
      // await staker.connect(one).deposit(BigNumber.from(1), one.address);
      await staker.connect(one).deposit(depositAmount, one.address);

      // check new share price and balances are as expected
      expect(sharePriceEquality(await staker.sharePrice(), initSharePrice)).to.equal(true); // unchanged
      expect(await staker.balanceOf(one.address)).to.equal(depositAmount); // changed
      expect(await staker.balanceOf(two.address)).to.equal(BigNumber.from(0)); // unchanged
      expect(await staker.balanceOf(three.address)).to.equal(BigNumber.from(0)); // unchanged

      // send 10k MATIC as second malicious user (two)
      await token.connect(two).transfer(staker.address, parseEther(10000));

      // log new share price and balances

      // console.log(await staker.sharePrice());
      // console.log(await staker.balanceOf(one.address));
      // console.log(await staker.balanceOf(two.address));
      // console.log(await staker.balanceOf(three.address));

      // when depositAmount is 1 wei: price goes up to ~1e40, which equals 1e22 MATIC for 1 TruMATIC
      // when depositAmount is 1 MATIC: price goes up to ~1e22, which equals 1e4 MATIC for 1 TruMATIC
      // this means the min. deposit to get a share is 1e4 wei, which equals 1e-14 MATIC, which is
      // small enough to not cause problems
    });

    it("fail: depositing under 1 MATIC", async () => {
      // try depositing 1 wei
      await expect(
        staker.connect(one).deposit(BigNumber.from(1), one.address)
      ).to.be.revertedWithCustomError(staker, "DepositBelowMinDeposit");

      // try depositing 1e18 - 1 wei
      await expect(
        staker.connect(one).deposit(parseEther(1).sub(BigNumber.from(1)), one.address)
      ).to.be.revertedWithCustomError(staker, "DepositBelowMinDeposit");
    });

    it("pass: deposit 1 MATIC or more", async () => {
      await staker.connect(one).deposit(parseEther(1), one.address);

      await staker.connect(one).deposit(parseEther(1).add(BigNumber.from(1)), one.address);
    });
  });
});
