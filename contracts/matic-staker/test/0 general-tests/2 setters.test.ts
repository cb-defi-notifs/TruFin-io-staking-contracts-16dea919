import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import * as constants from "../helpers/constants";
import { deployment } from "../helpers/fixture";
import {parseEther} from "../helpers/math";
import { ethers,upgrades } from "hardhat";
import { smock } from '@defi-wonderland/smock';

describe("SETTERS", () => {
  let one, two, staker, phiPrecision;

  beforeEach(async () => {
    // reset to fixture
    ({ one, two, staker } = await loadFixture(deployment));
    phiPrecision = constants.PHI_PRECISION
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

  describe("setMinDeposit", async () => {
    it("Reverts with too low value", async () => {
        await expect(staker.setMinDeposit(1e12 + 1)).to.be.revertedWithCustomError(staker,"MinDepositTooSmall");
    });

    it("Works with a new value", async () => {
        const minDeposit = await staker.minDeposit();
        await staker.setMinDeposit(parseEther(1e4));
        expect(await staker.minDeposit()).to.equal(parseEther(1e4));
    });

    it("Works with the same value", async () => {
        const minDeposit = await staker.minDeposit();
        await staker.setMinDeposit(minDeposit);
        expect(await staker.minDeposit()).to.equal(minDeposit);
    });

    it("Fails if set by non-owner", async () => {
        await expect(staker.connect(one).setMinDeposit(parseEther(1e4))).to.be.revertedWith("Ownable: caller is not the owner");;
    });

  });

});

describe("Validators", () => {
  let deployer, one, two, staker, validatorShare;

  beforeEach(async () => {
    ({ deployer, one, two, staker, validatorShare } = await loadFixture(deployment));
  });

  describe("addValidator", async () => {
    let newValidator;
    let addValidatorTx;

    beforeEach(async () => {
      // setup a mock validator with a pre-existing stake
      newValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
      newValidator.getTotalStake.returns([parseEther(123), 1]);
      addValidatorTx = await staker.connect(deployer).addValidator(newValidator.address);
    });

    it("Adds a new validator", async () => {
      const validators = await staker.getValidators();
      const lastAddedAddress = validators[validators.length - 1]

      expect(lastAddedAddress).to.equal(newValidator.address);
      const validator = await staker.validators(newValidator.address);
      expect(validator.state).to.equal(constants.VALIDATOR_STATE.ENABLED);
    });

    it("Sets the amount staked on the validator", async () => {
      // verify that the staked amount in the staker's Validator struct matches the pre-existing stake
      const [,stakedAmount,] = await staker.validators(newValidator.address);
      await expect(stakedAmount).to.equal(parseEther(123));
    });

    it("Emits the expected event", async () => {
      await expect(addValidatorTx).to.emit(staker, "ValidatorAdded")
        .withArgs(newValidator.address, parseEther(123));
    });

    it("Reverts with zero address", async () => {
      await expect(
        staker.connect(deployer).addValidator(ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(staker,"ZeroAddressNotSupported");
    });

    it("Reverts with an existing address", async () => {
      await expect(
        staker.connect(deployer).addValidator(newValidator.address)
      ).to.be.revertedWithCustomError(staker, "ValidatorAlreadyExists");
    });

    it("Reverts when the caller is not the owner", async () => {
      await expect(
        staker.connect(one).addValidator(two.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("disableValidator", async () => {

    it("Disable an enabled validator", async () => {
      await staker.connect(deployer).disableValidator(validatorShare.address);

      const validator = await staker.validators(validatorShare.address);
      expect(validator.state).to.equal(constants.VALIDATOR_STATE.DISABLED);
    });

    it("Emits the expected event", async () => {
      const tx = await staker.connect(deployer).disableValidator(validatorShare.address);

      await expect(tx).to.emit(staker, "ValidatorStateChanged")
        .withArgs(validatorShare.address, constants.VALIDATOR_STATE.ENABLED, constants.VALIDATOR_STATE.DISABLED);
    });

    it("Reverts with zero address", async () => {
      await expect(
        staker.connect(deployer).disableValidator(ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(staker,"ZeroAddressNotSupported");
    });

    it("Reverts with an unknown validator address", async () => {
      await expect(
        staker.connect(deployer).disableValidator(one.address)
      ).to.be.revertedWithCustomError(staker, "ValidatorNotEnabled");
    });

    it("Reverts with a disabled validator address", async () => {
      await staker.connect(deployer).disableValidator(validatorShare.address);

      await expect(
        staker.connect(deployer).disableValidator(validatorShare.address)
      ).to.be.revertedWithCustomError(staker, "ValidatorNotEnabled");
    });

    it("Reverts when the caller is not the owner", async () => {
      await expect(
        staker.connect(one).disableValidator(validatorShare.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("enableValidator", async () => {

    beforeEach(async () => {
      await staker.connect(deployer).disableValidator(validatorShare.address);
    });

    it("Enable a disabled validator", async () => {
      await staker.connect(deployer).enableValidator(validatorShare.address);

      const validator = await staker.validators(validatorShare.address);
      expect(validator.state).to.equal(constants.VALIDATOR_STATE.ENABLED);
    });

    it("Emits the expected event", async () => {
      const tx = await staker.connect(deployer).enableValidator(validatorShare.address);

      await expect(tx).to.emit(staker, "ValidatorStateChanged")
        .withArgs(validatorShare.address, constants.VALIDATOR_STATE.DISABLED, constants.VALIDATOR_STATE.ENABLED);
    });

    it("Reverts with zero address", async () => {
      await expect(
        staker.connect(deployer).enableValidator(ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(staker,"ZeroAddressNotSupported");
    });

    it("Reverts with an unknown validator address", async () => {
      await expect(
        staker.connect(deployer).enableValidator(one.address)
      ).to.be.revertedWithCustomError(staker, "ValidatorNotDisabled");
    });

    it("Reverts with an enabled validator address", async () => {
      await staker.connect(deployer).enableValidator(validatorShare.address);

      await expect(
        staker.connect(deployer).enableValidator(validatorShare.address)
      ).to.be.revertedWithCustomError(staker, "ValidatorNotDisabled");
    });

    it("Reverts when the caller is not the owner", async () => {
      await expect(
        staker.connect(one).enableValidator(validatorShare.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("setDefaultValidator", async () => {

    it("Sets a default validator", async () => {
      // mock validator
      const newValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
      newValidator.getTotalStake.returns([parseEther(123), 1]);

      // add the new validator to enable it
      await staker.connect(deployer).addValidator(newValidator.address);

      // set it as the default validator
      await staker.connect(deployer).setDefaultValidator(newValidator.address);

      expect(await staker.defaultValidatorAddress()).to.equal(newValidator.address);
    });

    it("Emits the expected event", async () => {
      await expect(staker.connect(deployer).setDefaultValidator(validatorShare.address)).to.emit(staker, "SetDefaultValidator")
      .withArgs(validatorShare.address, validatorShare.address);
    });

    it("Reverts when called by non-owner", async () => {
      await expect(staker.connect(one).setDefaultValidator(validatorShare.address)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Reverts with zero address", async () => {
      await expect(
        staker.connect(deployer).setDefaultValidator(ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(staker,"ZeroAddressNotSupported");
    });

    it("Reverts with a non-enabled validated", async () => {
      let newValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
      newValidator.getTotalStake.returns([parseEther(123), 1]);
      await staker.connect(deployer).addValidator(newValidator.address);
      await staker.connect(deployer).disableValidator(newValidator.address);
      await expect(
        staker.connect(deployer).setDefaultValidator(newValidator.address)
      ).to.be.revertedWithCustomError(staker, "ValidatorNotEnabled");
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
            await expect(staker.connect(one).allocate(parseEther(10),ethers.constants.AddressZero)).to.be.revertedWithCustomError(staker,"ZeroAddressNotSupported");
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
                ])
              )
            ).to.be.revertedWithCustomError(staker, "ZeroAddressNotSupported");
            await expect(
                ethers.getContractFactory("TruStakeMATICv2").then(
                  (stakerFactory) => upgrades.deployProxy(stakerFactory, [
                    token.address,
                    ethers.constants.AddressZero,
                    validatorShare.address,
                    whitelist.address,
                    treasury.address,
                    constants.PHI_PRECISION,
                    constants.DIST_PHI,
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
                  ])
                )
              ).to.be.revertedWithCustomError(staker, "ZeroAddressNotSupported");
          });
        });

});
