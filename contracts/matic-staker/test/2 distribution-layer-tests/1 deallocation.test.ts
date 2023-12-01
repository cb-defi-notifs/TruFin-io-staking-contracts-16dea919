/** Testing deallocation in the TruStakeMATIC vault. */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import * as constants from "../helpers/constants";
import { deployment } from "../helpers/fixture";
import { parseEther } from "../helpers/math";
import { submitCheckpoint } from "../helpers/state-interaction";

describe("DEALLOCATE", () => {
  let owner, allocatorOne, allocatorTwo, recipientOne, recipientTwo, staker, strictness, distributionInMATIC;

  // Test constants
  const ALLOCATED_AMOUNT = parseEther(10000);
  const DEALLOCATED_AMOUNT = parseEther(1000);

  beforeEach(async () => {
    ({
      deployer: owner,
      one: allocatorOne,
      two: recipientOne,
      three: allocatorTwo,
      four: recipientTwo,
      staker
    } = await loadFixture(deployment));

      //Deposit ALLOCATED_AMOUNT
    await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT);
    strictness = false;
    distributionInMATIC = false;
    // Deposit and allocated ALLOCATED_AMOUNT to recipientOne
    await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientOne.address);
  });

    it("Emits 'Deallocated' event with expected parameters", async () => {
      // Calculate intented post-deallocation parameters
      const expectedIndividualAmount = ALLOCATED_AMOUNT.sub(DEALLOCATED_AMOUNT);
      const expectedTotalAmount = ALLOCATED_AMOUNT.sub(DEALLOCATED_AMOUNT);
      const expectedTotalPriceNum = ALLOCATED_AMOUNT.sub(DEALLOCATED_AMOUNT).mul(parseEther(10000)); // Numerator has a 1e18 multipler (precision) and a 1e4 multiplier (fee)
      const expectedTotalPriceDenom = ALLOCATED_AMOUNT.sub(DEALLOCATED_AMOUNT).mul(10000); // Denominator has a 1e4 multiplier (fee)

      await expect(staker.connect(allocatorOne).deallocate(DEALLOCATED_AMOUNT, recipientOne.address))
        .to.emit(staker, "Deallocated")
        .withArgs(
          allocatorOne.address,
          recipientOne.address,
          expectedIndividualAmount
        );
    });

    it("Reverts if caller has not made an allocation to the input recipient", async () => {
      await expect(
        staker.connect(allocatorOne).deallocate(ALLOCATED_AMOUNT, recipientTwo.address)
      ).to.be.revertedWithCustomError(staker, "AllocationNonExistent");
    });

    it("Reverts via underflow if deallocated amount larger than allocated amount", async () => {
      const excessDeallocation = ALLOCATED_AMOUNT.add(1);

      await expect(
        staker.connect(allocatorOne).deallocate(excessDeallocation, recipientOne.address)
      ).to.be.revertedWithCustomError(staker, "ExcessDeallocation");
    });

    it("Reverts if remaining allocation is under 1 MATIC", async () => {
      const allocationMinusAlmostOne = ALLOCATED_AMOUNT.sub(parseEther(1).sub(1));
      await expect(
        staker.connect(allocatorOne).deallocate(allocationMinusAlmostOne, recipientOne.address)
      ).to.be.revertedWithCustomError(staker, "AllocationUnderOneMATIC");
    });

    it("Removes recipient from distributor's recipients if full individual deallocation", async () => {
      // Make similar further allocation to recipientTwo to ensure removal logic works with multiple recipients
      await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT);
      await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientTwo.address);

      // Complete deallocation for recipientOne
      await staker.connect(allocatorOne).deallocate(ALLOCATED_AMOUNT, recipientOne.address);

      const postRecipientOneDeallocationRecipients = await staker.getRecipients(allocatorOne.address);

      // Check only recipient two left in allocatorOne's recipients
      expect(postRecipientOneDeallocationRecipients).to.eql([recipientTwo.address]);

      // Complete deallocation for recipientTwo
      await staker.connect(allocatorOne).deallocate(ALLOCATED_AMOUNT, recipientTwo.address);

      const postRecipientTwoDeallocationRecipients = await staker.getRecipients(allocatorOne.address);

      // Check no recipients left in allocatorOne's recipients after their complete deallocations
      expect(postRecipientTwoDeallocationRecipients).to.eql([]);
    });

    it("Removes distributor from recipient's distributors if full individual deallocation", async () => {
      // Make similar further allocation from allocatorTwo to recipientOne to ensure removal logic works with multiple allocators
      await staker.connect(allocatorTwo).deposit(ALLOCATED_AMOUNT);
      await staker.connect(allocatorTwo).allocate(ALLOCATED_AMOUNT, recipientOne.address);

      // Complete deallocation by allocatorOne
      await staker.connect(allocatorOne).deallocate(ALLOCATED_AMOUNT, recipientOne.address);

      // Get updated recipient's allocators/disbtributors
      const allocatorsPostAllocatorOneDeallocation = await staker.getDistributors(recipientOne.address);

      // Check only allocatorTwo left in recipientOne's allocators
      expect(allocatorsPostAllocatorOneDeallocation).to.eql([allocatorTwo.address]);

      // Complete deallocation by allocatorTwo
      await staker.connect(allocatorTwo).deallocate(ALLOCATED_AMOUNT, recipientOne.address);

      const allocatorsPostAllocatorTwoDeallocation = await staker.getDistributors(recipientOne.address);

      // RecipientOne's allocators should be empty after complete deallocations of their allocators
      expect(allocatorsPostAllocatorTwoDeallocation).to.eql([]);
    });

    describe("Individual Allocation State", async () => {
      it("Individual allocation price is not changed during deallocation", async () => {
        const { sharePriceNum: initialSharePriceNumerator, sharePriceDenom: initialSharePriceDenominator } =
          await staker.allocations(allocatorOne.address, recipientOne.address, strictness);

        await staker.connect(allocatorOne).deallocate(DEALLOCATED_AMOUNT, recipientOne.address);

        const {
          sharePriceNum: postDeallocationSharePriceNumerator,
          sharePriceDenom: postDeallocationSharePriceDenominator
        } = await staker.allocations(allocatorOne.address, recipientOne.address, strictness);

        // Check share price is unchanged
        expect(initialSharePriceNumerator).to.equal(postDeallocationSharePriceNumerator);
        expect(initialSharePriceDenominator).to.equal(postDeallocationSharePriceDenominator);
      });

      it("Reduces individual allocation by deallocated amount", async () => {
        await staker.connect(allocatorOne).deallocate(DEALLOCATED_AMOUNT, recipientOne.address);

        const { maticAmount: reducedAllocation } = await staker.allocations(
          allocatorOne.address,
          recipientOne.address,
          strictness
        );

        const expectedReducedAllocation = ALLOCATED_AMOUNT.sub(DEALLOCATED_AMOUNT);

        // Check allocation is reduced by deallocated amount
        expect(reducedAllocation).to.equal(expectedReducedAllocation);
      });

      it("Deletes individual allocation from storage if full individual deallocation", async () => {
        await staker.connect(allocatorOne).deallocate(ALLOCATED_AMOUNT, recipientOne.address);

        const allocation = await staker.allocations(allocatorOne.address, recipientOne.address, strictness);

        // Check if state deleted
        expect(allocation.maticAmount).to.equal(0);
        expect(allocation.sharePriceNum).to.equal(0);
        expect(allocation.sharePriceDenom).to.equal(0);
      });
    });

    describe("Total Allocation State", async () => {
      it("Returns zero for total deallocation", async () => {
        await staker.connect(allocatorOne).deallocate(ALLOCATED_AMOUNT, recipientOne.address);

        const totalAllocation = await staker.getTotalAllocated(allocatorOne.address);

        // Check if state deleted
        expect(totalAllocation.maticAmount).to.equal(0);
        expect(totalAllocation.sharePriceNum).to.equal(0);
        expect(totalAllocation.sharePriceDenom).to.equal(0);
      });

      it("Decreases total allocation amount if partial deallocation", async () => {
        const { maticAmount: preDeallocationTotalAllocationAmount } = await staker.getTotalAllocated(allocatorOne.address);

        await staker.connect(allocatorOne).deallocate(DEALLOCATED_AMOUNT, recipientOne.address);

        const { maticAmount: postDeallocationTotalAllocationAmount } = await staker.getTotalAllocated(allocatorOne.address);

        // Check allocation reduced
        expect(postDeallocationTotalAllocationAmount).to.be.lessThan(preDeallocationTotalAllocationAmount);

        // Calculate expected total allocation amount
        const expectedTotalAllocationAmount = ALLOCATED_AMOUNT.sub(DEALLOCATED_AMOUNT);

        // Check expected value
        expect(postDeallocationTotalAllocationAmount).to.equal(expectedTotalAllocationAmount);
      });
    });

    describe("Functionality", async () => {
      it("Deallocate reduces rewards proportionally", async () => {
        await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT);

        // Allocate equal amount to recipientTwo
        await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientTwo.address);

        // Accrue rewards
        await submitCheckpoint(0);

        const HALVING_REDUCTION = ALLOCATED_AMOUNT.div(2);

        // Deallocate half of recipientTwo's allocation
        await staker.connect(allocatorOne).deallocate(HALVING_REDUCTION, recipientTwo.address);

        // Distribute rewards to recipients
        await staker.connect(allocatorOne).distributeAll(distributionInMATIC);

        const recipientOneRewards = await staker.balanceOf(recipientOne.address);
        const recipientTwoRewards = await staker.balanceOf(recipientTwo.address);

        // RecipientOne should have earned twice the rewards as recipientTwo
        // closeTo is used as the calculation does not use math from the contract and may have very small rounding errors
        expect(recipientOneRewards).to.closeTo(recipientTwoRewards.mul(2), 1);
      });

      it("Deallocation leads to rewards if the reduced amount was allocated initially (before any distribution)", async () => {
        const SMALLER_ALLOCATED_AMOUNT = parseEther(5000);

        // Deposit and allocate to recipientTwo a smaller amount than recipientOne
        await staker.connect(allocatorOne).deposit(SMALLER_ALLOCATED_AMOUNT);
        await staker.connect(allocatorOne).allocate(SMALLER_ALLOCATED_AMOUNT, recipientTwo.address);

        // Accrue rewards
        await submitCheckpoint(0);

        // Deallocating this amount from recipientOne will leave them with the same base allocated amount as recipientTwo
        const EQUALISING_REDUCTION = ALLOCATED_AMOUNT.sub(SMALLER_ALLOCATED_AMOUNT);

        // Equalise base allocated amounts
        await staker.connect(allocatorOne).deallocate(EQUALISING_REDUCTION, recipientOne.address);

        // Distribute rewards to recipients
        await staker.connect(allocatorOne).distributeAll(distributionInMATIC);

        const recipientOneRewards = await staker.balanceOf(recipientOne.address);
        const recipientTwoRewards = await staker.balanceOf(recipientTwo.address);

        // RecipientOne should have the same rewards as recipientTwo
        expect(recipientOneRewards).to.equal(recipientTwoRewards);
      });

      it("Flow of allocating, deallocating and distributing as rewards accrue", async () => {
        // accrue rewards
        await submitCheckpoint(0);

        // distribute rewards and check that TruMATIC balance of recipient increases
        let preBalOne = await staker.balanceOf(recipientOne.address);
        await staker.connect(allocatorOne).distributeRewards(recipientOne.address, distributionInMATIC);
        let postBalOne = await staker.balanceOf(recipientOne.address);

        expect(postBalOne).to.be.gt(preBalOne);

        // accrue rewards
        await submitCheckpoint(1);

        // deallocate at a higher price
        await staker.connect(allocatorOne).deallocate(ALLOCATED_AMOUNT, recipientOne.address);

        //ensure that rewards were not distributed before deallocating
        expect(await staker.balanceOf(recipientOne.address)).to.equal(postBalOne);

        //ensure individualAllocation was deleted
        let individualAllocationCP1 = await staker.allocations(allocatorOne.address, recipientOne.address, strictness);
        expect(individualAllocationCP1.maticAmount).to.equal(0);
        expect(individualAllocationCP1.sharePriceNum).to.equal(0);

        // allocate again
        await staker.connect(allocatorOne).allocate(parseEther(1000),recipientOne.address);
        individualAllocationCP1 = await staker.allocations(allocatorOne.address, recipientOne.address, strictness);

        //accrue rewards
        await submitCheckpoint(2);

        //allocate at a higher price and ensure mapping reflects a non-zero share price
        await staker.connect(allocatorOne).allocate(parseEther(1000),recipientOne.address);
        const individualAllocationCP2 = await staker.allocations(allocatorOne.address, recipientOne.address, strictness);
        expect(individualAllocationCP2.sharePriceNum).to.not.equal(0);
        expect(individualAllocationCP1.sharePriceNum.div(individualAllocationCP1.sharePriceDenom)).to.be.lt(individualAllocationCP2.sharePriceNum.div(individualAllocationCP2.sharePriceDenom));

        // accrue rewards
        await submitCheckpoint(3);

        //distribute all and check that recipient's TruMATIC balance increased and allocator's balance decreased
        preBalOne = await staker.balanceOf(recipientOne.address);
        let preBalAllocator = await staker.balanceOf(allocatorOne.address);
        await staker.connect(allocatorOne).distributeAll(distributionInMATIC);
        postBalOne = await staker.balanceOf(recipientOne.address);
        let postBalAllocator = await staker.balanceOf(allocatorOne.address);


        expect(postBalOne).to.be.gt(preBalOne);
        expect(postBalAllocator).to.be.lt(preBalAllocator);

        //check allocation mapping was updated to current share price
        const individualAllocationCP3 = await staker.allocations(allocatorOne.address, recipientOne.address, strictness);
        const sp = await staker.sharePrice();
        expect(individualAllocationCP3.sharePriceNum).to.equal(sp[0]);
        expect(individualAllocationCP3.sharePriceDenom).to.equal(sp[1]);
      });
    });
  });
