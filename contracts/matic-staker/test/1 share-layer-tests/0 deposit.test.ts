/** Testing depositing into the TruStakeMATIC vault. */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import * as constants from "../helpers/constants";
import { deployment } from "../helpers/fixture";
import { divSharePrice, parseEther } from "../helpers/math";
import { submitCheckpoint } from "../helpers/state-interaction";
import { parse } from "path";
import { BigNumber } from "@ethersproject/bignumber";
import { smock } from '@defi-wonderland/smock';

describe("DEPOSIT", () => {
  // Pre-deposit checked in "INIT" describe block

  let one, two, nonWhitelistedUser, staker, stakeManager, treasury, deployer, validatorShare, token;

  beforeEach(async () => {
    // reset to fixture
    ({ deployer, one, two, nonWhitelistedUser, staker, stakeManager, treasury, validatorShare, token } = await loadFixture(deployment));

  });

  it("single deposit", async () => {
    // Perform a deposit
    await staker
    .connect(one)
    .deposit(parseEther(5000), one.address);

    // Check vault values are as expected
    expect(await staker.totalStaked()).to.equal(parseEther(5000));
    expect(await staker.totalSupply()).to.equal(parseEther(5000));
    expect(await staker.totalRewards()).to.equal(parseEther(0));
    expect(await staker.totalAssets()).to.equal(parseEther(0));
    expect(divSharePrice(await staker.sharePrice())).to.equal(parseEther(1));

    // Check user values are as expected
    expect(await staker.balanceOf(one.address)).to.equal(parseEther(5000));
  });

  it("single deposit to a specific validator", async () => {
    // Perform a deposit
    await staker
    .connect(one)
    .depositToSpecificValidator(parseEther(5000), validatorShare.address);

    // Check vault values are as expected
    expect(await staker.totalStaked()).to.equal(parseEther(5000));
    expect(await staker.totalSupply()).to.equal(parseEther(5000));
    expect(await staker.totalRewards()).to.equal(parseEther(0));
    expect(await staker.totalAssets()).to.equal(parseEther(0));
    expect(divSharePrice(await staker.sharePrice())).to.equal(parseEther(1));

    // Check user values are as expected
    expect(await staker.balanceOf(one.address)).to.equal(parseEther(5000));
  });

  it("single deposit with too little MATIC fails", async () => {
    // Transfer all MATIC, then attempt to deposit
    let matic_balance = await token.balanceOf(one.address);
    await token.connect(one).transfer(two.address, matic_balance);
    await expect(staker.connect(one).deposit(parseEther(5000), one.address)).to.be.revertedWith("SafeERC20: low-level call failed");
  });

  it("single deposit to a non-existent validator fails", async () => {
    await expect(
      staker.connect(one).depositToSpecificValidator(
        parseEther(1000),
        one.address
      )
    ).to.be.revertedWithCustomError(staker, "ValidatorNotEnabled");
  });

  it("single deposit to a deactivated validator fails", async () => {
    await staker.connect(deployer).disableValidator(validatorShare.address);
    await expect(
      staker.connect(one).depositToSpecificValidator(
        parseEther(1000),
        one.address
      )
    ).to.be.revertedWithCustomError(staker, "ValidatorNotEnabled");
  });


  it("repeated deposits", async () => {
    // Perform two deposits by the same account
    await staker
      .connect(one)
    ["deposit(uint256,address)"](parseEther(5000), one.address);
    await staker
      .connect(one)
    ["deposit(uint256,address)"](parseEther(5000), one.address);

    // Check vault values are as expected
    expect(await staker.totalStaked()).to.equal(parseEther(10000));
    expect(await staker.totalSupply()).to.equal(parseEther(10000));
    expect(await staker.totalRewards()).to.equal(parseEther(0));
    expect(await staker.totalAssets()).to.equal(parseEther(0));
    expect(divSharePrice(await staker.sharePrice())).to.eql(parseEther(1));

    // Check user values are as expected
    expect(await staker.balanceOf(one.address)).to.equal(parseEther(10000));
  });

  it("repeated deposits to specific validator", async () => {
    // Perform two deposits by the same account
    await staker
      .connect(one)
    ["depositToSpecificValidator(uint256,address)"](parseEther(5000), validatorShare.address);
    await staker
      .connect(one)
    ["depositToSpecificValidator(uint256,address)"](parseEther(5000), validatorShare.address);

    // Check vault values are as expected
    expect(await staker.totalStaked()).to.equal(parseEther(10000));
    expect(await staker.totalSupply()).to.equal(parseEther(10000));
    expect(await staker.totalRewards()).to.equal(parseEther(0));
    expect(await staker.totalAssets()).to.equal(parseEther(0));
    expect(divSharePrice(await staker.sharePrice())).to.eql(parseEther(1));

    // Check user values are as expected
    expect(await staker.balanceOf(one.address)).to.equal(parseEther(10000));
  });

  it("multiple account deposits", async () => {
    // Perform two deposits by different accounts
    await staker
      .connect(one)
    ["deposit(uint256,address)"](parseEther(5000), one.address);
    await staker
      .connect(one)
    ["deposit(uint256,address)"](parseEther(5000), one.address);
    await staker
      .connect(two)
    ["deposit(uint256,address)"](parseEther(5000), two.address);

    // Check vault values are as expected
    expect(await staker.totalStaked()).to.equal(parseEther(15000));
    expect(await staker.totalSupply()).to.equal(parseEther(15000));
    expect(await staker.totalRewards()).to.equal(parseEther(0));
    expect(await staker.totalAssets()).to.equal(parseEther(0));
    expect(divSharePrice(await staker.sharePrice())).to.eql(parseEther(1));

    // Check user values are as expected
    expect(await staker.balanceOf(one.address)).to.equal(parseEther(10000));
    expect(await staker.balanceOf(two.address)).to.equal(parseEther(5000));
  });

  it("multiple account deposit to a specific validator", async () => {
    // Perform two deposits by different accounts
    await staker
      .connect(one)
    ["depositToSpecificValidator(uint256,address)"](parseEther(5000), validatorShare.address);
    await staker
      .connect(one)
    ["depositToSpecificValidator(uint256,address)"](parseEther(5000), validatorShare.address);
    await staker
      .connect(two)
    ["depositToSpecificValidator(uint256,address)"](parseEther(5000), validatorShare.address);

    // Check vault values are as expected
    expect(await staker.totalStaked()).to.equal(parseEther(15000));
    expect(await staker.totalSupply()).to.equal(parseEther(15000));
    expect(await staker.totalRewards()).to.equal(parseEther(0));
    expect(await staker.totalAssets()).to.equal(parseEther(0));
    expect(divSharePrice(await staker.sharePrice())).to.eql(parseEther(1));

    // Check user values are as expected
    expect(await staker.balanceOf(one.address)).to.equal(parseEther(10000));
    expect(await staker.balanceOf(two.address)).to.equal(parseEther(5000));
  });

  it("multiple account deposit to a specific and default validator", async () => {
    // Perform two deposits by different accounts
    await staker
      .connect(one)
    ["depositToSpecificValidator(uint256,address)"](parseEther(5000), validatorShare.address);
    await staker
      .connect(one)
    ["deposit(uint256,address)"](parseEther(5000), one.address);
    await staker
      .connect(two)
    ["depositToSpecificValidator(uint256,address)"](parseEther(5000), validatorShare.address);

    // Check vault values are as expected
    expect(await staker.totalStaked()).to.equal(parseEther(15000));
    expect(await staker.totalSupply()).to.equal(parseEther(15000));
    expect(await staker.totalRewards()).to.equal(parseEther(0));
    expect(await staker.totalAssets()).to.equal(parseEther(0));
    expect(divSharePrice(await staker.sharePrice())).to.eql(parseEther(1));

    // Check user values are as expected
    expect(await staker.balanceOf(one.address)).to.equal(parseEther(10000));
    expect(await staker.balanceOf(two.address)).to.equal(parseEther(5000));
  });

  it("deposit zero MATIC", async () => {
    // was blocked, now should work
    await staker
      .connect(one)
    ["deposit(uint256,address)"](parseEther(0), one.address);
  });

  it("deposit zero MATIC to specific validator", async () => {
    // was blocked, now should work
    await staker
      .connect(one)
    ["depositToSpecificValidator(uint256,address)"](parseEther(0), validatorShare.address);
  });

  it("Can withdraw maxWithdraw amount", async () => {
    // deposit so that rewards can accrue
    await staker.connect(two).deposit(parseEther(10e3), two.address);

    for(let i = 0; i<5; i++){
       // accrue
      await submitCheckpoint(i);

      // deposit
      await staker.connect(one).deposit(parseEther(5), one.address);

      // get max
      const maxWithdraw = await staker.maxWithdraw(one.address);

      // withdraw max
      await staker.connect(one).withdraw(maxWithdraw, one.address, one.address);
    }
  });

  it("can immediately withdraw deposited amount", async () => {
    //let treasury deposit first
    await staker.connect(treasury).deposit(parseEther(100), treasury.address);

    // deposit
    await staker.connect(one).deposit(parseEther(5), one.address);

    // withdraw deposited amt
    await staker.connect(one).withdraw(parseEther(5), one.address, one.address);
  });

  it("unknown non-whitelist user deposit fails", async () => {
    await expect(
      staker.connect(nonWhitelistedUser).deposit(parseEther(1e18), nonWhitelistedUser.address)
    ).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
  });

  it("unknown non-whitelist user cannot deposit to a whitelisted user's address", async () => {
    await expect(
      staker
        .connect(nonWhitelistedUser)
      ["deposit(uint256,address)"](
        parseEther(1e18),
        one.address
      )
    ).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
  });

  it("user cannot drain vault by depositing zero", async () => {
    // deposit 0
    await staker.connect(one).deposit(
        parseEther(0),
        one.address
      )
    // maxRedeem remains zero
    expect(await staker.maxRedeem(one.address)).to.equal(0);
    // maxWithdraw of zero forbidden
    expect(await staker.maxWithdraw(one.address)).to.equal(0);
  });

  it("user cannot deposit less than the minDeposit", async () => {
    // lower deposit limit set to 10,000 MATIC
    await staker.connect(deployer).setMinDeposit(parseEther(1e4));

    // deposit 1,000 MATIC
    await expect(staker.connect(one).deposit(
        parseEther(1e3),
        one.address
      )).to.be.revertedWithCustomError(staker, "DepositBelowMinDeposit")
  });

  it("user can deposit the minDeposit exactly", async () => {
    // lower deposit limit set to 10,000 MATIC
    await staker.connect(deployer).setMinDeposit(parseEther(1e4));

    // deposit 10,000 MATIC
    await staker.connect(one).deposit(
        parseEther(1e4),
        one.address
      );
  });

  it("updates validator struct correctly post deposit", async () => {
    await staker.connect(one).deposit(parseEther(1e6), one.address);

    expect(await staker.connect(one).getAllValidators()).to.deep.equal([
      [constants.VALIDATOR_STATE.ENABLED, parseEther(1e6), validatorShare.address]])
    });


  it("user can deposit to specific validator", async () => {
    // mock validator
    const newValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
    await staker.connect(deployer).addValidator(newValidator.address);

    // deposit to specific validator
    await staker.connect(one).depositToSpecificValidator(parseEther(1), newValidator.address);

    // check amount staked on validator
    const validator = await staker.validators(newValidator.address);
    expect(await validator.stakedAmount).to.equal(parseEther(1));

    // check default validator didn't increase staked amount
    const defaultValidator = await staker.validators(await staker.defaultValidatorAddress());
    expect(await defaultValidator.stakedAmount).to.equal(parseEther(0));
  })

  it("user can deposit the minDeposit exactly to a specific validator", async () => {
    // mock validator
    const newValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
    await staker.connect(deployer).addValidator(newValidator.address);

    // lower deposit limit set to 10,000 MATIC
    await staker.connect(deployer).setMinDeposit(parseEther(1e4));

    // deposit 10,000 MATIC
    await staker.connect(one).depositToSpecificValidator(
        parseEther(1e4),
        newValidator.address
      );
  });

  it("unknown non-whitelist user deposit to  specific validator fails", async () => {
    // mock validator
    const newValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
    await staker.connect(deployer).addValidator(newValidator.address);

    await expect(
      staker.connect(nonWhitelistedUser).depositToSpecificValidator(parseEther(1e18), newValidator.address)
    ).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
  });

  it("unknown non-whitelist user cannot deposit to specific validator to a whitelisted user's address", async () => {
    // mock validator
    const newValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
    await staker.connect(deployer).addValidator(newValidator.address);

    await expect(
      staker
        .connect(nonWhitelistedUser)
      ["depositToSpecificValidator(uint256,address)"](
        parseEther(1e18),
        newValidator.address
      )
    ).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
  });

  it("user cannot drain vault by depositing zero to a specific validator", async () => {
    // mock validator
    const newValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
    await staker.connect(deployer).addValidator(newValidator.address);

    // deposit 0
    await staker.connect(one).depositToSpecificValidator(
        parseEther(0),
        newValidator.address
      )
    // maxRedeem remains zero
    expect(await staker.maxRedeem(one.address)).to.equal(0);
    // maxWithdraw of zero forbidden
    expect(await staker.maxWithdraw(one.address)).to.equal(0);
  });

  it("user cannot deposit less than the minDeposit to  specific validator", async () => {
    // mock validator
    const newValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
    await staker.connect(deployer).addValidator(newValidator.address);

    // lower deposit limit set to 10,000 MATIC
    await staker.connect(deployer).setMinDeposit(parseEther(1e4));

    // deposit 1,000 MATIC
    await expect(staker.connect(one).depositToSpecificValidator(
        parseEther(1e3),
        newValidator.address
      )).to.be.revertedWithCustomError(staker, "DepositBelowMinDeposit")
  });


  it("deposit zero MATIC to a specific validator", async () => {
    // mock validator
    const newValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
    await staker.connect(deployer).addValidator(newValidator.address);

    // was blocked, now should work
    await staker
      .connect(one)
    ["depositToSpecificValidator(uint256,address)"](parseEther(0), newValidator.address);
  });
});

// TODO: organise tests
