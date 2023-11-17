// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.8.19;

import {Withdrawal, Allocation, Validator} from "./Types.sol";

/// @title TruStakeMATICStorage
abstract contract TruStakeMATICv2Storage {

    /// @notice Address of MATIC on this chain (Ethereum and Goerli supported).
    address public stakingTokenAddress;

    /// @notice The stake manager contract deployed by Polygon.
    address public stakeManagerContractAddress;

    /// @notice The address of the default validator.
    address public defaultValidatorAddress;

    /// @notice The whitelist contract keeps track of what users can interact with
    ///   certain function in the TruStakeMATIC contract.
    address public whitelistAddress;

    /// @notice The treasury gathers fees during the restaking of rewards as shares.
    address public treasuryAddress;

    /// @notice Size of fee taken on rewards.
    /// @dev Fee in basis points.
    uint256 public phi;

    /// @notice Size of fee taken on allocations.
    /// @dev Distribution fee in basis points.
    uint256 public distPhi;

    /// @notice Deprecated but here for storage considerations.
    uint256 public deprecated1;

    /// @notice Mapping to keep track of (user, amount) values for each unbond nonce.
    /// @dev Legacy mapping to keep track of pre-upgrade withdrawal claims.
    /// @dev Maps nonce of validator unbonding to a Withdrawal (user & amount).
    mapping(uint256 => Withdrawal) public unbondingWithdrawals;

    /// @notice Allocated balance mapping to ensure users can only withdraw funds not still allocated to a user.
    mapping(address => mapping(bool => Allocation)) public totalAllocated;

    /// @notice Mapping of distributor to recipient to amount and share price.
    mapping(address => mapping(address => mapping(bool => Allocation))) public allocations;

    /// @notice Array of distributors to their recipients.
    mapping(address => mapping(bool => address[])) public recipients;

    /// @notice Array of recipients to their distributors.
    mapping(address => mapping(bool => address[])) public distributors;

    /// @notice Value to offset rounding errors.
    uint256 public epsilon;

    /// @notice Deprecated but here for storage considerations.
    bool public deprecated2;

    /// @notice Cap on the smallest amount one can deposit to the staker.
    uint256 public minDeposit;

    /// @notice Mapping of a validator address to the validator struct.
    mapping(address => Validator) public validators;

    /// @notice The array of validators share contract addresses configured in the contract.
    address[] public validatorAddresses;

    /// @notice Mapping to keep track of the withdrawals (user, amount) for each unbond nonce for each validator.
    mapping(address => mapping(uint256 => Withdrawal)) public withdrawals;

    /// @notice Gap for upgradeability.
    uint256[44] private __gap;

}
