/** Testing strict allocation functionality in the TruStakeMATIC vault. */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { deployment } from "../helpers/fixture";
import { parseEther } from "../helpers/math";

describe("STRICT ALLOCATIONS", () => {
  // Accounts
  let owner, allocator, recipient, staker;

  // Test constants
  const ALLOCATED_AMOUNT = parseEther(10000);
  const STRICTNESS = true;

  // Set up initial test state
  beforeEach(async () => {
    ({ one: allocator, two: recipient, deployer: owner, staker } = await loadFixture(deployment));

    // Allow strict allocations
    await staker.connect(owner).setAllowStrict(STRICTNESS);

    // Allocator deposits to grant them funds for allocation
    await staker.connect(allocator).deposit(ALLOCATED_AMOUNT, allocator.address);
  });

  it("Strict allocation attempts revert if allowStrict is false", async () => {
    // Turn off strict allocations
    await staker.connect(owner).setAllowStrict(false);

    await expect(
      staker.connect(allocator).allocate(ALLOCATED_AMOUNT, recipient.address, STRICTNESS)
    ).to.be.revertedWithCustomError(staker, "StrictAllocationDisabled");
  });

  it("Allocation limit reduced by current total strict allocation", async () => {
    // Allocate strictly
    await staker.connect(allocator).allocate(ALLOCATED_AMOUNT, recipient.address, STRICTNESS);

    // Attempt to allocate further funds
    await expect(staker.connect(allocator).allocate(1, recipient.address, STRICTNESS)).to.be.revertedWithCustomError(
      staker,
      "InsufficientDistributorBalance"
    );
  });

  it("Updates individual strict allocation amount and price", async () => {
    const {
      maticAmount: initialAllocationAmount,
      sharePriceNum: initialAllocationPriceNumerator,
      sharePriceDenom: initialAllocationPriceDenominator
    } = await staker.allocations(allocator.address, recipient.address, STRICTNESS);

    // Allocate strictly
    await staker.connect(allocator).allocate(ALLOCATED_AMOUNT, recipient.address, STRICTNESS);

    const {
      maticAmount: finalAllocationAmount,
      sharePriceNum: finalAllocationPriceNumerator,
      sharePriceDenom: finalAllocationPriceDenominator
    } = await staker.allocations(allocator.address, recipient.address, STRICTNESS);

    // Check individual allocation updates have been made
    expect(finalAllocationAmount).to.be.greaterThan(initialAllocationAmount);
    expect(finalAllocationPriceNumerator).to.be.greaterThan(initialAllocationPriceNumerator);
    expect(finalAllocationPriceDenominator).to.be.greaterThan(initialAllocationPriceDenominator);
  });

  it("Updates total strict allocation amount and price", async () => {
    const {
      maticAmount: initialAllocationAmount,
      sharePriceNum: initialAllocationPriceNumerator,
      sharePriceDenom: initialAllocationPriceDenominator
    } = await staker.totalAllocated(allocator.address, STRICTNESS);

    // Allocate strictly
    await staker.connect(allocator).allocate(ALLOCATED_AMOUNT, recipient.address, STRICTNESS);

    const {
      maticAmount: finalAllocationAmount,
      sharePriceNum: finalAllocationPriceNumerator,
      sharePriceDenom: finalAllocationPriceDenominator
    } = await staker.totalAllocated(allocator.address, STRICTNESS);

    // Check total allocation updates have been made
    expect(finalAllocationAmount).to.be.greaterThan(initialAllocationAmount);
    expect(finalAllocationPriceNumerator).to.be.greaterThan(initialAllocationPriceNumerator);
    expect(finalAllocationPriceDenominator).to.be.greaterThan(initialAllocationPriceDenominator);
  });

  it("Emits Allocation event with strict = true", async () => {
    await expect(staker.connect(allocator).allocate(ALLOCATED_AMOUNT, recipient.address, STRICTNESS))
      .to.emit(staker, "Allocated")
      .withArgs(anyValue, anyValue, anyValue, anyValue, anyValue, anyValue, anyValue, anyValue, STRICTNESS);
  });

  it("Allocator added to recipient's strict distributors upon strict allocation", async () => {
    // Allocate strictly
    await staker.connect(allocator).allocate(ALLOCATED_AMOUNT, recipient.address, STRICTNESS);

    // Check allocator is in strict distributors
    expect(await staker.getDistributors(recipient.address, STRICTNESS)).to.eql([allocator.address]);
  });

  it("Recipient added to strict allocator's recipients upon strict allocation", async () => {
    // Allocate strictly
    await staker.connect(allocator).allocate(ALLOCATED_AMOUNT, recipient.address, STRICTNESS);

    // Check allocator is in strict distributors
    expect(await staker.getRecipients(allocator.address, STRICTNESS)).to.eql([recipient.address]);
  });
});
