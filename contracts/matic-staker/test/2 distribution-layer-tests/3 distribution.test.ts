/** Testing reward distribution in the TruStakeMATIC vault. */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { deployment } from "../helpers/fixture";
import { parseEther, sharesToMATIC } from "../helpers/math";
import { submitCheckpoint } from "../helpers/state-interaction";
import { EPSILON } from "../helpers/constants";

describe("DISTRIBUTION", () => {
  // Accounts
  let deployer, treasury, allocatorOne, recipientOne, recipientTwo, depositor, staker, stakeManager;

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
      stakeManager
    } = await loadFixture(deployment));

    // Deposit to staker as allocatorOne
    await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT, allocatorOne.address);

    // Allocate that deposit to recipientOne as allocatorOne
    await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientOne.address, false);
  });

  describe("External Methods", () => {
    describe("distributeRewards", async () => {
      beforeEach(async () => {
        // Generate vault rewards for distribution
        await submitCheckpoint(0);
      });

      it("Reverts if target allocation is loose and caller is not the allocator", async () => {
        await expect(
          staker.connect(recipientOne).distributeRewards(recipientOne.address, allocatorOne.address, false)
        ).to.be.revertedWithCustomError(staker, "OnlyDistributorCanDistributeRewards");
      });

      it("Allows calls from non-allocator addresses if allocation is strict", async () => {
        // Permit strict allocations
        await staker.connect(deployer).setAllowStrict(true);

        // Make a strict allocation to recipientOne to prevent other reverts
        await staker.connect(allocatorOne).allocate(parseEther(1), recipientOne.address, true);

        await submitCheckpoint(1);

        await expect(staker.connect(recipientTwo).distributeRewards(recipientOne.address, allocatorOne.address, true))
          .to.not.be.reverted;
      });
    });

    describe("distributeAll", async () => {
      beforeEach(async () => {
        // Deposit to staker as allocatorOne
        await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT, allocatorOne.address);

        // Allocate that deposit to recipientTwo as allocatorOne
        await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientTwo.address, false);

        // Generate vault rewards for distribution
        await submitCheckpoint(0);
      });

      it("Reverts if target allocations are loose and caller is not the allocator", async () => {
        await expect(
          staker.connect(recipientOne).distributeAll(allocatorOne.address, false)
        ).to.be.revertedWithCustomError(staker, "OnlyDistributorCanDistributeRewards");
      });

      it("Allows calls from non-allocator addresses if allocation is strict", async () => {
        // Permit strict allocations
        await staker.connect(deployer).setAllowStrict(true);

        // Make a strict allocation to recipientOne to prevent other reverts
        await staker.connect(allocatorOne).allocate(parseEther(1), recipientOne.address, true);

        await submitCheckpoint(1);

        await expect(staker.connect(recipientOne).distributeAll(allocatorOne.address, true)).to.not.be.reverted;
      });

      it("Calls _distributeRewards for all allocator's recipients", async () => {
        // Double check all recipients have zero TruMATIC balance
        expect(await staker.balanceOf(recipientOne.address)).to.equal(0);
        expect(await staker.balanceOf(recipientTwo.address)).to.equal(0);

        await staker.connect(allocatorOne).distributeAll(allocatorOne.address, false);

        // Check TruMATIC rewards have been sent all recipients => indicates _distributedRewards has been called for each
        expect(await staker.balanceOf(recipientOne.address)).to.be.gt(0);
        expect(await staker.balanceOf(recipientTwo.address)).to.be.gt(0);
      });

      it("Updates distributor's total allocation price to current global price", async () => {
        // Save share price at distribution time
        const [globalSharePriceNumerator, globalSharePriceDenominator] = await staker.sharePrice();

        await staker.connect(allocatorOne).distributeAll(allocatorOne.address, false);

        const { sharePriceNum, sharePriceDenom } = await staker.totalAllocated(allocatorOne.address, false);

        // Check total allocation share price
        expect(sharePriceNum).to.equal(globalSharePriceNumerator);
        expect(sharePriceDenom).to.equal(globalSharePriceDenominator);
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
        await expect(staker.connect(allocatorOne).distributeAll(allocatorOne.address, false))
          .to.emit(staker, "DistributedRewards")
          .withArgs(
            allocatorOne.address,
            recipientOne.address,
            recipientOneMATICRewards,
            recipientOneTruMATICRewards,
            globalSharePriceNumerator,
            globalSharePriceDenominator,
            0,
            0,
            false
          );
      });

      it("Transfers rewards as TruMATIC to recipient", async () => {
        await expect(
          staker.connect(allocatorOne).distributeRewards(recipientOne.address, allocatorOne.address, false)
        ).to.changeTokenBalance(staker, recipientOne, recipientOneTruMATICRewards);
      });

      it("Transfers TruMATIC recipientOneTruMATICFee to treasury", async () => {
        await expect(
          staker.connect(allocatorOne).distributeRewards(recipientOne.address, allocatorOne.address, false)
        ).to.changeTokenBalance(staker, treasury, recipientOneTruMATICFee);
      });

      it("Updates individual price allocation", async () => {
        await staker.connect(allocatorOne).distributeRewards(recipientOne.address, allocatorOne.address, false);

        const {
          sharePriceNum: individualAllocationSharePriceNumerator,
          sharePriceDenom: individualAllocationSharePriceDenominator
        } = await staker.allocations(allocatorOne.address, recipientOne.address, false);

        // Individual share price should be set to current share price after _distributeRewards
        expect(individualAllocationSharePriceNumerator).to.equal(globalSharePriceNumerator);
        expect(individualAllocationSharePriceDenominator).to.equal(globalSharePriceDenominator);
      });

      // This test ensures _beforeTokenTransfer check does not block distribution of strict rewards any more
      it("Strict rewards can be distributed with insufficient max redemption", async () => {
        // Reset fixture to allow reuse of checkpoint submission transaction
        ({
          one: allocatorOne,
          two: recipientOne,
          three: recipientTwo,
          four: depositor,
          deployer,
          treasury,
          staker,
          stakeManager
        } = await loadFixture(deployment));

        // Enable strict allocations
        await staker.connect(deployer).setAllowStrict(true);

        // Deposit and strictly allocate to recipientOne as allocator
        await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT, allocatorOne.address);
        await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientOne.address, true);

        // Accrue rewards
        await submitCheckpoint(0);

        const recipientOneBalanceBefore = await staker.balanceOf(recipientOne.address);

        // Check max redemption is zero => less that recipientOne's rewards
        expect(await staker.maxRedeem(allocatorOne.address)).to.equal(0);

        await staker.connect(allocatorOne).distributeRewards(recipientOne.address, allocatorOne.address, true);

        const recipientOneBalanceAfter = await staker.balanceOf(recipientOne.address);

        // Check rewards are distributed
        expect(recipientOneBalanceAfter).to.be.gt(recipientOneBalanceBefore);
      });
    });

    describe("_distributeRewardsUpdateTotal", async () => {
      let distributeRewardsTransaction;

      beforeEach(async () => {
        distributeRewardsTransaction = await staker
          .connect(allocatorOne)
          .distributeRewards(recipientOne.address, allocatorOne.address, false);
      });

      it("Reverts if no allocation made by distributor to input recipient", async () => {
        // AllocatorOne has not allocated to themselves
        await expect(
          staker.connect(allocatorOne).distributeRewards(allocatorOne.address, allocatorOne.address, false)
        ).to.be.revertedWithCustomError(staker, "NothingToDistribute");
      });

      it("Skips reward distribution if global share price same as individual share price", async () => {
        // distributeRewardsTransaction sets the share price of recipientOne's allocation to the global share price
        const nonDistributingTransaction = await staker
          .connect(allocatorOne)
          .distributeRewards(recipientOne.address, allocatorOne.address, false);

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
        } = await staker.totalAllocated(allocatorOne.address, false);

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

        // Distribute recipientOne's rewards
        await staker.connect(allocatorOne).distributeRewards(recipientOne.address, allocatorOne.address, false);

        // Get updated total allocation share price
        const { sharePriceDenom } = await staker.totalAllocated(allocatorOne.address, false);

        // Check total allocation share price has been updated via vault's share maths
        expect(sharePriceDenom).to.equal(intendedSharePriceDenominator);
      });

      it("Emits 'DistributedRewards' event with correct parameters", async () => {
        await submitCheckpoint(1);
        const {
          sharePriceNum: totalAllocationSharePriceNumerator,
          sharePriceDenom: totalAllocationSharePriceDenominator
        } = await staker.totalAllocated(allocatorOne.address, false);

        await expect(distributeRewardsTransaction)
          .to.emit(staker, "DistributedRewards")
          .withArgs(
            allocatorOne.address,
            recipientOne.address,
            recipientOneMATICRewards,
            recipientOneTruMATICRewards,
            globalSharePriceNumerator,
            globalSharePriceDenominator,
            totalAllocationSharePriceNumerator,
            totalAllocationSharePriceDenominator,
            false
          );
      });
    });
  });

  describe("LOOSE", async () => {
    it("Rewards earned via allocation equal rewards earned via deposit", async () => {
      // Make a deposit with a third party (not allocatorOne or recipientOne)
      // Depositor has an inital MATIC investment of ALLOCATED_AMOUNT
      await staker.connect(depositor).deposit(ALLOCATED_AMOUNT, depositor.address);

      // Accrue vault rewards
      await submitCheckpoint(0);

      // Set distPhi to zero to allow direct comparison of depositor's and recipient's earnings
      await staker.connect(deployer).setDistPhi(0);

      // Distribute rewards to recipientOne
      await staker.connect(allocatorOne).distributeRewards(recipientOne.address, allocatorOne.address, false);

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
      await staker.connect(recipientOne).deposit(parseEther(10), recipientOne.address);
      // Accrue vault rewards
      await submitCheckpoint(0);

      // Distribute rewards to recipientOne
      await staker.connect(allocatorOne).distributeRewards(recipientOne.address, allocatorOne.address, false);
      
      // expected user balance after distribution of awards (incl +/- 1 wei rounding)
      const userInfoBefore = await staker.getUserInfo(allocatorOne.address);
      expect(userInfoBefore[1]).to.be.closeTo(ALLOCATED_AMOUNT.add(EPSILON), 1e0);

      // Ensure allocator can still claim their base allocation after distributing rewards to a single recipient
      await staker.connect(allocatorOne).withdraw(ALLOCATED_AMOUNT, allocatorOne.address, allocatorOne.address);

      // removed everything left in balance (including dust)
      const userInfo = await staker.getUserInfo(allocatorOne.address);
      expect(userInfo[0]).to.equal(0);
      expect(userInfo[1]).to.equal(0);
      expect(await staker.balanceOf(allocatorOne.address)).to.equal(0);
    });

    it("Can withdraw combined allocated amounts after distributeAll call", async () => {
      // Deposit ALLOCATED_AMOUNT MATIC again
      await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT, allocatorOne.address);

      // Make a second allocation
      await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientTwo.address, false);

      // Accrue vault rewards
      await submitCheckpoint(0);

      // Distribute rewards to recipientOne
      await staker.connect(allocatorOne).distributeAll(allocatorOne.address, false);

      const totalAllocation = ALLOCATED_AMOUNT.mul(2);

      await submitCheckpoint(1);

      // Ensure allocator can still claim combined allocations after distributing rewards to all recipients
      staker.connect(allocatorOne).withdraw(totalAllocation, allocatorOne.address, allocatorOne.address);
    });

    it("Mutliple distributeRewards calls are equivalent to single distributeAll call", async () => {
      // Deposit ALLOCATED_AMOUNT MATIC again
      await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT, allocatorOne.address);

      // Make a second allocation as allocatorOne to recipientTwo
      await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientTwo.address, false);

      // Accrue vault rewards
      await submitCheckpoint(0);

      // Distribute rewards for all allocatorOne's allocations
      await staker.connect(allocatorOne).distributeAll(allocatorOne.address, false);

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
        stakeManager
      } = await loadFixture(deployment));

      // Perform same deposits and allocations made previously
      await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT, allocatorOne.address);
      await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientOne.address, false);
      await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT, allocatorOne.address);
      await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientTwo.address, false);

      // Accrue same vault rewards
      await submitCheckpoint(0);

      // Perform individual distributeRewards calls
      await staker.connect(allocatorOne).distributeRewards(recipientOne.address, allocatorOne.address, false);
      await staker.connect(allocatorOne).distributeRewards(recipientTwo.address, allocatorOne.address, false);

      // Get their TruMATIC balances post-distribution
      const recipientOneBalanceDistributeRewards = await staker.balanceOf(recipientOne.address);
      const recipientTwoBalanceDistributeRewards = await staker.balanceOf(recipientTwo.address);

      // Assert that distributeRewards calls are equivalent to distributeAll call
      expect(recipientOneBalanceDistributeAll).to.equal(recipientOneBalanceDistributeRewards);
      expect(recipientTwoBalanceDistributeAll).to.equal(recipientTwoBalanceDistributeRewards);
    });
  });

  describe("STRICT", async () => {

    const strictness = true;

    beforeEach(async () => {
      await staker.connect(deployer).setAllowStrict(strictness);
      // Allocate that deposit to recipientOne as allocatorOne
      await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientOne.address, strictness);
    
    });

    it("Rewards earned via strict allocation equal rewards earned via deposit", async () => {
      // Make a deposit with a third party (not allocatorOne or recipientOne)
      // Depositor has an inital MATIC investment of ALLOCATED_AMOUNT
      await staker.connect(depositor).deposit(ALLOCATED_AMOUNT, depositor.address);

      // Accrue vault rewards
      await submitCheckpoint(0);

      // Set distPhi to zero to allow direct comparison of depositor's and recipient's earnings
      await staker.connect(deployer).setDistPhi(0);

      // Distribute rewards to recipientOne
      await staker.connect(allocatorOne).distributeRewards(recipientOne.address, allocatorOne.address, strictness);

      // TruMATIC balances post-distribution
      const recipientOneBalance = await staker.balanceOf(recipientOne.address);
      const depositorBalance = await staker.balanceOf(depositor.address);

      const depositorsUnderlyingMATIC = await sharesToMATIC(depositorBalance, staker);

      // Determine how much MATIC each actor has gained
      const depositorsMATICRewards = depositorsUnderlyingMATIC.sub(ALLOCATED_AMOUNT);
      const recipientsMATICRewards = await sharesToMATIC(recipientOneBalance, staker);

      // Assert that rewards earned by allocation are almost equal to those that earned by equivalent deposit, disregarding small rounding inequalities
      expect(depositorsMATICRewards).to.closeTo(recipientsMATICRewards,1);
    });

    it("Cannot withdraw strictly allocated amount after distributeRewards call", async () => {
      // Accrue vault rewards
      await submitCheckpoint(0);

      // Distribute rewards to recipientOne
      await staker.connect(allocatorOne).distributeRewards(recipientOne.address, allocatorOne.address, strictness);

      // Ensure allocator cannot still claim their base allocation after distributing rewards to a single recipient
      await expect(staker.connect(allocatorOne).withdraw(ALLOCATED_AMOUNT, allocatorOne.address, allocatorOne.address)).to.be.revertedWithCustomError(staker, 'WithdrawalAmountTooLarge');
      await expect(await staker.maxWithdraw(allocatorOne.address)).to.equal(0);
      await expect(await staker.maxRedeem(allocatorOne.address)).to.equal(0);
    });

    it("Cannot withdraw combined allocated amounts after strict allocation", async () => {
      // Deposit ALLOCATED_AMOUNT MATIC again
      await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT, allocatorOne.address);

      // Make a second allocation
      await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientTwo.address, strictness);
      
      // Accrue vault rewards
      await submitCheckpoint(0);

      const totalAllocation = ALLOCATED_AMOUNT.mul(2);

      // allocator cannot withdraw after having distributed rewards
      await expect(staker.connect(allocatorOne).withdraw(totalAllocation, allocatorOne.address, allocatorOne.address)).to.be.revertedWithCustomError(staker, 'WithdrawalAmountTooLarge');
    });

    it("Cannot withdraw combined allocated amounts after distributeAll call", async () => {
      // Deposit ALLOCATED_AMOUNT MATIC again
      await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT, allocatorOne.address);

      // Make a second allocation
      await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientTwo.address, strictness);
      
      // Accrue vault rewards
      await submitCheckpoint(0);

      // Distribute rewards to recipientOne
      await staker.connect(allocatorOne).distributeAll(allocatorOne.address, strictness);

      const totalAllocation = ALLOCATED_AMOUNT.mul(2);

      // allocator cannot withdraw after having distributed rewards
      await expect(staker.connect(allocatorOne).withdraw(totalAllocation, allocatorOne.address, allocatorOne.address)).to.be.revertedWithCustomError(staker, 'WithdrawalAmountTooLarge');
    });


    it("Mutliple distributeRewards calls are equivalent to single distributeAll call", async () => {
      // Deposit ALLOCATED_AMOUNT MATIC again
      await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT, allocatorOne.address);

      // Make a second allocation as allocatorOne to recipientTwo
      await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientTwo.address, strictness);

      // Accrue vault rewards
      await submitCheckpoint(0);

      // Distribute rewards for all allocatorOne's allocations
      await staker.connect(allocatorOne).distributeAll(allocatorOne.address, strictness);

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
        stakeManager
      } = await loadFixture(deployment));
      await staker.connect(deployer).setAllowStrict(strictness);

      // Perform same deposits and allocations made previously
      await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT, allocatorOne.address);
      await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientOne.address, strictness);
      await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT, allocatorOne.address);
      await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientTwo.address, strictness);

      // Accrue same vault rewards
      await submitCheckpoint(0);

      // Perform individual distributeRewards calls
      await staker.connect(allocatorOne).distributeRewards(recipientOne.address, allocatorOne.address, strictness);
      await staker.connect(allocatorOne).distributeRewards(recipientTwo.address, allocatorOne.address, strictness);

      // Get their TruMATIC balances post-distribution
      const recipientOneBalanceDistributeRewards = await staker.balanceOf(recipientOne.address);
      const recipientTwoBalanceDistributeRewards = await staker.balanceOf(recipientTwo.address);

      // Assert that distributeRewards calls are equivalent to distributeAll call
      expect(recipientOneBalanceDistributeAll).to.equal(recipientOneBalanceDistributeRewards);
      expect(recipientTwoBalanceDistributeAll).to.equal(recipientTwoBalanceDistributeRewards);
    });
  });
});
