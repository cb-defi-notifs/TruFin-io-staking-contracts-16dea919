import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { smock } from '@defi-wonderland/smock';
import { AddressZero } from "@ethersproject/constants";
import * as helpers from "@nomicfoundation/hardhat-network-helpers";
import * as constants from "../helpers/constants";

const chainId = constants.DEFAULT_CHAIN_ID;

const parseEther = ethers.utils.parseEther;

// needed because solidity div always rounds down
const expectDivEqual = (a: any, b: any) => expect(a - b).to.be.oneOf([0, 1]);

const getAddressMappingStorageIndex = (address, mappingIndex) =>
  ethers.utils.solidityKeccak256(
    ["uint256", "uint256"],
    [address, mappingIndex]
  );

const getBalanceStorageIndex = (address: String) =>
  getAddressMappingStorageIndex(address, 0);

const setTokenBalancesAndApprove = async (token, users, recipient, amount) => {
  const index = getBalanceStorageIndex(users[0].address);
  const callBalance = await token.balanceOf(users[0].address);
  const storageBalance = ethers.BigNumber.from(
    await helpers.getStorageAt(token.address, index)
  );
  expect(storageBalance).to.equal(callBalance);

  for (let user of users) {
    // get balance storage index
    const userIndex = getBalanceStorageIndex(user.address);

    // set balance to amount
    await helpers.setStorageAt(token.address, userIndex, amount);

    // approve amount to recipient
    await token.connect(user).approve(recipient, amount);
  }
};

describe("Staker", () => {
  let deployer, treasury, user1, user2, user3;
  let token, validatorShare, stakeManager, whitelist, staker;
  let snapshot: any;

  before(async () => {
    // load deployed contracts
    token = await ethers.getContractAt(
      constants.STAKING_TOKEN_ABI,
      constants.STAKING_TOKEN_ADDRESS[chainId]
    );
    validatorShare = await ethers.getContractAt(
      constants.VALIDATOR_SHARE_ABI,
      constants.VALIDATOR_SHARE_CONTRACT_ADDRESS[chainId]
    );
    stakeManager = await ethers.getContractAt(
      constants.STAKE_MANAGER_ABI,
      constants.STAKE_MANAGER_CONTRACT_ADDRESS[chainId]
    );

    // load signers, balances set to 10k ETH in hardhat config file
    [deployer, treasury, user1, user2, user3] = await ethers.getSigners();

    // mock whitelist
    whitelist = await smock.fake(constants.WHITELIST_ABI);

    // add users to whitelist
    whitelist.isUserWhitelisted.returns((params : [string]) => {
      return [deployer, treasury, user1, user2].map(it => it.address).includes(params[0])
    });

    staker = await ethers
      .getContractFactory("TruStakeMATICv2")
      .then((stakerFactory) =>
        upgrades.deployProxy(stakerFactory, [
          token.address,
          stakeManager.address,
          validatorShare.address,
          whitelist.address,
          treasury.address,
          constants.PHI,
          constants.DIST_PHI,
        ])
      );

    // make it the default validator
    await staker.setDefaultValidator(validatorShare.address);

    // set each balance to 10k MATIC and approve it to staker
    await setTokenBalancesAndApprove(
      token,
      [user1, user2, deployer, treasury],
      staker.address,
      parseEther("1000000")
    );

    // treasury deposits first
    await staker.connect(treasury).deposit(parseEther("100"), treasury.address);

    // save snapshot
    snapshot = await helpers.takeSnapshot();
  });

  beforeEach(async () => {
    // reset to snapshot
    await snapshot.restore();
  });

  describe(`Setters`, async () => {

    it(`Set whitelist`, async () => {
      const tx = await staker.setWhitelist(deployer.address);

      await expect(tx)
        .to.emit(staker, "SetWhitelist")
        .withArgs(whitelist.address, deployer.address);
      expect(await staker.whitelistAddress()).to.equal(deployer.address);
    });

    it(`Set treasury`, async () => {
      const tx = await staker.setTreasury(deployer.address);

      await expect(tx)
        .to.emit(staker, "SetTreasury")
        .withArgs(treasury.address, deployer.address);
      expect(await staker.treasuryAddress()).to.equal(deployer.address);
    });

    it(`Set phi`, async () => {
      const tx = await staker.setPhi(10);

      await expect(tx).to.emit(staker, "SetPhi").withArgs(constants.PHI, 10);
      expect(await staker.phi()).to.equal(10);
    });

    it(`Set dist phi`, async () => {
      const tx = await staker.setDistPhi(20);

      await expect(tx)
        .to.emit(staker, "SetDistPhi")
        .withArgs(constants.DIST_PHI, 20);
      expect(await staker.distPhi()).to.equal(20);
    });
  });

  describe(`Main`, async () => {
    it(`Deposit`, async () => {
      // stake as user1
      const amount = parseEther("1000");

      const tx = await staker.connect(user1).deposit(amount, user1.address);

      await expect(tx).to.emit(staker, "Deposited");
      expect(await staker.balanceOf(user1.address)).to.equal(amount);
    });

    it(`Mint`, async () => {
      // stake as user1
      const amount = parseEther("1000");

      const tx = await staker.connect(user1).mint(amount, user1.address);

      await expect(tx).to.emit(staker, "Deposited");
      expect(await staker.balanceOf(user1.address)).to.equal(amount);
    });

    it(`Withdraw`, async () => {
      // stake as user1
      const amount = parseEther("1000");
      await staker.connect(user1).deposit(amount, user1.address);

      const tx = await staker
        .connect(user1)
        .withdraw(parseEther("1000"), user1.address, user1.address);

      await expect(tx).to.emit(staker, "WithdrawalRequested");
      expect(await staker.balanceOf(user1.address)).to.equal(0);
    });

    it(`Redeem`, async () => {
      // stake as user1
      const amount = parseEther("1000");
      await staker.connect(user1).deposit(amount, user1.address);

      const tx = await staker
        .connect(user1)
        .redeem(parseEther("500"), user1.address, user1.address);

      await expect(tx).to.emit(staker, "WithdrawalRequested");
      expect(await staker.balanceOf(user1.address)).to.equal(parseEther("500"));
    });
  });

  describe(`Allocations`, async () => {
    it(`Allocate to user`, async () => {
      // stake as user1
      const amount = parseEther("1000");
      await staker.connect(user1).deposit(amount, user1.address);

      // allocate
      const tx = await staker
        .connect(user1)
        .allocate(parseEther("1000"), user2.address);

      await expect(tx).to.emit(staker, "Allocated");

      const userAlloc = await staker.allocations(user1.address, user2.address, false);
      const sharePrice = userAlloc.sharePriceNum/userAlloc.sharePriceDenom;
      expect(userAlloc.maticAmount).to.equal(amount);
      expect(sharePrice).to.equal(1e18);

      await staker.connect(user1).deposit(amount, user1.address);
      await staker
        .connect(user1)
        .allocate(parseEther("100"), user2.address);
    });

    it(`Deallocate from user`, async () => {
      // stake as user1
      const amount = parseEther("1000");
      await staker.connect(user1).deposit(amount, user1.address);

      // allocate
      await staker
        .connect(user1)
        .allocate(parseEther("1000"), user2.address);

      const tx = await staker
        .connect(user1)
        .deallocate(parseEther("1000"), user2.address);

      await expect(tx).to.emit(staker, "Deallocated");
      expect(
        await staker.allocations(user1.address, user2.address, false)
      ).to.deep.equal([0, 0, 0]);
    });

    it(`Distribute rewards`, async () => {
      // stake as user1 and user2
      const amount = parseEther("1000");
      await staker.connect(user1).deposit(amount, user1.address);
      await staker.connect(user2).deposit(amount, user2.address);

      // allocate
      await staker
        .connect(user1)
        .allocate(parseEther("100"), user2.address);
      await staker
        .connect(user1)
        .allocate(parseEther("400"), user2.address);

      await helpers.time.increase(100000000);

      await token.transfer(staker.address, parseEther("1000"));

      const user2BalanceBefore = await staker.balanceOf(user2.address);

      await staker
        .connect(user1)
        .distributeRewards(user2.address, false);

      const user2BalanceAfter = await staker.balanceOf(user2.address);

      expect(user2BalanceAfter).to.be.gt(user2BalanceBefore);

    });
  });

  describe(`Revert`, async () => {
    it(`When try to initialize contract again`, async () => {
      await expect(
        staker.initialize(
          token.address,
          stakeManager.address,
          validatorShare.address,
          whitelist.address,
          treasury.address,
          constants.PHI,
          constants.DIST_PHI,
        )
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it(`When not owner tries to add a validator`, async () => {
      await expect(
        staker.connect(user1).addValidator(user1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it(`When not owner tries to set whitelist`, async () => {
      await expect(
        staker.connect(user1).setWhitelist(user1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it(`When not owner tries to set treasury`, async () => {
      await expect(
        staker.connect(user1).setTreasury(user1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it(`When not owner tries to set phi`, async () => {
      await expect(staker.connect(user1).setPhi(1)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it(`When not owner tries to set dist phi`, async () => {
      await expect(staker.connect(user1).setDistPhi(1)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it(`When try to set phi if it is too large`, async () => {
      await expect(
        staker.setPhi(parseEther("1"))
      ).to.be.revertedWithCustomError(staker, "PhiTooLarge");
    });

    it(`When try to set dist phi if it is too large`, async () => {
      await expect(
        staker.setDistPhi(parseEther("1"))
      ).to.be.revertedWithCustomError(staker, "DistPhiTooLarge");
    });

    it(`When not whitelisted user tries to allocate`, async () => {
      await expect(
        staker.connect(user3).allocate(1, deployer.address)
      ).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
    });

    it(`When not whitelisted user tries to deallocate`, async () => {
      await expect(
        staker.connect(user3).deallocate(1, deployer.address)
      ).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
    });

    it(`When try to allocate 0 amount`, async () => {
      await expect(
          staker.allocate(0, deployer.address)
      ).to.be.revertedWithCustomError(staker, "AllocationUnderOneMATIC");
    });

    it(`When try to deallocate`, async () => {
      await expect(
        staker.deallocate(1, deployer.address)
      ).to.be.revertedWithCustomError(staker, "AllocationNonExistent");
    });

    it(`When not whitelisted user tries to deposit`, async () => {
      await expect(
          staker.connect(user3).deposit(1, user1.address)
      ).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
    });

    it(`When not whitelisted user tries to mint`, async () => {
      await expect(
          staker.connect(user3).mint(1, deployer.address)
      ).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
    });

    it(`When not whitelisted user tries to withdraw`, async () => {
      await expect(
          staker.connect(user3).withdraw(1, user1.address, deployer.address)
      ).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
    });

    it(`When not whitelisted user tries to redeem`, async () => {
      await expect(
          staker.connect(user3).redeem(1, user1.address, deployer.address)
      ).to.be.revertedWithCustomError(staker, "UserNotWhitelisted");
    });
  });
});
