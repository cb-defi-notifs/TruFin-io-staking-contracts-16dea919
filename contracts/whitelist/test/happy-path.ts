import { ethers, network, upgrades } from "hardhat";
import { expect } from "chai";
import { Contract } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("HAPPY PATH", () => {
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

    // UserType Setup
    const UserType = {
      User: 0,
      MarketMaker: 1,
      Vault: 2,
      Lawyer: 3,
      SwapManager: 4,
  };

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

  it("addLawyer should AddedToWhitelist emit event", async function () {
    await expect(await whitelist.addLawyer(lawyer.address))
    .to.emit(whitelist, "AddedToWhitelist")
    .withArgs(lawyer.address, UserType.Lawyer, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Manual")));
  });

  it("addLawyer adds a lawyer but doesn't whitelist the lawyer's address", async function () {
    await whitelist.connect(owner).addLawyer(user.address);

    expect(await whitelist.isUserWhitelisted(user.address)).to.equal(false);
    expect(await whitelist.isLawyer(user.address)).equal(true);
  });

  it("removeLawyer should emit RemovedFromWhitelist event", async function () {
    await expect(await whitelist.removeLawyer(lawyer.address))
      .to.emit(whitelist, "RemovedFromWhitelist")
      .withArgs(lawyer.address, UserType.Lawyer);
  });

  it("removeLawyer should not remove lawyer from whitelist", async function () {
    expect(await whitelist.isLawyer(lawyer.address)).equal(true);
    await whitelist.addUserToWhitelist(lawyer.address);

    await whitelist.removeLawyer(lawyer.address);
    expect(await whitelist.isLawyer(lawyer.address)).equal(false);
    expect(await whitelist.isUserWhitelisted(lawyer.address)).to.equal(true);

  });

  it("addSwapManagerToWhitelist should emit event", async function () {
    await expect(
      await whitelist
        .connect(lawyer)
        .addSwapManagerToWhitelist(swapManager.address)
    )
      .to.emit(whitelist, "AddedToWhitelist")
      .withArgs(swapManager.address, UserType.SwapManager, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Manual")));
  });

  it("addSwapManagerToWhitelist should add swap manager to whitelist", async function () {
    await expect(
      await whitelist.isSwapManagerWhitelisted(swapManager.address)
    ).equal(true);
  });

  it("removeSwapManagerFromWhitelist should emit event", async function () {
    await expect(
      await whitelist
        .connect(lawyer)
        .removeSwapManagerFromWhitelist(swapManager.address)
    )
      .to.emit(whitelist, "RemovedFromWhitelist")
      .withArgs(swapManager.address, UserType.SwapManager);
  });

  it("removeSwapManagerFromWhitelist should remove swap manager from whitelist", async function () {
    await expect(
      await whitelist.isSwapManagerWhitelisted(swapManager.address)
    ).equal(false);
    await whitelist
      .connect(lawyer)
      .addSwapManagerToWhitelist(swapManager.address);
  });

  it("setInvestigationPeriod should change the investigation period", async function () {
    await expect(await whitelist.getInvestigationPeriod()).to.equal(604800);
    await expect(whitelist.connect(lawyer).setInvestigationPeriod(691200)).to
      .not.be.reverted;
    await expect(await whitelist.getInvestigationPeriod()).to.equal(691200);
  });

  it("setKYCReader should change the KYC Reader address", async function () {
    await expect(await whitelist.kycReader()).to.equal(
      "0x0000000000000000000000000000000000000000"
    );

    await expect(whitelist.connect(lawyer).setKYCReader(reader.address)).to.not
      .be.reverted;
    await expect(await whitelist.kycReader()).to.equal(reader.address);
  });

  it("setKYCRegistry should change the KYC Registry address", async function () {
    await expect(await whitelist.kycRegistry()).to.equal(
      "0x0000000000000000000000000000000000000000"
    );

    await expect(whitelist.connect(lawyer).setKYCRegistry(registry.address)).to
      .not.be.reverted;
    await expect(await whitelist.kycRegistry()).to.equal(registry.address);
  });

  it("addUserToWhitelist should emit event", async function () {
    await expect(
      await whitelist.connect(lawyer).addUserToWhitelist(user.address)
    )
      .to.emit(whitelist, "AddedToWhitelist")
      .withArgs(user.address, UserType.User, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Manual")));
  });

  it("addUserToWhitelist should add user to whitelist", async function () {
    await expect(
      await whitelist.connect(lawyer).isUserWhitelisted(user.address)
    ).to.equal(true);
  });

  it("addUserToWhitelistWithProvider should add user to whitelist", async function () {
    await expect(
      await whitelist
        .connect(lawyer)
        .addUserToWhitelistWithProvider(
          user.address,
          ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Manual"))
        )
    )
      .to.emit(whitelist, "AddedToWhitelist")
      .withArgs(user.address, UserType.User, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Manual")));
  });

  it("checkKYCProvider should return the KYC provider", async function () {
    await whitelist
        .connect(lawyer)
        .addUserToWhitelistWithProvider(
          user.address,
          ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MyProvider"))
    );

    await expect(await whitelist.checkKYCProvider(user.address)).to.equal(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MyProvider"))
    );
  });

  it("removeFromWhitelist should emit event", async function () {
    await expect(
      await whitelist.connect(lawyer).removeUserFromWhitelist(user.address)
    )
      .to.emit(whitelist, "RemovedFromWhitelist")
      .withArgs(user.address, UserType.User);
  });

  it("removeFromWhitelist should remove user from whitelist", async function () {
    await expect(
      await whitelist.connect(lawyer).isUserWhitelisted(user.address)
    ).to.equal(false);
    await expect(await whitelist.checkKYCProvider(user.address)).to.equal(
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    await whitelist.connect(lawyer).addUserToWhitelist(user.address);
  });

  it("addMMToWhitelist should emit event", async function () {
    await expect(await whitelist.connect(lawyer).addMMToWhitelist(mm.address))
      .to.emit(whitelist, "AddedToWhitelist")
      .withArgs(mm.address, UserType.MarketMaker, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Manual")));
  });

  it("addMMToWhitelist should add MM to whitelist", async function () {
    await expect(await whitelist.isMMWhitelisted(mm.address)).equal(true);
  });

  it("removeMMFromWhitelist should emit event", async function () {
    await expect(
      await whitelist.connect(lawyer).removeMMFromWhitelist(mm.address)
    )
      .to.emit(whitelist, "RemovedFromWhitelist")
      .withArgs(mm.address, UserType.MarketMaker);
  });

  it("removeMMFromWhitelist should remove market maker from whitelist", async function () {
    await expect(await whitelist.isMMWhitelisted(mm.address)).equal(false);
    await whitelist.connect(lawyer).addMMToWhitelist(mm.address);
  });

  it("setWhitelistedMMId should associate a market maker name to a particular wallet", async function () {
    let mm_name = "wintermute";
    await expect(
      whitelist
        .connect(lawyer)
        .setWhitelistedMMId(mm.address, ethers.utils.formatBytes32String(mm_name))
    ).to.not.be.reverted;
    await expect(
      ethers.utils.parseBytes32String(await whitelist.getWhitelistedMMId(mm.address))
    ).equals(mm_name);
  });

  it("addMMToWhitelistWithId should associate a market maker name to a particular wallet ", async function () {
    let mm_name = "wintermute";
    await expect(
      whitelist
        .connect(lawyer)
        .addMMToWhitelistWithId(
          mm.address,
          ethers.utils.formatBytes32String(mm_name)
        )
    ).to.not.be.reverted;
    await expect(
      ethers.utils.parseBytes32String(await whitelist.getWhitelistedMMId(mm.address))
    ).equals(mm_name);
  });

  it("addVaultToWhitelist should emit event", async function () {
    await expect(
      await whitelist.connect(lawyer).addVaultToWhitelist(vault.address)
    )
      .to.emit(whitelist, "AddedToWhitelist")
      .withArgs(vault.address, UserType.Vault, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Manual")));
  });

  it("addVaultToWhitelist should add vault to whitelist", async function () {
    await expect(await whitelist.isVaultWhitelisted(vault.address)).equal(true);
  });

  it("removeVaultFromWhitelist should emit event", async function () {
    await expect(
      await whitelist.connect(lawyer).removeVaultFromWhitelist(vault.address)
    )
      .to.emit(whitelist, "RemovedFromWhitelist")
      .withArgs(vault.address, UserType.Vault);
  });

  it("removeVaultFromWhitelist should remove vault from whitelist", async function () {
    await expect(await whitelist.isVaultWhitelisted(vault.address)).equal(
      false
    );
    await whitelist.connect(lawyer).addVaultToWhitelist(vault.address);
  });

  it("addAssetToWhitelist should add asset to whitelist", async function () {
    await expect(whitelist.connect(lawyer).addAssetToWhitelist(asset.address))
      .to.not.be.reverted;
    await expect(await whitelist.isAssetWhitelisted(asset.address)).equal(true);
  });

  //! todo makes no sense
  it("removeAssetFromWhitelist should add asset to whitelist", async function () {
    await whitelist.connect(lawyer).removeAssetFromWhitelist(asset.address);
    await expect(await whitelist.isAssetWhitelisted(asset.address)).equal(false);
    await whitelist.connect(lawyer).addAssetToWhitelist(asset.address);
  });

  it("addCountryToBlacklist should add country to Blacklist", async function () {
    await expect(
      await whitelist.isCountryBlacklisted(
        "0x627fe66dd064a0a7d686e05b87b04d5a7c585907afae1f0c65ab27fa379ca189"
      )
    ).equal(false);

    await
      whitelist
        .connect(lawyer)
        .addCountryToBlacklist(
          "0x627fe66dd064a0a7d686e05b87b04d5a7c585907afae1f0c65ab27fa379ca189"
        );

    await expect(
      await whitelist.isCountryBlacklisted(
        "0x627fe66dd064a0a7d686e05b87b04d5a7c585907afae1f0c65ab27fa379ca189"
      )
    ).equal(true);
  });

  it("removeCountryFromBlacklist should remove country to blacklist", async function () {
    await whitelist
        .connect(lawyer)
        .addCountryToBlacklist(
          "0xa58de32261c1daca7d9359f64242e87c5d42b10589f30dafe0c3cf007786f64a"
        );

    await expect(
      await whitelist.isCountryBlacklisted(
        "0xa58de32261c1daca7d9359f64242e87c5d42b10589f30dafe0c3cf007786f64a"
      )
    ).equal(true);

    await whitelist
        .connect(lawyer)
        .removeCountryFromBlacklist(
          "0xa58de32261c1daca7d9359f64242e87c5d42b10589f30dafe0c3cf007786f64a"
        );

    await expect(
      await whitelist.isCountryBlacklisted(
        "0xa58de32261c1daca7d9359f64242e87c5d42b10589f30dafe0c3cf007786f64a"
      )
    ).equal(false);
  });

  it("isCountryBlacklisted should return if the country is blacklisted", async function () {
    await expect(
      await whitelist.isCountryBlacklisted(
        "0x627fe66dd064a0a7d686e05b87b04d5a7c585907afae1f0c65ab27fa379ca189"
      )
    ).equal(true);

    await expect(
      await whitelist.isCountryBlacklisted(
        "0xa58de32261c1daca7d9359f64242e87c5d42b10589f30dafe0c3cf007786f64a"
      )
    ).equal(false);
  });

  it("hasPassport should return false if the user doesn't have one", async function () {
    await expect(await whitelist.hasPassport(user.address)).equal(false);
  });

  it("hasPassport should return true if the user has one", async function () {
    await reader.mockAddPassport(user.address);
    await expect(await whitelist.hasPassport(user.address)).equal(true);
  });

  it("checkFeeRisk should return the correct fee", async function () {
    await expect(await whitelist.checkFeeRisk()).equal("20000000000000000");
  });

  it("checkFeeCountry should return the correct fee", async function () {
    await expect(await whitelist.checkFeeCountry()).equal("20000000000000000");
  });

  it.skip("addUserToWhitelistUsingPassport should add the user to the whitelist", async function () {
    await whitelist.removeUserFromWhitelist(user.address);
    await reader.setNoRiskAddress(user.address);
    const options = { value: ethers.utils.parseEther("0.04") };
    await expect(
      whitelist.addUserToWhitelistUsingPassport(user.address, options)
    )
      .to.emit(whitelist, "AddedToWhitelist")
      .withArgs(user.address, UserType.User, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Manual")));
    await expect(await whitelist.checkKYCProvider(user.address)).to.equal(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Quadrata"))
    );
  });

  it.skip("addUserToWhitelistUsingRegistry should add the user to the whitelist", async function () {
    await whitelist.removeUserFromWhitelist(user.address);
    await registry.mockVerify(user.address);
    await expect(whitelist.addUserToWhitelistUsingRegistry(user.address))
      .to.emit(whitelist, "AddedToWhitelist")
      .withArgs(user.address, UserType.User, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Manual"))); //Manual
    await expect(await whitelist.checkKYCProvider(user.address)).to.equal(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Verite"))
    );
  });

  //! this cannot work yet as the verite support does not exist yet
  it.skip("isUserWhitelisted should return true for a verite whitelisted user", async function () {
    await whitelist
    .connect(lawyer)
    .addUserToWhitelistWithProvider(
      user.address,
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Verite"))
    );

    console.log(await whitelist.connect(lawyer).isUserWhitelisted(user.address));
    expect(await whitelist.connect(lawyer).isUserWhitelisted(user.address)).to.equal(true);
  });

  it("addUserToWhitelistWithProvider automatically sets KYCProvider for user", async function () {
    await whitelist
        .connect(lawyer)
        .addUserToWhitelistWithProvider(
          user.address,
          ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Verite"))
    );

    await expect(await whitelist.checkKYCProvider(user.address)).to.equal(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Verite"))
    );
  });

  it("returns correct value if user is whitelisted for Gnosis auction", async function () {
    await expect(await whitelist.isAllowed(mm.address, 0, 0x0)).equal(
      "0x19a05a7e"
    );
  });

  it("returns empty value if user is not whitelisted for Gnosis auction", async function () {
    await expect(await whitelist.isAllowed(user.address, 0, 0x0)).equal(
      "0x00000000"
    );
  });

  it("addUserToBlacklist should emit event with correct arguments", async function () {
    const investigationPeriod = await whitelist.investigationPeriod();
    const timestamp = await time.latest() + 1;

    await expect(
      whitelist.connect(lawyer).addUserToBlacklist(user.address)
    )
      .to.emit(whitelist, "AddedToBlacklist")
      .withArgs(user.address, timestamp + parseInt(investigationPeriod));
  });

  it("removeUserFromBlacklist should emit event", async function () {
    await whitelist.connect(lawyer).addUserToBlacklist(user.address);

    await expect(
      await whitelist.connect(lawyer).removeUserFromBlacklist(user.address)
    )
      .to.emit(whitelist, "RemovedFromBlacklist")
      .withArgs(user.address);
  });

  it("removeUserFromBlacklist should remove user from blacklist", async function () {
    await whitelist.connect(lawyer).addUserToBlacklist(user.address);
    expect(await whitelist.isUserBlacklisted(user.address)).equal(true);
    await whitelist.connect(lawyer).removeUserFromBlacklist(user.address);

    expect(await whitelist.isUserBlacklisted(user.address)).equal(false);
  });

  it("addUserToBlacklistIndefinitely should emit event", async function () {
    await expect(
      await whitelist
        .connect(lawyer)
        .addUserToBlacklistIndefinitely(user.address)
    )
      .to.emit(whitelist, "AddedToBlacklist")
      .withArgs(user.address, 32503680000);
    await expect(await whitelist.checkKYCProvider(user.address)).to.equal(
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
  });

  it("addUserToBlacklistIndefinitely should add User to blacklist", async function () {
    await whitelist
        .connect(lawyer)
        .addUserToBlacklistIndefinitely(user.address);

    await expect(await whitelist.isUserBlacklisted(user.address)).equal(true);
  });

  it("Checks that blacklisting indefinitely actually blacklists user indefinitely", async function () {
    whitelist.connect(lawyer).addUserToBlacklistIndefinitely(user.address);
    expect(await whitelist.isUserBlacklisted(user.address)).equal(true);

    await ethers.provider.send("evm_increaseTime", [7000000000]);
    await ethers.provider.send("evm_mine", []);

    expect(await whitelist.isUserBlacklisted(user.address)).equal(true);
  });

  it("Normal Blacklist freezing period should not end prematurely", async function () {
    whitelist.connect(lawyer).addUserToBlacklist(user.address);

    await ethers.provider.send("evm_increaseTime", [350000]);
    await ethers.provider.send("evm_mine", []);

    await expect(await whitelist.isUserBlacklisted(user.address)).equal(true);
  });

  it("Confirm that blacklisting automatically ends according to the investigation period", async function () {
    whitelist.connect(lawyer).addUserToBlacklist(user.address);

    // calculate the number of blocks until blacklisting should end
    const timestamp = await time.latest();
    const timestampOfBlacklistEnd = await whitelist.blacklistedUsers(user.address);
    const numberOfBlocksUntilEnd = (timestampOfBlacklistEnd - timestamp);

    await ethers.provider.send("evm_increaseTime", [numberOfBlocksUntilEnd]);
    await ethers.provider.send("evm_mine", []);

    await expect(await whitelist.isUserBlacklisted(user.address)).equal(false);
  });

  it("Adding whitelisted user to blacklist indefinitely removes them from whitelist", async () => {
    // whitelist user
    await whitelist.addUserToWhitelist(user.address);

    // blacklist indefinitely
    await expect(whitelist.addUserToBlacklistIndefinitely(user.address))
    .to.emit(whitelist, "RemovedFromWhitelist")
    .withArgs(user.address, UserType.User);
  });

  it("Adding user to whitelist instantly removes user from blacklist", async () => {
    // blacklist user
    await whitelist.addUserToBlacklist(user.address);

    // whitelist user
    await expect(whitelist.addUserToWhitelist(user.address)).to.emit(whitelist, "RemovedFromBlacklist")
    .withArgs(user.address);
  });

  it("Adding user to whitelist with provider instantly removes them from blacklist", async () => {
    // blacklist user
    await whitelist.addUserToBlacklist(user.address);

    // whitelist with provider
    await expect(whitelist.addUserToWhitelistWithProvider(
      user.address,
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Verite"))
    )).to.emit(whitelist, "RemovedFromBlacklist")
    .withArgs(user.address);
  });

  it("isUserVerified returns true, if user is verite verified and whitelisted", async () => {
    // Mock user having been verified using verite KYC
    await whitelist.addUserToWhitelistWithProvider(
      user.address,
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Verite"))
    );
    await registry.mockVerify(user.address);

    expect(await whitelist.connect(lawyer).isUserWhitelisted(user.address)).to.equal(true);
});

});
