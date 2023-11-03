/** Testing depositing into the TruStakeMATIC vault. */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import * as constants from "../helpers/constants";
import { deployment } from "../helpers/fixture";
import { divSharePrice, parseEther } from "../helpers/math";
import { submitCheckpoint } from "../helpers/state-interaction";
import { parse } from "path";

describe("DEPOSIT", () => {
  // Pre-deposit checked in "INIT" describe block

  let one, two, six, staker, stakeManager,treasury;

  beforeEach(async () => {
    // reset to fixture
    ({ one, two, six, staker, stakeManager,treasury } = await loadFixture(deployment));
    
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

  it("deposit zero matic", async () => {
    // was blocked, now should work
    await staker
      .connect(one)
    ["deposit(uint256,address)"](parseEther(0), one.address);
  });

  it("try depositing more than the cap", async () => {
    await expect(
      staker
        .connect(one)
      .deposit(
        constants.CAP.mul(110).div(100),
        one.address
      )
    ).to.be.revertedWithCustomError(staker, "DepositSurpassesVaultCap");
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
    // six == nonwhitelisted signer
    await expect(
      staker.connect(six).deposit(parseEther(1e18), six.address)
    ).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
  });

  it("unknown non-whitelist user cannot deposit to a whitelisted user's address", async () => {
    await expect(
      staker
        .connect(six)
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
});

// TODO: organise tests
