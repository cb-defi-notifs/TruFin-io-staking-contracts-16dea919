/** Temp file - tests will be organised into other files. */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { deployment } from "../helpers/fixture";
import {
  calculateAmountFromShares,
  calculateSharesFromAmount,
  divSharePrice,
  parseEther
} from "../helpers/math";

import { ethers, upgrades } from "hardhat";
import { advanceEpochs } from "../helpers/state-interaction";
import { EPSILON } from "../helpers/constants";

describe("ERC-4626 (TEMP)", () => {
  let treasury, one, two, staker, token, stakeManager;
  let TREASURY_INITIAL_DEPOSIT;
  beforeEach(async () => {
    // reset to fixture
    ({ treasury, one, two, staker, token, stakeManager } = await loadFixture(deployment));
    TREASURY_INITIAL_DEPOSIT = parseEther(100);
    await staker.connect(treasury).deposit(TREASURY_INITIAL_DEPOSIT, treasury.address);
  });

  // TODO
  describe("ERC-4626: standard share exchange functions", async () => {
    // Near copies of the first original deposit/withdrawal tests + requirements checks

    it("deposit", async () => {
      // Test requirements
      await expect(
        staker
          .connect(one)
        ["deposit(uint256,address)"](parseEther(5000), two.address)
      ).to.be.revertedWithCustomError(staker, "SenderAndOwnerMustBeReceiver");

      // Perform a deposit
      await staker
        .connect(one)
      ["deposit(uint256,address)"](parseEther(5000), one.address);

      // Check vault values are as expected
      expect(await staker.totalStaked()).to.equal(parseEther(5000).add(TREASURY_INITIAL_DEPOSIT));
      expect(await staker.totalSupply()).to.equal(parseEther(5000).add(TREASURY_INITIAL_DEPOSIT));
      expect(await staker.totalRewards()).to.equal(parseEther(0));
      expect(await staker.totalAssets()).to.equal(parseEther(0));
      expect(divSharePrice(await staker.sharePrice())).to.equal(parseEther(1));

      // Check user values are as expected
      expect(await staker.balanceOf(one.address)).to.equal(parseEther(5000));
    });

    it("mint", async () => {
      // Test requirements
      await expect(
        staker.connect(one).mint(parseEther(5000), two.address)
      ).to.be.revertedWithCustomError(staker, "SenderAndOwnerMustBeReceiver");

      // Perform a deposit
      await staker.connect(one).mint(parseEther(5000), one.address);

      let shares = calculateSharesFromAmount(
        parseEther(5000),
        await staker.sharePrice()
      );

      // Check vault values are as expected
      expect(await staker.totalStaked()).to.equal(shares.add(TREASURY_INITIAL_DEPOSIT));
      expect(await staker.totalSupply()).to.equal(shares.add(TREASURY_INITIAL_DEPOSIT));
      expect(await staker.totalRewards()).to.equal(parseEther(0));
      expect(await staker.totalAssets()).to.equal(parseEther(0));
      expect(divSharePrice(await staker.sharePrice())).to.equal(parseEther(1));

      // Check user values are as expected
      expect(await staker.balanceOf(one.address)).to.equal(shares);
    });

    it("withdraw", async () => {
      // Deposit 10000 with account one
      await staker.connect(one)["deposit(uint256,address)"](parseEther(10000), one.address);

      // Test requirements
      await expect(
        staker.connect(one).withdraw(parseEther(3000), one.address, two.address)
      ).to.be.revertedWithCustomError(staker, "SenderAndOwnerMustBeReceiver");

      await expect(
        staker.connect(one).withdraw(parseEther(3000), two.address, one.address)
      ).to.be.revertedWithCustomError(staker, "SenderAndOwnerMustBeReceiver");

      // Initiate withdrawal
      await staker
        .connect(one)
        .withdraw(parseEther(3000), one.address, one.address);

      // Check vault values
      expect(await staker.totalStaked()).to.equal(parseEther(7000).add(TREASURY_INITIAL_DEPOSIT)); // should not have changed

      // Check user values
      expect(await staker.balanceOf(one.address)).to.equal(parseEther(7000));

      let unbondNonce = await staker.getUnbondNonce();
      let [user, amount] = await staker.unbondingWithdrawals(unbondNonce);
      expect(user).to.equal(one.address);
      expect(amount).to.equal(parseEther(3000));
    });

    it("pass: redeem some shares to oneself works", async () => {
      // Deposit 10000 with account one
      await staker.connect(one)["deposit(uint256,address)"](parseEther(10000), one.address);

      // Test requirements
      await expect(
        staker.connect(one).redeem(parseEther(3000), one.address, two.address)
      ).to.be.revertedWithCustomError(staker, "SenderAndOwnerMustBeReceiver");

      await expect(
        staker.connect(one).redeem(parseEther(3000), two.address, one.address)
      ).to.be.revertedWithCustomError(staker, "SenderAndOwnerMustBeReceiver");

      // Initiate withdrawal
      await staker
        .connect(one)
        .redeem(parseEther(3000), one.address, one.address);

      let shares3000 = calculateSharesFromAmount(
        parseEther(3000),
        await staker.sharePrice()
      );
      let shares7000 = calculateSharesFromAmount(
        parseEther(7000),
        await staker.sharePrice()
      );

      let sharesTreasury = calculateSharesFromAmount(TREASURY_INITIAL_DEPOSIT, await staker.sharePrice());

      // Check vault values
      expect(await staker.totalStaked()).to.equal(shares7000.add(sharesTreasury)); // should not have changed

      // Check user values
      expect(await staker.balanceOf(one.address)).to.equal(shares7000);

      let unbondNonce = await staker.getUnbondNonce();
      let [user, amount] = await staker.unbondingWithdrawals(unbondNonce);
      expect(user).to.equal(one.address);
      expect(amount).to.equal(shares3000);
    });


    it("pass: redeem entire staked balanceOf to oneself", async () => {
      // Perform a deposit
      await staker.connect(one).mint(parseEther(5000), one.address);

      // get user balance
      let balance = await staker.balanceOf(one.address);
      // get balance of user
      const userMaticBalanceBefore = await token.balanceOf(one.address);
      const userInfo = await staker.getUserInfo(one.address);
      // REDEEM 
      await staker.connect(one).redeem(balance, one.address, one.address);
      const unbondNonce = await staker.getUnbondNonce();

      // Check vault values are as expected
      expect(await staker.totalStaked()).to.equal(TREASURY_INITIAL_DEPOSIT.sub(EPSILON));
      expect(await staker.totalSupply()).to.equal((TREASURY_INITIAL_DEPOSIT));
      expect(await staker.totalRewards()).to.equal(parseEther(0));
      expect(await staker.totalAssets()).to.equal(parseEther(0));


      expect(divSharePrice(await staker.sharePrice())).to.be.closeTo(parseEther(1), EPSILON); // 0.99 now

      // Check user values are as expected
      expect(await staker.balanceOf(one.address)).to.equal(0);


      let epoch = await staker.getCurrentEpoch();
      // advance by 100 epochs
      await advanceEpochs(stakeManager, 100);

      // check epoch advancing helper is working correctly
      expect(await staker.getCurrentEpoch()).to.equal(epoch.add(100));

      // try claiming with user one
      await staker.connect(one).withdrawClaim(unbondNonce);

      // new matic balance of user in wallet should be: 
      expect(await token.balanceOf(one.address)).to.equal(userMaticBalanceBefore.add(userInfo[1]));
    });


  });
});
