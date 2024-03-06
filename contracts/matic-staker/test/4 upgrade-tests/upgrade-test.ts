import * as constants from "../helpers/constants";
import { ethers, network, upgrades } from "hardhat";
import { expect } from "chai";

describe("UPGRADE", () => {

  describe("Staker contract", async () => {
    it("can upgrade staker contract", async () => {
      const stakerFactory = await ethers.getContractFactory("TruStakeMATICv2");
      const stakerAddress = constants.STAKER_ADDRESS[constants.DEFAULT_CHAIN_ID]

      // Validates and deploys a new implementation contract and returns its address.
      const address = await upgrades.prepareUpgrade(stakerAddress, stakerFactory, { unsafeAllowRenames: true })
      expect(address).to.be.lengthOf(42);
    });

    it("can access all storage variables after an upgrade", async () => {
      // Get the mainnet staker contract
      const mainnetStaker = await ethers.getContractAt(
        constants.MAINNET_STAKER_ABI,
        constants.STAKER_ADDRESS[constants.DEFAULT_CHAIN_ID]
      );

      // Query storage variables in mainnet staker contract
      const stakingTokenAddress = await mainnetStaker.stakingTokenAddress();
      const stakeManagerContractAddress = await mainnetStaker.stakeManagerContractAddress();
      const validatorShareContractAddress = await mainnetStaker.validatorShareContractAddress();
      const whitelistAddress = await mainnetStaker.whitelistAddress();
      const treasuryAddress = await mainnetStaker.treasuryAddress();
      const phi = await mainnetStaker.phi();
      const distPhi = await mainnetStaker.distPhi();
      const epsilon = await mainnetStaker.epsilon();

      // Upgrade Staker contract
      const upgradedStaker = await upgradeStakerContract();

      // Verify that can access the same storage variables values
      expect(await upgradedStaker.stakingTokenAddress()).is.equal(stakingTokenAddress);
      expect(await upgradedStaker.defaultValidatorAddress()).is.equal(validatorShareContractAddress);
      expect(await upgradedStaker.stakeManagerContractAddress()).is.equal(stakeManagerContractAddress);
      expect(await upgradedStaker.whitelistAddress()).is.equal(whitelistAddress);
      expect(await upgradedStaker.treasuryAddress()).is.equal(treasuryAddress);
      expect(await upgradedStaker.phi()).is.equal(phi);
      expect(await upgradedStaker.distPhi()).is.equal(distPhi);
      expect(await upgradedStaker.epsilon()).is.equal(epsilon);
    });
  });

});

async function upgradeStakerContract() {

  // Impersonate proxy admin owner
  const proxyAdminOwner = "0x71598A2209b4a9C3E23260Ac373180f4B637136d";
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [proxyAdminOwner],
  });

  const proxyAdminSigner = await ethers.getSigner(proxyAdminOwner);
  const [deployer] = await ethers.getSigners();

  // Send some ETH to proxy admin owner
  await deployer.sendTransaction({
    to: proxyAdminSigner.address,
    value: ethers.utils.parseEther("2")
  });

  // Transfer proxy admin ownership to deployer
  await upgrades.admin.transferProxyAdminOwnership(deployer.address, proxyAdminSigner);

  // Upgrade Staker contract
  const StakerFactory = await ethers.getContractFactory("TruStakeMATICv2");
  const stakerAddress = constants.STAKER_ADDRESS[constants.DEFAULT_CHAIN_ID]
  await upgrades.upgradeProxy(stakerAddress, StakerFactory, { unsafeAllowRenames: true })

  // Access upgraded staker contract via the new ABI
  const upgradedStaker = await ethers.getContractAt(
    constants.STAKER_ABI,
    constants.STAKER_ADDRESS[constants.DEFAULT_CHAIN_ID]
  );

  return upgradedStaker;
}
