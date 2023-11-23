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
  let deployer, treasury, one, token, stakeManager, validatorShare, validatorShare2, staker;

  beforeEach(async () => {
    // reset to fixture
    ({
      deployer, treasury, one, token, stakeManager, validatorShare, validatorShare2, staker
    } = await loadFixture(deployment));
  });

  describe("Vault: Simulate rewards accrual", async () => {
    it("Simulating `SubmitCheckpoint` transaction on RootChainProxy", async () => {
      // already checked rewards are zero immediately after deposit
      await staker
        .connect(one)
        .deposit(parseEther(10000000));

      for(let i = 0; i < 5; i++) {
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
      // deposit some MATIC
      let depositAmt = parseEther(10e6);
      await staker.connect(one).deposit(depositAmt);

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
      await staker.connect(deployer).compoundRewards(validatorShare.address);

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

    it("rewards compounded correctly (compoundRewards: using claimed rewards)", async () => {
      // deposit some MATIC
      let depositAmt = parseEther(10e6);
      await staker
        .connect(one)
        .deposit(depositAmt);

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
      await staker.connect(deployer).compoundRewards(validatorShare.address);

      // check claimed and total rewards
      expect(await staker.totalAssets()).to.equal(parseEther(0));
      expect(await staker.totalRewards()).to.equal(parseEther(0));
      expect(await staker.totalStaked()).to.equal(
        preStakeTotalStaked.add(preStakeClaimedRewards).add(preStakeTotalRewards)
      );
    });

    it("compoundRewards correctly updates staked amount", async () => {
       // add a new validator
       await staker.addValidator(validatorShare2.address);

      // deposit some MATIC into the default and new validator
      let depositAmt = parseEther(5e6);
      await staker.connect(one).deposit(depositAmt);
      await staker.connect(one).depositToSpecificValidator(depositAmt, validatorShare2.address);

      // set `claimedRewards` / MATIC balance to 1 MATIC
      await setTokenBalance(token, staker.address, parseEther(1));

      // submit checkpoint, increase rewards
      await submitCheckpoint(0);

      let preClaimedRewards = await staker.totalAssets();
      let preTotalRewardsV1 = await staker.getRewardsFromValidator(validatorShare.address);
      let preTotalStakedV1 = await staker.validators(validatorShare.address);
      let preTotalRewardsV2 = await staker.getRewardsFromValidator(validatorShare2.address);
      let preTotalStakedV2 = await staker.validators(validatorShare2.address);

      expect(preTotalRewardsV1).to.be.greaterThan(parseEther(0));
      expect(preTotalStakedV2.stakedAmount).to.equal(depositAmt);
      expect(preTotalRewardsV2).to.be.greaterThan(parseEther(0));
      expect(preTotalStakedV1.stakedAmount).to.equal(depositAmt);

      // call compoundRewards on the default validator
      await staker.connect(deployer).compoundRewards(validatorShare.address);

      let postTotalStakedV1 = await staker.validators(validatorShare.address);
      let postTotalStakedV2 = await staker.validators(validatorShare2.address);

      // v1 staked amount should have increased by the validator's unclaimed rewards plus the claimed rewards in the contract
      expect((preTotalStakedV1.stakedAmount).add(preTotalRewardsV1).add(preClaimedRewards)).to.equal(postTotalStakedV1.stakedAmount);
      // v2 staked amount should have increased by the validator's unclaimed rewards
      expect((preTotalStakedV2.stakedAmount).add(preTotalRewardsV2)).to.equal(postTotalStakedV2.stakedAmount);
    });

    it("does not revert when compounding zero rewards", async () => {
      expect(await staker.totalRewards()).to.equal(0);

      await expect(
        staker.connect(deployer).compoundRewards(validatorShare.address)
      ).to.not.be.reverted;
    });

    it("emits an event when restaking on a validator reverts", async () => {
      expect(await staker.totalRewards()).to.equal(0);

      await expect(
        staker.connect(deployer).compoundRewards(validatorShare.address)
      ).to.emit(staker, "RestakeError").withArgs(validatorShare.address, "Too small rewards to restake");
    });

    it("stakes MATIC present in the vault with the selected validator", async () => {
      // add a new validator
      await staker.addValidator(validatorShare2.address);

      // set some MATIC in the vault
      const maticAmount = parseEther(1000);
      await setTokenBalance(token, staker.address, maticAmount);

      const [stakedBefore,] = await validatorShare2.getTotalStake(staker.address);
      expect(stakedBefore).to.equal(0);

      // call compoundRewards on the new validator
      await staker.connect(deployer).compoundRewards(validatorShare2.address);

      // verify all MATIC was sent to the new validator and is staked
      const [stakedAfter,] = await validatorShare2.getTotalStake(staker.address);
      expect (stakedAfter).is.equal(maticAmount);
      expect(await token.balanceOf(staker.address)).is.equal(0);
    });

    it("reverts when the selected validator is disabled", async () => {
      // add a new validator
      await staker.addValidator(validatorShare2.address);
      await staker.disableValidator(validatorShare2.address);

      // set some MATIC in the vault
      const maticAmount = parseEther(1000);
      await setTokenBalance(token, staker.address, maticAmount);


      await expect(staker.connect(deployer).compoundRewards(validatorShare2.address)).to.be.revertedWithCustomError(staker, "ValidatorNotEnabled");
    });

    it("does not revert when a non-specified validator is disabled", async () => {
      await staker.disableValidator(validatorShare.address);

      await expect(staker.connect(deployer).compoundRewards(validatorShare2.address)).to.not.be.reverted;
    });

    it("does not revert when MATIC in the vault is below the validator min amount", async () => {
      // set MATIC in the vault below the validator min amount
      const minAmount = await validatorShare.minAmount();
      await setTokenBalance(token, staker.address, minAmount.div(2));

      expect(await staker.totalAssets()).to.be.greaterThan(0)

      await expect(
        staker.connect(deployer).compoundRewards(validatorShare.address)
      ).to.not.be.reverted;

      expect(await staker.totalAssets()).to.equal(0);

    });

    it("leaves no MATIC in the vault when there are liquid rewards to restake", async () => {

      // first deposit
      await staker.connect(one).depositToSpecificValidator(parseEther(1e6), validatorShare.address);

      // submit checkpoint to generate rewards
      await submitCheckpoint(0);

      // verify there is no MATIC in the vault
      expect(await token.balanceOf(staker.address)).is.equal(0);

      // second deposit
      await staker.connect(one).depositToSpecificValidator(parseEther(1e6), validatorShare.address);

      // verify the validator sent some MATIC to the vault
      expect(await token.balanceOf(staker.address)).is.greaterThan(0);

      // generate more rewards
      await submitCheckpoint(1);

      // compound rewards with MATIC in the vault and liquid rewards to restake
      await staker.connect(deployer).compoundRewards(validatorShare.address);

      // verify the MATIC in the vault was sent to the validator
      expect(await token.balanceOf(staker.address)).is.equal(0);
    });

    it("restakes liquid rewards on multiple validators", async () => {
      // add a second validator
      await staker.addValidator(validatorShare2.address);

      // stake on both validators
      await staker.connect(one).depositToSpecificValidator(parseEther(1e6), validatorShare.address);
      await staker.connect(one).depositToSpecificValidator(parseEther(2e6), validatorShare2.address);

      const [stakeOnFirstValidatorAfterDeposit,] = await validatorShare.getTotalStake(staker.address);
      const [stakeOnSecondValidatorAfterDeposit,] = await validatorShare2.getTotalStake(staker.address);

      // submit checkpoint to generate rewards
      await submitCheckpoint(0);

      const rewardsOnFirstValidator = await validatorShare.getLiquidRewards(staker.address);
      const rewardsOnSecondValidator = await validatorShare2.getLiquidRewards(staker.address);

      // verify rewards are present on both validators
      expect(rewardsOnFirstValidator).to.be.greaterThan(0);
      expect(rewardsOnSecondValidator).to.be.greaterThan(0);

      // compound rewards on both validators
      await staker.connect(deployer).compoundRewards(validatorShare.address);

      // verify rewards got restaked on both validators
      expect(await validatorShare.getLiquidRewards(staker.address)).to.equal(0);
      expect(await validatorShare2.getLiquidRewards(staker.address)).to.equal(0);

      const [stakeOnFirstValidator,] = await validatorShare.getTotalStake(staker.address);
      const [stakeOnSecondValidator,] = await validatorShare2.getTotalStake(staker.address);

      expect(stakeOnFirstValidator).to.equal(stakeOnFirstValidatorAfterDeposit.add(rewardsOnFirstValidator))
      expect(stakeOnSecondValidator).to.equal(stakeOnSecondValidatorAfterDeposit.add(rewardsOnSecondValidator))
    });
  });
});
