/** Testing claiming withdrawals from the TruStakeMATIC vault. */

import { AddressZero } from "@ethersproject/constants";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { deployment } from "../helpers/fixture";
import { parseEther } from "../helpers/math";
import { advanceEpochs } from "../helpers/state-interaction";

describe("WITHDRAW CLAIM", () => {
  let one, two, token, stakeManager, staker;

  beforeEach(async () => {
    // reset to fixture
    ({ one, two, token, stakeManager, staker } = await loadFixture(deployment));
  });

  describe("User: withdrawClaim", async () => {
    let unbondNonce;

    beforeEach(async () => {
      // deposit
      await staker.connect(one).deposit(parseEther(10000), one.address);

      // initate withdrawal with user one
      await staker.connect(one).withdraw(parseEther(3000), one.address, one.address);

      // set unbondNonce
      unbondNonce = await staker.getUnbondNonce();
    });

    it("try claiming withdrawal requested by different user", async () => {
      // setup for epoch helper cher
      let epoch = await staker.getCurrentEpoch();

      // advance by 100 epochs
      await advanceEpochs(stakeManager, 100);

      // check epoch advancing helper is working correctly
      expect(await staker.getCurrentEpoch()).to.equal(epoch.add(100));

      // try claiming with user two
      await expect(staker.connect(two).withdrawClaim(unbondNonce)).to.be.revertedWithCustomError(
        staker,
        "SenderMustHaveInitiatedWithdrawalRequest"
      );

      // unbondingWithdrawals mapping non-removal check
      let [usr, amt] = await staker.unbondingWithdrawals(unbondNonce);
      expect(usr).to.equal(one.address);
      expect(amt).to.equal(parseEther(3000));
    });

    it("try claiming withdrawal requested 79 epochs ago", async () => {
      // advance by 79 epochs
      await advanceEpochs(stakeManager, 79);

      // test isClaimable returns false before 80 epochs have passed
      expect(await staker.isClaimable(unbondNonce)).to.equal(false);

      // try claiming with user one
      await expect(staker.connect(one).withdrawClaim(unbondNonce)).to.be.revertedWith("Incomplete withdrawal period");

      // unbondingWithdrawals mapping non-removal check
      let [usr, amt] = await staker.unbondingWithdrawals(unbondNonce);
      expect(usr).to.equal(one.address);
      expect(amt).to.equal(parseEther(3000));
    });

    it("try claiming withdrawal with unbond nonce that doesn't exist", async () => {
      // advance by 100 epochs
      await advanceEpochs(stakeManager, 100);

      // try claiming _unbondNonce = unbondNonce + 1 with user one
      await expect(staker.connect(one).withdrawClaim(unbondNonce + 1)).to.be.revertedWithCustomError(
        staker,
        "SenderMustHaveInitiatedWithdrawalRequest"
      );
    });

    it("try claiming already claimed withdrawal", async () => {
      // advance by 100 epochs
      await advanceEpochs(stakeManager, 100);

      // claim with user one
      await staker.connect(one).withdrawClaim(unbondNonce);

      // try claiming with user one
      await expect(staker.connect(one).withdrawClaim(unbondNonce)).to.be.revertedWithCustomError(
        staker,
        "SenderMustHaveInitiatedWithdrawalRequest"
      );
    });

    it("successfully claim withdrawal requested 80 epochs ago with expected changes in state and balances", async () => {
      // advance by 80 epochs
      await advanceEpochs(stakeManager, 80);

      // check state + balances

      // get withdrawal info
      let [, amount] = await staker.unbondingWithdrawals(unbondNonce);
      // staker balance should equal zero
      expect(await token.balanceOf(staker.address)).to.equal(0);
      // save validatorShare and user balances
      let stakeManagerBalance = await token.balanceOf(stakeManager.address);
      let userBalance = await token.balanceOf(one.address);

      // test isClaimable returns true after 80 epochs
      expect(await staker.isClaimable(unbondNonce)).to.equal(true);

      // claim with user one
      await staker.connect(one).withdrawClaim(unbondNonce);

      // test isClaimable returns false once an unbond nonce has been claimed
      expect(await staker.isClaimable(unbondNonce)).to.equal(false);

      // check state + balances

      // staker balance should equal zero
      expect(await token.balanceOf(staker.address)).to.equal(0);
      // validatorShare balance should have gone down by withdrawal amount
      expect(await token.balanceOf(stakeManager.address)).to.equal(stakeManagerBalance.sub(amount));
      // user one balance should have gone up by withdrawal amount
      expect(await token.balanceOf(one.address)).to.equal(userBalance.add(amount));

      // unbondingWithdrawals mapping removal check
      let [usr, amt] = await staker.unbondingWithdrawals(unbondNonce);
      expect(usr).to.equal(AddressZero);
      expect(amt).to.equal(0);
    });
  });

  describe("User: claimList", async () => {
    let n1, n2, n3, n4;

    beforeEach(async () => {
      // initiate four requests, with nonces n1, n2, n3, n4
      // each 10 epochs apart

      // deposit 1M MATIC
      await staker.connect(one)["deposit(uint256,address)"](parseEther(1e6), one.address);
      await staker.connect(two)["deposit(uint256,address)"](parseEther(1e6), two.address);

      // initiate withdrawals, inc. epoch between each
      await staker.connect(one).withdraw(parseEther(10_000), one.address, one.address); // n1
      await advanceEpochs(stakeManager, 10);
      await staker.connect(one).withdraw(parseEther(1_000), one.address, one.address); // n1
      await advanceEpochs(stakeManager, 10);
      await staker.connect(one).withdraw(parseEther(100_000), one.address, one.address); // n1
      await advanceEpochs(stakeManager, 10);
      await staker.connect(two).withdraw(parseEther(10_000), two.address, two.address); // n1

      // save unbond nonces for tests
      n4 = await staker.getUnbondNonce();
      n3 = n4.sub(1);
      n2 = n3.sub(1);
      n1 = n2.sub(1);
    });

    it("try to claim test unbonds when one has not matured", async () => {
      // advance epochs till n2 has matured
      await advanceEpochs(stakeManager, 60);

      // n1, n2, n3
      await expect(staker.connect(one).claimList([n1, n2, n3])).to.be.revertedWith("Incomplete withdrawal period");
    });

    it("try to claim test unbonds when one has already been claimed", async () => {
      // advance epochs till n3 has matured
      await advanceEpochs(stakeManager, 70);

      // claim n1
      await staker.connect(one).withdrawClaim(n1);

      // n1, n2, n3
      await expect(staker.connect(one).claimList([n1, n2, n3])).to.be.revertedWithCustomError(
        staker,
        "SenderMustHaveInitiatedWithdrawalRequest"
      );
    });

    it("try to claim test unbonds when one has a different user", async () => {
      // advance epochs till n4 has matured
      await advanceEpochs(stakeManager, 80);

      // n2, n3, n4
      await expect(staker.connect(one).claimList([n2, n3, n4])).to.be.revertedWithCustomError(
        staker,
        "SenderMustHaveInitiatedWithdrawalRequest"
      );
    });

    it("successfully claim three test unbonds consecutively", async () => {
      // advance epochs till n3 has matured
      await advanceEpochs(stakeManager, 70);

      // n1, n2, n3
      await staker.connect(one).claimList([n1, n2, n3]);

      // checks
      let usr, amt;
      // n1
      [usr, amt] = await staker.unbondingWithdrawals(n1);
      expect(usr).to.equal(AddressZero);
      expect(amt).to.equal(0);
      // n2
      [usr, amt] = await staker.unbondingWithdrawals(n2);
      expect(usr).to.equal(AddressZero);
      expect(amt).to.equal(0);
      // n3
      [usr, amt] = await staker.unbondingWithdrawals(n3);
      expect(usr).to.equal(AddressZero);
      expect(amt).to.equal(0);
      // n4
      [usr, amt] = await staker.unbondingWithdrawals(n4);
      expect(usr).to.equal(two.address);
      expect(amt).to.be.greaterThan(0);
    });

    it("successfully claim two of three test unbonds inconsecutively", async () => {
      // advance epochs till n3 has matured
      await advanceEpochs(stakeManager, 70);

      // n3, n1
      await staker.connect(one).claimList([n3, n1]);

      // checks
      let usr, amt;
      // n1
      [usr, amt] = await staker.unbondingWithdrawals(n1);
      expect(usr).to.equal(AddressZero);
      expect(amt).to.equal(0);
      // n2
      [usr, amt] = await staker.unbondingWithdrawals(n2);
      expect(usr).to.equal(one.address);
      expect(amt).to.be.greaterThan(0);
      // n3
      [usr, amt] = await staker.unbondingWithdrawals(n3);
      expect(usr).to.equal(AddressZero);
      expect(amt).to.equal(0);
      // n4
      [usr, amt] = await staker.unbondingWithdrawals(n4);
      expect(usr).to.equal(two.address);
      expect(amt).to.be.greaterThan(0);
    });

    it("successfully claim just one withdrawal", async () => {
      // advance epochs till n1 has matured
      await advanceEpochs(stakeManager, 50);

      // n1
      await staker.connect(one).claimList([n1]);

      // checks
      let usr, amt;
      // n1
      [usr, amt] = await staker.unbondingWithdrawals(n1);
      expect(usr).to.equal(AddressZero);
      expect(amt).to.equal(0);
      // n2
      [usr, amt] = await staker.unbondingWithdrawals(n2);
      expect(usr).to.equal(one.address);
      expect(amt).to.be.greaterThan(0);
      // n3
      [usr, amt] = await staker.unbondingWithdrawals(n3);
      expect(usr).to.equal(one.address);
      expect(amt).to.be.greaterThan(0);
      // n4
      [usr, amt] = await staker.unbondingWithdrawals(n4);
      expect(usr).to.equal(two.address);
      expect(amt).to.be.greaterThan(0);
    });
  });
});
