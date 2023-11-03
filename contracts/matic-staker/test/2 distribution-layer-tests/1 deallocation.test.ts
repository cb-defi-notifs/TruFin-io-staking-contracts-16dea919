/** Testing deallocation in the TruStakeMATIC vault. */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import * as constants from "../helpers/constants";
import { deployment } from "../helpers/fixture";
import { parseEther } from "../helpers/math";
import { submitCheckpoint } from "../helpers/state-interaction";

describe("DEALLOCATE", () => {
  let owner, allocatorOne, allocatorTwo, recipientOne, recipientTwo, staker, strictness;

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
    await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT, allocatorOne.address);
  });

describe("LOOSE", () => {
  beforeEach(async () => {
    strictness = false;
    // Deposit and allocated ALLOCATED_AMOUNT to recipientOne
    await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientOne.address, strictness);    
  });

  it("Emits 'Deallocated' event with expected parameters", async () => {
    // Calculate intented post-deallocation parameters
    const expectedIndividualAmount = ALLOCATED_AMOUNT.sub(DEALLOCATED_AMOUNT);
    const expectedTotalAmount = ALLOCATED_AMOUNT.sub(DEALLOCATED_AMOUNT);
    const expectedTotalPriceNum = ALLOCATED_AMOUNT.sub(DEALLOCATED_AMOUNT).mul(parseEther(10000)); // Numerator has a 1e18 multipler (precision) and a 1e4 multiplier (fee)
    const expectedTotalPriceDenom = ALLOCATED_AMOUNT.sub(DEALLOCATED_AMOUNT).mul(10000); // Denominator has a 1e4 multiplier (fee)

    await expect(staker.connect(allocatorOne).deallocate(DEALLOCATED_AMOUNT, recipientOne.address, strictness))
      .to.emit(staker, "Deallocated")
      .withArgs(
        allocatorOne.address,
        recipientOne.address,
        expectedIndividualAmount,
        expectedTotalAmount,
        expectedTotalPriceNum,
        expectedTotalPriceDenom,
        strictness
      );
  });

  it("Reverts if caller has not made an allocation to the input recipient", async () => {
    await expect(
      staker.connect(allocatorOne).deallocate(ALLOCATED_AMOUNT, recipientTwo.address, strictness)
    ).to.be.revertedWithCustomError(staker, "NoRewardsAllocatedToRecipient");
  });

  it("Reverts via underflow if deallocated amount larger than allocated amount", async () => {
    const excessDeallocation = ALLOCATED_AMOUNT.add(1);

    await expect(
      staker.connect(allocatorOne).deallocate(excessDeallocation, recipientOne.address, strictness)
    ).to.be.revertedWithCustomError(staker, "ExcessDeallocation");
  });

  it("Removes recipient from distributor's recipients if full individual deallocation", async () => {
    // Make similar further allocation to recipientTwo to ensure removal logic works with multiple recipients
    await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT, allocatorOne.address);
    await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientTwo.address, strictness);

    // Complete deallocation for recipientOne
    await staker.connect(allocatorOne).deallocate(ALLOCATED_AMOUNT, recipientOne.address, strictness);

    const postRecipientOneDeallocationRecipients = await staker.getRecipients(allocatorOne.address, strictness);

    // Check only recipient two left in allocatorOne's recipients
    expect(postRecipientOneDeallocationRecipients).to.eql([recipientTwo.address]);

    // Complete deallocation for recipientTwo
    await staker.connect(allocatorOne).deallocate(ALLOCATED_AMOUNT, recipientTwo.address, strictness);

    const postRecipientTwoDeallocationRecipients = await staker.getRecipients(allocatorOne.address, strictness);

    // Check no recipients left in allocatorOne's recipients after their complete deallocations
    expect(postRecipientTwoDeallocationRecipients).to.eql([]);
  });

  it("Removes distributor from recipient's distributors if full individual deallocation", async () => {
    // Make similar further allocation from allocatorTwo to recipientOne to ensure removal logic works with multiple allocators
    await staker.connect(allocatorTwo).deposit(ALLOCATED_AMOUNT, allocatorTwo.address);
    await staker.connect(allocatorTwo).allocate(ALLOCATED_AMOUNT, recipientOne.address, strictness);

    // Complete deallocation by allocatorOne
    await staker.connect(allocatorOne).deallocate(ALLOCATED_AMOUNT, recipientOne.address, strictness);

    // Get updated recipient's allocators/disbtributors
    const allocatorsPostAllocatorOneDeallocation = await staker.getDistributors(recipientOne.address, strictness);

    // Check only allocatorTwo left in recipientOne's allocators
    expect(allocatorsPostAllocatorOneDeallocation).to.eql([allocatorTwo.address]);

    // Complete deallocation by allocatorTwo
    await staker.connect(allocatorTwo).deallocate(ALLOCATED_AMOUNT, recipientOne.address, strictness);

    const allocatorsPostAllocatorTwoDeallocation = await staker.getDistributors(recipientOne.address, strictness);

    // RecipientOne's allocators should be empty after complete deallocations of their allocators
    expect(allocatorsPostAllocatorTwoDeallocation).to.eql([]);
  });

  describe("Individual Allocation State", async () => {
    it("Individual allocation price is not changed during deallocation", async () => {
      const { sharePriceNum: initialSharePriceNumerator, sharePriceDenom: initialSharePriceDenominator } =
        await staker.allocations(allocatorOne.address, recipientOne.address, strictness);

      await staker.connect(allocatorOne).deallocate(DEALLOCATED_AMOUNT, recipientOne.address, strictness);

      const {
        sharePriceNum: postDeallocationSharePriceNumerator,
        sharePriceDenom: postDeallocationSharePriceDenominator
      } = await staker.allocations(allocatorOne.address, recipientOne.address, strictness);

      // Check share price is unchanged
      expect(initialSharePriceNumerator).to.equal(postDeallocationSharePriceNumerator);
      expect(initialSharePriceDenominator).to.equal(postDeallocationSharePriceDenominator);
    });

    it("Reduces individual allocation by deallocated amount", async () => {
      await staker.connect(allocatorOne).deallocate(DEALLOCATED_AMOUNT, recipientOne.address, strictness);

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
      await staker.connect(allocatorOne).deallocate(ALLOCATED_AMOUNT, recipientOne.address, strictness);

      const allocation = await staker.allocations(allocatorOne.address, recipientOne.address, strictness);

      // Check if state deleted
      expect(allocation.maticAmount).to.equal(0);
      expect(allocation.sharePriceNum).to.equal(0);
      expect(allocation.sharePriceDenom).to.equal(0);
    });
  });

  describe("Total Allocation State", async () => {
    it("Deletes total allocation from storage if complete total deallocation", async () => {
      await staker.connect(allocatorOne).deallocate(ALLOCATED_AMOUNT, recipientOne.address, strictness);

      const totalAllocation = await staker.totalAllocated(allocatorOne.address, strictness);

      // Check if state deleted
      expect(totalAllocation.maticAmount).to.equal(0);
      expect(totalAllocation.sharePriceNum).to.equal(0);
      expect(totalAllocation.sharePriceDenom).to.equal(0);
    });

    it("Updates total allocation price if partial total deallocation", async () => {
      const {
        sharePriceNum: preDeallocationSharePriceNumerator,
        sharePriceDenom: preDeallocationSharePriceDenominator
      } = await staker.totalAllocated(allocatorOne.address, strictness);

      await staker.connect(allocatorOne).deallocate(DEALLOCATED_AMOUNT, recipientOne.address, strictness);

      const {
        sharePriceNum: postDeallocationSharePriceNumerator,
        sharePriceDenom: postDeallocationSharePriceDenominator
      } = await staker.totalAllocated(allocatorOne.address, strictness);

      // Check price numerator and denominator are decreased
      expect(postDeallocationSharePriceNumerator).to.be.lessThan(preDeallocationSharePriceNumerator);
      expect(postDeallocationSharePriceDenominator).to.be.lessThan(preDeallocationSharePriceDenominator);

      // Calculate expected total allocation price
      const expectedTotalAllocationPriceNumerator = ALLOCATED_AMOUNT.sub(DEALLOCATED_AMOUNT).mul(parseEther(10000));
      const expectedTotalAllocationPriceDenominator = ALLOCATED_AMOUNT.sub(DEALLOCATED_AMOUNT).mul(10000);

      // Check if updated to expected value
      expect(postDeallocationSharePriceNumerator).to.equal(expectedTotalAllocationPriceNumerator);
      expect(postDeallocationSharePriceDenominator).to.equal(expectedTotalAllocationPriceDenominator);
    });

    it("Decreases total allocation amount if partial total deallocation", async () => {
      const { maticAmount: preDeallocationTotalAllocationAmount } = await staker.totalAllocated(
        allocatorOne.address,
        strictness
      );

      await staker.connect(allocatorOne).deallocate(DEALLOCATED_AMOUNT, recipientOne.address, strictness);

      const { maticAmount: postDeallocationTotalAllocationAmount } = await staker.totalAllocated(
        allocatorOne.address,
        strictness
      );

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
      await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT, allocatorOne.address);

      // Allocate equal amount to recipientTwo
      await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientTwo.address, strictness);

      // Accrue rewards
      await submitCheckpoint(0);

      const HALVING_REDUCTION = ALLOCATED_AMOUNT.div(2);

      // Deallocate half of recipientTwo's allocation
      await staker.connect(allocatorOne).deallocate(HALVING_REDUCTION, recipientTwo.address, strictness);

      // Distribute rewards to recipients
      await staker.connect(allocatorOne).distributeAll(allocatorOne.address, strictness);

      const recipientOneRewards = await staker.balanceOf(recipientOne.address);
      const recipientTwoRewards = await staker.balanceOf(recipientTwo.address);

      // RecipientOne should have earned twice the rewards as recipientTwo
      // closeTo is used as the calculation does not use math from the contract and may have very small rounding errors
      expect(recipientOneRewards).to.closeTo(recipientTwoRewards.mul(2), 1);
    });

    it("Deallocation leads to rewards if the reduced amount was allocated initially (before any distribution)", async () => {
      const SMALLER_ALLOCATED_AMOUNT = parseEther(5000);

      // Deposit and allocate to recipientTwo a smaller amount than recipientOne
      await staker.connect(allocatorOne).deposit(SMALLER_ALLOCATED_AMOUNT, allocatorOne.address);
      await staker.connect(allocatorOne).allocate(SMALLER_ALLOCATED_AMOUNT, recipientTwo.address, strictness);

      // Accrue rewards
      await submitCheckpoint(0);

      // Deallocating this amount from recipientOne will leave them with the same base allocated amount as recipientTwo
      const EQUALISING_REDUCTION = ALLOCATED_AMOUNT.sub(SMALLER_ALLOCATED_AMOUNT);

      // Equalise base allocated amounts
      await staker.connect(allocatorOne).deallocate(EQUALISING_REDUCTION, recipientOne.address, strictness);

      // Distribute rewards to recipients
      await staker.connect(allocatorOne).distributeAll(allocatorOne.address, strictness);

      const recipientOneRewards = await staker.balanceOf(recipientOne.address);
      const recipientTwoRewards = await staker.balanceOf(recipientTwo.address);

      // RecipientOne should have the same rewards as recipientTwo
      expect(recipientOneRewards).to.equal(recipientTwoRewards);
    });

    it("Non-strict flow of allocating, deallocating and distributing as rewards accrue", async () => {
      // accrue rewards
      await submitCheckpoint(0);

      // distribute rewards and check that TruMATIC balance of recipient increases
      let preBalOne = await staker.balanceOf(recipientOne.address);
      await staker.connect(allocatorOne).distributeRewards(recipientOne.address,allocatorOne.address,strictness);
      let postBalOne = await staker.balanceOf(recipientOne.address);

      expect(postBalOne).to.be.gt(preBalOne);

      // accrue rewards
      await submitCheckpoint(1);

      // deallocate at a higher price 
      await staker.connect(allocatorOne).deallocate(ALLOCATED_AMOUNT,recipientOne.address,strictness);

      //ensure that rewards were not distributed before deallocating
      expect(await staker.balanceOf(recipientOne.address)).to.equal(postBalOne);

      //ensure individualAllocation was deleted
      let individualAllocationCP1 = await staker.allocations(allocatorOne.address,recipientOne.address,strictness);
      expect(individualAllocationCP1.maticAmount).to.equal(0);
      expect(individualAllocationCP1.sharePriceNum).to.equal(0);

      // allocate again
      await staker.connect(allocatorOne).allocate(parseEther(1000),recipientOne.address,strictness);
      individualAllocationCP1 = await staker.allocations(allocatorOne.address,recipientOne.address,strictness);
      
      //accrue rewards
      await submitCheckpoint(2);

      //allocate at a higher price and ensure mapping reflects a non-zero share price
      await staker.connect(allocatorOne).allocate(parseEther(1000),recipientOne.address,strictness);
      const individualAllocationCP2 = await staker.allocations(allocatorOne.address,recipientOne.address,strictness);
      expect(individualAllocationCP2.sharePriceNum).to.not.equal(0);
      expect(individualAllocationCP1.sharePriceNum.div(individualAllocationCP1.sharePriceDenom)).to.be.lt(individualAllocationCP2.sharePriceNum.div(individualAllocationCP2.sharePriceDenom));

      // accrue rewards
      await submitCheckpoint(3);

      //distribute all and check that recipient's TruMATIC balance increased and allocator's balance decreased
      preBalOne = await staker.balanceOf(recipientOne.address);
      let preBalAllocator = await staker.balanceOf(allocatorOne.address);
      await staker.connect(allocatorOne).distributeAll(allocatorOne.address,strictness);
      postBalOne = await staker.balanceOf(recipientOne.address);
      let postBalAllocator = await staker.balanceOf(allocatorOne.address);


      expect(postBalOne).to.be.gt(preBalOne);
      expect(postBalAllocator).to.be.lt(preBalAllocator);

      //check allocation mapping was updated to current share price
      const individualAllocationCP3 = await staker.allocations(allocatorOne.address,recipientOne.address,strictness);
      const sp = await staker.sharePrice();
      expect(individualAllocationCP3.sharePriceNum).to.equal(sp[0]);
      expect(individualAllocationCP3.sharePriceDenom).to.equal(sp[1]); 
    });
  });
});

  describe("STRICT", () => {
    beforeEach(async () => {
      strictness = true;
      await staker.connect(owner).setAllowStrict(true);
      await staker.connect(allocatorOne).deposit(ALLOCATED_AMOUNT, allocatorOne.address);
      await staker.connect(allocatorOne).allocate(ALLOCATED_AMOUNT, recipientOne.address, strictness);
    });

    it("Simple deallocation pre reward accrual", async () => {
      console.log(strictness);
      const recipientOneInitialBalance = await staker.balanceOf(recipientOne.address);
      await expect(staker.connect(allocatorOne).deallocate(1, recipientOne.address, strictness)).to.emit(
        staker,
        "Deallocated"
      );
      const recipientOneFinalBalance = await staker.balanceOf(recipientOne.address);
      // Check that recipientOne's balance has not increased as no rewards were accrued
      expect(recipientOneFinalBalance).to.equal(recipientOneInitialBalance);
    });

    it("Simple deallocation updates mappings correctly", async () => {
      //correct pre-balance
      let individualAllocationRecipientOne = await staker.allocations(
        allocatorOne.address,
        recipientOne.address,
        strictness
      );
      expect(individualAllocationRecipientOne.maticAmount).to.equal(ALLOCATED_AMOUNT);

      let totalAllocatedAllocatorOne = await staker.totalAllocated(allocatorOne.address, strictness);
      expect(totalAllocatedAllocatorOne.maticAmount).to.equal(ALLOCATED_AMOUNT);

      //deallocation
      await staker.connect(allocatorOne).deallocate(parseEther(1), recipientOne.address, strictness);

      //correct post-balances
      individualAllocationRecipientOne = await staker.allocations(
        allocatorOne.address,
        recipientOne.address,
        strictness
      );
      expect(individualAllocationRecipientOne.maticAmount).to.equal(ALLOCATED_AMOUNT.sub(parseEther(1)));

      totalAllocatedAllocatorOne = await staker.totalAllocated(allocatorOne.address, strictness);
      expect(totalAllocatedAllocatorOne.maticAmount).to.equal(ALLOCATED_AMOUNT.sub(parseEther(1)));
    });

    it("Pending rewards are distributed upon deallocation", async () => {
      // Accrue vault rewards
      await submitCheckpoint(0);

      const recipientOneInitialBalance = await staker.balanceOf(recipientOne.address);
      await staker.connect(allocatorOne).deallocate(parseEther(1), recipientOne.address, strictness);
      const recipientOneFinalBalance = await staker.balanceOf(recipientOne.address);
      // Check that recipientOne's balance has increased via reward distribution
      expect(recipientOneFinalBalance).to.be.gt(recipientOneInitialBalance);
    });

    it("Partial deallocation: share price updated correctly", async () => {
      // Accrue vault rewards
      await submitCheckpoint(0);
      await staker.connect(allocatorOne).deallocate(parseEther(1), recipientOne.address, strictness);

      let individualAllocationRecipientOne = await staker.allocations(
        allocatorOne.address,
        recipientOne.address,
        strictness
      );
      let totalAllocationsAllocatorOne = await staker.totalAllocated(allocatorOne.address, strictness);

      let sp = await staker.sharePrice();
      expect(
        individualAllocationRecipientOne.sharePriceNum.div(individualAllocationRecipientOne.sharePriceDenom)
      ).to.equal(sp[0].div(sp[1]));
      expect(totalAllocationsAllocatorOne.sharePriceNum.div(totalAllocationsAllocatorOne.sharePriceDenom)).to.equal(
        sp[0].div(sp[1])
      );
    });

    it("Partial deallocation: totalAllocated share price updated correctly", async () => {
      await staker.connect(allocatorOne).allocate(parseEther(1000), recipientTwo.address, strictness);
      const totalAllocationsAllocatorOnePreAccrual = await staker.totalAllocated(allocatorOne.address, strictness);

      // Accrue vault rewards
      await submitCheckpoint(0);
      await staker.connect(allocatorOne).deallocate(parseEther(1), recipientOne.address, strictness);

      const totalAllocationsAllocatorOnePostAccrual = await staker.totalAllocated(allocatorOne.address, strictness);
      let sp = await staker.sharePrice();
      expect(
        totalAllocationsAllocatorOnePreAccrual.sharePriceNum.div(totalAllocationsAllocatorOnePreAccrual.sharePriceDenom)
      ).to.equal(parseEther(1));
      expect(
        totalAllocationsAllocatorOnePostAccrual.sharePriceNum.div(
          totalAllocationsAllocatorOnePostAccrual.sharePriceDenom
        )
      ).to.be.lt(sp[0].div(sp[1]));
    });

    it("Full deallocation: mappings updated correctly", async () => {
      await staker.connect(allocatorOne).allocate(parseEther(1000), recipientTwo.address, strictness);

      // Accrue vault rewards
      await submitCheckpoint(0);
      await staker.connect(allocatorOne).deallocate(ALLOCATED_AMOUNT, recipientOne.address, strictness);

      const totalAllocatedAllocatorOne = await staker.totalAllocated(allocatorOne.address, strictness);
      expect(totalAllocatedAllocatorOne.maticAmount).to.equal(parseEther(1000));
      expect(totalAllocatedAllocatorOne.sharePriceNum.div(totalAllocatedAllocatorOne.sharePriceDenom)).to.equal(
        parseEther(1)
      );
      expect(await staker.getDistributors(recipientOne.address, strictness)).to.eql([]);
      expect(await staker.getRecipients(allocatorOne.address, strictness)).to.eql([recipientTwo.address]);
      await expect(staker.distributors(recipientOne.address, strictness, 0)).to.be.reverted;
      expect(await staker.recipients(allocatorOne.address, strictness, 0)).to.equal(recipientTwo.address);
    });

    it("Strict flow of allocating, deallocating and distributing as rewards accrue", async () => {
      // accrue rewards
      await submitCheckpoint(0);

      // distribute rewards and check that TruMATIC balance of recipient increases
      let preBalOne = await staker.balanceOf(recipientOne.address);
      await staker.connect(allocatorOne).distributeRewards(recipientOne.address,allocatorOne.address,strictness);
      let postBalOne = await staker.balanceOf(recipientOne.address);

      expect(postBalOne).to.be.gt(preBalOne);

      // accrue rewards
      await submitCheckpoint(1);

      // deallocate at higher price 
      await staker.connect(allocatorOne).deallocate(ALLOCATED_AMOUNT,recipientOne.address,strictness);

      //ensure that rewards were distributed before deallocating
      expect(await staker.balanceOf(recipientOne.address)).to.be.gt(postBalOne);

      //ensure individualAllocation was deleted
      let individualAllocationCP1 = await staker.allocations(allocatorOne.address,recipientOne.address,strictness);
      expect(individualAllocationCP1.maticAmount).to.equal(0);
      expect(individualAllocationCP1.sharePriceNum).to.equal(0);

      // allocate again
      await staker.connect(allocatorOne).allocate(parseEther(1000),recipientOne.address,strictness);
      individualAllocationCP1 = await staker.allocations(allocatorOne.address,recipientOne.address,strictness);
      
      //accrue rewards
      await submitCheckpoint(2);

      //allocate at a higher price and ensure mapping was updated accordingly
      await staker.connect(allocatorOne).allocate(parseEther(1000),recipientOne.address,strictness);
      const individualAllocationCP2 = await staker.allocations(allocatorOne.address,recipientOne.address,strictness);
      expect(individualAllocationCP2.sharePriceNum).to.not.equal(0);
      expect(individualAllocationCP1.sharePriceNum.div(individualAllocationCP1.sharePriceDenom)).to.be.lt(individualAllocationCP2.sharePriceNum.div(individualAllocationCP2.sharePriceDenom));

      // accrue rewards
      await submitCheckpoint(3);

      //distribute all and check that recipient's TruMATIC balance increased and allocator's balance decreased
      preBalOne = await staker.balanceOf(recipientOne.address);
      let preBalAllocator = await staker.balanceOf(allocatorOne.address);
      await staker.connect(allocatorOne).distributeAll(allocatorOne.address,strictness);
      postBalOne = await staker.balanceOf(recipientOne.address);
      let postBalAllocator = await staker.balanceOf(allocatorOne.address);


      expect(postBalOne).to.be.gt(preBalOne);
      expect(postBalAllocator).to.be.lt(preBalAllocator);

      //check allocation mapping was updated to current share price
      const individualAllocationCP3 = await staker.allocations(allocatorOne.address,recipientOne.address,strictness);
      const sp = await staker.sharePrice();
      expect(individualAllocationCP3.sharePriceNum).to.equal(sp[0]);
      expect(individualAllocationCP3.sharePriceDenom).to.equal(sp[1]); 
    });
  });


});
