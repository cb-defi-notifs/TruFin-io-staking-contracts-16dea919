/** Testing initiating withdrawals from the TruStakeMATIC vault. */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import * as constants from "../helpers/constants";
import { deployment } from "../helpers/fixture";
import { calculateSharesFromAmount, divSharePrice, parseEther } from "../helpers/math";
import { submitCheckpoint } from "../helpers/state-interaction";

describe("WITHDRAW REQUEST", () => {
  // Initial state, deposits, rewards compounding already tested

  let treasury, deployer, one, two, nonWhitelistedUser, staker, validatorShare;
  let TREASURY_INITIAL_DEPOSIT;

  beforeEach(async () => {
    // reset to fixture
    ({ treasury, deployer, one, two, nonWhitelistedUser, staker, validatorShare } = await loadFixture(deployment));
    TREASURY_INITIAL_DEPOSIT = parseEther(100)
    await staker.connect(treasury).deposit(TREASURY_INITIAL_DEPOSIT, treasury.address);
  });

  it("initiate a partial withdrawal", async () => {
    // Deposit 10000 with account one
    await staker.connect(one).deposit(parseEther(10000), one.address);
    // Initiate withdrawal
    await staker.connect(one).withdraw(parseEther(3000), one.address, one.address);

    // Check vault values
    expect(await staker.totalStaked()).to.equal(parseEther(7000).add(TREASURY_INITIAL_DEPOSIT)); // should not have changed

    // Check user values
    expect(await staker.balanceOf(one.address)).to.equal(parseEther(7000));

    let unbondNonce = await staker.getUnbondNonce(validatorShare.address);
    let [user, amount] = await staker.withdrawals(validatorShare.address, unbondNonce);
    expect(user).to.equal(one.address);
    expect(amount).to.equal(parseEther(3000));
  });

  it("initiate a partial withdrawal from a specific validator", async () => {
    // Deposit 10000 with account one
    await staker.connect(one).deposit(parseEther(10000), one.address);

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

  it("initiate a complete withdrawal", async () => {
    // Deposit 10000 with account one
    await staker.connect(one).deposit(parseEther(10000), one.address);

    // Initiate withdrawal
    await staker.connect(one).withdraw(parseEther(10000), one.address, one.address);

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
    await staker.connect(one).deposit(parseEther(10000), one.address);

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
    await staker.connect(one).deposit(parseEther(10000), one.address);

    // Testing summing of user pending withdrawals
    await staker.connect(one).withdraw(parseEther(2000), one.address, one.address);
    await staker.connect(one).withdraw(parseEther(5000), one.address, one.address);

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
    await staker.connect(one).deposit(parseEther(10e6), one.address);

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
    await staker.connect(one).withdraw(withdrawAmt, one.address, one.address);

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

  it("try initiating a withdrawal of size zero", async () => {
    await expect(staker.connect(one).withdraw(parseEther(0), one.address, one.address)).to.be.revertedWithCustomError(
      staker,
      "WithdrawalRequestAmountCannotEqualZero"
    );
  });

  it("try initiating withdrawal of more than deposited", async () => {
    // Deposit 10M with account one
    await staker.connect(one).deposit(parseEther(10e6), one.address);

    await expect(
      staker.connect(one).withdraw(parseEther(15e6), one.address, one.address)
    ).to.be.revertedWithCustomError(staker, "WithdrawalAmountTooLarge");
  });

  it("try initiating withdrawal from a non existent validator", async () => {
    // Deposit 10M with account one
    await staker.connect(one).deposit(parseEther(10e6), one.address);

    await expect(
      staker.connect(one).withdrawFromSpecificValidator(parseEther(1000), one.address)
    ).to.be.revertedWithCustomError(staker, "ValidatorDoesNotExist");
  });

  it("try initiating a withdrawal from a specific validator with a non-whitelisted user", async () => {
    await expect(
      staker.connect(nonWhitelistedUser).withdrawFromSpecificValidator(parseEther(1000), one.address)
    ).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
  });
});
