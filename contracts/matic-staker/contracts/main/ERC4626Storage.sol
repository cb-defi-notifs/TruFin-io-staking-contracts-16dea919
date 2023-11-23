// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.8.19;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

/// @title ERC4626Storage
/// @notice This contract includes storage variables from OpenZeppelin's ERC4626Upgradeable.
/// @dev Needed for compatibility with prior versions of the staker contract that inherited from ERC4626Upgradeable.
abstract contract ERC4626Storage is ERC20Upgradeable {
    address private _asset;
    uint8 private _underlyingDecimals;
    uint256[49] private __gap;
}
