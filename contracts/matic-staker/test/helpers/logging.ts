/** Loggers useful for debugging and locating storage slots in smart contracts */

import {BigNumber, Contract} from "ethers";
import * as helpers from "@nomicfoundation/hardhat-network-helpers";

export const logStorageIndices = async (stakeManager: Contract): Promise<void> => {
  console.log(stakeManager.address);
  console.log(await stakeManager.currentEpoch());

  for (let i = 0; i < 50; i++) {
    let r1 = await helpers.getStorageAt(stakeManager.address, i);
    console.log(i, BigNumber.from(r1));
  }
};

export const logAddresses = (accts: Object): void => {
  let addrs = Object.fromEntries(
    Object.entries(accts).map(([k, v]) => [k, v.address])
  );
  console.log(addrs);
};
