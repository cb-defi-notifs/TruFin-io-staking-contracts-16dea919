import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployment } from "../helpers/fixture";
import * as constants from "../helpers/constants";
import { submitCheckpoint } from "../helpers/state-interaction";
import { parseEther } from "../helpers/math";
import { smock } from '@defi-wonderland/smock';

describe("Checkpoint Submissions", () => {
  let staker, one, deployer, validatorShare;

  it("rewards are increasing with each checkpoint", async () => {
    // load fixture
    ({ staker, one, deployer } = await loadFixture(deployment));

    // deposit on default validator
    await staker.connect(one).deposit(parseEther(1000));

    // add a new validator and deposit to it
    const newValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
    await staker.connect(deployer).addValidator(newValidator.address);
    await staker.connect(one).depositToSpecificValidator(parseEther(1000), newValidator.address);

    // store initial rewards value (should be zero)
    let lastRewards = await staker.totalRewards();
    // console.log("Rewards:", lastRewards.toString());

    // submit as many times as there are saved checkpoints, check rewards always increase
    for(let i = 0; i<5; i++){

      //submit new checkpoint
      await submitCheckpoint(i);

      // set new rewards
      let newRewards = await staker.totalRewards()

      // uncomment to see how rewards increase for a deposit of 2k
      // console.log("Rewards:", newRewards.toString());

      // check values are increasing each time
      expect(newRewards).to.be.greaterThan(lastRewards);

      // set last rewards
      lastRewards = newRewards;
    }
  });

  it("totalRewards increases more than single validator rewards for each checkpoint", async () => {
    // load fixture
    ({ staker, one, deployer, validatorShare} = await loadFixture(deployment));

    // deposit on default validator
    await staker.connect(one).deposit(parseEther(1000));

    // add a new validator and deposit to it
    const newValidator = await smock.fake(constants.VALIDATOR_SHARE_ABI);
    newValidator.getLiquidRewards.returns(parseEther(100));
    await staker.connect(deployer).addValidator(newValidator.address);
    await staker.connect(one).depositToSpecificValidator(parseEther(1000), newValidator.address);

    // submit as many times as there are saved checkpoints
    for(let i = 0; i<5; i++){

      //submit new checkpoint
      await submitCheckpoint(i);

      // set new rewards
      let newRewards = await staker.totalRewards()
      let singleValidatorRewards = await staker.getRewardsFromValidator(validatorShare.address);


      // uncomment to see how rewards increase for a deposit of 2k and 1k
      // console.log("Total Rewards:", newRewards.toString());
      // console.log("Single Validator Rewards:", singleValidatorRewards.toString());

      // check total rewards are greater than single rewards
      expect(newRewards).to.be.greaterThan(singleValidatorRewards);
    }
  });

  it("rewards on a specific validator increase with each checkpoint", async () => {
    // load fixture
    ({ staker, one, validatorShare } = await loadFixture(deployment));

    // deposit on default validator
    await staker.connect(one).deposit(parseEther(1000));

    let lastRewards = await staker.getRewardsFromValidator(validatorShare.address);
    // console.log("Rewards:", lastRewards.toString());

    // submit as many times as there are saved checkpoints, check rewards always increase
    for(let i = 0; i<5; i++){

      //submit new checkpoint
      await submitCheckpoint(i);

      // set new rewards
      let newRewards = await staker.getRewardsFromValidator(validatorShare.address);

      // uncomment to see how rewards increase for a deposit of 1k
      // console.log("Rewards:", newRewards.toString());

      // check values are increasing each time
      expect(newRewards).to.be.greaterThan(lastRewards);

      // set last rewards
      lastRewards = newRewards;
    }
  });
});
