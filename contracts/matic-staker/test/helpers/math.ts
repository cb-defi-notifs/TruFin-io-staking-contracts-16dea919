/** Calculation functions as in Solidity. */

import {ethers} from "hardhat";
import {BigNumber} from "ethers";
import * as constants from "../../constants/constants";

export const parseEther = (n: number): BigNumber =>
  ethers.utils.parseEther(n.toString());

export const calculateSharePrice = (
  totalStaked,
  claimedRewards,
  totalRewards,
  totalShares,
  phi,
  phiPrecision
): [BigNumber, BigNumber] => {
  const totalAssetsTimesPhiPrecision = totalStaked
    .add(claimedRewards)
    .mul(phiPrecision)
    .add(phiPrecision.sub(phi).mul(totalRewards));

  const priceNum = totalAssetsTimesPhiPrecision.mul(parseEther(1));
  const priceDenom = totalShares.mul(phiPrecision);

  return [priceNum, priceDenom];
};

export const calculateSharesFromAmount = (
  amount: BigNumber,
  sharePrice: [BigNumber, BigNumber]
): BigNumber => amount.mul(parseEther(1)).mul(sharePrice[1]).div(sharePrice[0]);

export const calculateAmountFromShares = (
  shares: BigNumber,
  sharePrice: [BigNumber, BigNumber]
): BigNumber => shares.mul(sharePrice[0]).div(sharePrice[1]).div(parseEther(1));

export const calculateRewardsDistributed = (
  amount: BigNumber,
  oldSharePrice: [BigNumber, BigNumber],
  newSharePrice: [BigNumber, BigNumber]
) : BigNumber => (amount.mul(oldSharePrice[1]).mul(parseEther(1)).div(oldSharePrice[0])).sub(amount.mul(newSharePrice[1]).mul(parseEther(1)).div(newSharePrice[0]))

export const calculateTrsyWithdrawFees = (
  totalRewards: BigNumber,
  sharePrice: [BigNumber, BigNumber]
): BigNumber => (totalRewards.mul(constants.PHI).mul(sharePrice[1]).mul(parseEther(1))).div(sharePrice[0].mul(constants.PHI_PRECISION))

export const divSharePrice = (sharePrice: [BigNumber, BigNumber]): BigNumber =>
  sharePrice[0].div(sharePrice[1]);

export const sharePriceEquality = (
  sharePrice0: [BigNumber, BigNumber],
  sharePrice1: [BigNumber, BigNumber]
): boolean => sharePrice0[0].mul(sharePrice1[1]).eq(sharePrice1[0].mul(sharePrice0[1]));

export const sharesToMATIC = async (amount, staker) => {
  // Get vault share price
  const [globalSharePriceNumerator, globalSharePriceDenominator] = await staker.sharePrice();

  // Convert truMATIC to MATIC at share price
  const MATIC = amount.mul(globalSharePriceNumerator).div(globalSharePriceDenominator).div(parseEther(1));

  return MATIC;
};
