import { ethers, network, upgrades } from "hardhat";
import { expect } from "chai";
import { Contract } from "ethers";


describe("UNHAPPY PATH", () => {
    const ZERO = "0x0000000000000000000000000000000000000000";
    let whitelist: Contract;
    let passport: Contract;
    let reader: Contract;
    let registry: Contract;
    let owner;
    let lawyer;
    let mm;
    let user;
    let vault;
    let asset;
    let swapManager;

    before(async function () {

      [owner, lawyer, mm, user, vault, asset, swapManager] =
        await ethers.getSigners();

      // currently mock objects are called separately whenever needed
      const whiteListFactory = await ethers.getContractFactory("MasterWhitelist");
      whitelist = await upgrades.deployProxy(whiteListFactory, [
        ZERO,
        ZERO,
        [],
      ]);

      // mock environment
      const passportFactory = await ethers.getContractFactory("mockKYCPassport");
      passport = await passportFactory.deploy();
      const readerFactory = await ethers.getContractFactory("mockKYCReader");
      reader = await readerFactory.deploy();
      const registryFactory = await ethers.getContractFactory("mockKYCRegistry");
      registry = await registryFactory.deploy();
    });

    beforeEach(async () => {
        // create lawyer
        whitelist.connect(owner).addLawyer(lawyer.address);
    });

    it("addLawyer should revert if not called by the lawyer", async function () {
      await expect(
        whitelist.connect(user).addLawyer(user.address)
      ).to.be.revertedWith("Lawyer: caller is not a lawyer");

      await expect(await whitelist.isLawyer(user.address)).equal(false);
      await whitelist.connect(owner).addLawyer(owner.address);
    });

    it("removeLawyer should revert if not called by the lawyer", async function () {
      await expect(
        whitelist.connect(user).removeLawyer(lawyer.address)
      ).to.be.revertedWith("Lawyer: caller is not a lawyer");
      await expect(await whitelist.isLawyer(lawyer.address)).equal(true);
    });

    it("addSwapManagerToWhitelist should revert if not called by the lawyer", async function () {
      await expect(
        whitelist.connect(user).addSwapManagerToWhitelist(swapManager.address)
      ).to.be.revertedWith("Lawyer: caller is not a lawyer");
      await expect(
        await whitelist.isSwapManagerWhitelisted(swapManager.address)
      ).equal(false);
    });

    it("removeSwapManagerFromWhitelist should revert if not called by the lawyer", async function () {
      await whitelist
        .connect(lawyer)
        .addSwapManagerToWhitelist(swapManager.address);
      await expect(
        whitelist
          .connect(user)
          .removeSwapManagerFromWhitelist(swapManager.address)
      ).to.be.revertedWith("Lawyer: caller is not a lawyer");
      await expect(
        await whitelist.isSwapManagerWhitelisted(swapManager.address)
      ).equal(true);
    });

    it("setInvestigationPeriod should revert if not called by the lawyer", async function () {
      expect(await whitelist.getInvestigationPeriod()).to.equal(604800);
      await expect(
        whitelist.connect(user).setInvestigationPeriod(604801)
      ).to.be.revertedWith("Lawyer: caller is not a lawyer");
      expect(await whitelist.getInvestigationPeriod()).to.equal(604800);
    });

    it("addUserToWhitelist should revert if not called by lawyer", async function () {
      await expect(
        whitelist.connect(user).addUserToWhitelist(user.address)
      ).to.be.revertedWith("Lawyer: caller is not a lawyer");
      expect(
        await whitelist.connect(lawyer).isUserWhitelisted(user.address)
      ).to.equal(false);
      await whitelist.connect(lawyer).addUserToWhitelist(user.address);
    });

    it("removeUserFromWhitelist should revert if not called by lawyer", async function () {
      await expect(
        whitelist.connect(user).removeUserFromWhitelist(user.address)
      ).to.be.revertedWith("Lawyer: caller is not a lawyer");
      expect(
        await whitelist.connect(lawyer).isUserWhitelisted(user.address)
      ).to.equal(true);
    });

    it("addMMToWhitelist should revert if not called by lawyer", async function () {
      await expect(
        whitelist.connect(user).addMMToWhitelist(mm.address)
      ).to.be.revertedWith("Lawyer: caller is not a lawyer");
      expect(await whitelist.isMMWhitelisted(mm.address)).equal(false);
      whitelist.connect(lawyer).addMMToWhitelist(mm.address);
    });

    it("removeMMFromWhitelist should revert if not called by lawyer", async function () {
      await expect(
        whitelist.connect(user).removeMMFromWhitelist(mm.address)
      ).to.be.revertedWith("Lawyer: caller is not a lawyer");
      await expect(await whitelist.isMMWhitelisted(mm.address)).equal(true);
    });

    it("setIdMM should revert if not called by lawyer", async function () {
      let mm_name = "wintermute";
      await expect(
        whitelist
          .connect(user)
          .setWhitelistedMMId(mm.address, ethers.utils.formatBytes32String(mm_name))
      ).to.be.revertedWith("Lawyer: caller is not a lawyer");
      expect(
        ethers.utils.parseBytes32String(await whitelist.getWhitelistedMMId(mm.address))
      ).equals("");
    });

    it("addVaultToWhitelist should revert if not called by lawyer", async function () {
      await expect(
        whitelist.connect(user).addVaultToWhitelist(vault.address)
      ).to.be.revertedWith("Lawyer: caller is not a lawyer");
      expect(await whitelist.isVaultWhitelisted(vault.address)).equal(
        false
      );
      await whitelist.connect(lawyer).addVaultToWhitelist(vault.address);
    });

    it("removeVaultFromWhitelist should revert if not called by lawyer", async function () {
      await expect(
        whitelist.connect(user).removeVaultFromWhitelist(vault.address)
      ).to.be.revertedWith("Lawyer: caller is not a lawyer");
      expect(await whitelist.isVaultWhitelisted(vault.address)).equal(true);
    });

    it("addAssetToWhitelist should revert if not called by lawyer", async function () {
      await expect(
        whitelist.connect(user).addAssetToWhitelist(asset.address)
      ).to.be.revertedWith("Lawyer: caller is not a lawyer");
      expect(await whitelist.isAssetWhitelisted(asset.address)).equal(
        false
      );
      await whitelist.connect(lawyer).addAssetToWhitelist(asset.address);
    });

    it("removeAssetFromWhitelist should revert if not called by lawyer", async function () {
      await expect(whitelist.connect(user).removeAssetFromWhitelist(asset.address))
      .to.be.revertedWith("Lawyer: caller is not a lawyer");
      expect(await whitelist.isAssetWhitelisted(asset.address)).equal(true);
    });

    it("addUserToBlacklist should revert if not called by lawyer", async function () {
      await expect(
        whitelist.connect(user).addUserToBlacklist(user.address)
      ).to.be.revertedWith("Lawyer: caller is not a lawyer");
      expect(await whitelist.isUserBlacklisted(user.address)).equal(false);
      await whitelist.connect(lawyer).addUserToBlacklist(user.address);
    });

    it("removeUserFromBlacklist should revert if not called by lawyer", async function () {
      // blacklist user
      await whitelist.connect(lawyer).addUserToBlacklist(user.address)

      // non-lawyer removing user from blacklist reverts
      await expect(
        whitelist.connect(user).removeUserFromBlacklist(user.address)
      ).to.be.revertedWith("Lawyer: caller is not a lawyer");
      expect(await whitelist.isUserBlacklisted(user.address)).equal(true);

      // lawyer removes user from blacklist
      await whitelist.connect(lawyer).removeUserFromBlacklist(user.address);
    });

    it("addUserToBlacklistIndefinitely should revert if not called by lawyer", async function () {
      await expect(
        whitelist.connect(user).addUserToBlacklistIndefinitely(user.address)
      ).to.be.revertedWith("Lawyer: caller is not a lawyer");

      expect(await whitelist.isUserBlacklisted(user.address)).equal(false);
    });

    it("addUserToWhitelistUsingPassport should revert if user has no kyc passport", async function () {
      await whitelist.connect(lawyer).removeUserFromWhitelist(user.address);
      await whitelist.connect(lawyer).setKYCReader(reader.address);

      const options = { value: ethers.utils.parseEther("0.04") };
      await expect(
        whitelist.connect(lawyer).addUserToWhitelistUsingPassport(user.address, options)
      ).to.be.revertedWith("user has no KYC passport");
    });

    it("addUserToWhitelistUsingRegistry should revert if user is not verified", async function () {
      await whitelist.connect(lawyer).setKYCRegistry(registry.address);
      await expect(
        whitelist.addUserToWhitelistUsingRegistry(user.address)
      ).to.be.revertedWith("user not verified in registry");
    });

    it("addUserToWhitelistUsingPassport should revert if the user is blacklisted", async function () {
      await reader.mockAddPassport(user.address);
      await whitelist.addUserToBlacklist(user.address);
      await expect(
        whitelist.addUserToWhitelistUsingPassport(user.address)
      ).to.be.revertedWith("user is blacklisted");
    });

    it("addUserToWhitelistUsingRegistry should revert if the user is blacklisted", async function () {
      await registry.mockVerify(user.address);
      await expect(
        whitelist.addUserToWhitelistUsingRegistry(user.address)
      ).to.be.revertedWith("user is blacklisted");
    });

    it("isUserWhitelisted should return false for a verified user not in our whitelist", async function () {
      await whitelist.removeUserFromBlacklist(user.address);
      await registry.mockVerify(user.address);

      expect(await whitelist.isUserWhitelisted(user.address)).to.equal(false);
    });

    it.skip("addUserToWhitelistUsingPassport should revert if the fee is not sent", async function () {
      await whitelist.addUserToWhitelistUsingPassport(user.address);
      await expect(whitelist.addUserToWhitelistUsingPassport(user.address)).to.be.revertedWith("fee is not correct");
    });

    it("addUserToWhitelistUsingPassport should revert if the fee is too low", async function () {
      const options = { value: ethers.utils.parseEther("0.01") };
      await expect(
        whitelist.addUserToWhitelistUsingPassport(user.address, options)
      ).to.be.revertedWithCustomError(whitelist, "MsgValueTooLow");
    });

    it.skip("addUserToWhitelistUsingPassport should pass if the fee is too high", async function () {
      const options = { value: ethers.utils.parseEther("0.1") };
      await expect(
        whitelist.addUserToWhitelistUsingPassport(user.address, options)
      ).to.emit(whitelist, "AddedToWhitelist");
    });

    it.skip("addUserToWhitelistUsingPassport should revert if AML is too high and country is blacklisted", async function () {
      const options = { value: ethers.utils.parseEther("0.04") };
      await expect(
        whitelist.addUserToWhitelistUsingPassport(user.address, options)
      ).to.be.revertedWithCustomError(whitelist, "CouldNotBeWhitelisted");
    });

    it.skip("addUserToWhitelistUsingPassport should revert if AML is too high and country not blacklisted", async function () {
      await whitelist.addCountryToBlacklist(
        "0x627fe66dd064a0a7d686e05b87b04d5a7c585907afae1f0c65ab27fa379ca189"
      );
      await reader.setNoCountryRiskAddress(user.address);
      const options = { value: ethers.utils.parseEther("0.04") };
      await expect(
        whitelist.addUserToWhitelistUsingPassport(user.address, options)
      ).to.be.revertedWithCustomError(whitelist, "CouldNotBeWhitelisted");
    });

    it.skip("addUserToWhitelistUsingPassport should revert if AML is fine but country is blacklisted", async function () {
      await reader.setNoCountryRiskAddress(
        "0x0000000000000000000000000000000000000000"
      );
      await reader.setNoAMLRiskAddress(user.address);
      const options = { value: ethers.utils.parseEther("0.04") };
      await expect(
        whitelist.addUserToWhitelistUsingPassport(user.address, options)
      ).to.be.revertedWithCustomError(whitelist, "CouldNotBeWhitelisted");
    });
  });
