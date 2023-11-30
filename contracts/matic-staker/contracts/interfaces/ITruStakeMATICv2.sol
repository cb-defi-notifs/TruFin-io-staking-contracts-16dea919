// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.8.19;

import {ValidatorState} from "../main/Types.sol";

interface ITruStakeMATICv2 {
    // --- Events ---

    /// @notice Emitted on initialize.
    /// @dev Params same as initialize function.
    event StakerInitialized(
        address _stakingTokenAddress,
        address _stakeManagerContractAddress,
        address _validator,
        address _whitelistAddress,
        address _treasuryAddress,
        uint256 _phi,
        uint256 _distPhi
    );

    // User Tracking

    /// @notice Emitted on user deposit.
    /// @param _user User which made the deposit tx.
    /// @param _treasuryShares Newly minted shares added to the treasury user's balance.
    /// @param _userShares Newly minted shares added to the depositing user's balance.
    /// @param _amount Amount of MATIC transferred by user into the staker.
    /// @param _stakedAmount Deposit _amount + any auto-claimed MATIC rewards sitting in the
    /// staker from previous deposits or withdrawal requests made by any user.
    /// @param _totalAssets Auto-claimed MATIC rewards that will sit in the staker
    /// until the next deposit made by any user.
    /// @param _validator Address of the validator the user has deposited to.
    event Deposited(
        address indexed _user,
        uint256 _treasuryShares,
        uint256 _userShares,
        uint256 _amount,
        uint256 _stakedAmount,
        uint256 _totalAssets,
        address indexed _validator
    );

    /// @notice Emitted on user requesting a withdrawal.
    /// @param _user User which made the withdraw request tx.
    /// @param _treasuryShares Newly minted shares added to the treasury user's balance
    /// (fees taken: shares are newly minted as a result of the auto-claimed MATIC rewards).
    /// @param _userShares Burnt shares removed from the depositing user's balance.
    /// @param _amount Amount of MATIC unbonding, which will be claimable by user in
    /// 80 checkpoints.
    /// @param _totalAssets Auto-claimed MATIC rewards that will sit in the staker
    /// until the next deposit made by any user.
    /// @param _validator Address of the validator the withdrawal was requested from.
    /// @param _unbondNonce Nonce of this unbond, which will be passed into the function
    /// withdrawClaim(uint256 _unbondNonce)` in 80 checkpoints in order to claim this
    /// the amount from this request.
    /// @param _epoch The current checkpoint the stake manager is at, used to track how
    /// how far from claiming the request is.
    event WithdrawalRequested(
        address indexed _user,
        uint256 _treasuryShares,
        uint256 _userShares,
        uint256 _amount,
        uint256 _totalAssets,
        address indexed _validator,
        uint256 _unbondNonce,
        uint256 indexed _epoch
    );

    /// @notice Emitted on user claiming a withdrawal.
    /// @param _user User which made the withdraw claim tx.
    /// @param _validator Address of the validator the withdrawal was claimed from.
    /// @param _unbondNonce Nonce of the original withdrawal request, which was passed
    /// into the `withdrawClaim` function.
    /// @param _amount Amount of MATIC claimed from staker (originally from stake manager).
    event WithdrawalClaimed(
        address indexed _user,
        address indexed _validator,
        uint256 indexed _unbondNonce,
        uint256 _amount
    );

    // global tracking

    /// @notice Emitted on rewards compound call.
    /// @param _amount Amount of MATIC moved from rewards on the validator to staked funds.
    /// @param _shares Newly minted shares added to the treasury user's balance (fees taken).
    event RewardsCompounded(uint256 indexed _amount, uint256 indexed _shares);

    // allocations

    /// @notice Emitted on allocation.
    /// @param _distributor Address of user who has allocated to someone else.
    /// @param _recipient Address of user to whom something was allocated.
    /// @param _individualAmount Total amount allocated to recipient by this distributor.
    /// @param _individualNum Average share price numerator at which allocations occurred.
    /// @param _individualDenom Average share price denominator at which allocations occurred.
    event Allocated(
        address indexed _distributor,
        address indexed _recipient,
        uint256 _individualAmount,
        uint256 _individualNum,
        uint256 _individualDenom
    );

    /// @notice Emitted on deallocations.
    /// @param _distributor Address of user who has allocated to someone else.
    /// @param _recipient Address of user to whom something was allocated.
    /// @param _individualAmount Remaining amount allocated to recipient.
    event Deallocated(address indexed _distributor, address indexed _recipient, uint256 _individualAmount);

    /// @notice Emitted when rewards are distributed.
    /// @param _distributor Address of user who has allocated to someone else.
    /// @param _recipient Address of user to whom something was allocated.
    /// @param _amount Amount of MATIC being distributed.
    /// @param _shares Amount of shares being distributed.
    /// @param _individualNum Average share price numerator at which distributor allocated.
    /// @param _individualDenom Average share price numerator at which distributor allocated.
    event DistributedRewards(
        address indexed _distributor,
        address indexed _recipient,
        uint256 _amount,
        uint256 _shares,
        uint256 _individualNum,
        uint256 _individualDenom
    );

    /// @notice Emitted when rewards are distributed.
    /// @param _distributor Address of user who has allocated to someone else.
    event DistributedAll(address indexed _distributor);

    // Setter Tracking

    event SetWhitelist(address indexed _oldWhitelistAddress, address indexed _newWhitelistAddress);

    event SetTreasury(address indexed _oldTreasuryAddress, address indexed _newTreasuryAddress);

    event SetDefaultValidator(address indexed _oldDefaultValidator, address indexed _newDefaultValidator);

    event SetPhi(uint256 indexed _oldPhi, uint256 indexed _newPhi);

    event SetDistPhi(uint256 indexed _oldDistPhi, uint256 indexed _newDistPhi);

    event SetEpsilon(uint256 indexed _oldEpsilon, uint256 indexed _newEpsilon);

    event SetMinDeposit(uint256 indexed _oldMinDeposit, uint256 indexed _newMinDeposit);

    event ValidatorAdded(address indexed _validator, uint256 _stakedAmount);

    event ValidatorStateChanged(
        address indexed _validator,
        ValidatorState indexed _oldState,
        ValidatorState indexed _newState
    );

    event RestakeError(address indexed _validator, string _reason);

    // --- Errors ---

    /// @notice Error thrown when user tries to transfer or approve to zero address.
    error ZeroAddressNotSupported();

    /// @notice Error thrown when a user tries to interact with a whitelisted-only function.
    error UserNotWhitelisted();

    /// @notice Error thrown when a user tries to deposit less than the minimum deposit amount.
    error DepositBelowMinDeposit();

    /// @notice Error thrown when a user tries to request a withdrawal with an amount larger
    /// than their shares entitle them to.
    error WithdrawalAmountTooLarge();

    /// @notice Error thrown when a user tries to request a withdrawal of amount zero.
    error WithdrawalRequestAmountCannotEqualZero();

    /// @notice Error thrown when a user tries to claim a withdrawal they did not request.
    error SenderMustHaveInitiatedWithdrawalRequest();

    /// @notice Error thrown when a user tries to claim a withdrawal that does not exist.
    error WithdrawClaimNonExistent();

    /// @notice Error thrown when user allocates more MATIC than available.
    error InsufficientDistributorBalance();

    /// @notice Error thrown when a user attempts to allocate less than one MATIC.
    error AllocationUnderOneMATIC();

    /// @notice Error thrown when deallocation is greater than allocated amount.
    error ExcessDeallocation();

    /// @notice Error thrown when a user tries to deallocate from a user they do
    /// not currently have anything allocated to.
    error AllocationNonExistent();

    /// @notice Error thrown when user calls distributeRewards when the allocation
    /// share price is the same as the current share price.
    error NothingToDistribute();

    /// @notice Error thrown when the distribution fee is higher than the fee precision.
    error DistPhiTooLarge();

    /// @notice Error thrown when epsilon is set too high.
    error EpsilonTooLarge();

    /// @notice Error thrown when the new minimum deposit amount is too small.
    error MinDepositTooSmall();

    /// @notice Error thrown when the phi value is larger than the phi precision constant.
    error PhiTooLarge();

    /// @notice Error thrown when trying to add an existing validator.
    error ValidatorAlreadyExists();

    /// @notice Error thrown when trying to disable a validator that is not enabled.
    error ValidatorNotEnabled();

    /// @notice Error thrown when trying to enable a validator that is not disabled.
    error ValidatorNotDisabled();

    /// @notice Error thrown when trying to perform actions on a non-existent validator.
    error ValidatorDoesNotExist();
}
