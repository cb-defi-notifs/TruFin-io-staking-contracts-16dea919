// Script to log where MATIC is dispersed in staker v1 and v2 unbonds, to take out all
// MATIC from unclaimed unbonds, and to log user TruMATIC balances (for staker v2 only).

import { ethers } from "hardhat";
import { Contract } from "ethers";

// constants

// staker deployments - goerli
// const stakerAddress = "0x902e78fa77fb980625463dbd96165a83e6e6a4b4"; // latest fiorentina
const stakerAddress = "0x0ce41d234f5E3000a38c5EEF115bB4D14C9E1c89"; // latest schnitzel
// const stakerAddress = "0xC49E166a7201aF99037cB8acff48281364642038"; // previous schnitzel

// staker deployments - mainnet
// const stakerAddress = "0x0EE0F1E438E4F0D8E3aA8D1F35592aa5303863a4"; // previous schnitzel

// funder is used to cover gas costs for all other signers
const funderAddress = "0xDbE6ACf2D394DBC830Ed55241d7b94aaFd2b504D";
const pks = [];

// save 1e18 BigNumber for rounding
const eth = ethers.BigNumber.from(10).pow(18);

// lists hashmap used for storing a list of unbonds for each user
interface ListMap { [key: string]: number[]; }
const lists: ListMap = {};

async function loopUnbonds(staker: Contract, lists: ListMap) {
    // populate lists object, keep running total of unbonds for logging

    // get latest unbond nonce for iterating through all unbonds
    const maxUnbondNonce = (await staker.getUnbondNonce()).add(1);

    console.log("Number of unbonds:", maxUnbondNonce.toString());

    console.log(" --- Getting all unbonds and creating claim lists --- ")

    let total = ethers.BigNumber.from(0);

    for (let unbondNonce = 0; unbondNonce < maxUnbondNonce; unbondNonce++) {
        // ignore already claimed or not yet unbonded withdrawals
        if (await staker.isClaimable(unbondNonce) == false) continue;

        const wdl = await staker.unbondingWithdrawals(unbondNonce);

        // log amount so script operator can manually investigate if needed
        console.log(unbondNonce, wdl.amount.div(eth));

        // increase rolling total
        total = total.add(wdl.amount);

        // get user arr, create if non-existent
        let userUnbondNonces = lists[wdl.user] || [];

        // add to user arr, save to lists object
        lists[wdl.user] = [...userUnbondNonces, unbondNonce];
    }

    console.log("Total withdrawable:", total.div(eth).toString(), "MATIC");

    const listsStr = Object.fromEntries(Object.entries(lists).map(([key, value]) => [key, JSON.stringify(value)]));

    console.log(listsStr);
}

async function claimUnbondLists(staker: Contract, lists: ListMap) {
    // iterate through lists object, call claimlist for each user and their list of unbonds

    console.log(" --- Claiming all unbonds as lists --- ");

    // funder to avoid having to fund all the signers individually manually
    const funder = await ethers.getSigner(funderAddress);

    for (const [user, list] of Object.entries(lists)) {
        // avoid trying to claim zero address unbonds
        if (user == ethers.constants.AddressZero) continue;

        const signer = await ethers.getSigner(user);

        console.log("Claiming", list.length, "withdrawals as", user);

        // send ether for gas

        let tx = {
            to: signer.address,
            value: ethers.utils.parseEther("1").div(10)
        };

        await funder.sendTransaction(tx);

        // make claimlist call with signer
        await staker.connect(signer).claimList(list);
    }

    console.log("Claimed all.")
}

async function getBalances(staker: Contract) {
    console.log(" --- TruMATIC Balances --- ");
    for (const pk of pks) {
      const wallet = new ethers.Wallet(pk);

      const balance = await staker.balanceOf(wallet.address);

      console.log(wallet.address, balance.div(eth).toString());
    }
}

async function main() {
    // web3 setup
    const staker = await ethers.getContractAt("TruStakeMATICv2", stakerAddress);

    // populate lists object, keep running total of unbonds for logging
    await loopUnbonds(staker, lists);

    // iterate through lists object, call claimlist for each user and their list of unbonds
    // await claimUnbondLists(staker, lists);

    // iterate through all signers and log TruMATIC balances
    await getBalances(staker);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
