import { ethers, network, upgrades } from "hardhat";
import { expect } from "chai";
import { Contract } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("HAPPY PATH", () => {
  let whitelist: Contract;
  let owner;
  let agent;
  let user;

  // Whitelisting status
  const WhitelistingStatus = {
    None: 0,
    Whitelisted: 1,
    Blacklisted: 2
  };

  beforeEach(async function () {

    [owner, agent, user] = await ethers.getSigners();

    // currently mock objects are called separately whenever needed
    const whiteListFactory = await ethers.getContractFactory("MasterWhitelist");
    whitelist = await upgrades.deployProxy(whiteListFactory, []);

    // add an agent
    whitelist.connect(owner).addAgent(agent.address);
  });

  it("should return true when checking whether the owner is an agent", async function () {
    expect(await whitelist.connect(owner).isAgent(owner.address)).to.equal(true);
  });

  it("allows the owner to whitelist a user without being explicitly listed as an agent", async function () {
    await whitelist.connect(owner).whitelistUser(user.address);

    expect(await whitelist.connect(owner).isUserWhitelisted(user.address)).to.equal(true);
  });

  it("addAgent adds an agent but doesn't whitelist the agent's address", async function () {
    await whitelist.connect(owner).addAgent(user.address);

    expect(await whitelist.isUserWhitelisted(user.address)).to.equal(false);
    expect(await whitelist.isAgent(user.address)).equal(true);
  });

  it("removeAgent should not remove the agent from the whitelist", async function () {
    expect(await whitelist.isAgent(agent.address)).equal(true);
    await whitelist.whitelistUser(agent.address);

    await whitelist.removeAgent(agent.address);
    expect(await whitelist.isAgent(agent.address)).equal(false);
    expect(await whitelist.isUserWhitelisted(agent.address)).to.equal(true);
  });

  it("should whitelist a new user", async function () {
    expect(await whitelist.isUserWhitelisted(agent.address)).to.equal(false);

    await whitelist.connect(agent).whitelistUser(user.address);

    expect(await whitelist.connect(agent).isUserWhitelisted(user.address)).to.equal(true);
    expect(await whitelist.connect(agent).isUserBlacklisted(user.address)).to.equal(false);
  });

  it("should blacklist a new user", async function () {
    expect(await whitelist.isUserBlacklisted(agent.address)).to.equal(false);

    await whitelist.connect(agent).blacklistUser(user.address);

    expect(await whitelist.connect(agent).isUserWhitelisted(user.address)).to.equal(false);
    expect(await whitelist.connect(agent).isUserBlacklisted(user.address)).to.equal(true);
  });

  it("should whitelist a blacklisted user", async function () {
    await whitelist.connect(agent).blacklistUser(user.address);
    expect(await whitelist.connect(agent).isUserBlacklisted(user.address)).to.equal(true);

    await whitelist.connect(agent).whitelistUser(user.address);

    expect(await whitelist.connect(agent).isUserWhitelisted(user.address)).to.equal(true);
    expect(await whitelist.connect(agent).isUserBlacklisted(user.address)).to.equal(false);
  });

  it("should blacklist a whitelisted user", async function () {
    await whitelist.connect(agent).whitelistUser(user.address);
    expect(await whitelist.connect(agent).isUserWhitelisted(user.address)).to.equal(true);

    await whitelist.connect(agent).blacklistUser(user.address);

    expect(await whitelist.connect(agent).isUserWhitelisted(user.address)).to.equal(false);
    expect(await whitelist.connect(agent).isUserBlacklisted(user.address)).to.equal(true);
  });

  it("should clear a blacklisted user's whitelisting status", async function () {
    await whitelist.connect(agent).blacklistUser(user.address);
    expect(await whitelist.isUserBlacklisted(user.address)).to.equal(true);

    await whitelist.connect(agent).clearWhitelistStatus(user.address);

    expect(await whitelist.connect(agent).isUserBlacklisted(user.address)).to.equal(false);
    expect(await whitelist.connect(agent).isUserWhitelisted(user.address)).to.equal(false);
  });

  it("should clear a whitelisted user's whitelisting status", async function () {
    await whitelist.connect(agent).whitelistUser(user.address);
    expect(await whitelist.isUserWhitelisted(user.address)).to.equal(true);

    await whitelist.connect(agent).clearWhitelistStatus(user.address);

    expect(await whitelist.connect(agent).isUserBlacklisted(user.address)).to.equal(false);
    expect(await whitelist.connect(agent).isUserWhitelisted(user.address)).to.equal(false);
  });

  it("should whitelist a cleared user's whitelisting status", async function () {
    await whitelist.connect(agent).whitelistUser(user.address);
    expect(await whitelist.isUserWhitelisted(user.address)).to.equal(true);

    await whitelist.connect(agent).clearWhitelistStatus(user.address);
    expect(await whitelist.connect(agent).isUserBlacklisted(user.address)).to.equal(false);
    expect(await whitelist.connect(agent).isUserWhitelisted(user.address)).to.equal(false);

    await whitelist.connect(agent).whitelistUser(user.address);

    expect(await whitelist.connect(agent).isUserBlacklisted(user.address)).to.equal(false);
    expect(await whitelist.connect(agent).isUserWhitelisted(user.address)).to.equal(true);
  });

  it("should blacklist a cleared user's whitelisting status", async function () {
    await whitelist.connect(agent).whitelistUser(user.address);
    expect(await whitelist.isUserWhitelisted(user.address)).to.equal(true);

    await whitelist.connect(agent).clearWhitelistStatus(user.address);
    expect(await whitelist.connect(agent).isUserBlacklisted(user.address)).to.equal(false);
    expect(await whitelist.connect(agent).isUserWhitelisted(user.address)).to.equal(false);

    await whitelist.connect(agent).blacklistUser(user.address);

    expect(await whitelist.connect(agent).isUserBlacklisted(user.address)).to.equal(true);
    expect(await whitelist.connect(agent).isUserWhitelisted(user.address)).to.equal(false);
  });

  // Testing events

  it("adding an agent should emit an event", async function () {
    await expect(whitelist.connect(owner).addAgent(user.address))
      .to.emit(whitelist, "AgentAdded")
      .withArgs(user.address);
  });

  it("removing an agent should emit an event", async function () {
    expect(await whitelist.isAgent(agent.address)).equal(true);

    await expect(whitelist.connect(owner).removeAgent(agent.address))
      .to.emit(whitelist, "AgentRemoved")
      .withArgs(agent.address);
  });

  it("should raise an event when a user is whitelisted", async function () {
    await expect(await whitelist.connect(agent).whitelistUser(user.address))
      .to.emit(whitelist, "WhitelistingStatusChanged")
      .withArgs(user.address, WhitelistingStatus.None, WhitelistingStatus.Whitelisted);
  });

  it("should raise an event when a user is blacklisted", async function () {
    await expect(await whitelist.connect(agent).blacklistUser(user.address))
      .to.emit(whitelist, "WhitelistingStatusChanged")
      .withArgs(user.address, WhitelistingStatus.None, WhitelistingStatus.Blacklisted);
  });

  it("should raise an event when a blacklisted user's whitelisting status is cleared", async function () {
    await whitelist.connect(agent).blacklistUser(user.address);

    await expect(await whitelist.connect(agent).clearWhitelistStatus(user.address))
      .to.emit(whitelist, "WhitelistingStatusChanged")
      .withArgs(user.address, WhitelistingStatus.Blacklisted, WhitelistingStatus.None);
  });

  it("should raise an event when a whitelisted user's whitelisting status is cleared", async function () {
    await whitelist.connect(agent).whitelistUser(user.address);

    await expect(await whitelist.connect(agent).clearWhitelistStatus(user.address))
      .to.emit(whitelist, "WhitelistingStatusChanged")
      .withArgs(user.address, WhitelistingStatus.Whitelisted, WhitelistingStatus.None);
  });

  it("should raise an event when a whitelisted user is blacklisted", async function () {
    await whitelist.connect(agent).whitelistUser(user.address);

    await expect(await whitelist.connect(agent).blacklistUser(user.address))
      .to.emit(whitelist, "WhitelistingStatusChanged")
      .withArgs(user.address, WhitelistingStatus.Whitelisted, WhitelistingStatus.Blacklisted);
  });

  it("should raise an event when a blacklisted user is whitelisted", async function () {
    await whitelist.connect(agent).blacklistUser(user.address);

    await expect(await whitelist.connect(agent).whitelistUser(user.address))
      .to.emit(whitelist, "WhitelistingStatusChanged")
      .withArgs(user.address, WhitelistingStatus.Blacklisted, WhitelistingStatus.Whitelisted);
  });

});
