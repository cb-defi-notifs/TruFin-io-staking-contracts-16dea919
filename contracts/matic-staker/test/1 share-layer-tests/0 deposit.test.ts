/** Testing depositing into the TruStakeMATIC vault. */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import * as constants from "../helpers/constants";
import { deployment } from "../helpers/fixture";
import { divSharePrice, parseEther } from "../helpers/math";
import { submitCheckpoint } from "../helpers/state-interaction";

import { smock } from '@defi-wonderland/smock';

describe("DEPOSIT", () => {
  // Pre-deposit checked in "INIT" describe block

  let one, two, nonWhitelistedUser, staker, validatorShare2, treasury, deployer, validatorShare, token;

  beforeEach(async () => {
    // reset to fixture
    ({ deployer, one, two, nonWhitelistedUser, staker, validatorShare2, treasury, validatorShare, token } = await loadFixture(deployment));

  });

  it("single deposit", async () => {
    // Perform a deposit
    await staker
    .connect(one)
    .deposit(parseEther(5000));

    // Check vault values are as expected
    expect(await staker.totalStaked()).to.equal(parseEther(5000));
    expect(await staker.totalSupply()).to.equal(parseEther(5000));
    expect(await staker.totalRewards()).to.equal(parseEther(0));
    expect(await staker.totalAssets()).to.equal(parseEther(0));
    expect(divSharePrice(await staker.sharePrice())).to.equal(parseEther(1));

    // Check user values are as expected
    expect(await staker.balanceOf(one.address)).to.equal(parseEther(5000));
  });

  it("deposit returns the minted shares", async () => {
    // Simulate a deposit and get the return value
    const sharesMinted = await staker.connect(one).callStatic.deposit(parseEther(5000));

    // Verify the return value
    expect(sharesMinted).to.equal(parseEther(5000));
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

  it("deposit to a specific validator returns the minted shares", async () => {
    // Simulate a deposit to a validator and get the return value
    const sharesMinted = await staker.connect(one).callStatic.depositToSpecificValidator(parseEther(5000), validatorShare.address);

    // Verify the return value
    expect(sharesMinted).to.equal(parseEther(5000));
  });

  it("single deposit with too little MATIC fails", async () => {
    // Transfer all MATIC, then attempt to deposit
    let matic_balance = await token.balanceOf(one.address);
    await token.connect(one).transfer(two.address, matic_balance);
    await expect(staker.connect(one).deposit(parseEther(5000))).to.be.revertedWith("SafeERC20: low-level call failed");
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
      .deposit(parseEther(5000));
    await staker
      .connect(one)
      .deposit(parseEther(5000));

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
      .deposit(parseEther(5000))
    await staker
      .connect(one)
      .deposit(parseEther(5000))
    await staker
      .connect(two)
      .deposit(parseEther(5000))

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
      .deposit(parseEther(5000))
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

  it("depositing zero MATIC should fail", async () => {
    await expect(staker.connect(one).deposit(parseEther(0))).to.be.revertedWithCustomError(staker, "DepositBelowMinDeposit")
  });

  it("depositing zero MATIC to specific validator should fail", async () => {
    await expect(staker.connect(one).depositToSpecificValidator(parseEther(0), validatorShare.address)).to.be.revertedWithCustomError(staker, "DepositBelowMinDeposit")
  });

  it("Can withdraw maxWithdraw amount", async () => {
    // deposit so that rewards can accrue
    await staker.connect(two).deposit(parseEther(10e3));

    for(let i = 0; i<5; i++){
       // accrue
      await submitCheckpoint(i);

      // deposit
      await staker.connect(one).deposit(parseEther(5));

      // get max
      const maxWithdraw = await staker.maxWithdraw(one.address);

      // withdraw max
      await staker.connect(one).withdraw(maxWithdraw);
    }
  });

  it("can immediately withdraw deposited amount", async () => {
    //let treasury deposit first
    await staker.connect(treasury).deposit(parseEther(100));

    // deposit
    await staker.connect(one).deposit(parseEther(5));

    // withdraw deposited amt
    await staker.connect(one).withdraw(parseEther(5));
  });

  it("unknown non-whitelist user deposit fails", async () => {
    await expect(
      staker.connect(nonWhitelistedUser).deposit(parseEther(1e18))
    ).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
  });

  it("unknown non-whitelist user cannot deposit to a whitelisted user's address", async () => {
    await expect(
      staker
        .connect(nonWhitelistedUser)
        .deposit(parseEther(1e18))
    ).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
  });

  it("user cannot deposit less than the minDeposit", async () => {
    // lower deposit limit set to 10,000 MATIC
    await staker.connect(deployer).setMinDeposit(parseEther(1e4));

    // deposit 1,000 MATIC
    await expect(staker.connect(one).deposit(parseEther(1e3))).to.be.revertedWithCustomError(staker, "DepositBelowMinDeposit")
  });

  it("user can deposit the minDeposit exactly", async () => {
    // lower deposit limit set to 10,000 MATIC
    await staker.connect(deployer).setMinDeposit(parseEther(1e4));

    // deposit 10,000 MATIC
    await staker.connect(one).deposit(parseEther(1e4));
  });

  it("updates validator struct correctly post deposit", async () => {
    await staker.connect(one).deposit(parseEther(1e6));

    expect(await staker.connect(one).getAllValidators()).to.deep.equal(
      [[constants.VALIDATOR_STATE.ENABLED, parseEther(1e6), validatorShare.address, false]]
    )
  });

  it("user can deposit to specific validator", async () => {
    // mock validator
    const newValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
    newValidator.buyVoucher.returns(parseEther(1));
    await staker.connect(deployer).addValidator(newValidator.address, false);

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
    await staker.connect(deployer).addValidator(newValidator.address, false);

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
    await staker.connect(deployer).addValidator(newValidator.address, false);

    await expect(
      staker.connect(nonWhitelistedUser).depositToSpecificValidator(parseEther(1e18), newValidator.address)
    ).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
  });

  it("unknown non-whitelist user cannot deposit to specific validator to a whitelisted user's address", async () => {
    // mock validator
    const newValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
    await staker.connect(deployer).addValidator(newValidator.address, false);

    await expect(
      staker
        .connect(nonWhitelistedUser)
      ["depositToSpecificValidator(uint256,address)"](
        parseEther(1e18),
        newValidator.address
      )
    ).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
  });

  it("user cannot deposit less than the minDeposit to  specific validator", async () => {
    // mock validator
    const newValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
    await staker.connect(deployer).addValidator(newValidator.address, false);

    // lower deposit limit set to 10,000 MATIC
    await staker.connect(deployer).setMinDeposit(parseEther(1e4));

    // deposit 1,000 MATIC
    await expect(staker.connect(one).depositToSpecificValidator(
        parseEther(1e3),
        newValidator.address
      )).to.be.revertedWithCustomError(staker, "DepositBelowMinDeposit")
  });

  it("when depositing, the treasury is only minted shares for claimed rewards", async () => {
    // deposit to two different validators
    await staker.connect(one).deposit(parseEther(100));
    await staker.connect(deployer).addValidator(validatorShare2.address, false);
    await staker.connect(one).depositToSpecificValidator(parseEther(100), validatorShare2.address);

    // accrue rewards
    await submitCheckpoint(0);

    // check balances before
    const rewardsValidatorOne = await staker.getRewardsFromValidator(validatorShare.address);
    const rewardsValidatorTwo = await staker.getRewardsFromValidator(validatorShare2.address);

    // deposit to default validator
    await staker.connect(two).deposit(parseEther(200));

    // check balances after
    const stakerBalanceAfter = await staker.totalAssets();
    const treasuryBalanceAfter = await staker.balanceOf(treasury.address);
    const [globalPriceNum, globalPriceDenom] = await staker.sharePrice();

    // calculate minted shares based off claimed rewards
    const sharesMinted = stakerBalanceAfter.mul(constants.PHI).mul(parseEther(1)).mul(globalPriceDenom).div((globalPriceNum.mul(constants.PHI_PRECISION)));

    expect(stakerBalanceAfter).to.equal(rewardsValidatorOne)
    expect(await staker.getRewardsFromValidator(validatorShare2.address)).to.equal(rewardsValidatorTwo);
    expect(treasuryBalanceAfter).to.equal(sharesMinted);

    // now, a new deposit to the same validator should not mint any more shares for the treasury
    await staker.connect(two).deposit(parseEther(200));
    expect(await staker.balanceOf(treasury.address)).to.equal(treasuryBalanceAfter);
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

    describe("deposit", () => {
      describe("user with non-private access", () => {
        beforeEach(async () => {
          expect((await staker.validators(privateValidator.address)).isPrivate).is.true
          expect((await staker.validators( await staker.defaultValidatorAddress() )).isPrivate).is.false
          expect(await staker.usersPrivateAccess(one.address)).is.equal(ethers.constants.AddressZero);
        });

        it("can deposit to a non-private validator", async () => {
          await expect(
            staker.connect(one).deposit(parseEther(5000))
          ).to.not.be.reverted;
        });

        it("should revert when depositing on a private validator", async () => {
          await staker.connect(deployer).setDefaultValidator(privateValidator.address);
          expect((await staker.validators(await staker.defaultValidatorAddress())).isPrivate).is.true

          await expect(
            staker.connect(one).deposit(parseEther(5000))
          ).to.be.revertedWithCustomError(staker, "ValidatorAccessDenied");
        });
      });

      describe("user with private access", () => {
        beforeEach(async () => {
          expect((await staker.validators(validator.address)).isPrivate).is.false
          expect((await staker.validators(privateValidator.address)).isPrivate).is.true

          await staker.connect(deployer).givePrivateAccess(one.address, privateValidator.address);
          expect(await staker.usersPrivateAccess(one.address)).is.equal(privateValidator.address);
        });

        it("can deposit to their private validator", async () => {
          await staker.connect(deployer).setDefaultValidator(privateValidator.address);

          await expect(
            staker.connect(one).deposit(parseEther(5000))
          ).to.not.be.reverted;
        });

        it("should revert when depositing on a validator that is not their private one", async () => {
          await expect(
            staker.connect(one).deposit(parseEther(5000))
          ).to.be.revertedWithCustomError(staker, "ValidatorAccessDenied");
        });
      });
    });

    describe("depositToSpecificValidator", () => {
      describe("user with non-private access", () => {
        beforeEach(async () => {
          expect((await staker.validators(validator.address)).isPrivate).is.false
          expect((await staker.validators(privateValidator.address)).isPrivate).is.true
          expect(await staker.usersPrivateAccess(one.address)).is.equal(ethers.constants.AddressZero);
        });

        it("can deposit to a non-private validator", async () => {
          await expect(
            staker.connect(one).depositToSpecificValidator(parseEther(5000), validator.address)
          ).to.not.be.reverted;
        });

        it("should revert when depositing on a private validator", async () => {
          await expect(
            staker.connect(one).depositToSpecificValidator(parseEther(5000), privateValidator.address)
          ).to.be.revertedWithCustomError(staker, "ValidatorAccessDenied");
        });
      });

      describe("user with private-access", () => {
        beforeEach(async () => {
          expect((await staker.validators(validator.address)).isPrivate).is.false
          expect((await staker.validators(privateValidator.address)).isPrivate).is.true

          await staker.connect(deployer).givePrivateAccess(one.address, privateValidator.address);
          expect(await staker.usersPrivateAccess(one.address)).is.equal(privateValidator.address);
        });

        it("can deposit to their private validator", async () => {
          await expect(
            staker.connect(one).depositToSpecificValidator(parseEther(5000), privateValidator.address)
          ).to.not.be.reverted;
        });

        it("should revert when depositing on a validator that is not their private one", async () => {
          await expect(
            staker.connect(one).depositToSpecificValidator(parseEther(5000), validator.address)
          ).to.be.revertedWithCustomError(staker, "ValidatorAccessDenied");
        });

      });
    });
  });

});

// TODO: organise tests
