
import { ethers, network } from "hardhat";
import { attackerDeployment } from "../helpers/fixture-attacker";
import { parseEther } from "../helpers/math";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";

describe("Reentrancy Attack", () => {
  let staker, attacker, attacker2, token, deployer, mallory;

  beforeEach(async () => {
   ({
      staker, attacker, attacker2, token, deployer, mallory
    } = await loadFixture(attackerDeployment));
  });

  describe("Attempt to reenter nonReentrant functions", async () => {

    it("Deposit reentrancy attack reverts", async () => {

      const maticAmount = parseEther(100);

      // send MATIC to the attacker
      await token.connect(mallory).transfer(attacker.address, maticAmount);

      // add attacker as validator
      await staker.connect(deployer).addValidator(attacker.address);

      await expect(
        attacker.connect(mallory).attack(maticAmount)
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");

    });

    it("Withdraw request reentrancy attack reverts", async () => {

      const maticAmount = parseEther(100);

      // send MATIC to the attacker
      await token.connect(mallory).transfer(attacker2.address, maticAmount);

      // add attacker as validator
      await staker.connect(deployer).addValidator(attacker2.address);

      await expect(
        attacker2.connect(mallory).attack(maticAmount)
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");

    });

  });
});
