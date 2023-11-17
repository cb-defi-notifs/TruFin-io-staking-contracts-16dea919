// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.8.19;

interface IValidatorShare {
    function buyVoucher(uint256 _amount, uint256 _minSharesToMint) external returns (uint256 amountToDeposit);

    function sellVoucher_new(uint256 claimAmount, uint256 maximumSharesToBurn) external;

    function unstakeClaimTokens_new(uint256 unbondNonce) external;

    function getLiquidRewards(address user) external view returns (uint256);

    function restake() external returns (uint256 amountRestaked, uint256 liquidReward);

    function balanceOf(address account) external view returns (uint256);

    function approve(address spender, uint256 amount) external;

    function transfer(address to, uint256 value) external;

    function transferFrom(address sender, address recipient, uint256 amount) external;

    function exchangeRate() external view returns (uint256);

    function getTotalStake(address user) external view returns (uint256, uint256);

    // automatically generated getter of a public mapping
    function unbonds_new(address user, uint256 unbondNonce) external view returns (uint256, uint256);

    // automatically generated getter of a public mapping
    function unbondNonces(address user) external view returns (uint256);
}
