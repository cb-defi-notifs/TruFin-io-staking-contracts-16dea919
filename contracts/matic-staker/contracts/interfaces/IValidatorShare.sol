// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.8.19;

interface IValidatorShare {
    function buyVoucher(uint256 _amount, uint256 _minSharesToMint) external returns (uint256 amountToDeposit);

    // solhint-disable-next-line func-name-mixedcase
    function sellVoucher_new(uint256 claimAmount, uint256 maximumSharesToBurn) external;

    // solhint-disable-next-line func-name-mixedcase
    function unstakeClaimTokens_new(uint256 unbondNonce) external;

    function restake() external returns (uint256 amountRestaked, uint256 liquidReward);

    function approve(address spender, uint256 amount) external;

    function transfer(address to, uint256 value) external;

    function transferFrom(address sender, address recipient, uint256 amount) external;

    function getLiquidRewards(address user) external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function exchangeRate() external view returns (uint256);

    function getTotalStake(address user) external view returns (uint256, uint256);

    // automatically generated getter of a public mapping
    // solhint-disable-next-line func-name-mixedcase
    function unbonds_new(address user, uint256 unbondNonce) external view returns (uint256, uint256);

    // automatically generated getter of a public mapping
    function unbondNonces(address user) external view returns (uint256);
}
