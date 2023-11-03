import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { deployment } from "../helpers/fixture";
import { parseEther } from "../helpers/math";
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("ERC-4626", () => {
  // Accounts
  let depositor, receiver, staker, MATIC, deployer;

  // Test constants
  const DEPOSIT = parseEther(5000);
  const SHARES = parseEther(4000);
  const WITHDRAWAL = parseEther(500);
  const REDEMPTION = parseEther(2000);
  const ALLOCATION = parseEther(100);

  beforeEach(async () => {
    ({ one: depositor, two: receiver, staker, token: MATIC, deployer } = await loadFixture(deployment));
  });

  describe("deposit", () => {
    // Standard specifies the deposit call must "revert if all of assets cannot be deposited"
    it("should revert if receiver is not caller ", async () => {
      await expect(staker.connect(depositor).deposit(DEPOSIT, receiver.address)).to.be.revertedWithCustomError(
        staker,
        "SenderAndOwnerMustBeReceiver"
      );
    });

    it("should mint fresh shares to depositor", async () => {
      // deposit
      await staker.connect(depositor).deposit(DEPOSIT, depositor.address);

      // Shares minted at a price of one, so number of shares minted equals DEPOSIT
      expect(await staker.totalSupply()).to.equal(DEPOSIT);

      // Check depositor owns ALL minted shares
      expect(await staker.balanceOf(depositor.address)).to.equal(DEPOSIT);
    });

    // Skipped due to issue #121
    it.skip("should increase vault assets by deposited MATIC", async () => {
      const initialDepositorMATICBalance = await MATIC.balanceOf(depositor.address);

      // deposit
      await staker.connect(depositor).deposit(DEPOSIT, depositor.address);

      const finalDepositorMATICBalance = await MATIC.balanceOf(depositor.address);

      // Check assets in vault equal to MATIC sent to vault
      expect(await staker.totalAssets()).to.equal(initialDepositorMATICBalance.sub(finalDepositorMATICBalance));
    });

    it("should emit 'Deposit' event", async () => {
      await expect(staker.connect(depositor).deposit(DEPOSIT, depositor.address))
        .to.emit(staker, "Deposit")
        .withArgs(depositor.address, depositor.address, DEPOSIT, anyValue);
    });
  });

  describe("mint", () => {
    it("should revert if receiver is not caller ", async () => {
      await expect(staker.connect(depositor).mint(DEPOSIT, receiver.address)).to.be.revertedWithCustomError(
        staker,
        "SenderAndOwnerMustBeReceiver"
      );
    });

    it("should mint fresh shares to depositor", async () => {
      await staker.connect(depositor).mint(SHARES, depositor.address);

      // Check total supply equal to deposit
      expect(await staker.totalSupply()).to.equal(SHARES);

      // Check depositor owns minted shares
      expect(await staker.balanceOf(depositor.address)).to.equal(SHARES);
    });

    it("should emit 'Deposit' event", async () => {
      await expect(staker.connect(depositor).mint(SHARES, depositor.address))
        .to.emit(staker, "Deposit")
        .withArgs(depositor.address, depositor.address, anyValue, SHARES);
    });
  });

  describe("withdraw", () => {
    beforeEach(async () => {
      // Deposit at a share price of one
      await staker.connect(depositor).deposit(DEPOSIT, depositor.address);
    });

    it("should burn shares from withdrawer", async () => {
      // Check withdrawn shares are burned
      await expect(
        staker.connect(depositor).withdraw(WITHDRAWAL, depositor.address, depositor.address)
      ).to.changeTokenBalance(staker, depositor, WITHDRAWAL.mul(-1));
    });

    it("should emit 'Withdraw' event", async () => {
      await expect(staker.connect(depositor).withdraw(WITHDRAWAL, depositor.address, depositor.address))
        .to.emit(staker, "Withdraw")
        .withArgs(depositor.address, depositor.address, depositor.address, anyValue, WITHDRAWAL);
    });
  });

  describe("redeem", () => {
    beforeEach(async () => {
      // Deposit at a share price of one
      await staker.connect(depositor).deposit(DEPOSIT, depositor.address);
    });

    // Standard specifies the redeem call must "revert if all of shares cannot be redeemed"
    it("should revert if receiver is not caller", async () => {
      await expect(
        staker.connect(depositor).redeem(REDEMPTION, depositor.address, receiver.address)
      ).to.be.revertedWithCustomError(staker, "SenderAndOwnerMustBeReceiver");
    });

    it("should burn redeemed shares from redeemer's balance", async () => {
      await expect(
        staker.connect(depositor).redeem(REDEMPTION, depositor.address, depositor.address)
      ).to.changeTokenBalance(staker, depositor, REDEMPTION.mul(-1));
    });
  });

  describe("maxRedeem", () => {
    it("should reduce maximum share redepmtion by strictly allocated amount", async () => {
      await staker.connect(deployer).setAllowStrict(true);

      // Deposit
      await staker.connect(depositor).deposit(DEPOSIT, depositor.address);

      // Strictly allocate to receiver
      await staker.connect(depositor).allocate(ALLOCATION, receiver.address, true);

      // Check maxRedeem is half of deposit
      expect(await staker.maxRedeem(depositor.address)).to.equal(DEPOSIT.sub(ALLOCATION));
    });

    it("should not reduce maximum share redemption by loosely allocated amount", async () => {
      // Deposit
      await staker.connect(depositor).deposit(DEPOSIT, depositor.address);

      // Strictly allocate to receiver
      await staker.connect(depositor).allocate(ALLOCATION, receiver.address, false);

      // Check maxRedeem is half of deposit
      expect(await staker.maxRedeem(depositor.address)).to.equal(DEPOSIT);
    });
  });
});
