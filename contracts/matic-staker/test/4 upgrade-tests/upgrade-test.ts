import * as constants from "../helpers/constants";
import { ethers, upgrades } from "hardhat";
import { expect } from "chai";

describe("UPGRADE", () => {

  describe("Staker contract", async () => {
    it("can upgrade staker contract", async () => {
        const stakerFactory = await ethers.getContractFactory("TruStakeMATICv2");
        const stakerAddress = constants.STAKER_ADDRESS[constants.DEFAULT_CHAIN_ID]

        // Validates and deploys a new implementation contract and returns its address.
        const address = await upgrades.prepareUpgrade(stakerAddress, stakerFactory, {unsafeAllowRenames: true})
        expect(address).to.be.lengthOf(42);
    });
  });

});

