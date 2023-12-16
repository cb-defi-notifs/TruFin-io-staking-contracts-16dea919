/** Testing initiating withdrawals from the TruStakeMATIC vault. */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { smock } from '@defi-wonderland/smock';
import { expect } from "chai";
import { ethers } from "hardhat";
import * as constants from "../helpers/constants";
import { deployment } from "../helpers/fixture";
import { calculateSharesFromAmount, divSharePrice, parseEther } from "../helpers/math";
import { submitCheckpoint } from "../helpers/state-interaction";

describe("WITHDRAW REQUEST", () => {
  // Initial state, deposits, rewards compounding already tested

  let treasury, deployer, one, nonWhitelistedUser, validatorShare2, staker, validatorShare;
  let TREASURY_INITIAL_DEPOSIT;

  beforeEach(async () => {
    // reset to fixture
    ({ treasury, deployer, one, nonWhitelistedUser, validatorShare2, staker, validatorShare } = await loadFixture(deployment));
    TREASURY_INITIAL_DEPOSIT = parseEther(100)
    await staker.connect(treasury).deposit(TREASURY_INITIAL_DEPOSIT);
  });

  it("initiate a partial withdrawal", async () => {
    // Deposit 10000 with account one
    await staker.connect(one).deposit(parseEther(10000));
    // Initiate withdrawal
    await staker.connect(one).withdraw(parseEther(3000));

    // Check vault values
    expect(await staker.totalStaked()).to.equal(parseEther(7000).add(TREASURY_INITIAL_DEPOSIT)); // should not have changed

    // Check user values
    expect(await staker.balanceOf(one.address)).to.equal(parseEther(7000));

    let unbondNonce = await staker.getUnbondNonce(validatorShare.address);
    let [user, amount] = await staker.withdrawals(validatorShare.address, unbondNonce);
    expect(user).to.equal(one.address);
    expect(amount).to.equal(parseEther(3000));
  });

  it("withdraw returns the burned shares and unbond nonce", async () => {
    // Deposit 10000 with account one
    await staker.connect(one).deposit(parseEther(10000));
    // Initiate withdrawal
    const [sharesBurned, unbondNonce] = await staker.connect(one).callStatic.withdraw(parseEther(3000));

    // Verify the return values
    expect(sharesBurned).to.equal(parseEther(3000));
    expect(unbondNonce).to.equal(1);
  });

  it("initiate a partial withdrawal from a specific validator", async () => {
    // Deposit 10000 with account one
    await staker.connect(one).deposit(parseEther(10000));

    // Initiate withdrawal from a specific validator
    await staker.connect(one).withdrawFromSpecificValidator(parseEther(3000), validatorShare.address);

    // Check vault values
    expect(await staker.totalStaked()).to.equal(parseEther(7000).add(TREASURY_INITIAL_DEPOSIT)); // should not have changed

    // Check user values
    expect(await staker.balanceOf(one.address)).to.equal(parseEther(7000));

    let unbondNonce = await staker.getUnbondNonce(validatorShare.address);
    let [user, amount] = await staker.withdrawals(validatorShare.address, unbondNonce);
    expect(user).to.equal(one.address);
    expect(amount).to.equal(parseEther(3000));
  });

  it("withdraw from a specific validator returns the burned shares and unbond nonce", async () => {
    // Deposit 10000 with account one
    await staker.connect(one).deposit(parseEther(10000));
    // Initiate withdrawal
    const [sharesBurned, unbondNonce] = await staker.connect(one).callStatic.withdrawFromSpecificValidator(parseEther(3000), validatorShare.address);

    // Verify the return values
    expect(sharesBurned).to.equal(parseEther(3000));
    expect(unbondNonce).to.equal(1);
  });

  it("initiate a complete withdrawal", async () => {
    // Deposit 10000 with account one
    await staker.connect(one).deposit(parseEther(10000));

    // Initiate withdrawal
    await staker.connect(one).withdraw(parseEther(10000));

    // Check vault values
    expect(await staker.totalStaked()).to.equal(parseEther(0).add(TREASURY_INITIAL_DEPOSIT).sub(constants.EPSILON)); // should not have changed

    // Check user values
    expect(await staker.balanceOf(one.address)).to.equal(parseEther(0));

    let unbondNonce = await staker.getUnbondNonce(validatorShare.address);
    let [user, amount] = await staker.withdrawals(validatorShare.address, unbondNonce);
    expect(user).to.equal(one.address);
    expect(amount).to.equal(parseEther(10000).add(constants.EPSILON));
  });

  it("initiate a complete withdrawal from a specific validator", async () => {
    // Deposit 10000 with account one
    await staker.connect(one).deposit(parseEther(10000));

    // Initiate withdrawal from a specific validator
    await staker.connect(one).withdrawFromSpecificValidator(parseEther(10000), validatorShare.address);

    // Check vault values
    expect(await staker.totalStaked()).to.equal(parseEther(0).add(TREASURY_INITIAL_DEPOSIT).sub(constants.EPSILON)); // should not have changed

    // Check user values
    expect(await staker.balanceOf(one.address)).to.equal(parseEther(0));

    let unbondNonce = await staker.getUnbondNonce(validatorShare.address);
    let [user, amount] = await staker.withdrawals(validatorShare.address, unbondNonce);
    expect(user).to.equal(one.address);
    expect(amount).to.equal(parseEther(10000).add(constants.EPSILON));
  });

  it("initiate multiple partial withdrawals", async () => {
    // Deposit 10000 with account one
    await staker.connect(one).deposit(parseEther(10000));

    // Testing summing of user pending withdrawals
    await staker.connect(one).withdraw(parseEther(2000));
    await staker.connect(one).withdraw(parseEther(5000));

    // Check vault values
    expect(await staker.totalStaked()).to.equal(parseEther(3000).add(TREASURY_INITIAL_DEPOSIT)); // should not have changed

    // Check user values
    expect(await staker.balanceOf(one.address)).to.equal(parseEther(3000));

    let unbondNonce = await staker.getUnbondNonce(validatorShare.address);
    let [user, amount] = await staker.withdrawals(validatorShare.address, unbondNonce);
    expect(user).to.equal(one.address);
    expect(amount).to.equal(parseEther(5000));
  });

  it("initiate withdrawal with rewards wip", async () => {
    // Deposit 10M with account one
    await staker.connect(one).deposit(parseEther(10e6));

    // Accrue rewards (about 26.6 MATIC)
    await submitCheckpoint(0);

    // save some variables for checks
    let totalRewards = await staker.totalRewards();
    let totalStaked = await staker.totalStaked();
    let totalShares = await staker.totalSupply();
    let sharePrice = await staker.sharePrice();
    let withdrawAmt = parseEther(3e6);
    let withdrawShares = calculateSharesFromAmount(withdrawAmt, sharePrice);
    let trsyShares = calculateSharesFromAmount(TREASURY_INITIAL_DEPOSIT, sharePrice);
    let shareDecUsr = withdrawShares;
    let shareIncTsy = totalRewards
      .mul(constants.PHI)
      .mul(parseEther(1))
      .mul(sharePrice[1])
      .div(sharePrice[0])
      .div(constants.PHI_PRECISION);

    // check vault + user variables pre-request
    expect(totalRewards).to.be.greaterThan(parseEther(0)); // double check rewards have increased
    expect(await staker.totalAssets()).to.equal(0);
    expect(await staker.totalStaked()).to.equal(parseEther(10e6).add(TREASURY_INITIAL_DEPOSIT));
    expect(await staker.totalSupply()).to.equal(parseEther(10e6).add(TREASURY_INITIAL_DEPOSIT));
    expect(await staker.balanceOf(one.address)).to.equal(parseEther(10e6));

    // Initiate withdrawal
    await staker.connect(one).withdraw(withdrawAmt);

    // check vault + user variables post-request
    expect(divSharePrice(await staker.sharePrice())).to.equal(divSharePrice(sharePrice));
    expect(await staker.totalRewards()).to.equal(0);
    expect(await staker.totalAssets()).to.equal(totalRewards);
    expect(await staker.totalStaked()).to.equal(totalStaked.sub(withdrawAmt));
    expect(await staker.totalSupply()).to.equal(totalShares.sub(shareDecUsr).add(shareIncTsy));
    expect(await staker.balanceOf(one.address)).to.equal(totalShares.sub(shareDecUsr).sub(TREASURY_INITIAL_DEPOSIT));
    expect(await staker.balanceOf(treasury.address)).to.equal(TREASURY_INITIAL_DEPOSIT.add(shareIncTsy));

    // check withdrawal struct state is correct
    let unbondNonce = await staker.getUnbondNonce(validatorShare.address);
    let [user, amount] = await staker.withdrawals(validatorShare.address, unbondNonce);
    expect(user).to.equal(one.address);
    expect(amount).to.equal(parseEther(3e6));
  });

  it("when withdrawing, the treasury is only minted shares for claimed rewards", async () => {
    // deposit to two different validators
    await staker.connect(one).deposit(parseEther(100));
    await staker.connect(deployer).addValidator(validatorShare2.address, false);
    await staker.connect(one).depositToSpecificValidator(parseEther(100), validatorShare2.address);

    // accrue rewards
    await submitCheckpoint(0);

    // check balances before
    const rewardsValidatorOne = await staker.getRewardsFromValidator(validatorShare.address);
    const rewardsValidatorTwo = await staker.getRewardsFromValidator(validatorShare2.address);

    // withdraw from second validator
    await staker.connect(one).withdrawFromSpecificValidator(parseEther(50), validatorShare2.address);

    // check balances after
    const stakerBalanceAfter = await staker.totalAssets();
    const treasuryBalanceAfter = await staker.balanceOf(treasury.address);
    const [globalPriceNum, globalPriceDenom] = await staker.sharePrice();

    // calculate minted shares based off claimed rewards
    const sharesMinted = stakerBalanceAfter.mul(constants.PHI).mul(parseEther(1)).mul(globalPriceDenom).div((globalPriceNum.mul(constants.PHI_PRECISION)));

    expect(stakerBalanceAfter).to.equal(rewardsValidatorTwo);
    expect(await staker.getRewardsFromValidator(validatorShare.address)).to.equal(rewardsValidatorOne);
    expect(treasuryBalanceAfter).to.equal(sharesMinted.add(TREASURY_INITIAL_DEPOSIT));

    // now, a new withdraw request to the same validator should not mint any more shares to the treasury
    await staker.connect(one).withdrawFromSpecificValidator(parseEther(50), validatorShare2.address);
    expect(await staker.balanceOf(treasury.address)).to.equal(treasuryBalanceAfter);
  });

  it("try initiating a withdrawal of size zero", async () => {
    await expect(staker.connect(one).withdraw(parseEther(0))).to.be.revertedWithCustomError(
      staker,
      "WithdrawalRequestAmountCannotEqualZero"
    );
  });

  it("try initiating withdrawal of more than deposited", async () => {
    // Deposit 10M with account one
    await staker.connect(one).deposit(parseEther(10e6));

    await expect(
      staker.connect(one).withdraw(parseEther(15e6))
    ).to.be.revertedWithCustomError(staker, "WithdrawalAmountTooLarge");
  });

  it("try initiating withdrawal from a non existent validator", async () => {
    // Deposit 10M with account one
    await staker.connect(one).deposit(parseEther(10e6));

    await expect(
      staker.connect(one).withdrawFromSpecificValidator(parseEther(1000), one.address)
    ).to.be.revertedWithCustomError(staker, "ValidatorDoesNotExist");
  });

  it("try initiating a withdrawal from a specific validator with a non-whitelisted user", async () => {
    await expect(
      staker.connect(nonWhitelistedUser).withdrawFromSpecificValidator(parseEther(1000), one.address)
    ).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
  });

  describe("Validator Access", () => {
    let validator, privateValidator;

    beforeEach(async () => {
      // add a non-private validator
      validator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
      await staker.connect(deployer).addValidator(validator.address, false);

      // add a private validator
      privateValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
      await staker.connect(deployer).addValidator(privateValidator.address, true);
    });

    describe("withdraw", () => {
      describe("user with non-private access", () => {
        beforeEach(async () => {
          expect((await staker.validators(privateValidator.address)).isPrivate).is.true
          expect((await staker.validators( await staker.defaultValidatorAddress() )).isPrivate).is.false
          expect(await staker.usersPrivateAccess(one.address)).is.equal(ethers.constants.AddressZero);

          await staker.connect(one).deposit(parseEther(10000));
        });

        it("can withdraw from a non-private validator", async () => {
          await expect(
            staker.connect(one).withdraw(parseEther(10000))
          ).to.not.be.reverted;
        });

        it("should revert when withdrawing from a private validator", async () => {
          await staker.connect(deployer).setDefaultValidator(privateValidator.address);
          expect((await staker.validators(await staker.defaultValidatorAddress())).isPrivate).is.true

          await expect(
            staker.connect(one).withdraw(parseEther(10000))
          ).to.be.revertedWithCustomError(staker, "ValidatorAccessDenied");
        });
      });

      describe("user with private access", () => {
        beforeEach(async () => {
          expect((await staker.validators(validator.address)).isPrivate).is.false
          expect((await staker.validators(privateValidator.address)).isPrivate).is.true

          await staker.connect(deployer).givePrivateAccess(one.address, privateValidator.address);
          expect(await staker.usersPrivateAccess(one.address)).is.equal(privateValidator.address);

          await staker.connect(deployer).setDefaultValidator(privateValidator.address);
          privateValidator.buyVoucher.returns(parseEther(10000));
          await staker.connect(one).deposit(parseEther(10000));
        });

        it("can withdraw from their private validator", async () => {
          await expect(
            staker.connect(one).withdraw(parseEther(5000))
          ).to.not.be.reverted;
        });

        it("should revert when withdrawing from a validator that is not their private one", async () => {
          await staker.connect(deployer).setDefaultValidator(validator.address);

          await expect(
            staker.connect(one).withdraw(parseEther(5000))
          ).to.be.revertedWithCustomError(staker, "ValidatorAccessDenied");
        });
      });
    });

    describe("withdrawFromSpecificValidator", () => {
      describe("user with non-private access", () => {
        beforeEach(async () => {
          expect((await staker.validators(validator.address)).isPrivate).is.false
          expect((await staker.validators(privateValidator.address)).isPrivate).is.true
          expect(await staker.usersPrivateAccess(one.address)).is.equal(ethers.constants.AddressZero);

          validator.buyVoucher.returns(parseEther(10000));
          await staker.connect(one).depositToSpecificValidator(parseEther(10000), validator.address);
        });

        it("can withdraw from a non-private validator", async () => {
          await expect(
            staker.connect(one).withdrawFromSpecificValidator(parseEther(5000), validator.address)
          ).to.not.be.reverted;
        });

        it("should revert when withdrawing from a private validator", async () => {
          await expect(
            staker.connect(one).depositToSpecificValidator(parseEther(5000), privateValidator.address)
          ).to.be.revertedWithCustomError(staker, "ValidatorAccessDenied");
        });
      });

      describe("user with private accessr", () => {
        beforeEach(async () => {
          expect((await staker.validators(validator.address)).isPrivate).is.false
          expect((await staker.validators(privateValidator.address)).isPrivate).is.true

          await staker.connect(deployer).givePrivateAccess(one.address, privateValidator.address);
          expect(await staker.usersPrivateAccess(one.address)).is.equal(privateValidator.address);

          privateValidator.buyVoucher.returns(parseEther(10000));
          await staker.connect(one).depositToSpecificValidator(parseEther(10000), privateValidator.address);
        });

        it("can withdraw from their private validator", async () => {
          await expect(
            staker.connect(one).withdrawFromSpecificValidator(parseEther(5000), privateValidator.address)
          ).to.not.be.reverted;
        });

        it("should revert when withdrawing from a validator that is not their private one", async () => {
          await expect(
            staker.connect(one).withdrawFromSpecificValidator(parseEther(5000), validator.address)
          ).to.be.revertedWithCustomError(staker, "ValidatorAccessDenied");
        });
      });
    });
  });
});
