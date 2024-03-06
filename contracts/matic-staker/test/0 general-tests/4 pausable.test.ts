/** Testing pausing the TruStakeMATIC vault. */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { deployment } from "../helpers/fixture";
import { parseEther } from "../helpers/math";

describe("PAUSE", () => {

  let one, two, staker, deployer, validatorShare;

  beforeEach(async () => {
    // reset to fixture
    ({ deployer, one, two, staker, validatorShare } = await loadFixture(deployment));

  });

  it("deposits are disabled when contract is paused", async () => {
    // Perform a deposit
    await staker
    .connect(one)
    .deposit(parseEther(5000));

    // pause the contract
    await staker.connect(deployer).pause();
    expect (await staker.paused()).to.equal(true);

    // deposits are no longer possible
    await expect(staker.connect(one).deposit(parseEther(5000))).to.be.revertedWith("Pausable: paused");
  });

  it("deposits to a specific validator are disabled when contract is paused", async () => {
    // Perform a deposit
    await staker
    .connect(one)
    .depositToSpecificValidator(parseEther(5000), validatorShare.address);

    // pause the contract
    await staker.connect(deployer).pause();
    expect (await staker.paused()).to.equal(true);

    // deposits are no longer possible
    await expect(staker.connect(one).depositToSpecificValidator(parseEther(5000), validatorShare.address)).to.be.revertedWith("Pausable: paused");
  });

  it("withdraw requests are disabled when contract is paused", async () => {
    // Perform a deposit
    await staker
    .connect(one)
    .deposit(parseEther(5000));

    // pause the contract
    await staker.connect(deployer).pause();
    expect (await staker.paused()).to.equal(true);

    // withdraw requests are no longer possible
    await expect(staker.connect(one).withdraw(parseEther(5000))).to.be.revertedWith("Pausable: paused");
  });

  it("withdraw requests from a specific validator are disabled when contract is paused", async () => {
    // Perform a deposit
    await staker
    .connect(one)
    .deposit(parseEther(5000));

    // pause the contract
    await staker.connect(deployer).pause();
    expect (await staker.paused()).to.equal(true);

    // withdraw requests are no longer possible
    await expect(staker.connect(one).withdrawFromSpecificValidator(parseEther(5000), validatorShare.address))
    .to.be.revertedWith("Pausable: paused");
  });

  it("withdraw claims are disabled when contract is paused", async () => {
    // Perform a deposit
    await staker
    .connect(one)
    .deposit(parseEther(5000));

    // initate withdrawal
    await staker.connect(one).withdraw(parseEther(3000));

    // pause contract
    await staker.connect(deployer).pause();
    expect (await staker.paused()).to.equal(true);

    // withdraw claims should now fail
    await expect(staker.connect(one).withdrawClaim(1, validatorShare.address)).to.be.revertedWith("Pausable: paused");
  });

  it("withdrawing claim lists is disabled when contract is paused", async () => {
    // Perform a deposit
    await staker
    .connect(one)
    .deposit(parseEther(5000));

    // initate withdrawals
    await staker.connect(one).withdraw(parseEther(3000));
    await staker.connect(one).withdraw(parseEther(1000));

    // pause contract
    await staker.connect(deployer).pause();
    expect (await staker.paused()).to.equal(true);

    // withdraw claims should now fail
    await expect(staker.connect(one).claimList([1,2], validatorShare.address)).to.be.revertedWith("Pausable: paused");
  });

  it("compounding rewards is disabled when contract is paused", async () => {
    // pause contract
    await staker.connect(deployer).pause();
    expect (await staker.paused()).to.equal(true);

    // compounding rewards should now fail
    await expect(staker.connect(one).compoundRewards(validatorShare.address)).to.be.revertedWith("Pausable: paused");
  });

  it("allocating rewards is disabled when contract is paused", async () => {
    await staker.connect(one).deposit(parseEther(1000));

    // pause contract
    await staker.connect(deployer).pause();
    expect (await staker.paused()).to.equal(true);

    // allocating rewards should now fail
    await expect(staker.connect(one).allocate(parseEther(1000), two.address)).to.be.revertedWith("Pausable: paused");
  });

  it("deallocating rewards is disabled when contract is paused", async () => {
    await staker.connect(one).deposit(parseEther(1000));
    await staker.connect(one).allocate(parseEther(1000), two.address);

    // pause contract
    await staker.connect(deployer).pause();
    expect (await staker.paused()).to.equal(true);

    // deallocating rewards should now fail
    await expect(staker.connect(one).deallocate(parseEther(1000), two.address)).to.be.revertedWith("Pausable: paused");
  });

  it("distributing rewards is disabled when contract is paused", async () => {
    await staker.connect(one).deposit(parseEther(1000));
    await staker.connect(one).allocate(parseEther(1000), two.address)

    // pause contract
    await staker.connect(deployer).pause();
    expect (await staker.paused()).to.equal(true);

    // distributing rewards should now fail
    await expect(staker.connect(one).distributeRewards(two.address, false)).to.be.revertedWith("Pausable: paused");

  });

  it("distributing all rewards is disabled when contract is paused", async () => {
    await staker.connect(one).deposit(parseEther(1000));
    await staker.connect(one).allocate(parseEther(1000), two.address)

    // pause contract
    await staker.connect(deployer).pause();
    expect (await staker.paused()).to.equal(true);

    // distributing rewards should now fail
    await expect(staker.connect(one).distributeAll(true)).to.be.revertedWith("Pausable: paused");

  });

  it("normal functionality resumes when contract is unpaused", async () => {
    // pause the contract
    await staker.connect(deployer).pause();
    expect (await staker.paused()).to.equal(true);

    // deposits are no longer possible
    await expect(staker.connect(one).deposit(parseEther(5000))).to.be.revertedWith("Pausable: paused");

    // un-pause the contract
    await staker.connect(deployer).unpause();
    expect (await staker.paused()).to.equal(false);

    // users can deposit again
    await staker.connect(one).deposit(parseEther(5000));
  });

  it("contract can only be paused by owner", async () => {
    await expect(staker.connect(one).pause()).to.be.revertedWith("Ownable: caller is not the owner");
    expect(await staker.paused()).to.equal(false);
  });

  it("contract can only be unpaused by owner", async () => {
    await staker.connect(deployer).pause();
    await expect(staker.connect(one).unpause()).to.be.revertedWith("Ownable: caller is not the owner");
    expect(await staker.paused()).to.equal(true);
  });
});
