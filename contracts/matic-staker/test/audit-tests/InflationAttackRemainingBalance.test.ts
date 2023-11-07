/** Testing Inflation possibilities in the TruStakeMATIC vault. */

import { AddressZero } from "@ethersproject/constants";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { deployment } from "../helpers/fixture";
import { parseEther } from "../helpers/math";
import { advanceEpochs } from "../helpers/state-interaction";
import { utils } from "ethers";
import { EPSILON } from "../helpers/constants";

describe("Inflation Attack", () => {
  let one, two, three, token, stakeManager, staker, treasury, validatorShare;

  beforeEach(async () => {
    ({
      treasury, one, two, three, token, stakeManager, staker, validatorShare
    } = await loadFixture(deployment));
    await staker.connect(treasury).deposit(parseEther(100), treasury.address);
  });

  describe("Checks ", async () => {
    let unbondNonce;
    let shareBalance;
    let totalSupply;
    let totalAsset;
    let sharePrice;
    let userBalance;
    let sharePriceAfterADeposits;

    beforeEach(async () => {

      let initialSharePrice = await staker.sharePrice();
      console.log("Initial Share Price:                  "+utils.formatEther(initialSharePrice[0])+", "+utils.formatEther(initialSharePrice[1]));

      userBalance = await token.balanceOf(one.address);
      console.log("\nInitial MATIC Token Balance of Address A:       "+utils.formatEther(userBalance));

      shareBalance = await staker.balanceOf(one.address);
      console.log("Address A Share Balance Before Deposit:         "+utils.formatEther(shareBalance));

      totalSupply = await staker.totalSupply();
      console.log("Total Supply before Address A deposit:          "+utils.formatEther(totalSupply));

      totalAsset = await staker.totalAssets();
      console.log("Total Asset before Address A deposit:           "+utils.formatEther(totalAsset));

      sharePrice = await staker.sharePrice();
      console.log("Share Price before Address A deposit:           "+utils.formatEther(sharePrice[0])+", "+utils.formatEther(sharePrice[1]));

      // deposit
      await staker.connect(one)["deposit(uint256,address)"](parseEther(1),one.address);

      console.log("\nAddress A deposits 1 MATIC\n");

      shareBalance = await staker.balanceOf(one.address);
      console.log("Address A Share Balance After Deposit:          "+utils.formatEther(shareBalance));

      totalSupply = await staker.totalSupply();
      console.log("Total Supply after Address A deposit:           "+utils.formatEther(totalSupply));

      totalAsset = await staker.totalAssets();
      console.log("Total Asset after Address A deposit:            "+utils.formatEther(totalAsset));

      sharePriceAfterADeposits = await staker.sharePrice();
      console.log("Share Price after Address A deposit:            "+utils.formatEther(sharePriceAfterADeposits[0])+", "+utils.formatEther(sharePriceAfterADeposits[1]));

      // initate withdrawal with user one
      await staker.connect(one).withdraw(parseEther(0.9999999999999999), one.address, one.address);

      console.log("\nAddress A withdraw requests 0.9999999999999999 MATIC\n");

      shareBalance = await staker.balanceOf(one.address);
      console.log("Address A Share Balance After Withdraw Request: "+utils.formatEther(shareBalance));

      totalSupply = await staker.totalSupply();
      console.log("Total Supply after Address A Withdraw Request:  "+utils.formatEther(totalSupply));

      totalAsset = await staker.totalAssets();
      console.log("Total Asset after Address A Withdraw Request:   "+utils.formatEther(totalAsset));

      sharePrice = await staker.sharePrice();
      console.log("Share Price after Address A Withdraw Request:   "+utils.formatEther(sharePrice[0])+", "+utils.formatEther(sharePrice[1])+"\n");

      // set unbondNonce
      unbondNonce = await staker.getUnbondNonce(validatorShare.address);
    });

    it("Check Inflation not possible with user leaving tiny remaining balance", async () => {

      // advance by 100 epochs
      await advanceEpochs(stakeManager, 100);

      await staker.connect(one).withdrawClaim(unbondNonce, validatorShare.address);
      let [usr, amt] = [one.address, parseEther(0.9999999999999999)];
      expect(usr).to.equal(one.address);
      expect(amt).to.equal(parseEther(0.9999999999999999));

      totalAsset = await staker.totalAssets();
      console.log("Total Asset before Address B deposit:           "+utils.formatEther(totalAsset));

      // User B deposits
      await staker.connect(two)["deposit(uint256,address)"](parseEther(1),two.address);

      shareBalance = await staker.balanceOf(two.address);
      console.log("Address B Share Balance After Deposit:          "+utils.formatEther(shareBalance));

      totalSupply = await staker.totalSupply();
      console.log("Total Supply after Address B deposit:           "+utils.formatEther(totalSupply));

      totalAsset = await staker.totalAssets();
      console.log("Total Asset after Address B deposit:            "+utils.formatEther(totalAsset));

      sharePrice = await staker.sharePrice();
      console.log("Share Price after Address B deposit:            "+utils.formatEther(sharePrice[0])+", "+utils.formatEther(sharePrice[1]));

      // User A and B TruMATIC balances (1 MATIC : 1 TruMATIC)
      expect(await staker.maxRedeem(one.address)).to.equal(parseEther(0));
      expect(await staker.maxRedeem(two.address)).to.be.greaterThanOrEqual(parseEther(1));
      expect(await staker.balanceOf(one.address)).to.equal(0);

      // User A and B MATIC balances
      expect(await staker.maxWithdraw(two.address)).to.be.closeTo(parseEther(1).add(EPSILON), 1e0);
      expect(await staker.maxWithdraw(one.address)).to.equal(parseEther(0));

      // // Share Price now equals initial share price after deposit price for A
      const curPrice = sharePrice[0].div(sharePrice[1]);
      const sharePriceAfterDepositFloat = sharePriceAfterADeposits[0].div(sharePriceAfterADeposits[1]);
      expect(curPrice).to.be.closeTo(sharePriceAfterDepositFloat, EPSILON);
    });

});

});
