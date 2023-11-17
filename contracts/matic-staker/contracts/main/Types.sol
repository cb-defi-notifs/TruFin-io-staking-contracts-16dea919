// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.8.19;

/// @notice Struct to hold information on a user's withdrawal request for fair claiming.
/// @dev The epoch of withdrawal is not stored as that is the key in the `unbondingWithdrawals`
/// mapping.
/// @param user The user that made the withdrawal request.
/// @param amount The amount of MATIC that the user requested to withdraw.
struct Withdrawal {
    address user;
    uint256 amount;
}

/// @notice Struct to hold information on user allocations.
/// @dev The numerator and denominator update when the allocation amount increases,
/// or when a distribution occurs.
/// @param maticAmount the amount of MATIC allocated.
/// @param sharePriceNum numerator of the share price for this allocation.
/// @param sharePriceDenom denominator of the share price for this allocation.
struct Allocation {
    uint256 maticAmount;
    uint256 sharePriceNum;
    uint256 sharePriceDenom;
}

/// @notice Struct to track information on a validator.
/// @param state The state of the validator.
/// @param stakedAmount The amount of Matic staked on the validator. This is the maximum that can be withdrawn from this validator.
/// @param validatorAddress The address of the validator.
struct Validator {
    ValidatorState state;
    uint256 stakedAmount;
    address validatorAddress;
}

/// @notice Enum for the possible validator states.
enum ValidatorState {
    NONE, ENABLED, DISABLED
}
