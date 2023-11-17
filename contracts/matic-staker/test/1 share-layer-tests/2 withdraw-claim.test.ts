/** Testing claiming withdrawals from the TruStakeMATIC vault. */

import { AddressZero } from "@ethersproject/constants";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import * as constants from "../helpers/constants";
import { deployment } from "../helpers/fixture";
import { parseEther } from "../helpers/math";
import { advanceEpochs } from "../helpers/state-interaction";
import { smock } from '@defi-wonderland/smock';

describe("WITHDRAW CLAIM", () => {
  let one, two, nonWhitelistedUser, token, stakeManager, staker, validatorShare, validatorShare2, deployer;

  beforeEach(async () => {
    // reset to fixture
    ({ one, two, nonWhitelistedUser, token, stakeManager, staker, validatorShare, validatorShare2, deployer } = await loadFixture(deployment));
  });

  describe("User: withdrawClaim", async () => {
    let unbondNonce;

    beforeEach(async () => {
      // deposit
      await staker.connect(one).deposit(parseEther(10000), one.address);

      // initate withdrawal with user one
      await staker.connect(one).withdraw(parseEther(3000), one.address, one.address);

      // set unbondNonce
      unbondNonce = await staker.getUnbondNonce(validatorShare.address);
    });

    it("try claiming withdrawal requested by different user", async () => {
      // setup for epoch helper cher
      let epoch = await staker.getCurrentEpoch();

      // advance by 100 epochs
      await advanceEpochs(stakeManager, 100);

      // check epoch advancing helper is working correctly
      expect(await staker.getCurrentEpoch()).to.equal(epoch.add(100));

      // try claiming with user two
      await expect(staker.connect(two).withdrawClaim(unbondNonce, validatorShare.address)).to.be.revertedWithCustomError(
        staker,
        "SenderMustHaveInitiatedWithdrawalRequest"
      );

      // withdrawals mapping non-removal check
      let [usr, amt] = await staker.withdrawals(validatorShare.address, unbondNonce);
      expect(usr).to.equal(one.address);
      expect(amt).to.equal(parseEther(3000));
    });

    it("try claiming pre-upgrade withdrawal requested by different user", async () => {
      // use old validator address
      let oldValidator = "0xeA077b10A0eD33e4F68Edb2655C18FDA38F84712";

      // mock staker contract and add a withdrawal to the old mapping for user 1
      const stakerContractFactory = await smock.mock('TruStakeMATICv2');
      const newStaker = await stakerContractFactory.deploy();
      await newStaker.setVariable('unbondingWithdrawals', {
        1: { user: one.address, amount: parseEther(123)}
      });

      // mock whitelist for onlyWhitelist modifier
      let whitelist = await smock.fake(constants.WHITELIST_ABI);
      whitelist.isUserWhitelisted.returns(true);
      await newStaker.setVariable('whitelistAddress', whitelist.address);

      // claim with user two
      await expect(newStaker.connect(two).withdrawClaim(1, oldValidator)).to.be.revertedWithCustomError(staker, "SenderMustHaveInitiatedWithdrawalRequest");
    });


    it("try claiming withdrawal requested 79 epochs ago", async () => {
      // advance by 79 epochs
      await advanceEpochs(stakeManager, 79);

      // test isClaimable returns false before 80 epochs have passed
      expect(await staker.isClaimable(unbondNonce, validatorShare.address)).to.equal(false);

      // try claiming with user one
      await expect(staker.connect(one).withdrawClaim(unbondNonce, validatorShare.address)).to.be.revertedWith("Incomplete withdrawal period");

      // withdrawals mapping non-removal check
      let [usr, amt] = await staker.withdrawals(validatorShare.address, unbondNonce);
      expect(usr).to.equal(one.address);
      expect(amt).to.equal(parseEther(3000));
    });

    it("try claiming withdrawal with unbond nonce that doesn't exist", async () => {
      // advance by 100 epochs
      await advanceEpochs(stakeManager, 100);

      // try claiming _unbondNonce = unbondNonce + 1 with user one
      await expect(staker.connect(one).withdrawClaim(unbondNonce + 1, validatorShare.address)).to.be.revertedWithCustomError(
        staker,
        "WithdrawClaimNonExistent"
      );
    });

    it("try claiming already claimed withdrawal", async () => {
      // advance by 100 epochs
      await advanceEpochs(stakeManager, 100);

      // claim with user one
      await staker.connect(one).withdrawClaim(unbondNonce, validatorShare.address);

      // try claiming with user one
      await expect(staker.connect(one).withdrawClaim(unbondNonce, validatorShare.address)).to.be.revertedWithCustomError(
        staker,
        "WithdrawClaimNonExistent"
      );
    });

    it("try claiming withdrawal as non-whitelisted user", async () => {
      // try claiming with a non-whitelisted user
      await expect(staker.connect(nonWhitelistedUser).withdrawClaim(unbondNonce, validatorShare.address)).to.be.revertedWithCustomError(
        staker,
        "UserNotWhitelisted"
      );
    });

    it("claim withdrawal requested 80 epochs ago with expected changes in state and balances", async () => {
      // advance by 80 epochs
      await advanceEpochs(stakeManager, 80);

      // check state + balances

      // get withdrawal info
      let [, amount] = await staker.withdrawals(validatorShare.address, unbondNonce);
      // staker balance should equal zero
      expect(await token.balanceOf(staker.address)).to.equal(0);
      // save validatorShare and user balances
      let stakeManagerBalance = await token.balanceOf(stakeManager.address);
      let userBalance = await token.balanceOf(one.address);

      // test isClaimable returns true after 80 epochs
      expect(await staker.isClaimable(unbondNonce, validatorShare.address)).to.equal(true);

      // claim with user one
      await staker.connect(one).withdrawClaim(unbondNonce, validatorShare.address);

      // test isClaimable returns false once an unbond nonce has been claimed
      expect(await staker.isClaimable(unbondNonce, validatorShare.address)).to.equal(false);

      // check state + balances

      // staker balance should equal zero
      expect(await token.balanceOf(staker.address)).to.equal(0);
      // validatorShare balance should have gone down by withdrawal amount
      expect(await token.balanceOf(stakeManager.address)).to.equal(stakeManagerBalance.sub(amount));
      // user one balance should have gone up by withdrawal amount
      expect(await token.balanceOf(one.address)).to.equal(userBalance.add(amount));

      // withdrawals mapping removal check
      let [usr, amt] = await staker.withdrawals(validatorShare.address, unbondNonce);
      expect(usr).to.equal(AddressZero);
      expect(amt).to.equal(0);
    });

    it("claim withdrawal requested from a specific validator 80 epochs ago", async () => {
       // deposit and initiate withdrawal with user two
       await staker.connect(two).deposit(parseEther(3000), two.address);
       await staker.connect(two).withdrawFromSpecificValidator(parseEther(3000), validatorShare.address);

       // set unbondNonce
      unbondNonce = await staker.getUnbondNonce(validatorShare.address);

      // advance by 80 epochs
      await advanceEpochs(stakeManager, 80);

      // check state + balances

      // get withdrawal info
      let [, amount] = await staker.withdrawals(validatorShare.address, unbondNonce);
      // staker balance should equal zero
      expect(await token.balanceOf(staker.address)).to.equal(0);
      // save validatorShare and user balances
      let stakeManagerBalance = await token.balanceOf(stakeManager.address);
      let userBalance = await token.balanceOf(two.address);

      // test isClaimable returns true after 80 epochs
      expect(await staker.isClaimable(unbondNonce, validatorShare.address)).to.equal(true);

      // claim with user two
      await staker.connect(two).withdrawClaim(unbondNonce, validatorShare.address);

      // test isClaimable returns false once an unbond nonce has been claimed
      expect(await staker.isClaimable(unbondNonce, validatorShare.address)).to.equal(false);

      // check state + balances

      // staker balance should equal zero
      expect(await token.balanceOf(staker.address)).to.equal(0);
      // validatorShare balance should have gone down by withdrawal amount
      expect(await token.balanceOf(stakeManager.address)).to.equal(stakeManagerBalance.sub(amount));
      // user one balance should have gone up by withdrawal amount
      expect(await token.balanceOf(two.address)).to.equal(userBalance.add(amount));

      // withdrawals mapping removal check
      let [usr, amt] = await staker.withdrawals(validatorShare.address, unbondNonce);
      expect(usr).to.equal(AddressZero);
      expect(amt).to.equal(0);
    });

    it("claim withdrawal from a different validator than was deposited into", async () => {
      // add a new validator
      await staker.connect(deployer).addValidator(validatorShare2.address);
      // deposit into the new validator with user two
      await staker.connect(two).depositToSpecificValidator(parseEther(10000), validatorShare2.address);

      // make a withdraw claim from the new validator with user one
      await staker.connect(one).withdrawFromSpecificValidator(parseEther(5000), validatorShare2.address);
      unbondNonce = await staker.getUnbondNonce(validatorShare2.address);

      // advance by 80 epochs
      await advanceEpochs(stakeManager, 80);

      // check state + balances
      // get withdrawal info
      let [, amount] = await staker.withdrawals(validatorShare2.address, unbondNonce);

      // staker balance should equal zero
      expect(await token.balanceOf(staker.address)).to.equal(0);

      // save validatorShare and user balances
      let stakeManagerBalance = await token.balanceOf(stakeManager.address);
      let userBalance = await token.balanceOf(one.address);

      // test isClaimable returns true after 80 epochs
      expect(await staker.isClaimable(unbondNonce, validatorShare2.address)).to.equal(true);

      // claim with user one
      await staker.connect(one).withdrawClaim(unbondNonce, validatorShare2.address);

      // test isClaimable returns false once an unbond nonce has been claimed
      expect(await staker.isClaimable(unbondNonce, validatorShare2.address)).to.equal(false);

      // check state + balances

      // staker balance should equal zero
      expect(await token.balanceOf(staker.address)).to.equal(0);
      // validatorShare balance should have gone down by withdrawal amount
      expect(await token.balanceOf(stakeManager.address)).to.equal(stakeManagerBalance.sub(amount));
      // user one balance should have gone up by withdrawal amount
      expect(await token.balanceOf(one.address)).to.equal(userBalance.add(amount));

      // withdrawals mapping removal check
      let [usr, amt] = await staker.withdrawals(validatorShare2.address, unbondNonce);
      expect(usr).to.equal(AddressZero);
      expect(amt).to.equal(0);
    });

    it("updates validator struct post withdrawal claim", async () => {
      // advance by 80 epochs
      await advanceEpochs(stakeManager, 80);

      // claim with user one
      await staker.connect(one).withdrawClaim(unbondNonce, validatorShare.address);

      // expect amountStaked on validator to decrease by amount claimed
      expect(await staker.connect(one).getAllValidators()).to.deep.equal([
        [constants.VALIDATOR_STATE.ENABLED, parseEther(7000), validatorShare.address]])
    });
  });

  describe("User: claimList", async () => {
    let n1, n2, n3, n4;

    beforeEach(async () => {
      // initiate four requests, with nonces n1, n2, n3, n4
      // each 10 epochs apart

      // deposit 1M MATIC
      await staker.connect(one).deposit(parseEther(1e6), one.address);
      await staker.connect(two).deposit(parseEther(1e6), two.address);

      // initiate withdrawals, inc. epoch between each
      await staker.connect(one).withdraw(parseEther(10_000), one.address, one.address); // n1
      await advanceEpochs(stakeManager, 10);
      await staker.connect(one).withdraw(parseEther(1_000), one.address, one.address); // n1
      await advanceEpochs(stakeManager, 10);
      await staker.connect(one).withdraw(parseEther(100_000), one.address, one.address); // n1
      await advanceEpochs(stakeManager, 10);
      await staker.connect(two).withdraw(parseEther(10_000), two.address, two.address); // n1

      // save unbond nonces for tests
      n4 = await staker.getUnbondNonce(validatorShare.address);
      n3 = n4.sub(1);
      n2 = n3.sub(1);
      n1 = n2.sub(1);
    });

    it("try to claim test unbonds when one has not matured", async () => {
      // advance epochs till n2 has matured
      await advanceEpochs(stakeManager, 60);

      // n1, n2, n3
      await expect(staker.connect(one).claimList([n1, n2, n3], validatorShare.address)).to.be.revertedWith("Incomplete withdrawal period");
    });

    it("try to claim test unbonds as a non-whitelisted user", async () => {
      // n1, n2, n3
      await expect(staker.connect(nonWhitelistedUser).claimList([n1, n2, n3], validatorShare.address)).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
    });

    it("try to claim test unbonds when one has already been claimed", async () => {
      // advance epochs till n3 has matured
      await advanceEpochs(stakeManager, 70);

      // claim n1
      await staker.connect(one).withdrawClaim(n1, validatorShare.address);

      // n1, n2, n3
      await expect(staker.connect(one).claimList([n1, n2, n3], validatorShare.address)).to.be.revertedWithCustomError(
        staker,
        "WithdrawClaimNonExistent"
      );
    });

    it("try to claim test unbonds when one has a different user", async () => {
      // advance epochs till n4 has matured
      await advanceEpochs(stakeManager, 80);

      // n2, n3, n4
      await expect(staker.connect(one).claimList([n2, n3, n4], validatorShare.address)).to.be.revertedWithCustomError(
        staker,
        "SenderMustHaveInitiatedWithdrawalRequest"
      );
    });

    it("claim three test unbonds consecutively", async () => {
      // advance epochs till n3 has matured
      await advanceEpochs(stakeManager, 70);

      // n1, n2, n3
      await staker.connect(one).claimList([n1, n2, n3], validatorShare.address);

      // checks
      let usr, amt;
      // n1
      [usr, amt] = await staker.withdrawals(validatorShare.address, n1);
      expect(usr).to.equal(AddressZero);
      expect(amt).to.equal(0);
      // n2
      [usr, amt] = await staker.withdrawals(validatorShare.address, n2);
      expect(usr).to.equal(AddressZero);
      expect(amt).to.equal(0);
      // n3
      [usr, amt] = await staker.withdrawals(validatorShare.address, n3);
      expect(usr).to.equal(AddressZero);
      expect(amt).to.equal(0);
      // n4
      [usr, amt] = await staker.withdrawals(validatorShare.address, n4);
      expect(usr).to.equal(two.address);
      expect(amt).to.be.greaterThan(0);
    });

    it("claim two of three test unbonds inconsecutively", async () => {
      // advance epochs till n3 has matured
      await advanceEpochs(stakeManager, 70);

      // n3, n1
      await staker.connect(one).claimList([n3, n1], validatorShare.address);

      // checks
      let usr, amt;
      // n1
      [usr, amt] = await staker.withdrawals(validatorShare.address, n1);
      expect(usr).to.equal(AddressZero);
      expect(amt).to.equal(0);
      // n2
      [usr, amt] = await staker.withdrawals(validatorShare.address, n2);
      expect(usr).to.equal(one.address);
      expect(amt).to.be.greaterThan(0);
      // n3
      [usr, amt] = await staker.withdrawals(validatorShare.address, n3);
      expect(usr).to.equal(AddressZero);
      expect(amt).to.equal(0);
      // n4
      [usr, amt] = await staker.withdrawals(validatorShare.address, n4);
      expect(usr).to.equal(two.address);
      expect(amt).to.be.greaterThan(0);
    });

    it("claim just one withdrawal", async () => {
      // advance epochs till n1 has matured
      await advanceEpochs(stakeManager, 50);

      // n1
      await staker.connect(one).claimList([n1], validatorShare.address);

      // checks
      let usr, amt;
      // n1
      [usr, amt] = await staker.withdrawals(validatorShare.address, n1);
      expect(usr).to.equal(AddressZero);
      expect(amt).to.equal(0);
      // n2
      [usr, amt] = await staker.withdrawals(validatorShare.address, n2);
      expect(usr).to.equal(one.address);
      expect(amt).to.be.greaterThan(0);
      // n3
      [usr, amt] = await staker.withdrawals(validatorShare.address, n3);
      expect(usr).to.equal(one.address);
      expect(amt).to.be.greaterThan(0);
      // n4
      [usr, amt] = await staker.withdrawals(validatorShare.address, n4);
      expect(usr).to.equal(two.address);
      expect(amt).to.be.greaterThan(0);
    });
  });
});
