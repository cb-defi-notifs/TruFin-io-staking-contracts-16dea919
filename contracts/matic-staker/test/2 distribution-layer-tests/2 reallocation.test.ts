/** Testing reallocation in the TruStakeMATICv2 vault. */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { deployment } from "../helpers/fixture";
import { parseEther } from "../helpers/math";
import { AddressZero } from "@ethersproject/constants";
import { submitCheckpoint } from "../helpers/state-interaction";

describe("REALLOCATE", () => {
  let one, two, three, four, deployer, stakeManager, staker, whitelist;

  beforeEach(async () => {
    // reset to fixture
    ({
      one, two, three, four, deployer, stakeManager, staker, whitelist
    } = await loadFixture(deployment));
  });

  it("pass: reallocation to empty allocation", async () => {
    // one deposits 10k
    await staker.connect(one).deposit(parseEther(10000), one.address);

    // one allocates 2k to two
    await staker.connect(one).allocate(parseEther(2000), two.address, false);
    // one allocates 2k to four
    await staker.connect(one).allocate(parseEther(2000), four.address, false);

    // save current recipient + distributor arrays for checks later
    const oldRecipientsArray = await staker.getRecipients(one.address, false);
    const oldDistributorsArrayTwo = await staker.getDistributors(two.address, false);
    const oldDistributorsArrayThree = await staker.getDistributors(three.address, false);
    const oldDistributorsArrayFour = await staker.getDistributors(four.address, false);

    // one reallocates from two to three
    await staker.connect(one).reallocate(two.address, three.address);

    // accrue rewards
    await submitCheckpoint(0);

    // distribute
    await staker.connect(one).distributeAll(one.address, false);

    // check balance of three should be the same as balance of four
    const threeBalance = await staker.balanceOf(three.address);
    const fourBalance = await staker.balanceOf(four.address);

    expect(threeBalance).to.equal(fourBalance);

    // check recipients array for one has been updated correctly (remove two, add three)
    const newRecipientsArray = await staker.getRecipients(one.address, false);
    expect(oldRecipientsArray).to.eql([two.address, four.address]);
    expect(newRecipientsArray).to.eql([three.address, four.address]);

    // check distributors arrays for recipients have been updated correctly
    const newDistributorsArrayTwo = await staker.getDistributors(two.address, false);
    expect(oldDistributorsArrayTwo).to.eql([one.address]);
    expect(newDistributorsArrayTwo).to.eql([]);
    const newDistributorsArrayThree = await staker.getDistributors(three.address, false);
    expect(oldDistributorsArrayThree).to.eql([]);
    expect(newDistributorsArrayThree).to.eql([one.address]);
    const newDistributorsArrayFour = await staker.getDistributors(four.address, false);
    expect(oldDistributorsArrayFour).to.eql([one.address]);
    expect(newDistributorsArrayFour).to.eql([one.address]);
  });

  it("pass: reallocation to existing allocation (from older allocation to more recent allocation)", async () => {
    // one deposits 10k
    await staker.connect(one).deposit(parseEther(10000), one.address);

    // one allocates 2k to two
    await staker.connect(one).allocate(parseEther(2000), two.address, false);
    // one allocates 2k to four
    await staker.connect(one).allocate(parseEther(2000), four.address, false);

    // allocate to 1k to three
    await staker.connect(one).allocate(parseEther(1000), three.address, false);
    // allocate to 1k to four
    await staker.connect(one).allocate(parseEther(1000), four.address, false);

    // save current recipient + distributor arrays for checks later
    const oldRecipientsArray = await staker.getRecipients(one.address, false);
    const oldDistributorsArrayTwo = await staker.getDistributors(two.address, false);
    const oldDistributorsArrayThree = await staker.getDistributors(three.address, false);
    const oldDistributorsArrayFour = await staker.getDistributors(four.address, false);

    // reallocate from two to three
    await staker.connect(one).reallocate(two.address, three.address);

    // accrue rewards
    await submitCheckpoint(0);

    // distribute
    await staker.connect(one).distributeAll(one.address, false);

    // check balance of three should be the same as balance of four
    const threeBalance = await staker.balanceOf(three.address);
    const fourBalance = await staker.balanceOf(four.address);

    expect(threeBalance).to.equal(fourBalance);

    // check recipients array for one has been updated correctly (remove two)
    const newRecipientsArray = await staker.getRecipients(one.address, false);
    expect(oldRecipientsArray).to.eql([two.address, four.address, three.address]);
    expect(newRecipientsArray).to.eql([three.address, four.address]);
    // this is testing our popping and replacing code

    // check distributors arrays for recipients have been updated correctly
    const newDistributorsArrayTwo = await staker.getDistributors(two.address, false);
    expect(oldDistributorsArrayTwo).to.eql([one.address]);
    expect(newDistributorsArrayTwo).to.eql([]);
    const newDistributorsArrayThree = await staker.getDistributors(three.address, false);
    expect(oldDistributorsArrayThree).to.eql([one.address]);
    expect(newDistributorsArrayThree).to.eql([one.address]);
    const newDistributorsArrayFour = await staker.getDistributors(four.address, false);
    expect(oldDistributorsArrayFour).to.eql([one.address]);
    expect(newDistributorsArrayFour).to.eql([one.address]);
  });

  it("pass: reallocation to existing allocation (from more recent allocation to older allocation)", async () => {
    // one deposits 10k
    await staker.connect(one).deposit(parseEther(10000), one.address);

    // one allocates 2k to two
    await staker.connect(one).allocate(parseEther(2000), two.address, false);
    // one allocates 2k to four
    await staker.connect(one).allocate(parseEther(2000), four.address, false);

    // allocate to 1k to three
    await staker.connect(one).allocate(parseEther(1000), three.address, false);
    // allocate to 1k to four
    await staker.connect(one).allocate(parseEther(1000), four.address, false);

    // save current recipient + distributor arrays for checks later
    const oldRecipientsArray = await staker.getRecipients(one.address, false);
    const oldDistributorsArrayTwo = await staker.getDistributors(two.address, false);
    const oldDistributorsArrayThree = await staker.getDistributors(three.address, false);
    const oldDistributorsArrayFour = await staker.getDistributors(four.address, false);

    // reallocate from two to three
    await staker.connect(one).reallocate(three.address, two.address);

    // accrue rewards
    await submitCheckpoint(0);

    // distribute
    await staker.connect(one).distributeAll(one.address, false);

    // check balance of three should be the same as balance of four
    const twoBalance = await staker.balanceOf(two.address);
    const fourBalance = await staker.balanceOf(four.address);

    expect(twoBalance).to.equal(fourBalance);

    // CHANGE
    // check recipients array for one has been updated correctly (remove three)
    const newRecipientsArray = await staker.getRecipients(one.address, false);
    expect(oldRecipientsArray).to.eql([two.address, four.address, three.address]);
    expect(newRecipientsArray).to.eql([two.address, four.address]);
    // this is testing our popping and replacing code

    // check distributors arrays for recipients have been updated correctly
    const newDistributorsArrayTwo = await staker.getDistributors(two.address, false);
    expect(oldDistributorsArrayTwo).to.eql([one.address]);
    expect(newDistributorsArrayTwo).to.eql([one.address]);
    const newDistributorsArrayThree = await staker.getDistributors(three.address, false);
    expect(oldDistributorsArrayThree).to.eql([one.address]);
    expect(newDistributorsArrayThree).to.eql([]);
    const newDistributorsArrayFour = await staker.getDistributors(four.address, false);
    expect(oldDistributorsArrayFour).to.eql([one.address]);
    expect(newDistributorsArrayFour).to.eql([one.address]);
  });

  it("pass: reallocating to yourself should be possible", async () => {
    // deposit 10k as one
    await staker.connect(one).deposit(parseEther(10000), one.address);

    // allocate 2k to two
    await staker.connect(one).allocate(parseEther(2000), two.address, false);
    
    // accrue rewards
    await submitCheckpoint(0);
    
    // reallocate to one
    await staker.connect(one).reallocate(two.address, one.address);
  });

  it("pass: reallocating to a non-whitelisted user should be possible", async () => {
    const randomUser = "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe";

    // deposit 10k as one
    await staker.connect(one).deposit(parseEther(10000), one.address);

    // allocate 2k to two
    await staker.connect(one).allocate(parseEther(2000), two.address, false);
    
    // accrue rewards
    await submitCheckpoint(0);
    
    // check user not whitelisted
    expect(
      await whitelist.isUserWhitelisted(randomUser)
    ).to.equal(false);

    // reallocate to one
    await staker.connect(one).reallocate(two.address, randomUser);
  });

  it("fail: reallocate from non-existent allocation", async () => {
    await expect(
      staker.connect(one).reallocate(two.address, three.address)
    ).to.be.revertedWithCustomError(staker, "AllocationNonExistent");
  });

  it("reallocating strict allocation fails", async () => {
    const strictness = true;
    await staker.connect(deployer).setAllowStrict(strictness);
    await staker.connect(one).deposit(parseEther(1e6), one.address);

    // strict allocation
    await staker.connect(one).allocate(parseEther(1e6), two.address, strictness);

    // try reallocating strict allocation
    await expect(staker.reallocate(two.address, one.address)).to.be.revertedWithCustomError(staker, 'AllocationNonExistent');
  });
});
