/** Testing general and ERC-4626 implementation getters.
 * Written originally by TG.
 * Reformatted by PD.
 */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
const ethers = require('ethers');
import * as constants from "../helpers/constants";
import { deployment } from "../helpers/fixture";
import {
  calculateAmountFromShares, parseEther
} from "../helpers/math";
import { submitCheckpoint } from "../helpers/state-interaction";
import { smock } from '@defi-wonderland/smock';

describe("GETTERS", () => {
  let one, two, three, deployer, staker, validatorShare;

  beforeEach(async () => {
    // reset to fixture
    ({ one, two, three, deployer, staker, validatorShare } = await loadFixture(deployment));
  });

  describe("Max functions", async () => {
    // todo: add tests for input validation

    it("maxWithdraw", async () => {
      // no deposits

      const balanceOld = await staker.balanceOf(one.address);
      const sharePriceOld = await staker.sharePrice();
      const maxWithdrawCalculatedOld = calculateAmountFromShares(balanceOld, sharePriceOld);

      expect(await staker.maxWithdraw(one.address)).to.equal(0);

      // deposit 1M MATIC
      await staker.connect(one).deposit(parseEther(1e6));

      const balanceNew = await staker.balanceOf(one.address);
      const sharePriceNew = await staker.sharePrice();
      const maxWithdrawCalculatedNew = calculateAmountFromShares(balanceNew, sharePriceNew);

      const maxWithdrawStaker = await staker.connect(one).maxWithdraw(one.address);
      const epsilon = await staker.epsilon();

      // check actual maxWithdraw is between the calculated one and the calculated one + epsilon

      expect(
        maxWithdrawStaker
      ).to.be.greaterThan(
        maxWithdrawCalculatedNew
      );

      expect(
        maxWithdrawStaker
      ).to.be.lessThanOrEqual(
        maxWithdrawCalculatedNew.add(epsilon)
      );
    });

    // it("pass: minting treasury shares does not screw with max withdraw", async () => {

    //   await staker.connect(one).deposit(parseEther(10000), one.address);

    //   await submitCheckpoint(0);

    //   // // deposit 5 MATIC
    //   // await staker.connect(one).deposit(parseEther(5), one.address);
    //   // // call max withdraw
    //   // const maxWithdrawAmount = await staker.maxWithdraw(one.address);
    //   // // assert equality
    //   // expect(maxWithdrawAmount).to.equal(parseEther(5));
    // });

    it("pass: output of maxWithdraw is greater than to just deposited amount without accrual", async () => {
      // deposit 5 MATIC
      await staker.connect(one).deposit(parseEther(5));
      // call max withdraw
      const maxWithdrawAmount = await staker.maxWithdraw(one.address);
      // assert greaterThan,  added along with magic number
      expect(maxWithdrawAmount).to.be.greaterThan(parseEther(5));
    });

    it("pass: withdraw output of maxWithdraw after depositing", async () => {
      // reserve fund
      await staker.connect(one).deposit(parseEther(1e4));

      // deposit 5 MATIC
      await staker.connect(two).deposit(parseEther(5));
      // call max withdraw
      const maxWithdrawAmount = await staker.maxWithdraw(two.address);
      // withdraw output
      await staker.connect(two).withdraw(maxWithdrawAmount);
    });

    it("fail: cannot withdraw 1 + output of maxWithdraw after depositing", async () => {
      // deposit 5 MATIC
      await staker.connect(one).deposit(parseEther(5));
      // call max withdraw
      const maxWithdrawAmount = await staker.maxWithdraw(one.address);
      // withdraw output
      await expect(
        staker.connect(one).withdraw(maxWithdrawAmount.add(1))
      ).to.be.revertedWithCustomError(staker, "WithdrawalAmountTooLarge");
    });

    it("pass: withdraw output of maxWithdraw after depositing and accruing rewards", async () => {
      // reserve fund
      await staker.connect(two).deposit(parseEther(10000));
      // deposit 5 MATIC
      await staker.connect(one).deposit(parseEther(5));
      // accrue
      await submitCheckpoint(0);
      // call max withdraw
      const maxWithdrawAmount = await staker.maxWithdraw(one.address);
      // withdraw output
      await staker.connect(one).withdraw(maxWithdrawAmount);
    });

    it("fail: cannot withdraw 1 + output of maxWithdraw after depositing and accruing rewards", async () => {
      // deposit 5 MATIC
      await staker.connect(one).deposit(parseEther(5));
      // accrue
      await submitCheckpoint(0);
      // call max withdraw
      const maxWithdrawAmount = await staker.maxWithdraw(one.address);
      // withdraw output
      await expect(
        staker.connect(one).withdraw(maxWithdrawAmount.add(1))
      ).to.be.revertedWithCustomError(staker, "WithdrawalAmountTooLarge");
    });

    it("preview functions circular check", async () => {
      // issue:
      // - in max withdraw, balanceOf is turned into MATIC
      // - in withdraw, amount is turned into TruMATIC
      // - this amount is larger than the original balanceOf amount

      await staker.connect(one).deposit(parseEther(1e4));

      for(let i = 0; i<5; i++){
        await submitCheckpoint(i);
        const shareAmt = parseEther(1234); // in TruMATIC
        const maticAmt = await staker.previewRedeem(shareAmt); // assets you'd get if you redeemed shares
        const newShareAmt = await staker.previewWithdraw(maticAmt) // shares you'd get if you withdrew assets

        expect(shareAmt).to.be.approximately(newShareAmt, 1); // off by 1 due to rounding up in previewRedeem
      }
    });

  });

  describe("TruMATIC token: getters + metadata", async () => {
    it("name", async () => {
      expect(await staker.name()).to.equal(constants.NAME);
    });

    it("symbol", async () => {
      expect(await staker.symbol()).to.equal(constants.SYMBOL);
    });
  });

  describe("Validators", async () => {

    describe("getValidators", async () => {
      it("includes the validator address", async () => {
        expect(await staker.getValidators()).includes(validatorShare.address);
      });
    });

    describe("getAllValidators", async () => {
      it("gets all validators, whether they are active, and the amount staked", async () => {

        const secondValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
        const secondValidatorStake = parseEther(222);
        secondValidator.getTotalStake.returns([secondValidatorStake, 1]);

        const thirdValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
        const thirdValidatorStake = parseEther(0);
        thirdValidator.getTotalStake.returns([thirdValidatorStake, 1]);

        await staker.addValidator(secondValidator.address, false);
        await staker.addValidator(thirdValidator.address, true);
        await staker.disableValidator(thirdValidator.address);

        expect(await staker.connect(one).getAllValidators()).to.deep.equal([
          [constants.VALIDATOR_STATE.ENABLED, 0, validatorShare.address, false],
          [constants.VALIDATOR_STATE.ENABLED, secondValidatorStake.toString(), secondValidator.address, false],
          [constants.VALIDATOR_STATE.DISABLED, thirdValidatorStake.toString(), thirdValidator.address, true],
        ])
      });
    });

    describe("getUserValidators", async () => {
      let validator, privateValidator, anotherPrivateValidator;

      beforeEach(async () => {
        // user one has no private validator access and deposits 10000 MATIC to a non-private validator
        validator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
        await staker.connect(deployer).addValidator(validator.address, false);
        expect((await staker.validators(validator.address)).isPrivate).is.false

        expect(await staker.usersPrivateAccess(one.address)).is.equal(ethers.constants.AddressZero);
        validator.buyVoucher.returns(parseEther(10000));
        await staker.connect(one).depositToSpecificValidator(parseEther(10000), validator.address);

        // user two has private access to privateValidator and deposits 20000 MATIC to it
        privateValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
        await staker.connect(deployer).addValidator(privateValidator.address, true);
        expect((await staker.validators(privateValidator.address)).isPrivate).is.true

        await staker.connect(deployer).givePrivateAccess(two.address, privateValidator.address);
        expect(await staker.usersPrivateAccess(two.address)).is.equal(privateValidator.address);
        privateValidator.buyVoucher.returns(parseEther(20000));
        await staker.connect(two).depositToSpecificValidator(parseEther(20000), privateValidator.address);

        // user three has private access to anotherPrivateValidator and deposits 30000 MATIC to it
        anotherPrivateValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
        await staker.connect(deployer).addValidator(anotherPrivateValidator.address, true);
        expect((await staker.validators(anotherPrivateValidator.address)).isPrivate).is.true

        await staker.connect(deployer).givePrivateAccess(three.address, anotherPrivateValidator.address);
        expect(await staker.usersPrivateAccess(three.address)).is.equal(anotherPrivateValidator.address);
        anotherPrivateValidator.buyVoucher.returns(parseEther(30000));
        await staker.connect(three).depositToSpecificValidator(parseEther(30000), anotherPrivateValidator.address);
      });

      describe("user with non-private access", () => {
        it("gets all non-private validators", async () => {
          expect(await staker.connect(one).getUserValidators(one.address)).to.deep.equal([
            [constants.VALIDATOR_STATE.ENABLED, parseEther(0).toString(), validatorShare.address, false],
            [constants.VALIDATOR_STATE.ENABLED, parseEther(10000).toString(), validator.address, false],
          ])
        });
      });

      describe("users with private access", () => {
        it("get their own private validator", async () => {
          expect(await staker.connect(one).getUserValidators(two.address)).to.deep.equal([
            [constants.VALIDATOR_STATE.ENABLED, parseEther(20000).toString(), privateValidator.address, true],
          ])
          expect(await staker.connect(one).getUserValidators(three.address)).to.deep.equal([
            [constants.VALIDATOR_STATE.ENABLED, parseEther(30000).toString(), anotherPrivateValidator.address, true],
          ])
        });
      });

      describe("zero address", () => {
        it("gets all non-private validators", async () => {
          expect(await staker.connect(one).getUserValidators(ethers.constants.AddressZero)).to.deep.equal([
            [constants.VALIDATOR_STATE.ENABLED, parseEther(0).toString(), validatorShare.address, false],
            [constants.VALIDATOR_STATE.ENABLED, parseEther(10000).toString(), validator.address, false],
          ])
        });
      });
    });
  });

  describe("Validator Access", () => {
    let deployer, one, staker, validator, privateValidator;

    beforeEach(async () => {
      ({ deployer, one, two, staker } = await loadFixture(deployment));

      // add a non private validator
      validator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
      await staker.connect(deployer).addValidator(validator.address, false);

      // add a private validator
      privateValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
      await staker.connect(deployer).addValidator(privateValidator.address, true);
    });

    describe("canAccessValidator", () => {
      describe("checks", () => {
        it("reverts with a zero user address", async () => {
          await expect(
            staker.canAccessValidator(ethers.constants.AddressZero, validator.address)
          ).to.be.revertedWithCustomError(staker, "ZeroAddressNotSupported");
        });

        it("reverts with a zero validator address", async () => {
          await expect(
            staker.canAccessValidator(one.address, ethers.constants.AddressZero)
          ).to.be.revertedWithCustomError(staker, "ZeroAddressNotSupported");
        });

        it("reverts if a validator does not exist", async () => {
          await expect(
            staker.canAccessValidator(one.address, two.address)
          ).to.be.revertedWithCustomError(staker, "ValidatorDoesNotExist");
        });
      });

      describe("non-private user", () => {
        beforeEach(async () => {
          expect((await staker.validators(validator.address)).isPrivate).is.false
          expect((await staker.validators(privateValidator.address)).isPrivate).is.true
          expect(await staker.usersPrivateAccess(one.address)).is.equal(ethers.constants.AddressZero);
        });

        it("returns true when validator is non-private", async () => {
          expect(await staker.canAccessValidator(one.address, validator.address)).is.true;
        });

        it("returns false when validator is private", async () => {
          expect(await staker.canAccessValidator(one.address, privateValidator.address)).is.false
        });
      });

      describe("private user", () => {
        beforeEach(async () => {
          expect((await staker.validators(validator.address)).isPrivate).is.false
          expect((await staker.validators(privateValidator.address)).isPrivate).is.true

          await staker.connect(deployer).givePrivateAccess(one.address, privateValidator.address);
          expect(await staker.usersPrivateAccess(one.address)).is.equal(privateValidator.address);
        });

        it("returns true when private to the same validator", async () => {
          expect(await staker.canAccessValidator(one.address, privateValidator.address)).to.equal(true);
        });

        it("returns false when private to a different validator", async () => {
          expect(await staker.canAccessValidator(one.address, validator.address)).to.equal(false);
        });
      });
    });
  });
});

// todo: write some tests which fail without the magic number
