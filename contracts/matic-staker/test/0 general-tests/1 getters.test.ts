/** Testing general and ERC-4626 implementation getters.
 * Written originally by TG.
 * Reformatted by PD.
 */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import * as constants from "../helpers/constants";
import { deployment } from "../helpers/fixture";
import {
  calculateAmountFromShares, calculateSharesFromAmount, parseEther
} from "../helpers/math";
import { submitCheckpoint } from "../helpers/state-interaction";

describe("GETTERS", () => {
  let one, two, staker, validatorShare;

  beforeEach(async () => {
    // reset to fixture
    ({ one, two, staker, validatorShare } = await loadFixture(deployment));
  });

  describe("ERC-4626: max functions", async () => {
    // todo: add tests for input validation

    it("maxDeposit", async () => {
      const cap = await staker.cap();

      // no deposits
      let maxDeposit = cap.sub(await staker.totalStaked());

      expect(await staker.maxDeposit(one.address)).to.equal(maxDeposit);

      // deposit 1M MATIC
      await staker.connect(one).deposit(parseEther(1e6), one.address);

      maxDeposit = cap.sub(await staker.totalStaked());

      expect(await staker.maxDeposit(one.address)).to.equal(maxDeposit);
    });

    it("maxMint", async () => {
      const cap = await staker.cap();

      // no deposits
      let maxDeposit = cap.sub(await staker.totalStaked());
      let sharePrice = await staker.sharePrice();
      let maxMint = calculateSharesFromAmount(maxDeposit, sharePrice);

      expect(await staker.maxMint(one.address)).to.equal(maxMint);

      // deposit 1M MATIC
      await staker.connect(one).deposit(parseEther(1e6), one.address);

      maxDeposit = cap.sub(await staker.totalStaked());
      sharePrice = await staker.sharePrice();
      maxMint = calculateSharesFromAmount(maxDeposit, sharePrice);

      expect(await staker.maxMint(one.address)).to.equal(maxMint);
    });

    it("maxWithdraw", async () => {
      // no deposits

      const balanceOld = await staker.balanceOf(one.address);
      const sharePriceOld = await staker.sharePrice();
      const maxWithdrawCalculatedOld = calculateAmountFromShares(balanceOld, sharePriceOld);

      expect(await staker.maxWithdraw(one.address)).to.equal(0);

      // deposit 1M MATIC
      await staker.connect(one).deposit(parseEther(1e6), one.address);

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
      await staker.connect(one).deposit(parseEther(5), one.address);
      // call max withdraw
      const maxWithdrawAmount = await staker.maxWithdraw(one.address);
      // assert greaterThan,  added along with magic number
      expect(maxWithdrawAmount).to.be.greaterThan(parseEther(5));
    });

    it("pass: withdraw output of maxWithdraw after depositing", async () => {
      // reserve fund
      await staker.connect(one).deposit(parseEther(1e4), one.address);

      // deposit 5 MATIC
      await staker.connect(two).deposit(parseEther(5), two.address);
      // call max withdraw
      const maxWithdrawAmount = await staker.maxWithdraw(two.address);
      // withdraw output
      await staker.connect(two).withdraw(maxWithdrawAmount, two.address, two.address);
    });

    it("fail: cannot withdraw 1 + output of maxWithdraw after depositing", async () => {
      // deposit 5 MATIC
      await staker.connect(one).deposit(parseEther(5), one.address);
      // call max withdraw
      const maxWithdrawAmount = await staker.maxWithdraw(one.address);
      // withdraw output
      await expect(
        staker.connect(one).withdraw(maxWithdrawAmount.add(1), one.address, one.address)
      ).to.be.revertedWithCustomError(staker, "WithdrawalAmountTooLarge");
    });

    it("pass: withdraw output of maxWithdraw after depositing and accruing rewards", async () => {
      // reserve fund
      await staker.connect(two).deposit(parseEther(10000), two.address);
      // deposit 5 MATIC
      await staker.connect(one).deposit(parseEther(5), one.address);
      // accrue
      await submitCheckpoint(0);
      // call max withdraw
      const maxWithdrawAmount = await staker.maxWithdraw(one.address);
      // withdraw output
      await staker.connect(one).withdraw(maxWithdrawAmount, one.address, one.address);
    });

    it("fail: cannot withdraw 1 + output of maxWithdraw after depositing and accruing rewards", async () => {
      // deposit 5 MATIC
      await staker.connect(one).deposit(parseEther(5), one.address);
      // accrue
      await submitCheckpoint(0);
      // call max withdraw
      const maxWithdrawAmount = await staker.maxWithdraw(one.address);
      // withdraw output
      await expect(
        staker.connect(one).withdraw(maxWithdrawAmount.add(1), one.address, one.address)
      ).to.be.revertedWithCustomError(staker, "WithdrawalAmountTooLarge");
    });

    it("maxRedeem", async () => {
      // no deposits
      const maxRedeemOld = await staker.balanceOf(one.address);

      expect(await staker.maxRedeem(one.address)).to.equal(maxRedeemOld);

      // deposit 1M MATIC
      await staker.connect(one).deposit(parseEther(1e6), one.address);

      const maxRedeemNew = await staker.balanceOf(one.address);

      expect(await staker.maxRedeem(one.address)).to.equal(maxRedeemNew);
    });

    it("preview functions circular check", async () => {
      // issue:
      // - in max withdraw, balanceOf isturned into MATIC
      // - in withdraw, amount is turned into TruMATIC
      // - this amount is larger than the original balanceOf amount

      await staker.connect(one).deposit(parseEther(1e4), one.address);

      for(let i = 0; i<5; i++){
        await submitCheckpoint(i);

        // 1
        const truMaticAmt1 = parseEther(1234); // in TruMATIC
        const maticAmt1 = await staker.previewMint(truMaticAmt1); // convertToAssets, rounds up
        const newTruMaticAmt1 = await staker.previewDeposit(maticAmt1); // convertToShares, rounds down

        expect(truMaticAmt1).to.equal(newTruMaticAmt1);

        // 2
        const maticAmt2 = parseEther(1234); // in MATIC
        const truMaticAmt2 = await staker.previewDeposit(maticAmt2); // shares you'd get if you deposited
        const newMaticAmt2 = await staker.previewRedeem(truMaticAmt2); // amt you'd get if you withdrew
        expect(maticAmt2).to.be.equal(newMaticAmt2);
      }
    });

  });

  describe("ERC-4626: getters + metadata", async () => {
    it("name", async () => {
      expect(await staker.name()).to.equal(constants.NAME);
    });

    it("symbol", async () => {
      expect(await staker.symbol()).to.equal(constants.SYMBOL);
    });
  });

  describe("Validators", async () => {
    it("getValidators", async () => {
      expect(await staker.getValidators()).includes(validatorShare.address);
    });

    it("get all validators, whether they are active, and the amount staked", async () => {
      await staker.addValidator(one.address);
      await staker.addValidator(two.address);
      await staker.disableValidator(two.address);

      expect(await staker.connect(one).getAllValidators()).to.deep.equal([
        [constants.VALIDATOR_STATE.ENABLED, 0, validatorShare.address],
        [constants.VALIDATOR_STATE.ENABLED, 0, one.address],
        [constants.VALIDATOR_STATE.DISABLED, 0, two.address],
      ])
      });
    });
  });

// todo: write some tests which fail without the magic number
