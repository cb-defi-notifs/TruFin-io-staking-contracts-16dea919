import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import * as constants from "../helpers/constants";
import { deployment } from "../helpers/fixture";
import {parseEther} from "../helpers/math";
import { ethers,upgrades } from "hardhat";


describe("SETTERS", () => {
  let one, two, staker, stakeManager,phiPrecision;

  beforeEach(async () => {
    // reset to fixture
    ({ one, two, staker, stakeManager } = await loadFixture(deployment));
    phiPrecision = constants.PHI_PRECISION
  });

  describe("setValidatorShareContract", async () => { 
    it("Reverts with zero address", async () => {
        await expect(staker.setValidatorShareContract(ethers.constants.AddressZero)).to.be.revertedWithCustomError(staker,"ZeroAddressNotSupported");
    });
    it("Works with a new address", async () => {
        await staker.setValidatorShareContract(two.address);
        expect(await staker.validatorShareContractAddress()).to.equal(two.address);
    });
    it("Works with the same address", async () => {
        const addr = await staker.validatorShareContractAddress();
        await staker.setValidatorShareContract(addr);
        expect(await staker.validatorShareContractAddress()).to.equal(addr);
      });
  });

  describe("setWhitelist", async () => { 
    it("Reverts with zero address", async () => {
        await expect(staker.setWhitelist(ethers.constants.AddressZero)).to.be.revertedWithCustomError(staker,"ZeroAddressNotSupported");
    });
    it("Works with a new address", async () => {
        await staker.setWhitelist(two.address);
        expect(await staker.whitelistAddress()).to.equal(two.address);
    });
    it("Works with the same address", async () => {
        const addr = await staker.whitelistAddress();
        await staker.setWhitelist(addr);
        expect(await staker.whitelistAddress()).to.equal(addr);
    });
    });

  describe("setTreasury", async () => { 
    it("Reverts with zero address", async () => {
        await expect(staker.setTreasury(ethers.constants.AddressZero)).to.be.revertedWithCustomError(staker,"ZeroAddressNotSupported");
    });
    it("Works with a new address", async () => {
        await staker.setTreasury(two.address);
        expect(await staker.treasuryAddress()).to.equal(two.address);
    });
    it("Works with the same address", async () => {
        const addr = await staker.treasuryAddress();
        await staker.setTreasury(addr);
        expect(await staker.treasuryAddress()).to.equal(addr);
    });
  });

  describe("setPhi", async () => { 
    it("General input validation; reverts when too high", async () => {
        const phi = await staker.phi();    
        await staker.setPhi(phi.mul(2)); // should work fine
        await staker.setPhi(phiPrecision); // should work fine

        await expect(
          staker.setPhi(phiPrecision.add(1))
        ).to.be.revertedWithCustomError(staker, "PhiTooLarge");
    });
    it("Works with a new value", async () => {
        const phi = await staker.phi();
        await staker.setPhi(phi.sub(1));
        expect(await staker.phi()).to.equal(phi.sub(1));
    });
    it("Works with the same value", async () => {
        const phi = await staker.phi();
        await staker.setPhi(phi);
        expect(await staker.phi()).to.equal(phi);
    });
  });

  describe("setDistPhi", async () => { 
    it("General input validation; reverts when too high", async () => {
        const distPhi = await staker.distPhi();
        // testing parameter validating
        await staker.setDistPhi(distPhi.mul(2)); // should work fine
        await staker.setDistPhi(phiPrecision); // should work fine

        await expect(
          staker.setDistPhi(phiPrecision.add(1))
        ).to.be.revertedWithCustomError(staker, "DistPhiTooLarge");
    });

    it("Works with a new value", async () => {
        const distPhi = await staker.distPhi();
        await staker.setDistPhi(distPhi.sub(1));
        expect(await staker.distPhi()).to.equal(distPhi.sub(1));
    });
    it("Works with the same value", async () => {
        const distPhi = await staker.distPhi();
        await staker.setDistPhi(distPhi);
        expect(await staker.distPhi()).to.equal(distPhi);
    });
  });

  describe("setCap", async () => { 
    it("Reverts with too low value", async () => {
        await staker.connect(one).deposit(parseEther(2000),one.address);
        const ts = await staker.totalStaked()
        await expect(staker.setCap(ts.sub(1))).to.be.revertedWithCustomError(staker,"CapTooLow");
    });
    it("Works with a new value", async () => {
        const cap = await staker.cap()
        await staker.setCap(cap.add(1e10));
        expect(await staker.cap()).to.equal(cap.add(1e10));
    });
    it("Works with the same value", async () => {
    const cap = await staker.cap();
    await staker.setCap(cap);
    expect(await staker.cap()).to.equal(cap);
    });

  });

  describe("setEpsilon", async () => { 
    it("Reverts with too high value", async () => {
        await expect(staker.setEpsilon(1e12 + 1)).to.be.revertedWithCustomError(staker,"EpsilonTooLarge");
    });
    it("Works with a new value", async () => {
        const epsilon = await staker.epsilon();
        await staker.setEpsilon(epsilon.sub(1e2));
        expect(await staker.epsilon()).to.equal(epsilon.sub(1e2));
    });
    it("Works with the same value", async () => {
        const epsilon = await staker.epsilon();
        await staker.setEpsilon(epsilon);
        expect(await staker.epsilon()).to.equal(epsilon);
    });

  });
});
describe("Other", () => {
    let one, two, staker, stakeManager;
  
    beforeEach(async () => {
      // reset to fixture
      ({ one, two, staker, stakeManager } = await loadFixture(deployment));
    });
    describe("allocate", async () => { 
        it("Reverts with zero address", async () => {
            await staker.connect(one).deposit(parseEther(20),one.address);
            await expect(staker.connect(one).allocate(parseEther(10),ethers.constants.AddressZero,false)).to.be.revertedWithCustomError(staker,"ZeroAddressNotSupported");
        });
    });
});

describe("Deployment", () => {
    let deployer, treasury, one, two, three, // accounts
    token, validatorShare, stakeManager, whitelist, staker; // contracts
    beforeEach(async () => {
        ({
          deployer, treasury, one, two, three,
          token, validatorShare, stakeManager, whitelist, staker
        } = await loadFixture(deployment));
      });
      describe("INITIALISATION", () => {
        it("Reverts on zero address", async () => {
            await expect(
              ethers.getContractFactory("TruStakeMATICv2").then(
                (stakerFactory) => upgrades.deployProxy(stakerFactory, [
                  ethers.constants.AddressZero,
                  stakeManager.address,
                  validatorShare.address,
                  whitelist.address,
                  treasury.address,
                  constants.PHI_PRECISION,
                  constants.DIST_PHI,
                  constants.CAP
                ])
              )
            ).to.be.revertedWithCustomError(staker, "ZeroAddressNotSupported");
            await expect(
                ethers.getContractFactory("TruStakeMATICv2").then(
                  (stakerFactory) => upgrades.deployProxy(stakerFactory, [
                    token.address,
                    ethers.constants.AddressZero,                    validatorShare.address,
                    whitelist.address,
                    treasury.address,
                    constants.PHI_PRECISION,
                    constants.DIST_PHI,
                    constants.CAP
                  ])
                )
              ).to.be.revertedWithCustomError(staker, "ZeroAddressNotSupported");
              await expect(
                ethers.getContractFactory("TruStakeMATICv2").then(
                  (stakerFactory) => upgrades.deployProxy(stakerFactory, [
                    token.address,
                    stakeManager.address,
                    ethers.constants.AddressZero,
                    whitelist.address,
                    treasury.address,
                    constants.PHI_PRECISION,
                    constants.DIST_PHI,
                    constants.CAP
                  ])
                )
              ).to.be.revertedWithCustomError(staker, "ZeroAddressNotSupported");
              await expect(
                ethers.getContractFactory("TruStakeMATICv2").then(
                  (stakerFactory) => upgrades.deployProxy(stakerFactory, [
                    token.address,
                    stakeManager.address,
                    validatorShare.address,
                    ethers.constants.AddressZero,
                    treasury.address,
                    constants.PHI_PRECISION,
                    constants.DIST_PHI,
                    constants.CAP
                  ])
                )
              ).to.be.revertedWithCustomError(staker, "ZeroAddressNotSupported");
              await expect(
                ethers.getContractFactory("TruStakeMATICv2").then(
                  (stakerFactory) => upgrades.deployProxy(stakerFactory, [
                    token.address,
                    stakeManager.address,
                    validatorShare.address,
                    whitelist.address,
                    ethers.constants.AddressZero,
                    constants.PHI_PRECISION,
                    constants.DIST_PHI,
                    constants.CAP
                  ])
                )
              ).to.be.revertedWithCustomError(staker, "ZeroAddressNotSupported");
          });
        });
    
});
