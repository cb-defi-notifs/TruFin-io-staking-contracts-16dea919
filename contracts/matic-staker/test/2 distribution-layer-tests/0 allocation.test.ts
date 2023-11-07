/** Testing allocation in the TruStakeMATIC vault. */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import * as constants from "../helpers/constants";
import { deployment } from "../helpers/fixture";
import { calculateAmountFromShares, calculateSharePrice, calculateSharesFromAmount, parseEther, calculateTrsyWithdrawFees } from "../helpers/math";
import { submitCheckpoint } from "../helpers/state-interaction";

describe("ALLOCATION", () => {
  let treasury, deployer, one, two, three, four, token, staker;

  beforeEach(async () => {
    // Run before every single test in the file

    // Reset to fixture
    ({ treasury, deployer, one, two, three, four, token, staker } = await loadFixture(
      deployment
    ));

    // Deposit 10k MATIC with account one
    await staker.connect(one).deposit(parseEther(10000), one.address);
  });

  describe("LOOSE", () => {
    // All exclusively loose tests go in here

    const strictness = false;
    const distributionInMATIC = false;

    // Passing test cases

    it("pass: making two allocations adding up to MATIC amount larger than user deposited MATIC", async () => {
      // spread over two (8000 + 3000 = 11000, > 10000)
      // should work - this is actually expected behaviour
      await staker.connect(one).allocate(parseEther(8000), two.address, strictness);
      await staker.connect(one).allocate(parseEther(3000), two.address, strictness);

      // check allocation values
      const oneTwoAllocation = await staker.allocations(one.address, two.address, strictness);
      expect(oneTwoAllocation.maticAmount).to.equal(parseEther(11000));
    });

    it("pass: allocating twice adds up to allocated amount correctly", async () => {
      // Allocate 10k
      await staker.connect(one).allocate(parseEther(5000), two.address, strictness);
      await staker.connect(one).allocate(parseEther(5000), two.address, strictness);

      // Check sum is correct
      const oneTwoAllocationLoose = await staker.allocations(one.address, two.address, strictness);
      expect(oneTwoAllocationLoose.maticAmount).to.equal(parseEther(10000));
    });

    it("pass: first allocation updates state accordingly", async () => {
      // Allocate 1k
      await staker.connect(one).allocate(parseEther(1000), two.address, strictness);

      const sharePriceFraction = await staker.sharePrice();

      // Check values are correctly saved into allocation structs, no math required as first allocation

      const oneTwoAllocation = await staker.allocations(one.address, two.address, strictness);

      expect(oneTwoAllocation.maticAmount).to.equal(parseEther(1000));
      expect(
        oneTwoAllocation.sharePriceNum.div(oneTwoAllocation.sharePriceDenom)
      ).to.equal(parseEther(1));
      expect(oneTwoAllocation.sharePriceNum).to.equal(sharePriceFraction[0]);
      expect(oneTwoAllocation.sharePriceDenom).to.equal(sharePriceFraction[1]);

      // Check values are correctly saved into total allocated struct, no math required as first allocation

      const oneTotalAllocated = await staker.totalAllocated(one.address, strictness);

      expect(oneTotalAllocated.maticAmount).to.equal(parseEther(1000));
      expect(oneTotalAllocated.sharePriceNum).to.equal(sharePriceFraction[0]);
      expect(oneTotalAllocated.sharePriceDenom).to.equal(sharePriceFraction[1]);

      // Check if address one and two have correct first element in dist/recipient array

      expect(await staker.distributors(two.address, strictness, 0)).to.equal(one.address);
      expect(await staker.recipients(one.address, strictness, 0)).to.equal(two.address);

      // And check there's no other elements in these arrays too
      // (Additional check so that mapping getter is also tested separately from array getter)

      expect(await staker.getDistributors(two.address, strictness)).to.eql([one.address]);
      expect(await staker.getRecipients(one.address, strictness)).to.eql([two.address]);
    });

    it("pass: multiple allocations update share prices in allocation mappings correctly", async () => {
      // Allocate to a user
      // Accrue rewards
      // Allocate some more
      // Check everything is as it should be

      let firstAllocationAmount = parseEther(1000);
      let secondAllocationAmount = parseEther(2000);

      let sharePriceFractionOld = await staker.sharePrice();

      // Double check share price starts as 1e18
      expect(sharePriceFractionOld[0].div(sharePriceFractionOld[1])).to.equal(parseEther(1));

      // Allocate 1k one-two
      await staker.connect(one).allocate(firstAllocationAmount, two.address, strictness);

      // First allocation so allocation and total allocated should have same values for everything

      const oneTwoAllocation = await staker.allocations(one.address, two.address, strictness);
      expect(oneTwoAllocation.maticAmount).to.equal(firstAllocationAmount);
      expect(oneTwoAllocation.sharePriceNum).to.equal(sharePriceFractionOld[0]);
      expect(oneTwoAllocation.sharePriceDenom).to.equal(sharePriceFractionOld[1]);

      const oneTotalAllocated = await staker.totalAllocated(one.address, strictness);
      expect(oneTotalAllocated.maticAmount).to.equal(firstAllocationAmount);
      expect(oneTotalAllocated.sharePriceNum).to.equal(sharePriceFractionOld[0]);
      expect(oneTotalAllocated.sharePriceDenom).to.equal(sharePriceFractionOld[1]);

      for(let i = 0; i<5; i++){
         // Accrue rewards
        await submitCheckpoint(i);

         // Save new share price
        let sharePriceFractionNew = await staker.sharePrice();

        // Allocate 2k more to user two
        await staker.connect(one).allocate(secondAllocationAmount, two.address, strictness);
        // The one-two allocation struct should have the same amt but share price should have changed

        let oneTwoAllocationNew = await staker.allocations(one.address, two.address, strictness);
        expect(oneTwoAllocationNew.maticAmount).to.equal(
          firstAllocationAmount.add(secondAllocationAmount)
        );

        let oneTotalAllocatedNew = await staker.totalAllocated(one.address, strictness);
        expect(oneTotalAllocatedNew.maticAmount).to.equal(
          firstAllocationAmount.add(secondAllocationAmount)
        );

        let priorAllocationTheoreticalSharecount = firstAllocationAmount
        .mul(parseEther(1))
        .mul(sharePriceFractionOld[1])
        .div(sharePriceFractionOld[0]);

        // Div allocated amount by spx to get share count
        let currentAllocationTheoreticalSharecount = secondAllocationAmount
        .mul(parseEther(1))
        .mul(sharePriceFractionNew[1])
        .div(sharePriceFractionNew[0]);

        let averageTheoreticalSharePrice = firstAllocationAmount.add(secondAllocationAmount)
        .mul(parseEther(1))
        .div(priorAllocationTheoreticalSharecount.add(currentAllocationTheoreticalSharecount));

        let oneTwoAllocationSharePrice = oneTwoAllocationNew.sharePriceNum
        .div(oneTwoAllocationNew.sharePriceDenom);
        expect(oneTwoAllocationSharePrice).to.equal(averageTheoreticalSharePrice);

        let oneTotalAllocationSharePrice = oneTotalAllocatedNew.sharePriceNum
        .div(oneTotalAllocatedNew.sharePriceDenom);
        expect(oneTotalAllocationSharePrice).to.equal(averageTheoreticalSharePrice);

        sharePriceFractionOld = [oneTwoAllocationNew.sharePriceNum,oneTwoAllocationNew.sharePriceDenom]
        firstAllocationAmount = firstAllocationAmount.add(secondAllocationAmount);
      }

      // Also check distributor and recipient arrays
      expect(await staker.getDistributors(two.address, strictness)).to.eql([one.address]);
      expect(await staker.getRecipients(one.address, strictness)).to.eql([two.address]);
    });

    it("pass: multiple allocations to different people work correctly", async () => {
      const sharePriceFractionOld = await staker.sharePrice();

      const oneTwoAllocatedAmount = parseEther(1000);
      const oneThreeAllocatedAmount = parseEther(2000);
      const oneFourAllocatedAmount = parseEther(2000);

      const amountAllocatedWithOldSharePrice = oneTwoAllocatedAmount.add(oneThreeAllocatedAmount);
      const amountAllocatedWithNewSharePrice = oneFourAllocatedAmount;

      // One allocates 1k to two, 2k to three
      await staker.connect(one).allocate(oneTwoAllocatedAmount, two.address, strictness);
      await staker.connect(one).allocate(oneThreeAllocatedAmount, three.address, strictness);

      // Check one total allocated values are stored correctly
      const oneTotalAllocated = await staker.totalAllocated(one.address, strictness);
      expect(oneTotalAllocated.maticAmount).to.equal(amountAllocatedWithOldSharePrice);
      expect(
        oneTotalAllocated.sharePriceNum.div(oneTotalAllocated.sharePriceDenom)
      ).to.equal(sharePriceFractionOld[0].div(sharePriceFractionOld[1]));

      // Accrue rewards
      await submitCheckpoint(0);

      // Rewards are on validator, dust should be 10% of rewards
      // Check dust is indeed equal to 10% of rewards on validator
      const totalRewards = await staker.totalRewards();
      const dust = await staker.getDust();
      const calculatedDust = (totalRewards)
        .mul(constants.PHI)
        .div(constants.PHI_PRECISION);
      expect(dust).to.equal(calculatedDust);

      // Four deposits 1k
      await staker.connect(four).deposit(parseEther(1000), four.address);
      const sharePriceFractionNew = await staker.sharePrice();

      // With new deposit, rewards were swept up and dumped into contract,
      //   so dust should be 0 and shares minted to treasury
      //uint256 shareIncreaseTsy = (totalRewards() * phi * 1e18 * globalPriceDenom) /
      //(globalPriceNum * phiPrecision);
      expect(await staker.getDust()).to.equal(0);
      expect(
        await staker.balanceOf(treasury.address)
      ).to.equal(calculateTrsyWithdrawFees(totalRewards, [sharePriceFractionNew[0], sharePriceFractionNew[1]]));

      // Four allocates .5k to three, one allocates 2k to four
      await staker.connect(four).allocate(parseEther(500), three.address, strictness);
      await staker.connect(one).allocate(oneFourAllocatedAmount, four.address, strictness);

      // Check allocation values for all current allocations are correct

      const oneTwoAllocation = await staker.allocations(one.address, two.address, strictness);
      expect(oneTwoAllocation.maticAmount).to.equal(oneTwoAllocatedAmount);
      expect(oneTwoAllocation.sharePriceNum).to.equal(sharePriceFractionOld[0]);
      expect(oneTwoAllocation.sharePriceDenom).to.equal(sharePriceFractionOld[1]);

      const oneThreeAllocation = await staker.allocations(one.address, three.address, strictness);
      expect(oneThreeAllocation.maticAmount).to.equal(oneThreeAllocatedAmount);
      expect(oneThreeAllocation.sharePriceNum).to.equal(sharePriceFractionOld[0]);
      expect(oneThreeAllocation.sharePriceDenom).to.equal(sharePriceFractionOld[1]);

      const oneFourAllocation = await staker.allocations(one.address, four.address, strictness);
      expect(oneFourAllocation.maticAmount).to.equal(oneFourAllocatedAmount);
      expect(oneFourAllocation.sharePriceNum).to.equal(sharePriceFractionNew[0]);
      expect(oneFourAllocation.sharePriceDenom).to.equal(sharePriceFractionNew[1]);

      // Extra control test: unused for later checks
      const fourThreeAllocation = await staker.allocations(four.address, three.address, strictness);
      expect(fourThreeAllocation.maticAmount).to.equal(parseEther(500));
      expect(fourThreeAllocation.sharePriceNum).to.equal(sharePriceFractionNew[0]);
      expect(fourThreeAllocation.sharePriceDenom).to.equal(sharePriceFractionNew[1]);

      // Find theoretical average share price and compare to actual share price
      //   use: old amount allocated * old price + new amount * new price / total amt

      // Calculate theoretical values

      const firstAllocationTheoreticalShareCount = amountAllocatedWithOldSharePrice // parseEther(3000)
        .mul(parseEther(1))
        .mul(sharePriceFractionOld[1])
        .div(sharePriceFractionOld[0]);

      const secondAllocationTheoreticalShareCount = amountAllocatedWithNewSharePrice // parseEther(2000)
        .mul(parseEther(1))
        .mul(sharePriceFractionNew[1])
        .div(sharePriceFractionNew[0]);

      // see above tests for explanation of these calculations
      const averageTheoreticalSharePrice = amountAllocatedWithOldSharePrice
        .add(amountAllocatedWithNewSharePrice)
        .mul(parseEther(1))
        .div(firstAllocationTheoreticalShareCount.add(secondAllocationTheoreticalShareCount));

      // Get actual values

      const oneTotalAllocatedNew = await staker.totalAllocated(one.address, strictness);

      const oneTotalAllocationSharePrice = oneTotalAllocatedNew.sharePriceNum
        .div(oneTotalAllocatedNew.sharePriceDenom);

      // Compare theoretical and actual values

      expect(oneTotalAllocationSharePrice).to.equal(averageTheoreticalSharePrice);
    });

    it("multiple allocations to different people at different shareprices work correctly", async () => {
      const oneTwoAllocatedAmount = parseEther(1000);
      const oneThreeAllocatedAmount = parseEther(2000);
      const oneFourAllocatedAmount = parseEther(2000);

      // One allocates 1k to two, 2k to three; 2k to four
      await submitCheckpoint(0);
      await staker.connect(one).allocate(oneTwoAllocatedAmount, two.address, strictness);
      await submitCheckpoint(1);
      await staker.connect(one).allocate(oneThreeAllocatedAmount, three.address, strictness);
      await submitCheckpoint(2);
      await staker.connect(one).allocate(oneFourAllocatedAmount, four.address, strictness);
      await submitCheckpoint(3);

      // get current shareprice and each individual allocation
      const sharePrice = await staker.sharePrice();
      const oneTwoAllocation = await staker.allocations(one.address, two.address, strictness);
      const oneThreeAllocation = await staker.allocations(one.address, three.address, strictness);
      const oneFourAllocation = await staker.allocations(one.address, four.address, strictness);
      const totalAllocated = await staker.totalAllocated(one.address,strictness);

      expect(oneTwoAllocation.sharePriceNum.div(oneTwoAllocation.sharePriceDenom)).to.be.greaterThan(parseEther(1));
      expect(oneThreeAllocation.sharePriceNum.div(oneThreeAllocation.sharePriceDenom)).to.be.greaterThan(oneTwoAllocation.sharePriceNum.div(oneTwoAllocation.sharePriceDenom));
      expect(oneFourAllocation.sharePriceNum.div(oneFourAllocation.sharePriceDenom)).to.be.greaterThan(oneThreeAllocation.sharePriceNum.div(oneThreeAllocation.sharePriceDenom));
      expect(oneFourAllocation.sharePriceNum.div(oneFourAllocation.sharePriceDenom)).to.be.lessThan(sharePrice[0].div(sharePrice[1]));
      expect(totalAllocated.sharePriceNum.div(totalAllocated.sharePriceDenom)).to.be.lessThan(sharePrice[0].div(sharePrice[1]));
      expect(totalAllocated.sharePriceNum.div(totalAllocated.sharePriceDenom)).to.be.greaterThan(parseEther(1));


    });

    it("pass: should be able to transfer loosely allocated balance", async () => {
      await staker.connect(one).allocate(parseEther(1000), two.address, strictness);

      const transferAmount = parseEther(10000);

      const oneBalanceOld = await staker.balanceOf(one.address);
      const threeBalanceOld = await staker.balanceOf(three.address);

      await staker.connect(one).transfer(three.address, transferAmount);

      const oneBalanceNew = await staker.balanceOf(one.address);
      const threeBalanceNew = await staker.balanceOf(three.address);

      expect(oneBalanceNew).to.equal(oneBalanceOld.sub(transferAmount));
      expect(threeBalanceNew).to.equal(threeBalanceOld.add(transferAmount));
    });

    it("pass: allocate full amount deposited to one other user", async () => {
      // Depositing as two since one already deposits 10k
      await staker.connect(two).deposit(parseEther(5), two.address);

      // Try allocating all 5 MATIC deposited to three
      await staker.connect(two).allocate(parseEther(5), three.address, strictness);
    });

    it("pass: overallocation: allocate 3x more than deposited, recipient rewards math is unchanged, distributors deposit amount is reduced to cover all rewards", async () => {
      // Try allocating all 10000 MATIC deposited to three different
      await staker.connect(one).allocate(parseEther(10000), two.address, strictness);
      await staker.connect(one).allocate(parseEther(10000), three.address, strictness);
      await staker.connect(one).allocate(parseEther(10000), four.address, strictness);

      let distributorInitialBalance = await staker.getUserInfo(one.address);

      for(let i = 0; i<5; i++){
      // REWARDS ACCRUE
      await submitCheckpoint(i);

      // _______________Calculate Recipient Rewards_____________________
      let [globalSharePriceNumerator, globalSharePriceDenominator] = await staker.sharePrice();

      // Allocation made to two
      let {
        maticAmount: individualAllocationMaticAmount,
        sharePriceNum: individualAllocationSharePriceNumerator,
        sharePriceDenom: individualAllocationSharePriceDenominator
      } = await staker.allocations(one.address, two.address, false);

      // Current distribution fee taken by vault
      let distPhi = await staker.distPhi()

      let originalShareValue = calculateSharesFromAmount(individualAllocationMaticAmount, [individualAllocationSharePriceNumerator, individualAllocationSharePriceDenominator]);

      let currentShareValue = calculateSharesFromAmount(individualAllocationMaticAmount, [globalSharePriceNumerator, globalSharePriceDenominator]);

      // Discrepancy of ALLOCATED_AMOUNT's value in shares between allocation time and present is the allocation's rewards
      let rewardShares = originalShareValue.sub(currentShareValue);
      let twoOneAllocTruMATICFee = rewardShares.mul(distPhi).div(constants.PHI_PRECISION);

      // Rewards in TruMATIC & MATIC
      let twoOneTruMATICRewards = rewardShares.sub(twoOneAllocTruMATICFee);
      let twoOneMATICRewards = await staker.convertToAssets(twoOneTruMATICRewards);

      // _________________________________________________________

      // DISTRIBUTE ALL
      await staker.connect(one).distributeAll(one.address, strictness, distributionInMATIC);

      // GET BALANCES
      // distributor
      let distributorPostDistBalance = await staker.getUserInfo(one.address);
      // recipients
      let twoInfo = await staker.getUserInfo(two.address);
      let threeInfo = await staker.getUserInfo(three.address);
      let fourInfo = await staker.getUserInfo(four.address);

      // All recipients receive equal amount of rewards (ignore rounding)
      expect(twoInfo[1].div(1e1)).to.equal(threeInfo[1].div(1e1));
      expect(threeInfo[1].div(1e1)).to.equal(fourInfo[1].div(1e1));
      let newRecipientMaticMinusEpsilon = twoInfo[1].sub(constants.EPSILON);
      // every user gets exactly the rewards of 10,000 deposit
      // two values equal +/- 5 wei rounding cutoff
      expect(newRecipientMaticMinusEpsilon).to.be.lessThanOrEqual(twoOneMATICRewards + 5);
      expect(newRecipientMaticMinusEpsilon).to.be.greaterThanOrEqual(twoOneMATICRewards);

      // distributor deposit is partially eaten up by the fact he needs to rewards to all other parties 10,000 MATIC => 9,999 MATIC
      let distributorMATICBalanceAfterDeposit =
      calculateAmountFromShares (distributorPostDistBalance[0],
        [distributorPostDistBalance[2], distributorPostDistBalance[3]]
        );

      expect(distributorMATICBalanceAfterDeposit).to.be.lessThan(distributorInitialBalance[0]);
      };
    });

    it("pass: distributing rewards does not affect allocated amount", async () => {
      // ALLOCATE
      await staker.connect(one).allocate(parseEther(20), two.address, strictness);

      const oneTwoAllocation =await staker.allocations(one.address, two.address, strictness);
      const totalAllocated = await staker.totalAllocated(one.address, strictness);
      const allocatedPrice = (totalAllocated.sharePriceNum).div(totalAllocated.sharePriceDenom);

      for (let i = 0; i<5; i++){
      // REWARDS ACCRUE
      await submitCheckpoint(i);

      // DISTRIBUTE REWARDS
      const distributeTx = await staker.connect(one).distributeRewards(two.address, one.address, strictness, distributionInMATIC);
      expect(distributeTx).to.emit(staker, "DistributedRewards");

      const oneTwoAllocationNow = await staker.allocations(one.address, two.address, strictness);
      const totalAllocatedNow = await staker.totalAllocated(one.address, strictness);

      // Absolute distributor MATIC balances remain unchanged
      expect(oneTwoAllocationNow.maticAmount).to.equal(oneTwoAllocation.maticAmount);
      expect(totalAllocatedNow.maticAmount).to.equal(totalAllocated.maticAmount);

      // Current allocation price
      const allocatedPriceNow = (totalAllocatedNow.sharePriceNum).div(totalAllocatedNow.sharePriceDenom);

      // current share price
      const currentPrice = await staker.sharePrice();
      const sharePrice = currentPrice[0].div(currentPrice[1]);

      expect(allocatedPriceNow).to.equal(sharePrice);
      expect(allocatedPriceNow).to.greaterThan(allocatedPrice);
      }
    });


    it("pass: repeated allocation to the same recipient (with accrual of rewards in between), computes new combined allocation share price correctly", async () => {
      // ALLOCATE
      await staker.connect(one).allocate(parseEther(20), two.address, strictness);

      for(let i = 0; i<5; i++){
      // REWARDS ACCRUE
      await submitCheckpoint(i);

      const oneTwoAllocationOne =await staker.allocations(one.address, two.address, strictness);
      const totalAllocatedOne = await staker.totalAllocated(one.address, strictness);
      const allocatedPriceOne = (totalAllocatedOne.sharePriceNum).div(totalAllocatedOne.sharePriceDenom);

      // SHARE PRICE BEFORE ALLOCATION #2
      const price = await staker.sharePrice();
      const sharePrice = price[0].div(price[1]);

      // ALLOCATE
      await staker.connect(one).allocate(parseEther(20), two.address, strictness);

      // NEW ALLOCATION DETAILS (W/ NEW SHARE PRICE)
      const oneTwoAllocationTwo = await staker.allocations(one.address, two.address, strictness);
      const totalAllocatedTwo = await staker.totalAllocated(one.address, strictness);
      const allocatedPriceTwo = (totalAllocatedTwo.sharePriceNum).div(totalAllocatedTwo.sharePriceDenom);

      // ESTIMATE NEW SHARE PRICE
      const priceIncrease = (sharePrice).sub(allocatedPriceOne);
      const halfIncrease = priceIncrease.div(2); // precision is 13 dps
      const halfOfTwoSharePrices = (allocatedPriceOne).add(halfIncrease);
      // some uncertainty here with % increase and the new alloc share price are computed at different levels of accuracy
      // allocatedPriceTwo precision is 1e19 - 1e13 (half increase precision) = 1e6 precision diff + 1 dp for rounding
      expect(allocatedPriceTwo).to.be.lessThanOrEqual(halfOfTwoSharePrices);
      expect(allocatedPriceTwo).to.be.greaterThan(allocatedPriceOne);
      expect(oneTwoAllocationTwo.maticAmount).to.be.greaterThan(oneTwoAllocationOne.maticAmount);
      expect(totalAllocatedTwo.maticAmount).to.be.greaterThan(totalAllocatedOne.maticAmount);
      };
    });

    it("dump, deposit, allocate, accrue, distribute, withdraw deposited returns correct getUserInfo", async () => {
      const depositAmount = parseEther(5e3);
      // DUMP

      // Deposit as one to mint some shares
      await staker.connect(one).deposit(parseEther(10e3), one.address);

      // Dump MATIC into staker as two
      await token.connect(two).transfer(staker.address, parseEther(123456));

      // DEPOSIT

      // Deposit as three at weird share price
      await staker.connect(three).deposit(depositAmount, three.address);

      // getUserInfo (1)
      let userData = await staker.getUserInfo(three.address);

      let totalStaked = await staker.totalStaked();
      let totalShares = await staker.totalSupply();
      let totalRewards = await staker.totalRewards();
      let claimedRewards = await staker.totalAssets();
      let sharePrice = calculateSharePrice(
        totalStaked,
        claimedRewards,
        totalRewards,
        totalShares,
        constants.PHI,
        constants.PHI_PRECISION
      )
      let epoch = await staker.getCurrentEpoch();

      expect(userData[2]).to.equal(sharePrice[0]);
      expect(userData[3]).to.equal(sharePrice[1]);
      expect(userData[4]).to.equal(epoch);

      let previousEpoch = userData[4];
      let maxRedeemableBeforeAccrue = calculateSharesFromAmount(
        depositAmount,
        sharePrice,
      )
      let stakerEpsilon = 1e4;

      expect(userData[0]).to.equal(maxRedeemableBeforeAccrue);
      expect(userData[1]).to.greaterThanOrEqual(depositAmount);

      // ALLOCATE

      // Allocate full deposited amount to four
      await staker.connect(three).allocate(depositAmount, four.address, strictness);

      // ACCRUE
      await submitCheckpoint(0);


      totalStaked = await staker.totalStaked();
      totalShares = await staker.totalSupply();
      totalRewards = await staker.totalRewards();
      claimedRewards = await staker.totalAssets();
      sharePrice = calculateSharePrice(
        totalStaked,
        claimedRewards,
        totalRewards,
        totalShares,
        constants.PHI,
        constants.PHI_PRECISION
      )
      let userTruMATIC : BigNumber = await staker.balanceOf(three.address);
      let userMATIC = userTruMATIC.mul(sharePrice[0]).div(sharePrice[1]).div(parseEther(1))

      let maxRedeemableAfterAccrue = calculateSharesFromAmount(
        userMATIC,
        sharePrice,
      )
      // getUserInfo (2)
      userData = await staker.getUserInfo(three.address);

      expect(userData[0]).to.equal(maxRedeemableBeforeAccrue)
      expect(userMATIC).to.be.greaterThan(depositAmount);
      expect(userMATIC).to.be.lessThanOrEqual(userData[1]);
      // Should equal previousEpoch + number of submitCheckpoints
      expect(userData[4]).to.equal(previousEpoch.add(1))

      // DISTRIBUTE
      await staker.connect(three).distributeRewards(four.address, three.address, strictness, distributionInMATIC);

      // getUserInfo (3)
      userData = await staker.getUserInfo(three.address);

      expect(userData[0]).to.be.lessThan(maxRedeemableBeforeAccrue);
      expect(userData[0]).to.lessThan(maxRedeemableAfterAccrue);

      // user distributed their rewards, so now less MATIC
      expect(userData[1]).to.be.lessThan(userMATIC);

      // +/-5 inaccuracy due to rounding range
      expect(userData[1]).to.lessThanOrEqual(depositAmount.add(stakerEpsilon).add(5));
      expect(userData[1]).to.greaterThanOrEqual(depositAmount.add(stakerEpsilon).sub(5));
    });

    it("deposit, allocate, accrue, distribute, withdraw deposited returns correct getUserInfo", async () => {
      const depositAmount = parseEther(5e3);

      // Deposit as one to mint some shares
      await staker.connect(one).deposit(parseEther(10e3), one.address);

      await submitCheckpoint(0);
      await submitCheckpoint(1);

      // Deposit as three at weird share price
      await staker.connect(three).deposit(depositAmount, three.address);

      // getUserInfo (1)
      let userData = await staker.getUserInfo(three.address);

      let totalStaked = await staker.totalStaked();
      let totalShares = await staker.totalSupply();
      let totalRewards = await staker.totalRewards();
      let claimedRewards = await staker.totalAssets();
      let sharePrice = calculateSharePrice(
        totalStaked,
        claimedRewards,
        totalRewards,
        totalShares,
        constants.PHI,
        constants.PHI_PRECISION
      )
      let epoch = await staker.getCurrentEpoch();

      expect(userData[2]).to.equal(sharePrice[0]);
      expect(userData[3]).to.equal(sharePrice[1]);
      expect(userData[4]).to.equal(epoch);

      let previousEpoch = userData[4];
      let maxRedeemableBeforeAccrue = calculateSharesFromAmount(
        depositAmount,
        sharePrice,
      )
      let stakerEpsilon = 1e4;

      expect(userData[0]).to.equal(maxRedeemableBeforeAccrue);
      expect(userData[1]).to.greaterThanOrEqual(depositAmount);

      // ALLOCATE

      // Allocate full deposited amount to four
      await staker.connect(three).allocate(depositAmount, four.address, strictness);

      // ACCRUE
      await submitCheckpoint(2);
      await submitCheckpoint(3);


      totalStaked = await staker.totalStaked();
      totalShares = await staker.totalSupply();
      totalRewards = await staker.totalRewards();
      claimedRewards = await staker.totalAssets();
      sharePrice = calculateSharePrice(
        totalStaked,
        claimedRewards,
        totalRewards,
        totalShares,
        constants.PHI,
        constants.PHI_PRECISION
      )
      let userTruMATIC : BigNumber = await staker.balanceOf(three.address);
      let userMATIC = userTruMATIC.mul(sharePrice[0]).div(sharePrice[1]).div(parseEther(1))

      let maxRedeemableAfterAccrue = calculateSharesFromAmount(
        userMATIC,
        sharePrice,
      )
      // getUserInfo (2)
      userData = await staker.getUserInfo(three.address);

      expect(userData[0]).to.equal(maxRedeemableBeforeAccrue)
      expect(userMATIC).to.be.greaterThan(depositAmount);
      expect(userMATIC).to.be.lessThanOrEqual(userData[1]);
      // Should equal previousEpoch + number of submitCheckpoints
      expect(userData[4]).to.equal(previousEpoch.add(2))

      // DISTRIBUTE
      await staker.connect(three).distributeRewards(four.address, three.address, strictness, distributionInMATIC);

      // getUserInfo (3)
      userData = await staker.getUserInfo(three.address);

      expect(userData[0]).to.be.lessThan(maxRedeemableBeforeAccrue);
      expect(userData[0]).to.lessThan(maxRedeemableAfterAccrue);

      // user distributed their rewards, so now less MATIC
      expect(userData[1]).to.be.lessThan(userMATIC);

      // +/-5 inaccuracy due to rounding range
      expect(userData[1]).to.lessThanOrEqual(depositAmount.add(stakerEpsilon).add(5));
      expect(userData[1]).to.greaterThanOrEqual(depositAmount.add(stakerEpsilon).sub(5));
    });

    it("fail: distributing rewards fails if distributor has transferred deposited amount beforehand", async () => {
      await staker.connect(one).allocate(parseEther(1000), two.address, strictness);
      await staker.connect(one).allocate(parseEther(2000), three.address, strictness);
      await submitCheckpoint(0);

      await staker.connect(one).transfer(two.address, await staker.balanceOf(one.address));
      await expect(
        staker.connect(one).distributeAll(one.address, strictness, distributionInMATIC)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    // Failing test cases

    it("fail: allocating more than deposited at once", async () => {
      // Allocating all at once (separate test case should pass, tested in passing tests)
      await expect(
        staker.connect(one).allocate(parseEther(10001), two.address, strictness)
      ).to.be.revertedWithCustomError(staker, "InsufficientDistributorBalance");
    });

    it("fail: allocating zero", async () => {
      await expect(
        staker.connect(one).allocate(parseEther(0), two.address, strictness)
      ).to.be.revertedWithCustomError(staker, "AllocationUnderOneMATIC");
    });

  });



  describe("STRICT", () => {
    // All exclusively strict tests go in here

    const strictness = true;
    const distributionInMATIC = false;

    beforeEach(async () => {
      // Turn `allowStrict` on
      await staker.connect(deployer).setAllowStrict(strictness);
    });

    // Passing test cases

    it("pass: allocating twice adds up to allocated amount correctly", async () => {
      // Allocate 10k
      await staker.connect(one).allocate(parseEther(5000), two.address, strictness);
      await staker.connect(one).allocate(parseEther(5000), two.address, strictness);

      // Check sum is correct
      const oneTwoAllocationStrict = await staker.allocations(one.address, two.address, strictness);
      expect(oneTwoAllocationStrict.maticAmount).to.equal(parseEther(10000));
    });

    it("pass: first allocation updates state accordingly", async () => {
      // Allocate 1k
      await staker.connect(one).allocate(parseEther(1000), two.address, strictness);

      const sharePriceFraction = await staker.sharePrice();

      // Check values are correctly saved into allocation structs, no math required as first allocation

      const oneTwoAllocation = await staker.allocations(one.address, two.address, strictness);

      expect(oneTwoAllocation.maticAmount).to.equal(parseEther(1000));
      expect(
        oneTwoAllocation.sharePriceNum.div(oneTwoAllocation.sharePriceDenom)
      ).to.equal(parseEther(1));
      expect(oneTwoAllocation.sharePriceNum).to.equal(sharePriceFraction[0]);
      expect(oneTwoAllocation.sharePriceDenom).to.equal(sharePriceFraction[1]);

      // Check values are correctly saved into total allocated struct, no math required as first allocation

      const oneTotalAllocated = await staker.totalAllocated(one.address, strictness);

      expect(oneTotalAllocated.maticAmount).to.equal(parseEther(1000));
      expect(oneTotalAllocated.sharePriceNum).to.equal(sharePriceFraction[0]);
      expect(oneTotalAllocated.sharePriceDenom).to.equal(sharePriceFraction[1]);

      // Check if address one and two have correct first element in dist/recipient array

      expect(await staker.distributors(two.address, strictness, 0)).to.equal(one.address);
      expect(await staker.recipients(one.address, strictness, 0)).to.equal(two.address);

      // And check there's no other elements in these arrays too
      // (Additional check so that mapping getter is also tested separately from array getter)

      expect(await staker.getDistributors(two.address, strictness)).to.eql([one.address]);
      expect(await staker.getRecipients(one.address, strictness)).to.eql([two.address]);
    });

    it("pass: multiple allocations update share prices in allocation mappings correctly", async () => {
      // Allocate to a user
      // Accrue rewards
      // Allocate some more
      // Check everything is as it should be
      await staker.connect(one).deposit(parseEther(20000),one.address);
      let firstAllocationAmount = parseEther(1000);
      let secondAllocationAmount = parseEther(2000);

      let sharePriceFractionOld = await staker.sharePrice();

      // Double check share price starts as 1e18
      expect(sharePriceFractionOld[0].div(sharePriceFractionOld[1])).to.equal(parseEther(1));

      // Allocate 1k one-two
      await staker.connect(one).allocate(firstAllocationAmount, two.address, strictness);

      // First allocation so allocation and total allocated should have same values for everything

      let oneTwoAllocation = await staker.allocations(one.address, two.address, strictness);
      expect(oneTwoAllocation.maticAmount).to.equal(firstAllocationAmount);
      expect(oneTwoAllocation.sharePriceNum).to.equal(sharePriceFractionOld[0]);
      expect(oneTwoAllocation.sharePriceDenom).to.equal(sharePriceFractionOld[1]);

      let oneTotalAllocated = await staker.totalAllocated(one.address, strictness);
      expect(oneTotalAllocated.maticAmount).to.equal(firstAllocationAmount);
      expect(oneTotalAllocated.sharePriceNum).to.equal(sharePriceFractionOld[0]);
      expect(oneTotalAllocated.sharePriceDenom).to.equal(sharePriceFractionOld[1]);

      for(let i = 0; i<5; i++){
        // Accrue rewards
       await submitCheckpoint(i);

        // Save new share price
       let sharePriceFractionNew = await staker.sharePrice();

       // Allocate 2k more to user two
       await staker.connect(one).allocate(secondAllocationAmount, two.address, strictness);
       // The one-two allocation struct should have the same amt but share price should have changed

       let oneTwoAllocationNew = await staker.allocations(one.address, two.address, strictness);
       expect(oneTwoAllocationNew.maticAmount).to.equal(
         firstAllocationAmount.add(secondAllocationAmount)
       );

       let oneTotalAllocatedNew = await staker.totalAllocated(one.address, strictness);
       expect(oneTotalAllocatedNew.maticAmount).to.equal(
         firstAllocationAmount.add(secondAllocationAmount)
       );

       let priorAllocationTheoreticalSharecount = firstAllocationAmount
       .mul(parseEther(1))
       .mul(sharePriceFractionOld[1])
       .div(sharePriceFractionOld[0]);

       // Div allocated amount by spx to get share count
       let currentAllocationTheoreticalSharecount = secondAllocationAmount
       .mul(parseEther(1))
       .mul(sharePriceFractionNew[1])
       .div(sharePriceFractionNew[0]);

       let averageTheoreticalSharePrice = firstAllocationAmount.add(secondAllocationAmount)
       .mul(parseEther(1))
       .div(priorAllocationTheoreticalSharecount.add(currentAllocationTheoreticalSharecount));

       let oneTwoAllocationSharePrice = oneTwoAllocationNew.sharePriceNum
       .div(oneTwoAllocationNew.sharePriceDenom);
       expect(oneTwoAllocationSharePrice).to.equal(averageTheoreticalSharePrice);

       let oneTotalAllocationSharePrice = oneTotalAllocatedNew.sharePriceNum
       .div(oneTotalAllocatedNew.sharePriceDenom);
       expect(oneTotalAllocationSharePrice).to.equal(averageTheoreticalSharePrice);

       sharePriceFractionOld = [oneTwoAllocationNew.sharePriceNum,oneTwoAllocationNew.sharePriceDenom]
       firstAllocationAmount = firstAllocationAmount.add(secondAllocationAmount);
     }

      // Also check distributor and recipient arrays
      expect(await staker.getDistributors(two.address, strictness)).to.eql([one.address]);
      expect(await staker.getRecipients(one.address, strictness)).to.eql([two.address]);
    });

    it("pass: multiple allocations to different people work correctly", async () => {
      const sharePriceFractionOld = await staker.sharePrice();

      const oneTwoAllocatedAmount = parseEther(1000);
      const oneThreeAllocatedAmount = parseEther(2000);
      const oneFourAllocatedAmount = parseEther(2000);

      const amountAllocatedWithOldSharePrice = oneTwoAllocatedAmount.add(oneThreeAllocatedAmount);
      const amountAllocatedWithNewSharePrice = oneFourAllocatedAmount;

      // One allocates 1k to two, 2k to three
      await staker.connect(one).allocate(oneTwoAllocatedAmount, two.address, strictness);
      await staker.connect(one).allocate(oneThreeAllocatedAmount, three.address, strictness);

      // Check one total allocated values are stored correctly
      const oneTotalAllocated = await staker.totalAllocated(one.address, strictness);
      expect(oneTotalAllocated.maticAmount).to.equal(amountAllocatedWithOldSharePrice);
      expect(
        oneTotalAllocated.sharePriceNum.div(oneTotalAllocated.sharePriceDenom)
      ).to.equal(sharePriceFractionOld[0].div(sharePriceFractionOld[1]));

      // Accrue rewards
      await submitCheckpoint(0);

      // Rewards are on validator, dust should be 10% of rewards
      // Check dust is indeed equal to 10% of rewards on validator
      const totalRewards = await staker.totalRewards();
      const dust = await staker.getDust();
      const calculatedDust = (totalRewards)
        .mul(constants.PHI)
        .div(constants.PHI_PRECISION);
      expect(dust).to.equal(calculatedDust);

      // Four deposits 1k
      await staker.connect(four).deposit(parseEther(1000), four.address);
      const sharePriceFractionNew = await staker.sharePrice();

      // With new deposit, rewards were swept up and dumped into contract,
      //   so dust should be 0 and shares minted to treasury
      expect(await staker.getDust()).to.equal(0);
      expect(
        await staker.balanceOf(treasury.address)
      ).to.equal(calculateTrsyWithdrawFees(totalRewards, [sharePriceFractionNew[0], sharePriceFractionNew[1]]));

      // Four allocates .5k to three, one allocates 2k to four
      await staker.connect(four).allocate(parseEther(500), three.address, strictness);
      await staker.connect(one).allocate(oneFourAllocatedAmount, four.address, strictness);

      // Check allocation values for all current allocations are correct

      const oneTwoAllocation = await staker.allocations(one.address, two.address, strictness);
      expect(oneTwoAllocation.maticAmount).to.equal(oneTwoAllocatedAmount);
      expect(oneTwoAllocation.sharePriceNum).to.equal(sharePriceFractionOld[0]);
      expect(oneTwoAllocation.sharePriceDenom).to.equal(sharePriceFractionOld[1]);

      const oneThreeAllocation = await staker.allocations(one.address, three.address, strictness);
      expect(oneThreeAllocation.maticAmount).to.equal(oneThreeAllocatedAmount);
      expect(oneThreeAllocation.sharePriceNum).to.equal(sharePriceFractionOld[0]);
      expect(oneThreeAllocation.sharePriceDenom).to.equal(sharePriceFractionOld[1]);

      const oneFourAllocation = await staker.allocations(one.address, four.address, strictness);
      expect(oneFourAllocation.maticAmount).to.equal(oneFourAllocatedAmount);
      expect(oneFourAllocation.sharePriceNum).to.equal(sharePriceFractionNew[0]);
      expect(oneFourAllocation.sharePriceDenom).to.equal(sharePriceFractionNew[1]);

      // Extra control test: unused for later checks
      const fourThreeAllocation = await staker.allocations(four.address, three.address, strictness);
      expect(fourThreeAllocation.maticAmount).to.equal(parseEther(500));
      expect(fourThreeAllocation.sharePriceNum).to.equal(sharePriceFractionNew[0]);
      expect(fourThreeAllocation.sharePriceDenom).to.equal(sharePriceFractionNew[1]);

      // Find theoretical average share price and compare to actual share price
      //   use: old amount allocated * old price + new amount * new price / total amt

      // Calculate theoretical values

      const firstAllocationTheoreticalShareCount = amountAllocatedWithOldSharePrice // parseEther(3000)
        .mul(parseEther(1))
        .mul(sharePriceFractionOld[1])
        .div(sharePriceFractionOld[0]);

      const secondAllocationTheoreticalShareCount = amountAllocatedWithNewSharePrice // parseEther(2000)
        .mul(parseEther(1))
        .mul(sharePriceFractionNew[1])
        .div(sharePriceFractionNew[0]);

      // see above tests for explanation of these calculations
      const averageTheoreticalSharePrice = amountAllocatedWithOldSharePrice
        .add(amountAllocatedWithNewSharePrice)
        .mul(parseEther(1))
        .div(firstAllocationTheoreticalShareCount.add(secondAllocationTheoreticalShareCount));

      // Get actual values

      const oneTotalAllocatedNew = await staker.totalAllocated(one.address, strictness);

      const oneTotalAllocationSharePrice = oneTotalAllocatedNew.sharePriceNum
        .div(oneTotalAllocatedNew.sharePriceDenom);

      // Compare theoretical and actual values

      expect(oneTotalAllocationSharePrice).to.equal(averageTheoreticalSharePrice);
    });

    it("multiple allocations to different people at different shareprices work correctly", async () => {
      const oneTwoAllocatedAmount = parseEther(1000);
      const oneThreeAllocatedAmount = parseEther(2000);
      const oneFourAllocatedAmount = parseEther(2000);

      // One allocates 1k to two, 2k to three; 2k to four
      await submitCheckpoint(0);
      await staker.connect(one).allocate(oneTwoAllocatedAmount, two.address, strictness);
      await submitCheckpoint(1);
      await staker.connect(one).allocate(oneThreeAllocatedAmount, three.address, strictness);
      await submitCheckpoint(2);
      await staker.connect(one).allocate(oneFourAllocatedAmount, four.address, strictness);
      await submitCheckpoint(3);

      // get current shareprice and each individual allocation
      const sharePrice = await staker.sharePrice();
      const oneTwoAllocation = await staker.allocations(one.address, two.address, strictness);
      const oneThreeAllocation = await staker.allocations(one.address, three.address, strictness);
      const oneFourAllocation = await staker.allocations(one.address, four.address, strictness);
      const totalAllocated = await staker.totalAllocated(one.address,strictness);

      expect(oneTwoAllocation.sharePriceNum.div(oneTwoAllocation.sharePriceDenom)).to.be.greaterThan(parseEther(1));
      expect(oneThreeAllocation.sharePriceNum.div(oneThreeAllocation.sharePriceDenom)).to.be.greaterThan(oneTwoAllocation.sharePriceNum.div(oneTwoAllocation.sharePriceDenom));
      expect(oneFourAllocation.sharePriceNum.div(oneFourAllocation.sharePriceDenom)).to.be.greaterThan(oneThreeAllocation.sharePriceNum.div(oneThreeAllocation.sharePriceDenom));
      expect(oneFourAllocation.sharePriceNum.div(oneFourAllocation.sharePriceDenom)).to.be.lessThan(sharePrice[0].div(sharePrice[1]));
      expect(totalAllocated.sharePriceNum.div(totalAllocated.sharePriceDenom)).to.be.lessThan(sharePrice[0].div(sharePrice[1]));
      expect(totalAllocated.sharePriceNum.div(totalAllocated.sharePriceDenom)).to.be.greaterThan(parseEther(1));


    });

    it("pass: repeated allocation to the same and other recipients (with accrual of rewards in between && artificially doubled share price), calculates rewards correctly", async () => {
      let numCheckpoints = 5;
      // ALLOCATE
      await staker.connect(one).allocate(parseEther(1000), two.address, strictness);
      await staker.connect(one).allocate(parseEther(1000), three.address, strictness);

      // ACCRUE REWARDS
      for(let i = 0; i < numCheckpoints; i++){
      await submitCheckpoint(i);
      }

      // ALLOCATE
      await staker.connect(one).allocate(parseEther(2000), two.address, strictness);
      await staker.connect(one).allocate(parseEther(2000), four.address, strictness);

      // ARTIFICIALLY DOUBLE SHARE PRICE
      const sharePriceFracNew = await staker.sharePrice();
      const sharePriceDoubleNum = sharePriceFracNew[0].mul(2);
      const sharePriceDoubleDenom = sharePriceFracNew[1];

      const oneTwoAllocation = await staker.allocations(one.address, two.address, strictness);
      const oneThreeAllocation = await staker.allocations(one.address, three.address, strictness);
      const oneFourAllocation = await staker.allocations(one.address, four.address, strictness);

      // CALCULATE GAIN FOR EACH RECIPIENT

      // Current Worth of MATIC:
      // MATIC(ALLOC)*INFLATED_NOW_SHARE_PRICE = TM (ALLOC)
      // TM(ALLOC)/SHARE_PRICE(ALLOC) = MATIC(ALLOC)

      // Gain:
      // = MATIC(ALLOC) NOW - MATIC(ALLOC)
      const oneTwoMaticPnL = (
        (oneTwoAllocation.maticAmount)
          .mul(parseEther(1))
          .mul(oneTwoAllocation.sharePriceDenom)
          .mul(sharePriceDoubleNum)
          .div(oneTwoAllocation.sharePriceNum)
          .div(sharePriceDoubleDenom)
          .div(parseEther(1))
          .sub(oneTwoAllocation.maticAmount));

      const oneThreeMaticPnL = (
        (oneThreeAllocation.maticAmount)
          .mul(parseEther(1))
          .mul(oneThreeAllocation.sharePriceDenom)
          .mul(sharePriceDoubleNum)
          .div(oneThreeAllocation.sharePriceNum)
          .div(sharePriceDoubleDenom)
          .div(parseEther(1))
          .sub(oneThreeAllocation.maticAmount));

      const oneFourMaticPnL = (
        (oneFourAllocation.maticAmount)
          .mul(parseEther(1))
          .mul(oneFourAllocation.sharePriceDenom)
          .mul(sharePriceDoubleNum)
          .div(oneFourAllocation.sharePriceNum)
          .div(sharePriceDoubleDenom)
          .div(parseEther(1))
          .sub(oneFourAllocation.maticAmount));
      // note this works also without inflating the share price, however then the gain is negative
      // Confirm that gain in MATIC of (two) after inflationis equal to gain of (three + four)
      expect(oneTwoMaticPnL).to.equal(oneThreeMaticPnL.add(oneFourMaticPnL));
    });

    // todo: potentially move this to distribution tests
    it("pass: distributing rewards works correctly for allocations", async () => {
      let numCheckpoints = 5;
      const sharePriceFractionOld = await staker.sharePrice();

      // Set test values
      const oneTwoAllocationAmount = parseEther(1000);
      const oneThreeAllocationAmount1 = parseEther(2000);
      const oneThreeAllocationAmount2 = parseEther(500);
      const oneThreeAllocationAmount = oneThreeAllocationAmount1.add(oneThreeAllocationAmount2);

      // One allocates 1k to two, 2k to three
      await staker.connect(one).allocate(oneTwoAllocationAmount, two.address, strictness);
      await staker.connect(one).allocate(oneThreeAllocationAmount1, three.address, strictness);

      // Accrue rewards


      // ACCRUE REWARDS
      for(let i = 0; i < numCheckpoints; i++){
      await submitCheckpoint(i);
      }

      // Save new share price for later checks
      const sharePriceFractionNew = await staker.sharePrice();

      // One allocates .5k to three
      await staker.connect(one).allocate(oneThreeAllocationAmount2, three.address, strictness);

      // Check total allocated values have been updated correctly following allocations

      const oneTwoAllocationOld = await staker.allocations(one.address, two.address, strictness);
      expect(oneTwoAllocationOld.maticAmount).to.equal(oneTwoAllocationAmount);
      expect(oneTwoAllocationOld.sharePriceNum).to.equal(sharePriceFractionOld[0]);
      expect(oneTwoAllocationOld.sharePriceDenom).to.equal(sharePriceFractionOld[1]);
      // Share price of one-two allocation should just be original spx

      const oneThreeAllocationOld = await staker.allocations(one.address, three.address, strictness);
      expect(oneThreeAllocationOld.maticAmount).to.equal(oneThreeAllocationAmount);

      // Share price of one-three allocation should be weighted combination of two spxs
      // - calculated theoretical one-three share price
      // - 1 over the avg share price is equal to the weighted sum of 1 over the other
      //   share prices
      // - weighted sum of 1 over the other share prices:
      //   (
      //     oneThreeAllocationAmount1 * sharePriceFracOld[1] / sharePriceFracOld[0] +
      //     oneThreeAllocationAmount2 * sharePriceFracNew[1] / sharePriceFracNew[0]
      //   ) / (oneThreeAllocationAmount1 + oneThreeAllocationAmount2)
      // - reciprocal of that (so avg share price): (
      //   (oneThreeAllocationAmount1 + oneThreeAllocationAmount2) /
      //   (
      //     oneThreeAllocationAmount1 * sharePriceFracOld[1] / sharePriceFracOld[0] +
      //     oneThreeAllocationAmount2 * sharePriceFracNew[1] / sharePriceFracNew[0]
      //   )

      const oneThreeAllocatedTheoreticalShareCount1 = oneThreeAllocationAmount1
        .mul(parseEther(1))
        .mul(sharePriceFractionOld[1])
        .div(sharePriceFractionOld[0]);

      const oneThreeAllocatedTheoreticalShareCount2 = oneThreeAllocationAmount2
        .mul(parseEther(1))
        .mul(sharePriceFractionNew[1])
        .div(sharePriceFractionNew[0]);

      const oneThreeTheoreticalSharePriceAvg =
        (
          oneThreeAllocationAmount1.add(oneThreeAllocationAmount2)
        ).mul(parseEther(1)).div(
          oneThreeAllocatedTheoreticalShareCount1.add(oneThreeAllocatedTheoreticalShareCount2)
        );

      // Get actual one-three share price

      const oneThreeAllocationOldSharePrice = oneThreeAllocationOld.sharePriceNum
        .div(oneThreeAllocationOld.sharePriceDenom);

      // Expect equality

      expect(oneThreeAllocationOldSharePrice).to.equal(oneThreeTheoreticalSharePriceAvg);

      // Performing similar avg share price check but on total allocated for one

      const oneTotalAllocatedOld = await staker.totalAllocated(one.address, strictness);

      const oneTotalAllocatedTheoreticalShareCountOld = parseEther(3000)
        .mul(parseEther(1))
        .mul(sharePriceFractionOld[1])
        .div(sharePriceFractionOld[0]);

      const oneTotalAllocatedTheoreticalShareCountNew = parseEther(500)
        .mul(parseEther(1))
        .mul(sharePriceFractionNew[1])
        .div(sharePriceFractionNew[0]);

      const oneTotalAllocatedTheoreticalSharePriceAvg = (
        parseEther(3500)
      ).mul(parseEther(1)).div(
        oneTotalAllocatedTheoreticalShareCountOld.add(oneTotalAllocatedTheoreticalShareCountNew)
      );

      expect(oneTotalAllocatedOld.maticAmount).to.equal(parseEther(3500));

      const oneTotalAllocatedActual = oneTotalAllocatedOld.sharePriceNum
        .div(oneTotalAllocatedOld.sharePriceDenom);

      expect(
        oneTotalAllocatedActual
      ).to.equal(
        oneTotalAllocatedTheoreticalSharePriceAvg
      );

      // Save one balance for later checks
      const oneBalanceOld = await staker.balanceOf(one.address);

      // One distributes all allocations
      await staker.connect(one).distributeAll(one.address,strictness, distributionInMATIC);

      // Check total allocateds following distribution of all of one's allocations

      const oneTwoAllocationNew = await staker.allocations(one.address, two.address, strictness);
      expect(oneTwoAllocationNew.sharePriceNum).to.equal(sharePriceFractionNew[0]);
      expect(oneTwoAllocationNew.sharePriceDenom).to.equal(sharePriceFractionNew[1]);

      const oneThreeAllocationNew = await staker.allocations(one.address, three.address, strictness);
      expect(oneThreeAllocationNew.sharePriceNum).to.equal(sharePriceFractionNew[0]);
      expect(oneThreeAllocationNew.sharePriceDenom).to.equal(sharePriceFractionNew[1]);

      const oneTotalAllocatedNew = await staker.totalAllocated(one.address, strictness);
      expect(oneTotalAllocatedNew.maticAmount).to.equal(parseEther(3500));
      expect(oneTotalAllocatedNew.sharePriceNum).to.equal(sharePriceFractionNew[0]);
      expect(oneTotalAllocatedNew.sharePriceDenom).to.equal(sharePriceFractionNew[1]);

      // Distribution checks (check correct amount of TruMATIC was distributed)

      // One-two alloc amt div by one-two alloc old spx: TruMATIC at time of allocation
      const oneTwoSharesAllocatedOld = oneTwoAllocationNew.maticAmount
        .mul(parseEther(1))
        .mul(sharePriceFractionOld[1])
        .div(sharePriceFractionOld[0]);

      // One-two alloc amt div by new cur spx: TruMATIC at current share price
      const oneTwoSharesAllocatedNew = oneTwoAllocationNew.maticAmount
        .mul(parseEther(1))
        .mul(sharePriceFractionNew[1])
        .div(sharePriceFractionNew[0]);

      // Calculate TruMATIC to move
      const oneTwoSharePnL = oneTwoSharesAllocatedOld
        .sub(oneTwoSharesAllocatedNew)
        .sub(BigNumber.from("1")); // todo: check if this is necessary (use rounding)

      // Check two received the expected amount of TruMATIC
      expect(await staker.balanceOf(two.address)).to.equal(oneTwoSharePnL);

      // One-three alloc amt div by one-three alloc old spx: TruMATIC at time of allocation
      const oneThreeSharesAllocatedOld = oneThreeAllocationNew.maticAmount
        .mul(parseEther(1))
        .mul(oneThreeAllocationOld.sharePriceDenom)
        .div(oneThreeAllocationOld.sharePriceNum);

      // One-three alloc amt div by new cur spx: TruMATIC at current share price
      const oneThreeSharesAllocatedNew = oneThreeAllocationNew.maticAmount
        .mul(parseEther(1))
        .mul(sharePriceFractionNew[1])
        .div(sharePriceFractionNew[0]);

      // Calculate TruMATIC to move
      const oneThreeSharePnL = oneThreeSharesAllocatedOld
        .sub(oneThreeSharesAllocatedNew)
        .sub(BigNumber.from("1")); // todo: check if this is necessary

      // Check three received the expected amount of TruMATIC
      expect(await staker.balanceOf(three.address)).to.equal(oneThreeSharePnL);

      // TruMATIC balance checks

      // Check balances of two and three add to one's original balance
      expect(
        await staker.balanceOf(one.address)
      ).to.equal(
        oneBalanceOld
          .sub(await staker.balanceOf(two.address))
          .sub(await staker.balanceOf(three.address))
      );

      // Check total TruMATIC supply is equal to all balances summed together
      expect(
        await staker.totalSupply()
      ).to.equal(
        (await staker.balanceOf(one.address))
          .add(await staker.balanceOf(three.address))
          .add(await staker.balanceOf(two.address))
          .add(await staker.balanceOf(treasury.address))
      );
    });

    it("pass: allocate full amount deposited to one other user", async () => {
      // Depositing as two since one already deposits 10k
      await staker.connect(two).deposit(parseEther(5), two.address);

      // Try allocating all 5 MATIC deposited to three
      await staker.connect(two).allocate(parseEther(5), three.address, strictness);
    });

    it("pass: allocate full amount deposited to one other user, rounding error", async () => {
      let numCheckpoints = 5;
      // Deposit so submitting a checkpoint causes rewards to accrue, increases share price
      await staker.connect(one).deposit(parseEther(10e3), one.address);

     // ACCRUE REWARDS
      for(let i = 0; i < numCheckpoints; i++){
      await submitCheckpoint(i);
      }

      // Depositing as two since one already deposits 10k
      await staker.connect(two).deposit(parseEther(5), two.address);

      // Try allocating all 5 MATIC deposited to three
      await staker.connect(two).allocate(parseEther(5), three.address, strictness);
    });

    it("increase spx using dumping", async () => {
      // Deposit as one to mint some shares
      await staker.connect(one).deposit(parseEther(10e3), one.address);

      const sharePriceFractionOld = await staker.sharePrice();

      // Dump MATIC into staker as two
      await token.connect(two).transfer(staker.address, parseEther(123456));

      const sharePriceFractionNew = await staker.sharePrice();

      // Check share price has increased
      expect(
        sharePriceFractionNew[0].div(sharePriceFractionNew[1])
        ).to.be.greaterThan(
        sharePriceFractionOld[0].div(sharePriceFractionOld[1])
      );
    });

    it("dump, deposit, allocate, accrue, distribute, withdraw deposited amt", async () => {
      let numCheckpoints = 5;

      const depositAmount = parseEther(5e3);

      // DUMP

      // Deposit as one to mint some shares
      await staker.connect(one).deposit(parseEther(10e3), one.address);

      // Dump MATIC into staker as two
      await token.connect(two).transfer(staker.address, parseEther(123456));

      // DEPOSIT

      // Deposit as three at weird share price
      await staker.connect(three).deposit(depositAmount, three.address);

      // ALLOCATE

      // Allocate full deposited amount to five
      await staker.connect(three).allocate(depositAmount, four.address, strictness);

      // ACCRUE REWARDS
      for(let i = 0; i < numCheckpoints; i++){
      await submitCheckpoint(i);
      }

      // DISTRIBUTE
      await staker.connect(three).distributeRewards(four.address, three.address, strictness, distributionInMATIC);

      // WITHDRAW

      // Attempt withdraw of full deposited amount
      await expect(staker.connect(three).withdraw(depositAmount, three.address, three.address)).to.be.revertedWithCustomError(staker, "WithdrawalAmountTooLarge");
    });

    it("deposit, allocate, accrue, distribute, withdraw deposited amt", async () => {
      const depositAmount = parseEther(5e3);

      // Deposit as one to mint some shares
      await staker.connect(one).deposit(parseEther(10e3), one.address);

      // accrue rewards
      await submitCheckpoint(0);
      await submitCheckpoint(1);

      // Deposit as three at weird share price
      await staker.connect(three).deposit(depositAmount, three.address);

      await submitCheckpoint(2);

      // Allocate full deposited amount to five
      await staker.connect(three).allocate(depositAmount, four.address, strictness);

      // accrue rewards
      await submitCheckpoint(3);

      // DISTRIBUTE
      await staker.connect(three).distributeRewards(four.address, three.address, strictness, distributionInMATIC);

      // accrue rewards
      await submitCheckpoint(4);

      // Attempt withdraw of full deposited amount
      await expect(staker.connect(three).withdraw(depositAmount, three.address, three.address)).to.be.revertedWithCustomError(staker,"WithdrawalAmountTooLarge");
    });

    // Failing test cases

    it("fail: try allocating strictly when `allowStrict` is set to false", async () => {
      // Set `allowStrict` to false
      await staker.connect(deployer).setAllowStrict(false);

      // Try to allocate
      await expect(
        staker.connect(one).allocate(parseEther(1000), two.address, strictness)
      ).to.be.revertedWithCustomError(staker, "StrictAllocationDisabled");
    });

    it("fail: allocating more than deposited", async () => {
      // Allocating all funds at once

      await expect(
        staker.connect(one).allocate(parseEther(11000), two.address, strictness)
      ).to.be.revertedWithCustomError(staker, "InsufficientDistributorBalance");

      // Allocating funds spread over two allocations (8000 + 3000 = 11000, > 10000).
      // This is explicitly tested particularly because this version *is* possible
      // in loose allocations, but not in strict allocations.

      await staker.connect(one).allocate(parseEther(8000), two.address, strictness);

      await expect(
        staker.connect(one).allocate(parseEther(3000), two.address, strictness)
      ).to.be.revertedWithCustomError(staker, "InsufficientDistributorBalance");
    });

    it("fail: allocating zero", async () => {
      await expect(
        staker.connect(one).allocate(parseEther(0), two.address, strictness)
      ).to.be.revertedWithCustomError(staker, "AllocationUnderOneMATIC");
    });

    it("fail: should be unable to transfer strictly allocated balance", async () => {
      await staker.connect(one).allocate(parseEther(1000), two.address, strictness);

      await expect(
        staker.connect(one).transfer(three.address, parseEther(10000))
      ).to.be.revertedWithCustomError(staker, "ExceedsUnallocatedBalance");
    });

    it("pass: checks that you can strictly allocate entire maxWithdraw amount (including epsilon)", async() => {
      const maxWithdrawAmount = await staker.maxWithdraw(one.address);
      // strict allocation of entire balance
      await staker.connect(one).allocate(maxWithdrawAmount, two.address,  strictness);
      const strictAllocation = await staker.allocations(one.address, two.address, strictness);
      expect(strictAllocation[0]).to.equal(maxWithdrawAmount);
    })

    it("maxRedeemable in getUserInfo returns maxWithdraw when the max balance is strictly allocated", async() => {
      const maxWithdrawAmount = await staker.maxWithdraw(one.address);

      // strict allocation of entire balance
      await staker.connect(one).allocate(maxWithdrawAmount, two.address,  strictness);
      const strictAllocation = await staker.allocations(one.address, two.address, strictness);

      const userMatic = await staker.getUserInfo(one.address);
      expect(strictAllocation[0]).to.equal(maxWithdrawAmount);
    })
  });



  describe("BOTH", () => {
    // Tests which include both configurations of strictness go in here

    // Strictness variable not set here to prevent accidentally referring to
    // the wrong strictness value. `true` and `false` literals should be used
    // for strictness in these tests.

    beforeEach(async () => {
      // Turn `allowStrict` on
      await staker.connect(deployer).setAllowStrict(true);
    });

    // Passing test cases

    it("pass: mix of strict & loose allocation update state accordingly", async () => {
      const strictness = true;

      // Make strict and loose allocations and check allocations are saved correctly

      // One strictly allocates 1k to two
      await staker.connect(one).allocate(parseEther(1000), two.address, strictness);

      const sharePriceFraction = await staker.sharePrice();

      // Check values saved into allocation struct as is, as it's the first allocation (no math)

      const oneTwoAllocationStrict = await staker.allocations(one.address, two.address, strictness);

      expect(oneTwoAllocationStrict.maticAmount).to.equal(parseEther(1000));
      expect(oneTwoAllocationStrict.sharePriceNum.div(oneTwoAllocationStrict.sharePriceDenom)).to.equal(parseEther(1));
      expect(oneTwoAllocationStrict.sharePriceNum).to.equal(sharePriceFraction[0]);
      expect(oneTwoAllocationStrict.sharePriceDenom).to.equal(sharePriceFraction[1]);

      // One loosely allocates 1k to two
      await staker.connect(one).allocate(parseEther(1000), two.address, !strictness);

      const oneTwoAllocationLoose = await staker.allocations(one.address, two.address, !strictness);

      expect(oneTwoAllocationLoose.maticAmount).to.equal(parseEther(1000));
      expect(oneTwoAllocationLoose.sharePriceNum.div(oneTwoAllocationLoose.sharePriceDenom)).to.equal(parseEther(1));

      // One loosely allocates 1k to three
      await staker.connect(one).allocate(parseEther(1000), three.address, !strictness);

      const oneThreeAllocationLoose = await staker.allocations(one.address, three.address, !strictness);

      expect(oneThreeAllocationLoose.maticAmount).to.equal(parseEther(1000));
      expect(oneThreeAllocationLoose.sharePriceNum.div(oneThreeAllocationLoose.sharePriceDenom)).to.equal(parseEther(1));

      // Now check strict and loose total allocations for one, should have saved values
      // into allocation struct as is, as it's the first allocation (no math)

      const oneTotalAllocatedStrict = await staker.totalAllocated(one.address, strictness);

      expect(oneTotalAllocatedStrict.maticAmount).to.equal(parseEther(1000));
      expect(oneTotalAllocatedStrict.sharePriceNum).to.equal(sharePriceFraction[0]);
      expect(oneTotalAllocatedStrict.sharePriceDenom).to.equal(sharePriceFraction[1]);

      const oneTotalAllocatedLoose = await staker.totalAllocated(one.address, !strictness);

      expect(oneTotalAllocatedLoose.maticAmount).to.equal(parseEther(2000));
      expect(
        oneTotalAllocatedLoose.sharePriceNum.div(oneTotalAllocatedLoose.sharePriceDenom)
      ).to.equal(parseEther(1));

      // Check if addresses one, two, and three have correctly filled dist/recipient arrays

      // One
      expect(await staker.getRecipients(one.address, strictness)).to.eql([two.address]);
      expect(await staker.getRecipients(one.address, !strictness)).to.eql([two.address, three.address]);

      // Two
      expect(await staker.getDistributors(two.address, strictness)).to.eql([one.address]);
      expect(await staker.getDistributors(two.address, !strictness)).to.eql([one.address]);

      // Three
      expect(await staker.getDistributors(three.address, !strictness)).to.eql([one.address]);
    });

    it("pass: mix of loose & strict allocation update state accordingly (opposite of previous case)", async () => {
      const strictness = false;

      // Make strict and loose allocations and check allocations are saved correctly

      // One strictly allocates 1k to two
      await staker.connect(one).allocate(parseEther(1000), two.address, strictness);

      const sharePriceFraction = await staker.sharePrice();

      // Check values saved into allocation struct as is, as it's the first allocation (no math)

      const oneTwoAllocationStrict = await staker.allocations(one.address, two.address, strictness);

      expect(oneTwoAllocationStrict.maticAmount).to.equal(parseEther(1000));
      expect(oneTwoAllocationStrict.sharePriceNum.div(oneTwoAllocationStrict.sharePriceDenom)).to.equal(parseEther(1));
      expect(oneTwoAllocationStrict.sharePriceNum).to.equal(sharePriceFraction[0]);
      expect(oneTwoAllocationStrict.sharePriceDenom).to.equal(sharePriceFraction[1]);

      // One loosely allocates 1k to two
      await staker.connect(one).allocate(parseEther(1000), two.address, !strictness);

      const oneTwoAllocationLoose = await staker.allocations(one.address, two.address, !strictness);

      expect(oneTwoAllocationLoose.maticAmount).to.equal(parseEther(1000));
      expect(oneTwoAllocationLoose.sharePriceNum.div(oneTwoAllocationLoose.sharePriceDenom)).to.equal(parseEther(1));

      // One loosely allocates 1k to three
      await staker.connect(one).allocate(parseEther(1000), three.address, !strictness);

      const oneThreeAllocationLoose = await staker.allocations(one.address, three.address, !strictness);

      expect(oneThreeAllocationLoose.maticAmount).to.equal(parseEther(1000));
      expect(oneThreeAllocationLoose.sharePriceNum.div(oneThreeAllocationLoose.sharePriceDenom)).to.equal(parseEther(1));

      // Now check strict and loose total allocations for one, should have saved values
      // into allocation struct as is, as it's the first allocation (no math)

      const oneTotalAllocatedStrict = await staker.totalAllocated(one.address, strictness);

      expect(oneTotalAllocatedStrict.maticAmount).to.equal(parseEther(1000));
      expect(oneTotalAllocatedStrict.sharePriceNum).to.equal(sharePriceFraction[0]);
      expect(oneTotalAllocatedStrict.sharePriceDenom).to.equal(sharePriceFraction[1]);

      const oneTotalAllocatedLoose = await staker.totalAllocated(one.address, !strictness);

      expect(oneTotalAllocatedLoose.maticAmount).to.equal(parseEther(2000));
      expect(
        oneTotalAllocatedLoose.sharePriceNum.div(oneTotalAllocatedLoose.sharePriceDenom)
      ).to.equal(parseEther(1));

      // Check if addresses one, two, and three have correctly filled dist/recipient arrays

      // One
      expect(await staker.getRecipients(one.address, strictness)).to.eql([two.address]);
      expect(await staker.getRecipients(one.address, !strictness)).to.eql([two.address, three.address]);

      // Two
      expect(await staker.getDistributors(two.address, strictness)).to.eql([one.address]);
      expect(await staker.getDistributors(two.address, !strictness)).to.eql([one.address]);

      // Three
      expect(await staker.getDistributors(three.address, !strictness)).to.eql([one.address]);
    });
    // Failing test cases

  });
});



  // cannot do this with current testing setup:
  // it("16 pass: three allocations to one user, with two accruals in between", async () => {

  // });

  // it("17 pass: three allocations to different users, with two accruals in between", async () => {

  // });

  // it("18 pass: multiple allocations shouldn't cause an overflow", async () => {
  //   // This test was used for manual testing originally (hence console logs).

  //   // It could still be useful for seeing how the numerator an denominator
  //   // of share price change with different calls when manually run, so it's
  //   // fine to keep this test in with commented console logs.

  //   // console.log((await staker.allocations(one.address, two.address, false)).slice(0, 3));
  //   // console.log((await staker.totalAllocated(one.address, false)).slice(0, 3));
  //   await staker.connect(one).allocate(parseEther(1), two.address, false);
  //   // console.log((await staker.allocations(one.address, two.address, false)).slice(0, 3));
  //   // console.log((await staker.totalAllocated(one.address, false)).slice(0, 3));
  //   await staker.connect(one).allocate(parseEther(1), two.address, false);
  //   // console.log((await staker.allocations(one.address, two.address, false)).slice(0, 3));
  //   // console.log((await staker.totalAllocated(one.address, false)).slice(0, 3));
  //   await staker.connect(one).allocate(parseEther(1), two.address, false);
  //   // console.log((await staker.allocations(one.address, two.address, false)).slice(0, 3));
  //   // console.log((await staker.totalAllocated(one.address, false)).slice(0, 3));
  //   await staker.connect(one).allocate(parseEther(1), two.address, false);
  //   // console.log((await staker.allocations(one.address, two.address, false)).slice(0, 3));
  //   // console.log((await staker.totalAllocated(one.address, false)).slice(0, 3));
  //   await staker.connect(one).allocate(parseEther(1), two.address, false);
  //   // console.log((await staker.allocations(one.address, two.address, false)).slice(0, 3));
  //   // console.log((await staker.totalAllocated(one.address, false)).slice(0, 3));
  //   await staker.connect(one).allocate(parseEther(1), two.address, false);
  //   // console.log((await staker.allocations(one.address, two.address, false)).slice(0, 3));
  //   // console.log((await staker.totalAllocated(one.address, false)).slice(0, 3));
  // });

  // // strict allocation
  // // call max withdrawal
  // // call withdraw on that number
  // // call distribute all <-- should be possible, bug if it reverts


  // // // todo included: skipping, failing probably becuase of fee
  // it("refactored---pass: distributing rewards works correctly for loose allocations (will fail until distribution fee implemented)", async () => {
  //   const strict = false;
  //   const sharePriceFracOld = await staker.sharePrice();

  //   // one allocates 1k to two, 2k to three
  //   await staker.connect(one).allocate(parseEther(1000), two.address, strict);
  //   await staker.connect(one).allocate(parseEther(2000), three.address, strict);

  //   // accrue rewards
  //   await submitCheckpoint(stakeManager, txdata["data"]);

  //   // four deposits 1k
  //   await staker.connect(four).deposit(parseEther(1000), four.address);

  //   // save new share price for later checks
  //   const sharePriceFracNew = await staker.sharePrice();

  //   // one allocated .5k to three
  //   await staker.connect(one).allocate(parseEther(500), three.address, strict);

  //   // check total allocated values have been updated correctly following allocations

  //   const oneTwoAllocationOld = await staker.allocations(one.address, two.address, strict);
  //   expect(oneTwoAllocationOld.maticAmount).to.equal(parseEther(1000));
  //   expect(oneTwoAllocationOld.sharePriceNum).to.equal(sharePriceFracOld[0]);
  //   expect(oneTwoAllocationOld.sharePriceDenom).to.equal(sharePriceFracOld[1]);

  //   const oneThreeAllocationOld = await staker.allocations(one.address, three.address, strict);
  //   const oneThreeAllocationTheoreticalAmountOld = parseEther(2000)
  //     .mul(sharePriceFracOld[0])
  //     .div(sharePriceFracOld[1]);
  //   const oneThreeAllocationTheoreticalAmountNew = parseEther(500)
  //     .mul(sharePriceFracNew[0])
  //     .div(sharePriceFracNew[1]);
  //   const oneThreeTheoreticalSharePriceAvg = oneThreeAllocationTheoreticalAmountOld
  //     .add(oneThreeAllocationTheoreticalAmountNew)
  //     .div(parseEther(2500));
  //   expect(oneThreeAllocationOld.maticAmount).to.equal(parseEther(2500));
  //   expect(
  //     oneThreeAllocationOld.sharePriceNum.div(oneThreeAllocationOld.sharePriceDenom)
  //   ).to.equal(oneThreeTheoreticalSharePriceAvg);

  //   const oneTotalAllocatedOld = await staker.totalAllocated(one.address, strict);
  //   const oneTotalAllocatedTheoreticalAmountOld = parseEther(3000)
  //     .mul(sharePriceFracOld[0])
  //     .div(sharePriceFracOld[1]);
  //   const oneTotalAllocatedTheoreticalAmountNew = parseEther(500)
  //     .mul(sharePriceFracNew[0])
  //     .div(sharePriceFracNew[1]);
  //   const oneTotalAllocatedTheoreticalSharePriceAvg = oneTotalAllocatedTheoreticalAmountOld
  //     .add(oneTotalAllocatedTheoreticalAmountNew)
  //     .div(parseEther(3500));
  //   expect(oneTotalAllocatedOld.maticAmount).to.equal(parseEther(3500));
  //   expect(
  //     oneTotalAllocatedOld.sharePriceNum.div(oneTotalAllocatedOld.sharePriceDenom)
  //   ).to.equal(oneTotalAllocatedTheoreticalSharePriceAvg);

  //   // save one balance for later checks
  //   const oneBalanceOld = await staker.balanceOf(one.address);

  //   // one distributes all allocations
  //   await staker.connect(one).distributeAll(one.address,strict);

  //   // check total allocateds following distribution of all of one's allocations

  //   const oneTwoAllocationNew = await staker.allocations(one.address, two.address, strict);
  //   expect(oneTwoAllocationNew.sharePriceNum).to.equal(sharePriceFracNew[0]);
  //   expect(oneTwoAllocationNew.sharePriceDenom).to.equal(sharePriceFracNew[1]);

  //   const oneThreeAllocationNew = await staker.allocations(one.address, three.address, strict);
  //   expect(oneThreeAllocationNew.sharePriceNum).to.equal(sharePriceFracNew[0]);
  //   expect(oneThreeAllocationNew.sharePriceDenom).to.equal(sharePriceFracNew[1]);

  //   const oneTotalAllocatedNew = await staker.totalAllocated(one.address, strict);
  //   expect(oneTotalAllocatedNew.maticAmount).to.equal(parseEther(3500));
  //   expect(oneTotalAllocatedNew.sharePriceNum).to.equal(sharePriceFracNew[0]);
  //   expect(oneTotalAllocatedNew.sharePriceDenom).to.equal(sharePriceFracNew[1]);

  //   // distribution checks (check correct amount of TruMATIC was distributed)

  //   // one-two alloc amt div by one-two alloc old spx: TruMATIC at time of allocation
  //   const oneTwoSharesAllocatedOld = oneTwoAllocationNew.maticAmount
  //     .mul(parseEther(1))
  //     .mul(oneTwoAllocationOld.sharePriceDenom)
  //     .div(oneTwoAllocationOld.sharePriceNum);

  //   // one-two alloc amt div by new cur spx: TruMATIC at current share price
  //   const oneTwoSharesAllocatedNew = oneTwoAllocationNew.maticAmount
  //     .mul(parseEther(1))
  //     .mul(sharePriceFracNew[1])
  //     .div(sharePriceFracNew[0]);

  //   // calculate TruMATIC to move
  //   const oneTwoSharePnL = oneTwoSharesAllocatedOld
  //     .sub(oneTwoSharesAllocatedNew)
  //     .sub(BigNumber.from("1")); // todo: check if this is necessary

  //   // todo: for some reason the share pnl is not equal to the distributed amount in loose allocations
  //   //   look into whether this is expected behaviour (test change)
  //   //   or if it should be fixed (contract change)

  //   // -> may be because of fee (probably this) -- fee is only taken in loose allocations

  //   // check two received the expected amount of TruMATIC
  //   expect(await staker.balanceOf(two.address)).to.equal(oneTwoSharePnL);

  //   // one-three alloc amt div by one-three alloc old spx: TruMATIC at time of allocation
  //   const oneThreeSharesAllocatedOld = oneThreeAllocationNew.maticAmount
  //     .mul(parseEther(1))
  //     .mul(oneThreeAllocationOld.sharePriceDenom)
  //     .div(oneThreeAllocationOld.sharePriceNum);

  //   // one-three alloc amt div by new cur spx: TruMATIC at current share price
  //   const oneThreeSharesAllocatedNew = oneThreeAllocationNew.maticAmount
  //     .mul(parseEther(1))
  //     .mul(sharePriceFracNew[1])
  //     .div(sharePriceFracNew[0]);

  //   // calculate TruMATIC to move
  //   const oneThreeSharePnL = oneThreeSharesAllocatedOld
  //     .sub(oneThreeSharesAllocatedNew)
  //     .sub(BigNumber.from("1")); // todo: check if this is necessary

  //   // check three received the expected amount of TruMATIC
  //   expect(await staker.balanceOf(three.address)).to.equal(oneThreeSharePnL);

  //   // TruMATIC balance checks

  //   // check balances of two and three add to one's original balance
  //   expect(
  //     await staker.balanceOf(one.address)
  //   ).to.equal(
  //     oneBalanceOld
  //       .sub(await staker.balanceOf(two.address))
  //       .sub(await staker.balanceOf(three.address))
  //   );

  //   // check total TruMATIC supply is equal to all balances summed together
  //   expect(
  //     await staker.totalSupply()
  //   ).to.equal(
  //     (await staker.balanceOf(one.address))
  //       .add(await staker.balanceOf(three.address))
  //       .add(await staker.balanceOf(two.address))
  //       .add(await staker.balanceOf(treasury.address))
  //       .add(await staker.balanceOf(four.address))
  //   );
  // });

  // // todo: the rest of the tests
  // it("distributing rewards works correctly for non-strict allocations", async () => {
  //   const strict = false;
  //   const sharePriceFracOld = await staker.sharePrice();

  //   await staker.connect(one).allocate(parseEther(1000), two.address, strict);
  //   await staker.connect(one).allocate(parseEther(2000), three.address, strict);

  //   const tb = await staker.balanceOf(two.address);

  //   await staker.connect(one).distributeRewards(two.address, one.address, strict);

  //   expect(await staker.balanceOf(two.address)).to.equal(tb);

  //   await submitCheckpoint(0);

  //   await staker.connect(four).deposit(parseEther(1000), four.address);

  //   const postShare = await staker.sharePrice();

  //   await expect(
  //     staker.connect(two).distributeAll(one.address, strict)
  //   ).to.be.revertedWithCustomError(staker, "OnlyDistributorCanDistributeRewards");
  //   await expect(
  //     staker.connect(two).distributeRewards(two.address, one.address, strict)
  //   ).to.be.revertedWithCustomError(staker, "OnlyDistributorCanDistributeRewards");

  //   const prebal = await staker.balanceOf(treasury.address);

  //   await staker.connect(one).distributeAll(one.address, false);

  //   const thirtysix = BigNumber.from("1000000000000000000000000000000000000");
  //   const q = BigNumber.from("2000")
  //     .mul(thirtysix)
  //     .mul(sharePriceFracOld[1])
  //     .div(sharePriceFracOld[0]);
  //   const r = BigNumber.from("2000").mul(thirtysix).mul(postShare[1]).div(postShare[0]);
  //   const maticToMove1 = q.sub(r).sub(BigNumber.from("1"));
  //   const p = BigNumber.from("1000")
  //     .mul(thirtysix)
  //     .mul(sharePriceFracOld[1])
  //     .div(sharePriceFracOld[0]);
  //   const o = BigNumber.from("1000").mul(thirtysix).mul(postShare[1]).div(postShare[0]);
  //   const maticToMove = p.sub(o).sub(BigNumber.from("1"));
  //   const distPhi = await staker.distPhi();

  //   expect(await staker.balanceOf(treasury.address)).to.equal(
  //     prebal
  //       .add(maticToMove.mul(distPhi).div(constants.PHI_PRECISION))
  //       .add(maticToMove1.mul(distPhi).div(constants.PHI_PRECISION))
  //   );
  // });


