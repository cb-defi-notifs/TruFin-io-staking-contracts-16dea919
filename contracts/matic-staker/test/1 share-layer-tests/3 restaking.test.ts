/** Testing restaking rewards and staking claimed rewards in the TruStakeMATIC vault. */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import * as constants from "../helpers/constants";
import { deployment } from "../helpers/fixture";
import {
  calculateSharePrice,
  calculateSharesFromAmount,
  divSharePrice,
  parseEther
} from "../helpers/math";
import {
  setTokenBalance,
  submitCheckpoint
} from "../helpers/state-interaction";

describe("RESTAKE", () => {
  let deployer, treasury, one, token, stakeManager, staker;

  beforeEach(async () => {
    // reset to fixture
    ({
      deployer, treasury, one, token, stakeManager, staker
    } = await loadFixture(deployment));
  });

  describe("Vault: Simulate rewards accrual", async () => {
    it("Simulating `SubmitCheckpoint` transaction on RootChainProxy", async () => {
      // already checked rewards are zero immediately after deposit
      await staker
        .connect(one)
       .deposit(parseEther(10000000), one.address);

      for(let i = 0; i < 5; i++){
      // simulate passing checkpoint
      await submitCheckpoint(i);

      // check rewards have increased after checkpoint passes
      expect(await staker.totalRewards()).to.be.greaterThan(0);
      expect(divSharePrice(await staker.sharePrice())).to.be.greaterThan(
        parseEther(1)
      );
      }
    });
  });

  describe("Vault: compound rewards", async () => {
    it("rewards compounded correctly (compoundRewards: using unclaimed rewards)", async () => {
      // deposit some matic
      let depositAmt = parseEther(10e6);
      await staker
        .connect(one).
        deposit(depositAmt, one.address);

      // accrue rewards
      await submitCheckpoint(0);
      await submitCheckpoint(1);
      await submitCheckpoint(2);

      let rewards = await staker.totalRewards();
      expect(rewards).to.be.greaterThan(parseEther(0));

      let claimedRewards = await staker.totalAssets();
      expect(claimedRewards).to.equal(parseEther(0));

      // get inputs to calculate expected new share price
      let totalStaked = await staker.totalStaked();
      let totalShares = await staker.totalSupply();
      let totalRewards = await staker.totalRewards();
      let phiPrecision = BigNumber.from(10000);
      let phi = constants.PHI;

      // calculate expected new share price as in Staker.sol
      let expSharePrice = calculateSharePrice(
        totalStaked,
        claimedRewards,
        totalRewards,
        totalShares,
        constants.PHI,
        constants.PHI_PRECISION
      );
      let expDust = totalRewards.mul(phi).div(phiPrecision);

      // check vault values are as expected
      expect(await staker.totalStaked()).to.equal(parseEther(10e6));
      expect(await staker.totalSupply()).to.equal(parseEther(10e6));
      expect(divSharePrice(await staker.sharePrice())).to.equal(
        divSharePrice(expSharePrice)
      ); // *.9 as .1 goes to treasury
      expect(await staker.getDust()).to.equal(expDust);

      // check user values are as expected
      // one
      expect(await staker.balanceOf(one.address)).to.equal(parseEther(10e6)); // should not have changed
      // treasury
      expect(await staker.balanceOf(treasury.address)).to.equal(parseEther(0)); // should not have changed

      // calculate expected share increase as in Staker.sol
      let shareInc = calculateSharesFromAmount(
        totalStaked.add(totalRewards),
        expSharePrice
      ).sub(totalShares);

      // call compound rewards
      await staker.connect(deployer).compoundRewards();

      // check vault values are as expected
      expect(await staker.totalStaked()).to.equal(
        totalStaked.add(totalRewards)
      ); // changed
      expect(await staker.totalSupply()).to.equal(totalShares.add(shareInc));
      expect(await staker.totalAssets()).to.equal(parseEther(0)); // not changed
      expect(await staker.totalRewards()).to.equal(parseEther(0)); // changed
      expect(divSharePrice(await staker.sharePrice())).to.equal(
        divSharePrice(expSharePrice)
      ); // not changed (most important)

      // check user values are as expected
      // one
      expect(await staker.balanceOf(one.address)).to.equal(parseEther(10e6)); // should not have changed
      // treasury
      expect(await staker.balanceOf(treasury.address)).to.equal(shareInc); // should have changed
    });

    it("rewards compounded correctly (stakeClaimedRewards: using claimed rewards)", async () => {
      // deposit some matic
      let depositAmt = parseEther(10e6);
      await staker
        .connect(one)
        .deposit(depositAmt, one.address);

      // artificially increase claimed rewards (as we can only simulate rewards once)
      // if we properly simulate rewards using new instances of the polygon contracts, we can test this without helpers

      // set `claimedRewards` / MATIC balance to 1 MATIC
      await setTokenBalance(token, staker.address, parseEther(1));

      // check claimed and total rewards
      expect(await staker.totalAssets()).to.equal(parseEther(1));
      expect(await staker.totalRewards()).to.equal(parseEther(0));

      // submit checkpoint, increase rewards
      await submitCheckpoint(0);

      // check claimed and total rewards
      let preStakeClaimedRewards = await staker.totalAssets();
      let preStakeTotalRewards = await staker.totalRewards();
      let preStakeTotalStaked = await staker.totalStaked();
      expect(preStakeClaimedRewards).to.equal(parseEther(1));
      expect(preStakeTotalRewards).to.be.greaterThan(parseEther(0));
      expect(preStakeTotalStaked).to.equal(parseEther(10e6));

      // stake claimed rewards
      await staker.connect(deployer).stakeClaimedRewards();

      // check claimed and total rewards
      expect(await staker.totalAssets()).to.equal(preStakeTotalRewards);
      expect(await staker.totalRewards()).to.equal(parseEther(0));
      expect(await staker.totalStaked()).to.equal(
        preStakeTotalStaked.add(preStakeClaimedRewards)
      );
    });

    it("try compounding rewards with rewards equal to zero", async () => {
      await staker
        .connect(one)
        ["deposit(uint256,address)"](parseEther(10e6), one.address);

      await expect(
        staker.connect(deployer).compoundRewards()
      ).to.be.revertedWith("Too small rewards to restake");
    });
  });
});
