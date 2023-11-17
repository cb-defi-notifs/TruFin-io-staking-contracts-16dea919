import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { deployment } from "../helpers/fixture";
import { calculateAmountFromShares, calculateRewardsDistributed, calculateSharesFromAmount, parseEther, sharesToMATIC } from "../helpers/math";
import { submitCheckpoint } from "../helpers/state-interaction";
import { EPSILON, PHI, PHI_PRECISION } from "../helpers/constants";
import { ALL } from "dns";

describe("MULTI CHECKPOINTS", () => {
  // Accounts
  let one, two, three, four, five, nonWhitelistedUser, deployer, recipient, treasury, staker;

  // Test constants
    const ALLOCATED_AMOUNT = parseEther(10000);
    const DISTRIBUTION_IN_MATIC = false;
    const TREASURY_INITIAL_DEPOSIT = parseEther(100);

  // Set up initial test state
  beforeEach(async () => {
    ({ one, two, three, four, five, nonWhitelistedUser, deployer, treasury, staker } = await loadFixture(deployment));

    // trsy deposits
    await staker.connect(treasury).deposit(TREASURY_INITIAL_DEPOSIT, treasury.address);

    // one deposits to grant them funds for allocation
    await staker.connect(one).deposit(ALLOCATED_AMOUNT, one.address);
    await staker.connect(four).deposit(ALLOCATED_AMOUNT, four.address);
  });


  it("Lifecycle testing: Receiver correctly aggregates shares+rewards across multiple checkpoints, Depositor, receiver and treasury can withdraw max withdraw amount.",
            async () => {
    // check initial balances (MATIC)
    expect(await staker.maxWithdraw(one.address)).to.equal(ALLOCATED_AMOUNT.add(EPSILON));
    expect(await staker.maxWithdraw(two.address)).to.equal(0);
    expect(await staker.maxWithdraw(treasury.address)).to.equal(TREASURY_INITIAL_DEPOSIT.add(EPSILON));

    // check initial share balances (TruMATIC)
    let oneInitialBalance = await staker.balanceOf(one.address);
    expect(await staker.maxRedeem(one.address)).to.equal(oneInitialBalance);
    expect(await staker.maxRedeem(two.address)).to.equal(0);
    expect(await staker.maxRedeem(treasury.address)).to.equal(await staker.balanceOf(treasury.address));

    // allocate strictly
    await staker.connect(one).allocate(ALLOCATED_AMOUNT, two.address);

    // ACCRUE
    await submitCheckpoint(0);

    // BALANCES after ACCRUE

    // one (depositor) after ACCRUE
    let oneBalance = await staker.balanceOf(one.address);
    let oneUnderlyingMATIC = await sharesToMATIC(oneBalance, staker);
    let oneMATICRewards = oneUnderlyingMATIC.sub(ALLOCATED_AMOUNT);

    // treasury balance after ACCRUE
    let trsyBalance = await staker.balanceOf(treasury.address)
    let trsyUnderlyingMATIC = await sharesToMATIC(trsyBalance, staker);
    let trsyMATICRewards = trsyUnderlyingMATIC.sub(TREASURY_INITIAL_DEPOSIT);

    expect(await staker.maxRedeem(one.address)).to.equal(oneBalance);

    // receiver has not received anything yet
    expect(await staker.maxRedeem(two.address)).to.equal(0);
    expect(await staker.maxWithdraw(two.address)).to.equal(0);

    // treasury rewards increase
    expect(await staker.maxWithdraw(treasury.address)).to.closeTo(TREASURY_INITIAL_DEPOSIT.add(trsyMATICRewards).add(EPSILON), 1e0);

    // ACCRUE 2
    await submitCheckpoint(1);

    // DISTRIBUTE
    await staker.connect(one).distributeAll(DISTRIBUTION_IN_MATIC);
    const twoTruMATICbalance = await staker.maxRedeem(two.address);

    // check share balances (TruMATIC)
    expect(await staker.maxRedeem(one.address)).to.be.lessThan(oneBalance);
    expect(twoTruMATICbalance).to.be.greaterThan(0);

    // ACCRUE 3
    await submitCheckpoint(2);

    // DISTRIBUTE
    await staker.connect(one).distributeRewards(two.address, DISTRIBUTION_IN_MATIC);
    const twoTruMATICbalanceAfterAnotherAccrual = await staker.maxRedeem(two.address)
    expect(twoTruMATICbalanceAfterAnotherAccrual).to.be.greaterThan(twoTruMATICbalance);

    // ACCRUE 4
    await submitCheckpoint(3);

    // DEALLOCATE
    await staker.connect(one).deallocate(ALLOCATED_AMOUNT, two.address);
    expect(await staker.maxRedeem(two.address)).to.equal(twoTruMATICbalanceAfterAnotherAccrual);


    // receiver
    // two (receiver) balance after ACCRUE
    let twoBalance = await staker.balanceOf(two.address);
    let recipientsMATICRewards = await sharesToMATIC(twoBalance, staker);
    expect(await staker.maxWithdraw(two.address)).to.be.closeTo(recipientsMATICRewards.add(EPSILON), 1e0);

    // ACCRUE
    await submitCheckpoint(4);

    // WITHDRAW
    // withdraw one
    let oneMaxWithdraw = await staker.maxWithdraw(one.address);
    expect(oneMaxWithdraw).to.be.greaterThan(ALLOCATED_AMOUNT.add(EPSILON));
    await staker.connect(one).withdraw(oneMaxWithdraw, one.address, one.address);
    // withdraw two
    let twoMaxWithdraw = await staker.maxWithdraw(two.address);
    await staker.connect(two).withdraw(twoMaxWithdraw, two.address, two.address);

    // treasury withdrawal
    let trsyMaxWithdraw = await staker.maxWithdraw(treasury.address);
    await staker.connect(treasury).withdraw(trsyMaxWithdraw, treasury.address, treasury.address);
  });


  it("Invariant testing: allocating across two sets of users. Same workflow accross two separate user groups accrues the same amount of rewards", async () => {
    const half = ALLOCATED_AMOUNT.div(2)
    await staker.connect(one).allocate(half, two.address);
    await staker.connect(one).allocate(half, three.address);

    await staker.connect(four).allocate(half, five.address);
    await staker.connect(four).allocate(half, nonWhitelistedUser.address);

    // ACCRUE
    await submitCheckpoint(0);
    console.log("ACCRUED")
    console.log(await staker.getUserInfo(one.address))

    // DEALLOCATE + ALLOCATE
    await staker.connect(one).deallocate(half, three.address);
    await staker.connect(one).allocate(half, two.address);
    await staker.connect(four).deallocate(half, nonWhitelistedUser.address);
    await staker.connect(four).allocate(half, five.address);

    // ACCRUE
    await submitCheckpoint(1);

    // DISTRIBUTE
    await staker.connect(one).distributeAll(DISTRIBUTION_IN_MATIC);
    const twoRewards = await staker.maxWithdraw(two.address);
    await staker.connect(one).distributeAll(DISTRIBUTION_IN_MATIC);

    await staker.connect(four).distributeAll(DISTRIBUTION_IN_MATIC);
    const fiveRewards = await staker.maxWithdraw(five.address);
    await staker.connect(four).distributeAll( DISTRIBUTION_IN_MATIC);

    const oneMaxWithdraw = await staker.maxWithdraw(one.address);
    const twoMaxWithdraw = await staker.maxWithdraw(two.address);

    const fourMaxWithdraw = await staker.maxWithdraw(four.address);

    // rewards of both wotrkflows should equal
    expect(oneMaxWithdraw).to.equal(await staker.maxWithdraw(four.address));
    expect(twoMaxWithdraw).to.equal(await staker.maxWithdraw(five.address));
    expect(await staker.maxWithdraw(three.address)).to.equal(0);
    expect(await staker.maxWithdraw(nonWhitelistedUser.address)).to.equal(0);


    // first batch of rewards goes to one, is more than the second batch
    const oneRewards = oneMaxWithdraw.sub(half).sub(EPSILON);
    const fourRewards = fourMaxWithdraw.sub(half).sub(EPSILON);

    // rewards of earlier accrual step should be larger than later
    expect(oneRewards).to.be.greaterThan(twoRewards);

    // rewards of both workflows
    expect(oneRewards).to.equal(fourRewards);
  });

});
