/** Testing reward distribution in the TruStakeMATIC vault. */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { deployment } from "../helpers/fixture";
import { parseEther, sharesToMATIC } from "../helpers/math";
import { submitCheckpoint } from "../helpers/state-interaction";
import { EPSILON } from "../helpers/constants";

describe("DISTRIBUTION", () => {
  // Accounts
  let deployer, treasury, allocatorOne, recipientOne, recipientTwo, depositor, staker, whitelist, token;

  // Test constants
  const ALLOCATED_AMOUNT = parseEther(10000);

  // Set up initial test state
  beforeEach(async () => {
    ({
      one: allocatorOne,
      two: recipientOne,
      three: recipientTwo,
      four: depositor,
      deployer,
      treasury,
      staker,
      whitelist,
      token
    } = await loadFixture(deployment));

    // Deposit to staker as allocatorOne
    await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT);

    // Allocate that deposit to recipientOne as allocatorOne
    await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientOne.address);
  });

  describe("External Methods", () => {
    describe("distributeAll", async () => {
      beforeEach(async () => {
        // Deposit to staker as allocatorOne
        await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT);

        // Allocate that deposit to recipientTwo as allocatorOne
        await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientTwo.address);

      });

      describe("No rewards to distribute", async () => {
        it("No rewards distributed to recipients", async () => {
          // Double check all recipients have zero TruMATIC balance
          expect(await staker.balanceOf(recipientOne.address)).to.equal(0);
          expect(await staker.balanceOf(recipientTwo.address)).to.equal(0);

          await staker.connect(allocatorOne).distributeAll(false);

          // Check no TruMATIC rewards have been sent to any recipients
          expect(await staker.balanceOf(recipientOne.address)).to.equal(0);
          expect(await staker.balanceOf(recipientTwo.address)).to.equal(0);
        });
      });

      describe("Distribute rewards", async () => {

        beforeEach(async () => {
          // Generate vault rewards for distribution
          await submitCheckpoint(0);
        });

        it("Rewards get distributed to recipients", async () => {
          // Double check all recipients have zero TruMATIC balance
          expect(await staker.balanceOf(recipientOne.address)).to.equal(0);
          expect(await staker.balanceOf(recipientTwo.address)).to.equal(0);

          await staker.connect(allocatorOne).distributeAll(false);

          // Check TruMATIC rewards have been sent to all recipients => indicates _distributedRewards has been called for each
          expect(await staker.balanceOf(recipientOne.address)).to.be.gt(0);
          expect(await staker.balanceOf(recipientTwo.address)).to.be.gt(0);
        });

        it("getTotalAllocated returns current global price after distribution", async () => {
          // Save share price at distribution time
          const [globalSharePriceNumerator, globalSharePriceDenominator] = await staker.sharePrice();

          await staker.connect(allocatorOne).distributeAll(false);

          const { sharePriceNum, sharePriceDenom } = await staker.getTotalAllocated(allocatorOne.address);

          // Check total allocation share price
          expect(sharePriceNum.div(sharePriceDenom)).to.equal(globalSharePriceNumerator.div(globalSharePriceDenominator));
        });

        it("DistributeAll reverts if user is not whitelisted", async () => {
          // blacklist allocator
          whitelist.isUserWhitelisted.returns(false);

          // attempt to distribute recipient rewards should fail
          await expect(staker.connect(allocatorOne).distributeAll(false)).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
        });
      });
    });
  });

  describe("Internal Methods", async () => {
    // Individual allocation values are for recipientOne
    let globalSharePriceNumerator,
      globalSharePriceDenominator,
      recipientOneTruMATICRewards,
      recipientOneMATICRewards,
      recipientOneTruMATICFee;

    beforeEach(async () => {
      // Generate vault rewards for distribution
      await submitCheckpoint(0);

      [globalSharePriceNumerator, globalSharePriceDenominator] = await staker.sharePrice();

      // Allocation made to recipientOne
      const {
        maticAmount: individualAllocationMaticAmount,
        sharePriceNum: individualAllocationSharePriceNumerator,
        sharePriceDenom: individualAllocationSharePriceDenominator
      } = await staker.allocations(allocatorOne.address, recipientOne.address, false);

      // Current distribution fee taken by vault
      const distPhi = await staker.distPhi();

      const originalShareValue = individualAllocationMaticAmount
        .mul(individualAllocationSharePriceDenominator)
        .mul(parseEther(1))
        .div(individualAllocationSharePriceNumerator);

      const currentShareValue = individualAllocationMaticAmount
        .mul(globalSharePriceDenominator)
        .mul(parseEther(1))
        .div(globalSharePriceNumerator);

      // Discrepancy of ALLOCATED_AMOUNT's value in shares between allocation time and present is the allocation's rewards
      // Add 1 to account for rounding discrepancies
      const rewardShares = originalShareValue.sub(currentShareValue).sub(1);

      // Fee is taken from recipientOne's rewards
      recipientOneTruMATICFee = rewardShares.mul(distPhi).div(10000);

      // Rewards in TruMATIC & MATIC
      recipientOneTruMATICRewards = rewardShares.sub(recipientOneTruMATICFee);
      recipientOneMATICRewards = await staker.convertToAssets(recipientOneTruMATICRewards);
    });

    describe("_distributeRewards", async () => {
      it("Emits 'DistributedRewards' with correct parameters inside distributeAll call", async () => {
        // Distribute recipientOne's rewards via a distributeAll call
        // This sets _individual parameter to false in subsequent internal _distributeRewards call => leads to event emission
        await expect(staker.connect(allocatorOne).distributeAll(false))
          .to.emit(staker, "DistributedRewards")
          .withArgs(
            allocatorOne.address,
            recipientOne.address,
            recipientOneMATICRewards,
            recipientOneTruMATICRewards,
            globalSharePriceNumerator,
            globalSharePriceDenominator
          );
      });

      it("Transfers rewards as TruMATIC to recipient", async () => {
        await expect(
          staker.connect(allocatorOne).distributeRewards(recipientOne.address, false)
        ).to.changeTokenBalance(staker, recipientOne, recipientOneTruMATICRewards);
      });

      it("Transfers TruMATIC recipientOneTruMATICFee to treasury", async () => {
        await expect(
          staker.connect(allocatorOne).distributeRewards(recipientOne.address, false)
        ).to.changeTokenBalance(staker, treasury, recipientOneTruMATICFee);
      });

      it("Updates individual price allocation", async () => {
        await staker.connect(allocatorOne).distributeRewards(recipientOne.address, false);

        const {
          sharePriceNum: individualAllocationSharePriceNumerator,
          sharePriceDenom: individualAllocationSharePriceDenominator
        } = await staker.allocations(allocatorOne.address, recipientOne.address, false);

        // Individual share price should be set to current share price after _distributeRewards
        expect(individualAllocationSharePriceNumerator).to.equal(globalSharePriceNumerator);
        expect(individualAllocationSharePriceDenominator).to.equal(globalSharePriceDenominator);
      });
    });

    describe("_distributeRewardsUpdateTotal", async () => {
      let distributeRewardsTransaction;

      beforeEach(async () => {
        distributeRewardsTransaction = await staker
          .connect(allocatorOne)
          .distributeRewards(recipientOne.address, false);
      });

      it("Reverts if no allocation made by distributor to input recipient", async () => {
        // AllocatorOne has not allocated to themselves
        await expect(
          staker.connect(allocatorOne).distributeRewards(allocatorOne.address, false)
        ).to.be.revertedWithCustomError(staker, "NothingToDistribute");
      });

      it("Skips reward distribution if global share price same as individual share price", async () => {
        // distributeRewardsTransaction sets the share price of recipientOne's allocation to the global share price
        const nonDistributingTransaction = await staker
          .connect(allocatorOne)
          .distributeRewards(recipientOne.address, false);

        // Skipping of distribution during repeat call can be checked via event emission
        await expect(nonDistributingTransaction).to.not.emit(staker, "DistributedRewards");

        // Can also check that recipientOne's token balance does not change
        await expect(nonDistributingTransaction).to.changeTokenBalance(staker, recipientOne, 0);
      });

      it("Updates price of distributor's total allocation", async () => {
        await submitCheckpoint(1);

        [globalSharePriceNumerator, globalSharePriceDenominator] = await staker.sharePrice();

        const {
          maticAmount: totalAllocationMaticAmount,
          sharePriceNum: totalAllocationSharePriceNumerator,
          sharePriceDenom: totalAllocationSharePriceDenominator
        } = await staker.getTotalAllocated(allocatorOne.address);

        const {
          maticAmount: individualAllocationMaticAmount,
          sharePriceNum: individualAllocationSharePriceNumerator,
          sharePriceDenom: individualAllocationSharePriceDenominator
        } = await staker.allocations(allocatorOne.address, recipientOne.address, false);

        // Total allocation share price denominator update calculation => broken into three terms for clarity

        const one = totalAllocationSharePriceDenominator;

        const two = individualAllocationMaticAmount
          .mul(globalSharePriceDenominator)
          .mul(totalAllocationSharePriceNumerator)
          .div(totalAllocationMaticAmount)
          .div(globalSharePriceNumerator);

        const three = individualAllocationMaticAmount
          .mul(individualAllocationSharePriceDenominator)
          .mul(totalAllocationSharePriceNumerator)
          .div(totalAllocationMaticAmount)
          .div(individualAllocationSharePriceNumerator);

        const intendedSharePriceDenominator = one.add(two).sub(three);
        const sharePriceCalculated = totalAllocationSharePriceNumerator.div(intendedSharePriceDenominator);

        // Distribute recipientOne's rewards
        await staker.connect(allocatorOne).distributeRewards(recipientOne.address, false);

        // Get updated total allocation share price
        const { sharePriceNum, sharePriceDenom } = await staker.getTotalAllocated(allocatorOne.address);
        const sharePriceTotalAllocated = sharePriceNum.div(sharePriceDenom);

        // Check total allocation share price has been updated via vault's share maths
        expect(sharePriceCalculated).to.equal(sharePriceTotalAllocated);
      });

      it("Emits 'DistributedRewards' event with correct parameters", async () => {
        await submitCheckpoint(1);

        await expect(distributeRewardsTransaction)
          .to.emit(staker, "DistributedRewards")
          .withArgs(
            allocatorOne.address,
            recipientOne.address,
            recipientOneMATICRewards,
            recipientOneTruMATICRewards,
            globalSharePriceNumerator,
            globalSharePriceDenominator,
          );
      });
    });
  });


  it("Rewards earned via allocation equal rewards earned via deposit", async () => {
    // Make a deposit with a third party (not allocatorOne or recipientOne)
    // Depositor has an inital MATIC investment of ALLOCATED_AMOUNT
    await staker.connect(depositor).deposit(ALLOCATED_AMOUNT);

    // Accrue vault rewards
    await submitCheckpoint(0);

    // Set distPhi to zero to allow direct comparison of depositor's and recipient's earnings
    await staker.connect(deployer).setDistPhi(0);

    // Distribute rewards to recipientOne
    await staker.connect(allocatorOne).distributeRewards(recipientOne.address, false);

    // TruMATIC balances post-distribution
    const recipientOneBalance = await staker.balanceOf(recipientOne.address);
    const depositorBalance = await staker.balanceOf(depositor.address);

    const depositorsUnderlyingMATIC = await sharesToMATIC(depositorBalance, staker);

    // Determine how much MATIC each actor has gained
    const depositorsMATICRewards = depositorsUnderlyingMATIC.sub(ALLOCATED_AMOUNT);
    const recipientsMATICRewards = await sharesToMATIC(recipientOneBalance, staker);

    // Assert that rewards earned by allocation are equal to those that earned by equivalent deposit
    // This is closeTo as the recipient shares are rounded down by function
    expect(depositorsMATICRewards).to.closeTo(recipientsMATICRewards,1);
  });

  it("Can withdraw allocated amount after distributeRewards call", async () => {
    await staker.connect(recipientOne).deposit(parseEther(10));
    // Accrue vault rewards
    await submitCheckpoint(0);

    // Distribute rewards to recipientOne
    await staker.connect(allocatorOne).distributeRewards(recipientOne.address, false);

    // expected user balance after distribution of awards (incl +/- 1 wei rounding)
    const userInfoBefore = await staker.getUserInfo(allocatorOne.address);
    expect(userInfoBefore[1]).to.be.closeTo(ALLOCATED_AMOUNT.add(EPSILON), 1e0);

    // Ensure allocator can still claim their base allocation after distributing rewards to a single recipient
    await staker.connect(allocatorOne).withdraw(ALLOCATED_AMOUNT);

    // removed everything left in balance (including dust)
    const userInfo = await staker.getUserInfo(allocatorOne.address);
    expect(userInfo[0]).to.equal(0);
    expect(userInfo[1]).to.equal(0);
    expect(await staker.balanceOf(allocatorOne.address)).to.equal(0);
  });

  it("Can withdraw combined allocated amounts after distributeAll call", async () => {
    // Deposit ALLOCATED_AMOUNT MATIC again
    await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT);

    // Make a second allocation
    await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientTwo.address);

    // Accrue vault rewards
    await submitCheckpoint(0);

    // Distribute rewards to recipientOne
    await staker.connect(allocatorOne).distributeAll(false);

    const totalAllocation = ALLOCATED_AMOUNT.mul(2);

    await submitCheckpoint(1);

    // Ensure allocator can still claim combined allocations after distributing rewards to all recipients
    staker.connect(allocatorOne).withdraw(totalAllocation);
  });

  it("Multiple distributeRewards calls are equivalent to single distributeAll call", async () => {
    // Deposit ALLOCATED_AMOUNT MATIC again
    await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT);

    // Make a second allocation as allocatorOne to recipientTwo
    await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientTwo.address);

    // Accrue vault rewards
    await submitCheckpoint(0);

    // Distribute rewards for all allocatorOne's allocations
    await staker.connect(allocatorOne).distributeAll(false);

    // Save recipientOne's and recipientTwo's TruMATIC balances post-distribution
    const recipientOneBalanceDistributeAll = await staker.balanceOf(recipientOne.address);
    const recipientTwoBalanceDistributeAll = await staker.balanceOf(recipientTwo.address);

    // Deploy fresh setup to allow reuse of checkpoint submission transaction
    ({
      one: allocatorOne,
      two: recipientOne,
      three: recipientTwo,
      four: depositor,
      deployer,
      treasury,
      staker,
      whitelist
    } = await loadFixture(deployment));

    // Perform same deposits and allocations made previously
    await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT);
    await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientOne.address);
    await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT);
    await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientTwo.address);

    // Accrue same vault rewards
    await submitCheckpoint(0);

    // Perform individual distributeRewards calls
    await staker.connect(allocatorOne).distributeRewards(recipientOne.address, false);
    await staker.connect(allocatorOne).distributeRewards(recipientTwo.address, false);

    // Get their TruMATIC balances post-distribution
    const recipientOneBalanceDistributeRewards = await staker.balanceOf(recipientOne.address);
    const recipientTwoBalanceDistributeRewards = await staker.balanceOf(recipientTwo.address);

    // Assert that distributeRewards calls are equivalent to distributeAll call
    expect(recipientOneBalanceDistributeAll).to.equal(recipientOneBalanceDistributeRewards);
    expect(recipientTwoBalanceDistributeAll).to.equal(recipientTwoBalanceDistributeRewards);
  });

  describe("distribute MATIC rewards", async () => {
    describe("distributeRewards", async () => {
      it("Reverts if distributor does not have enough MATIC", async () => {
        // transfer all of allocator's MATIC balance
        let matic_balance = await token.balanceOf(allocatorOne.address);
        await token.connect(allocatorOne).transfer(depositor.address, matic_balance);

        // with a MATIC balance of 0, distributing MATIC should fail
        await submitCheckpoint(0);

        await expect(
          staker.connect(allocatorOne).distributeRewards(recipientOne.address, true)
        ).to.be.revertedWith("SafeERC20: low-level call failed");
      });

      it("Reverts if user is not whitelisted", async () => {
        // blacklist allocator
        whitelist.isUserWhitelisted.returns(false);

        // attempt to distribute recipient rewards should fail
        await expect(staker.connect(allocatorOne).distributeRewards(recipientOne.address, false)).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
      });

      it("No TruMATIC is transferred to recipients when distributing MATIC", async () => {
        await submitCheckpoint(0);
        await staker.connect(allocatorOne).distributeRewards(recipientOne.address, true);
        expect(await staker.balanceOf(recipientOne.address)).to.equal(0); // recipients balance should still be 0
      });

      it("The equivalent amount of TruMATIC is transferred to the user when distributing MATIC", async () => {
        // allocate to new user
        await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT);
        await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientTwo.address);

        // accrue rewards
        await submitCheckpoint(0);
        await submitCheckpoint(1);

        // distribute rewards in truMatic to user2 and check how many rewards were distributed
        await staker.connect(allocatorOne).distributeRewards(recipientTwo.address, false);
        let truMaticAmount = await staker.balanceOf(recipientTwo.address);

        // when distributing to user1 in MATIC, they should receive the equivalent amount as User2
        let maticAmount =  await staker.previewRedeem(truMaticAmount);
        await expect(
          staker.connect(allocatorOne).distributeRewards(recipientOne.address, true)
        ).to.changeTokenBalance(token, recipientOne, maticAmount);

        // total staked should remain the same
        expect(await staker.totalStaked()).to.equal(ALLOCATED_AMOUNT.add(ALLOCATED_AMOUNT))
      });
    });

    describe("distributeAll", async () => {
      it("Reverts if distributor does not have enough MATIC", async () => {
        // transfer all of allocator's MATIC balance
        let matic_balance = await token.balanceOf(allocatorOne.address);
        await token.connect(allocatorOne).transfer(depositor.address, matic_balance);

        // with a MATIC balance of 0, distributing MATIC should fail
        await submitCheckpoint(0);

        await expect(
          staker.connect(allocatorOne).distributeAll(true)
        ).to.be.revertedWith("SafeERC20: low-level call failed");
      });

      it("No TruMATIC is transferred to recipients when distributing MATIC", async () => {
        await submitCheckpoint(0);
        await staker.connect(allocatorOne).distributeAll(true);
        expect(await staker.balanceOf(recipientOne.address)).to.equal(0); // recipients balance should still be 0

      });

      it("The equivalent amount of TruMATIC is transferred to the user when distributing MATIC", async () => {
        // allocate to two new users
        await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT);
        await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientTwo.address);
        await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, depositor.address);

        // accrue rewards
        await submitCheckpoint(0);
        await submitCheckpoint(1);

        // distribute rewards in truMatic to depositor and check how many rewards were distributed
        await staker.connect(allocatorOne).distributeRewards(depositor.address, false);
        let truMaticAmount = await staker.balanceOf(depositor.address);

        // check pre-distribution MATIC balances of the two recipients
        let preBalanceOne = await token.balanceOf(recipientOne.address);
        let preBalanceTwo = await token.balanceOf(recipientTwo.address);

        // distribute all
        await staker.connect(allocatorOne).distributeAll(true);

        // expect recipients balance to have increased be the equivalent MATIC amount
        let maticAmount =  await staker.previewRedeem(truMaticAmount);
        expect(await token.balanceOf(recipientOne.address)).to.equal(preBalanceOne.add(maticAmount));
        expect(await token.balanceOf(recipientTwo.address)).to.equal(preBalanceTwo.add(maticAmount));

        // total staked should remain the same
        expect(await staker.totalStaked()).to.equal(ALLOCATED_AMOUNT.add(ALLOCATED_AMOUNT))
      });
    });
  });

  afterEach(() => {
    whitelist.isUserWhitelisted.returns(true);
  })
});
