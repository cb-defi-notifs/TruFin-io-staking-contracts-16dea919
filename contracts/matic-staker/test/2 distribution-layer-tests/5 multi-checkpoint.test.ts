/** Testing strict allocation functionality in the TruStakeMATIC vault. */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { deployment } from "../helpers/fixture";
import { calculateAmountFromShares, calculateRewardsDistributed, parseEther, sharesToMATIC } from "../helpers/math";
import { submitCheckpoint } from "../helpers/state-interaction";
import { EPSILON, PHI, PHI_PRECISION } from "../helpers/constants";
import { ALL } from "dns";

describe("MULTI CHECKPOINTS", () => {
  // Accounts
  let one, two, three, four, five, six, deployer, recipient, treasury, staker;

  // Test constants
    const ALLOCATED_AMOUNT = parseEther(10000);
    const STRICTNESS = true;
    const TREASURY_INITIAL_DEPOSIT = parseEther(100);

  // Set up initial test state
  beforeEach(async () => {
    ({ one, two, three, four, five, six, deployer, treasury, staker } = await loadFixture(deployment));

    // trsy deposits
    await staker.connect(treasury).deposit(TREASURY_INITIAL_DEPOSIT, treasury.address);
    // Allow strict allocations
    await staker.connect(deployer).setAllowStrict(STRICTNESS);

    // one deposits to grant them funds for allocation
    await staker.connect(one).deposit(ALLOCATED_AMOUNT, one.address);
    await staker.connect(four).deposit(ALLOCATED_AMOUNT, four.address);
  });


  it("Lifecycle testing: Depositor amount+shares are locked as rewards accrue (strict allocations) and unlocked after deallocate, Receiver correctly aggregates shares+rewards across multiple checkpoints and after deallocate call, Depositor and receiver can withdraw max withdraw amount, treasury cannot due to epsilon",
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
    await staker.connect(one).allocate(ALLOCATED_AMOUNT, two.address, STRICTNESS);

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

    // depositor deposit_amount is locked
    expect(await staker.maxRedeem(one.address)).to.equal(0);
    expect(await staker.maxWithdraw(one.address)).to.be.equal(0);

    // receiver has not received anything yet
    expect(await staker.maxRedeem(two.address)).to.equal(0);
    expect(await staker.maxWithdraw(two.address)).to.equal(0);

    // treasury rewards increase
    expect(await staker.maxWithdraw(treasury.address)).to.closeTo(TREASURY_INITIAL_DEPOSIT.add(trsyMATICRewards).add(EPSILON), 1e0);

    // ACCRUE 2
    await submitCheckpoint(1);

    // DISTRIBUTE
    await staker.connect(two).distributeAll(one.address, STRICTNESS);
    const twoTruMATICbalance = await staker.maxRedeem(two.address); 

    // check share balances (TruMATIC), one deposit_amount still allocated, hence zero
    expect(await staker.maxRedeem(one.address)).to.equal(0);
    expect(twoTruMATICbalance).to.be.greaterThan(0);

    // ACCRUE 3
    await submitCheckpoint(2);

    // DISTRIBUTE
    await staker.distributeRewards(two.address, one.address, STRICTNESS);
    const twoTruMATICbalanceAfterAnotherAccrual = await staker.maxRedeem(two.address)
    expect(twoTruMATICbalanceAfterAnotherAccrual).to.be.greaterThan(twoTruMATICbalance);

    // ACCRUE 4
    await submitCheckpoint(3);
        
    // DEALLOCATE
    await staker.connect(one).deallocate(ALLOCATED_AMOUNT, two.address, STRICTNESS);
    expect(await staker.maxRedeem(two.address)).to.be.greaterThan(twoTruMATICbalanceAfterAnotherAccrual);


    // receiver
    // deallocate after strict allocation, distributes rewards automatically
    // hence TruMATIC balance must increase
    expect(await staker.maxRedeem(two.address)).to.be.greaterThan(twoTruMATICbalance);
    // strict allocation to two (receiver) balance after ACCRUE
    let twoBalance = await staker.balanceOf(two.address);
    let recipientsMATICRewards = await sharesToMATIC(twoBalance, staker);
    expect(await staker.maxWithdraw(two.address)).to.be.closeTo(recipientsMATICRewards.add(EPSILON), 1e0);

    // depositor
    // allocated_amount has been deallocated (unlocked)
    expect(await staker.maxWithdraw(one.address)).to.be.closeTo(ALLOCATED_AMOUNT.add(EPSILON), 1e1);

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


  it("Rewards are distributed correctly after _reallocation_ and _distribution_, reallocation after 1/2 the time is the same as having the allocation from the start: 100% to receiver, 0% rewards to depositor", async () => {
    // allocate strictly and non-strictly
    const half = ALLOCATED_AMOUNT.div(2)
    await staker.connect(one).allocate(half, two.address, true);
    await staker.connect(one).allocate(half, three.address, false);

    // ACCRUE
    await submitCheckpoint(0);

    // REALLOCATE
     // reallocate keeps the initial share price
    await staker.connect(one).reallocate(three.address, two.address);

    // ACCRUE
    await submitCheckpoint(1);

    // DISTRIBUTE 
    await staker.connect(one).distributeAll(one.address, false);
    // does not deallocate
    await staker.connect(one).distributeAll(one.address, true);

    // rewards distribution
    const oneMaxWithdraw = await staker.maxWithdraw(one.address); 
    const twoMaxWithdraw = await staker.maxWithdraw(two.address);
    expect(oneMaxWithdraw).to.be.closeTo(EPSILON.add(calculateAmountFromShares(await staker.maxRedeem(one.address), await staker.sharePrice())), 1e0);
    expect(twoMaxWithdraw).to.closeTo(EPSILON.add(calculateAmountFromShares(await staker.maxRedeem(two.address), await staker.sharePrice())), 1e0);
    expect(await staker.maxWithdraw(three.address)).to.equal(0);

    // one gets 0% of the rewards (all go to two, strict and loose)
    const oneRewards = oneMaxWithdraw.sub(half).sub(EPSILON); 
    expect(oneRewards).to.be.closeTo(0, 1e0);
  });



  it("Reallocate, deallocate a strict and a loose allocation (without calling distribute), forces distribution of rewards in case of strict. for loose it is the same as having had no allocation", async () => {
    // allocate strictly and non-strictly
    const half = ALLOCATED_AMOUNT.div(2)
    await staker.connect(one).allocate(half, two.address, true);
    await staker.connect(one).allocate(half, three.address, false);
    
    const oldSp = await staker.sharePrice()

    // ACCRUE
    await submitCheckpoint(0);

    // REALLOCATE
    await staker.connect(one).reallocate(three.address, two.address);

    // ACCRUE
    await submitCheckpoint(1);

    // DEALLOCATE
    // deallocate (without distributing rewards)
    const calculatedRewards = calculateRewardsDistributed(half,oldSp,await staker.sharePrice())
    await staker.connect(one).deallocate(half, two.address, false);
    await staker.connect(one).deallocate(half, two.address, true);
    
    // 50% rewards to depositor/one, 50% rewards to two
    const oneMaxWithdraw = await staker.maxWithdraw(one.address); 
    const twoMaxWithdraw = await staker.maxWithdraw(two.address);

    expect(oneMaxWithdraw).to.be.closeTo(EPSILON.add(calculateAmountFromShares(await staker.maxRedeem(one.address), await staker.sharePrice())), 1e0);
    expect(twoMaxWithdraw).to.be.closeTo(EPSILON.add(calculateAmountFromShares(await staker.maxRedeem(two.address), await staker.sharePrice())), 1e0);
    expect(await staker.maxWithdraw(three.address)).to.equal(0);

    //check if amount subtracted from one is amount gained by two
    expect((await staker.balanceOf(one.address)).sub(ALLOCATED_AMOUNT).mul(-1)).to.equal(await staker.balanceOf(two.address))

    const oneMATICAmount = calculateAmountFromShares(await staker.balanceOf(one.address), await staker.sharePrice())
    const twoMATICAmount = calculateAmountFromShares(await staker.balanceOf(two.address), await staker.sharePrice())
    const rewardAmount = calculateAmountFromShares(calculatedRewards,await staker.sharePrice())

    expect(twoMATICAmount).to.closeTo(rewardAmount,1e0)
    expect(oneMATICAmount.sub(ALLOCATED_AMOUNT)).to.be.closeTo(rewardAmount, 1e0);
  });


  it("Invariant testing: allocating strictly and loosely across two sets of users. Same workflow accross two separate user groups accrues the same amount of rewards ", async () => {
    // allocate strictly and non-strictly
    const half = ALLOCATED_AMOUNT.div(2)
    await staker.connect(one).allocate(half, two.address, true);
    await staker.connect(one).allocate(half, three.address, false);

    await staker.connect(four).allocate(half, five.address, true);
    await staker.connect(four).allocate(half, six.address, false);

    // ACCRUE
    await submitCheckpoint(0);
    console.log("ACCRUED")
    console.log(await staker.getUserInfo(one.address))

    // DEALLOCATE + ALLOCATE
    await staker.connect(one).deallocate(half, three.address, false);
    await staker.connect(one).allocate(half, two.address, false);
    await staker.connect(four).deallocate(half, six.address, false);
    await staker.connect(four).allocate(half, five.address, false);
   
    // ACCRUE
    await submitCheckpoint(1);

    // DISTRIBUTE
    await staker.connect(one).distributeAll(one.address, false);
    const twoLooseRewards = await staker.maxWithdraw(two.address);
    // strict rewards
    await staker.connect(one).distributeAll(one.address, true);

    await staker.connect(four).distributeAll(four.address, false);
    const fiveLooseRewards = await staker.maxWithdraw(five.address);
    // strict rewards
    await staker.connect(four).distributeAll(four.address, true);

    const oneMaxWithdraw = await staker.maxWithdraw(one.address); 
    const twoMaxWithdraw = await staker.maxWithdraw(two.address);

    const fourMaxWithdraw = await staker.maxWithdraw(four.address);

    // rewards of both wotrkflows should equal
    expect(oneMaxWithdraw).to.equal(await staker.maxWithdraw(four.address));
    expect(twoMaxWithdraw).to.equal(await staker.maxWithdraw(five.address));
    expect(await staker.maxWithdraw(three.address)).to.equal(0);
    expect(await staker.maxWithdraw(six.address)).to.equal(0);


    // first batch of loose rewards goes to one, is more than the second batch
    const oneRewards = oneMaxWithdraw.sub(half).sub(EPSILON); 
    const fourRewards = fourMaxWithdraw.sub(half).sub(EPSILON);

    // rewards of earlier accrual step should be larger than later
    expect(oneRewards).to.be.greaterThan(twoLooseRewards);
    
    // rewards of both workflows
    expect(oneRewards).to.equal(fourRewards);
  });

});
