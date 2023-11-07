// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.8.19;

// OpenZeppelin
import {ERC4626Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {MathUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

// Polygon
import {IValidatorShare} from "../interfaces/IValidatorShare.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";

// TruFin
import {ITruStakeMATICv2} from "../interfaces/ITruStakeMATICv2.sol";
import {TruStakeMATICv2Storage} from "./TruStakeMATICv2Storage.sol";
import {Withdrawal, Allocation, ValidatorState, Validator} from "./Types.sol";
import {IMasterWhitelist} from "../interfaces/IMasterWhitelist.sol";

uint256 constant PHI_PRECISION = 1e4;
uint256 constant MAX_EPSILON = 1e12;

/// @title TruStakeMATICv2
/// @notice An auto-compounding liquid staking MATIC vault with reward-allocating functionality.
contract TruStakeMATICv2 is
    TruStakeMATICv2Storage,
    ITruStakeMATICv2,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    ERC4626Upgradeable
{
    // *** LIBRARIES ***

    using SafeERC20Upgradeable for IERC20Upgradeable;

    // *** CONSTRUCTOR & INITIALIZER ***

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Vault state initializer.
    /// @param _stakingTokenAddress MATIC token address.
    /// @param _stakeManagerContractAddress Polygon's StakeManager contract address.
    /// @param _validator Share contract address of the validator the vault delegates to.
    /// @param _whitelistAddress The vault's whitelist contract address.
    /// @param _treasuryAddress Treasury address that receives vault fees.
    /// @param _phi Fee taken on restake in basis points.
    /// @param _distPhi Fee taken during the distribution of rewards earned from loose allocations.
    /// @param _cap Limit placed on combined vault deposits.
    function initialize(
        address _stakingTokenAddress,
        address _stakeManagerContractAddress,
        address _validator,
        address _whitelistAddress,
        address _treasuryAddress,
        uint256 _phi,
        uint256 _distPhi,
        uint256 _cap
    ) external initializer {
        // Initialize derived state
        __ReentrancyGuard_init();
        __Ownable_init();
        __ERC4626_init(IERC20Upgradeable(_stakingTokenAddress));
        __ERC20_init("TruStake MATIC Vault Shares", "TruMATIC");

        // Ensure addresses are non-zero
        _checkNotZeroAddress(_stakingTokenAddress);
        _checkNotZeroAddress(_stakeManagerContractAddress);
        _checkNotZeroAddress(_validator);
        _checkNotZeroAddress(_whitelistAddress);
        _checkNotZeroAddress(_treasuryAddress);

        if (_phi > PHI_PRECISION) {
            revert PhiTooLarge();
        }

        if (_distPhi > PHI_PRECISION) {
            revert DistPhiTooLarge();
        }

        // Initialize contract state
        stakingTokenAddress = _stakingTokenAddress;
        stakeManagerContractAddress = _stakeManagerContractAddress;
        validatorAddresses.push(_validator);
        validators[_validator].state = ValidatorState.ENABLED;
        whitelistAddress = _whitelistAddress;
        treasuryAddress = _treasuryAddress;
        phi = _phi;
        cap = _cap;
        distPhi = _distPhi;
        epsilon = 1e4;
        allowStrict = false;
        minDeposit = 1e18; // default minimum is 1 MATIC

        emit StakerInitialized(
            _stakingTokenAddress,
            _stakeManagerContractAddress,
            _validator,
            _whitelistAddress,
            _treasuryAddress,
            _phi,
            _cap,
            _distPhi
        );
    }

    // *** MODIFIERS ***

    // Reverts call if caller is not whitelisted
    modifier onlyWhitelist() {
        if (!IMasterWhitelist(whitelistAddress).isUserWhitelisted(msg.sender)) {
            revert UserNotWhitelisted();
        }
        _;
    }

    // **************************************** VIEW FUNCTIONS ****************************************

    // *** VAULT INFO ***

    /// @notice Gets the total amount of MATIC currently staked by the vault.
    /// @return stake Total amount of MATIC staked by the vault via validator delegation.
    function totalStaked() public view returns (uint256 stake) {
        uint256 validatorCount = validatorAddresses.length;
        for (uint256 i; i < validatorCount;){
            stake += validators[validatorAddresses[i]].stakedAmount;
            unchecked{
                ++i;
            }
        }
        return stake;
    }

    /// @notice Gets the total unclaimed MATIC rewards on all validators.
    /// @return validatorRewards Total amount of MATIC rewards earned through all validators.
    function totalRewards() public view returns (uint256 validatorRewards) {
        uint256 validatorCount = validatorAddresses.length;
        for (uint256 i; i < validatorCount;){
            validatorRewards += IValidatorShare(validatorAddresses[i]).getLiquidRewards(address(this));
            unchecked{
                ++i;
            }
        }
        return validatorRewards;
    }

    /// @notice Gets the price of one TruMATIC share in MATIC.
    /// @dev Represented via a fraction. Factor of 1e18 included in numerator to avoid rounding errors (currently redundant).
    /// @return globalPriceNum Numerator of the vault's share price fraction.
    /// @return globalPriceDenom Denominator of the vault's share price fraction.
    function sharePrice() public view returns (uint256, uint256) {
        if (totalSupply() == 0) return (1e18, 1);

        uint256 totalCapitalTimesPhiPrecision = (totalStaked() + totalAssets()) *
            PHI_PRECISION +
            (PHI_PRECISION - phi) *
            totalRewards();

        // Calculate share price fraction components
        uint256 globalPriceNum = totalCapitalTimesPhiPrecision * 1e18;
        uint256 globalPriceDenom = totalSupply() * PHI_PRECISION;

        return (globalPriceNum, globalPriceDenom);
    }

    // *** GETTERS ***

    /// @notice Convenience getter for retrieving user-relevant info.
    /// @param _user Address of the user.
    /// @return maxRedeemable Maximum TruMATIC that can be redeemed by the user.
    /// @return maxWithdrawAmount Maximum MATIC that can be withdrawn by the user.
    /// @return globalPriceNum Numerator of the vault's share price fraction.
    /// @return globalPriceDenom Denominator of the vault's share price fraction.
    /// @return epoch Current Polygon epoch.
    function getUserInfo(address _user) public view returns (uint256, uint256, uint256, uint256, uint256) {
        (uint256 globalPriceNum, uint256 globalPriceDenom) = sharePrice();
        uint256 maxRedeemable = maxRedeem(_user);
        uint256 maxWithdrawAmount = maxWithdraw(_user);
        uint256 epoch = getCurrentEpoch();

        return (maxRedeemable, maxWithdrawAmount, globalPriceNum, globalPriceDenom, epoch);
    }

    /// @notice Retrieves information for all supported validators.
    /// @return validatorArray An array of structs containing details for each validator.
    function getAllValidators() public view returns (Validator[] memory){
        uint256 validatorCount = validatorAddresses.length;
        Validator[] memory validatorArray = new Validator[](validatorCount);
        for (uint256 i; i < validatorCount;){
            address validatorAddress = validatorAddresses[i];
            Validator memory validator = validators[validatorAddress];
            validator.validatorAddress = validatorAddress;
            validatorArray[i] = validator;
            unchecked{
                ++i;
            }
        }
        return validatorArray;
    }

    /// @notice Gets the total unclaimed MATIC rewards on a specific validator.
    /// @param _validator The address of the validator.
    /// @return Amount of MATIC rewards earned through this validator.
    function getRewardsFromValidator(address _validator) public view returns (uint256) {
        return IValidatorShare(_validator).getLiquidRewards(address(this));
    }

    /// @notice Calculates the amount of fees from MATIC rewards that haven't yet been turned into shares.
    /// @return The amount of fees from rewards that haven't yet been turned into shares.
    function getDust() external view returns (uint256) {
        return (totalRewards() * phi) / PHI_PRECISION;
    }

    /// @notice Gets the latest unbond nonce from a specified validator.
    /// @param _validator The address of the validator.
    /// @return Current unbond nonce for vault-delegator unbonds.
    function getUnbondNonce(address _validator) external view returns (uint256) {
        return IValidatorShare(_validator).unbondNonces(address(this));
    }

    /// @notice Returns the addresses of the validators that are added to the contract.
    function getValidators() external view returns (address[] memory) {
        return validatorAddresses;
    }

    /// @notice Gets the current epoch from Polygons's StakeManager contract.
    /// @return Current Polygon epoch.
    function getCurrentEpoch() public view returns (uint256) {
        return IStakeManager(stakeManagerContractAddress).epoch();
    }

    /// @notice Gets a recipient's distributors.
    /// @param _user The recipient.
    /// @param _strict Whether to get strict-distributors (true) or loose distributors (false).
    /// @return The recipient's distributors.
    function getDistributors(address _user, bool _strict) public view returns (address[] memory) {
        return distributors[_user][_strict];
    }

    /// @notice Gets a distributor's recipients.
    /// @param _user The distributor.
    /// @param _strict Whether to get strict-recipients (true) or loose recipients (false).
    /// @return The distributor's recipients.
    function getRecipients(address _user, bool _strict) public view returns (address[] memory) {
        return recipients[_user][_strict];
    }

    /// @notice Checks if the unbond specified via the input nonce can be claimed from the delegator.
    /// @dev Cannot check the claimability of pre-upgrade unbonds.
    /// @param _unbondNonce Nonce of the unbond under consideration.
    /// @param _validator The address of the validator.
    /// @return  A value indicating whether the unbond can be claimed.
    function isClaimable(uint256 _unbondNonce, address _validator) external view returns (bool) {
        // Get epoch at which unbonding of delegated MATIC was initiated
        (, uint256 withdrawEpoch) = IValidatorShare(_validator).unbonds_new(
            address(this),
            _unbondNonce
        );

        // Check required epochs have passed
        bool epochsPassed = getCurrentEpoch() >= withdrawEpoch + IStakeManager(stakeManagerContractAddress).withdrawalDelay();

        bool withdrawalPresent = withdrawals[_validator][_unbondNonce].user != address(0);

        return withdrawalPresent && epochsPassed;
    }


    // *** MAXIMUMS ***

    /// @notice Gets the maximum amount of MATIC a user could deposit into the vault.
    /// @dev maxDeposit is independent of the user, so while an address is passed in for ERC4626
    /// compliance, it is never used.
    /// @return The amount of MATIC.
    function maxDeposit(address) public view override returns (uint256) {
        uint256 totalStakedMATIC = totalStaked();

        if (totalStakedMATIC >= cap) return 0;

        return cap - totalStakedMATIC;
    }

    /// @notice Gets the maximum number of TruMATIC shares a user could mint.
    /// @dev maxMint is independent of the user, so while an address is passed in for ERC4626
    /// compliance, it is never used.
    /// @return The amount of TruMATIC.
    function maxMint(address) public view override returns (uint256) {
        return previewDeposit(maxDeposit(address(0)));
    }

    /// @notice Gets the maximum amount of MATIC a user can withdraw from the vault.
    /// @param _user The user under consideration.
    /// @return The amount of MATIC.
    function maxWithdraw(address _user) public view override returns (uint256) {
        uint256 preview = previewRedeem(maxRedeem(_user));

        if (preview == 0) {
            return 0;
        }

        return preview + epsilon;
    }

    /// @notice Gets the maximum number of TruMATIC shares a user can redeem into MATIC.
    /// @param _user The user under consideration.
    /// @return The amount of TruMATIC.
    function maxRedeem(address _user) public view override returns (uint256) {
        Allocation storage totalAllocation = totalAllocated[_user][true];

        // Cache from storage
        uint256 maticAmount = totalAllocation.maticAmount;

        // Redeemer can't withdraw shares equivalent to their total allocation plus its rewards
        uint256 unredeemableShares = (maticAmount == 0)
            ? 0
            : MathUpgradeable.mulDiv(
                totalAllocation.maticAmount * 1e18,
                totalAllocation.sharePriceDenom,
                totalAllocation.sharePriceNum,
                MathUpgradeable.Rounding.Up
            );

        // We rounded up unredeemableShares to ensure excess shares are not returned
        return balanceOf(_user) > unredeemableShares ? balanceOf(_user) - unredeemableShares : 0;
    }

    /// @notice Anticipates the amount of MATIC someone can redeem based on the number of TruMATIC shares.
    /// @param _shares The amount of TruMATIC to redeem MATIC for.
    /// @inheritdoc ERC4626Upgradeable
    function previewRedeem(uint256 _shares) public view override returns (uint256) {
        return _convertToAssets(_shares, MathUpgradeable.Rounding.Up);
    }

    // **************************************** STATE-CHANGING FUNCTIONS ****************************************

    // *** JOINING THE VAULT ***

    /// @notice Deposits an amount of caller->-vault approved MATIC into the vault.
    /// @param _assets The amount of MATIC to deposit.
    /// @param _receiver The address to receive TruMATIC shares (must be caller to avoid reversion).
    /// @dev Although the ERC-4626 standard stipulates an approved user should be able to call this function
    /// on behalf of a different `_receiver`, this functionality is currently disabled in the TruMATICv2
    /// contract as the share management system has not been designed for it. If use of this functionality is
    /// attempted, the transaction will revert.
    /// @return The resulting amount of TruMATIC shares minted to the caller (receiver).
    function deposit(uint256 _assets, address _receiver) public override onlyWhitelist nonReentrant returns (uint256) {
        if (msg.sender != _receiver) {
            revert SenderAndOwnerMustBeReceiver();
        }

        _deposit(msg.sender, _assets, defaultValidatorAddress);

        return previewDeposit(_assets);
    }

    /// @notice Deposits an amount of caller->-vault approved MATIC into the vault.
    /// @param _assets The amount of MATIC to deposit.
    /// @param _validator Address of the validator you want to stake with.
    /// @return The resulting amount of TruMATIC shares minted to the caller.
    function depositToSpecificValidator(uint256 _assets, address _validator) public onlyWhitelist nonReentrant returns (uint256) {
        _deposit(msg.sender, _assets, _validator);

        return previewDeposit(_assets);
    }

    /// @notice Mints an amount of vault shares to the caller.
    /// @dev Requires equivalent value of MATIC to be approved to the vault by the caller (converted using current share price).
    /// @param _shares The amount of shares to mint.
    /// @param _receiver The address to receive said TruMATIC shares (must be caller to avoid reversion).
    /// @dev Although the ERC-4626 standard stipulates an approved user should be able to call this function
    /// on behalf of a different `_receiver`, this functionality is currently disabled in the TruMATICv2
    /// contract as the share management system has not been designed for it. If use of this functionality is
    /// attempted, the transaction will revert.
    /// @return The resulting amount of MATIC deposited into the vault.
    function mint(uint256 _shares, address _receiver) public override onlyWhitelist nonReentrant returns (uint256) {
        if (msg.sender != _receiver) {
            revert SenderAndOwnerMustBeReceiver();
        }

        uint256 assets = previewMint(_shares);

        _deposit(msg.sender, assets, defaultValidatorAddress);

        return assets;
    }

    /// @notice Mints an amount of vault shares to the caller.
    /// @dev Requires equivalent value of MATIC to be approved to the vault by the caller (converted using current share price).
    /// @param _shares The amount of shares to mint.
    /// @param _receiver The address to receive said TruMATIC shares (must be caller to avoid reversion).
    /// @dev Although the ERC-4626 standard stipulates an approved user should be able to call this function
    /// on behalf of a different `_receiver`, this functionality is currently disabled in the TruMATICv2
    /// contract as the share management system has not been designed for it. If use of this functionality is
    /// attempted, the transaction will revert.
    /// @param _validator Address of the validator the user is minting from.
    /// @return The resulting amount of MATIC deposited into the vault.
    function mintFromSpecificValidator(uint256 _shares, address _receiver, address _validator) public onlyWhitelist nonReentrant returns (uint256) {
        if (msg.sender != _receiver) {
            revert SenderAndOwnerMustBeReceiver();
        }

        uint256 assets = previewMint(_shares);

        _deposit(msg.sender, assets, _validator);

        return assets;
    }

    // *** LEAVING THE VAULT ***

    /// @notice Initiates a withdrawal request for an amount of MATIC from the vault and burns corresponding TruMATIC shares.
    /// @param _assets The amount of MATIC to withdraw.
    /// @param _receiver The address to receive the MATIC (must be caller to avoid reversion).
    /// @param _user The address whose shares are to be burned (must be caller to avoid reversion).
    /// @dev Although the ERC-4626 standard stipulates an approved user should be able to call this function
    /// on behalf of a different `_receiver` or `_user`, this functionality is currently disabled in the TruMATICv2
    /// contract as the share management system has not been designed for it. If use of this functionality is
    /// attempted, the transaction will revert.
    /// @dev Although the ERC-4626 standard stipulates that assets be transferred to the receiver in this function, it is
    /// non-trivial to enforce both that functionality and the ability for users to pass in as a parameter the amount of
    /// assets they'd like to withdraw (another stipulation of the standard). Therefore, that is not the case with this
    /// function, and users will need to call `withdrawClaim(uint256)` following an unbonding period in order to receive
    /// their assets.
    /// @return The resulting amount of TruMATIC shares burned from the caller (owner).
    function withdraw(
        uint256 _assets,
        address _receiver,
        address _user
    ) public override onlyWhitelist nonReentrant returns (uint256) {
        if (msg.sender != _receiver || msg.sender != _user) {
            revert SenderAndOwnerMustBeReceiver();
        }

        _withdrawRequest(msg.sender, _assets, defaultValidatorAddress);

        return previewWithdraw(_assets);
    }

    /// @notice Initiates a withdrawal request for an amount of MATIC from the specified validator
    /// and burns corresponding TruMATIC shares.
    /// @param _assets The amount of MATIC to withdraw.
    /// @param _validator The address of the validator from which to withdraw.
    /// @return The resulting amount of TruMATIC shares burned from the caller (owner).
    function withdrawFromSpecificValidator(
        uint256 _assets,
        address _validator) public onlyWhitelist nonReentrant returns (uint256) {
        if (validators[_validator].state == ValidatorState.NONE){
            revert ValidatorDoesNotExist();
        }

        _withdrawRequest(msg.sender, _assets, _validator);

        return previewWithdraw(_assets);
    }

    /// @notice Initiates a withdrawal request for the underlying MATIC of an amount of TruMATIC shares from the vault.
    /// @param _shares The amount of TruMATIC shares to redeem and burn.
    /// @param _receiver The address to receive the underlying MATIC (must be caller to avoid reversion).
    /// @param _user The address whose shares are to be burned (must be caller to avoid reversion).
    /// @dev Although the ERC-4626 standard stipulates an approved user should be able to call this function
    /// on behalf of a different `_receiver` or `_user`, this functionality is currently disabled in the TruMATICv2
    /// contract as the share management system has not been designed for it. If use of this functionality is
    /// attempted, the transaction will revert.
    /// @dev Although the ERC-4626 standard stipulates that assets be transferred to the receiver in this function, it is
    /// non-trivial to enforce both that functionality and the ability for users to pass in as a parameter the amount of
    /// shares they'd like to withdraw (another stipulation of the standard). Therefore, that is not the case with this
    /// function, and users will need to call `withdrawClaim(uint256)` following an unbonding period in order to receive
    /// their assets.
    /// @return The amount of MATIC scheduled for withdrawal from the vault.
    function redeem(
        uint256 _shares,
        address _receiver,
        address _user
    ) public override onlyWhitelist nonReentrant returns (uint256) {
        if (msg.sender != _receiver || msg.sender != _user) {
            revert SenderAndOwnerMustBeReceiver();
        }

        uint256 assets = previewRedeem(_shares);

        _withdrawRequest(msg.sender, assets, defaultValidatorAddress);

        return assets;
    }

    // *** CLAIMING WITHDRAWALS ***

    /// @notice Claims a previous requested and now unbonded withdrawal.
    /// @param _unbondNonce Nonce of the corresponding delegator unbond.
    /// @param _validator Address of the validator to claim the rewards from.
    function withdrawClaim(uint256 _unbondNonce, address _validator) external onlyWhitelist nonReentrant {
        _withdrawClaim(_unbondNonce, _validator);
    }

    /// @notice Claims multiple previously requested and now unbonded withdrawals from a specified validator.
    /// @param _unbondNonces List of delegator unbond nonces corresponding to said withdrawals.
    /// @param _validator Address of the validator to claim the rewards from.
    function claimList(uint256[] calldata _unbondNonces, address _validator) external onlyWhitelist nonReentrant {
        uint256 len = _unbondNonces.length;

        for (uint256 i; i < len; ) {
            _withdrawClaim(_unbondNonces[i], _validator);

            unchecked {
                ++i;
            }
        }
    }

    /// @notice Stakes MATIC lingering in the vault to the default validator.
    /// @dev Such MATIC arrives in the vault via auto-claiming during vault delegations/unbonds (buy/sell validator vouchers).
    /// @param _validator Address of the validator to stake the claimed rewards to.
    function stakeClaimedRewards(address _validator) external nonReentrant {
        _deposit(address(0), 0, _validator);
    }

    /// @notice Restakes the vault's current unclaimed delegation-earned rewards.
    /// @dev Can be called manually to prevent the rewards surpassing reserves. This could lead to insufficient funds for
    /// withdrawals, as they are taken from delegated MATIC and not its rewards.
    function compoundRewards() external nonReentrant {
        uint256 amountRestaked = totalRewards();

        // To keep share price constant when rewards are staked, new shares need to be minted
        uint256 shareIncrease = convertToShares(totalStaked() + amountRestaked + totalAssets()) - totalSupply();

        _restake(defaultValidatorAddress);

        // Minted shares are given to the treasury to effectively take a fee
        _mint(treasuryAddress, shareIncrease);

        // Emitted for ERC4626 compliance
        emit Deposit(msg.sender, treasuryAddress, 0, shareIncrease);

        emit RewardsCompounded(amountRestaked, shareIncrease);
    }

    // *** ALLOCATIONS ***

    /// @notice Allocates the validation rewards earned by an amount of the caller's staked MATIC to a user.
    /// @param _amount The amount of staked MATIC.
    /// @param _recipient The address of the target recipient.
    /// @param _strict  A value indicating whether the type of the allocation is strict(true) or loose(false).
    function allocate(uint256 _amount, address _recipient, bool _strict) external onlyWhitelist nonReentrant {
        if (_strict && !allowStrict) {
            revert StrictAllocationDisabled();
        }
        _checkNotZeroAddress(_recipient);

        if (_amount > maxWithdraw(msg.sender)) {
            // not strictly necessary but used anyway for loose allocations
            revert InsufficientDistributorBalance();
        }

        if (_amount < 1e18) {
            revert AllocationUnderOneMATIC();
        }

        uint256 individualAmount;
        uint256 individualPriceNum;
        uint256 individualPriceDenom;

        uint256 totalAmount;
        uint256 totalNum;
        uint256 totalDenom;
        // variables up here for stack too deep issues

        {
            (uint256 globalPriceNum, uint256 globalPriceDenom) = sharePrice();

            Allocation storage oldIndividualAllocation = allocations[msg.sender][_recipient][_strict];
            uint256 oldIndividualAllocationMaticAmount = oldIndividualAllocation.maticAmount;

            if (oldIndividualAllocationMaticAmount == 0) {
                // if this is a new allocation
                individualAmount = _amount;
                individualPriceNum = globalPriceNum;
                individualPriceDenom = globalPriceDenom;

                // update mappings to keep track of recipients for each dist and vice versa
                distributors[_recipient][_strict].push(msg.sender);
                recipients[msg.sender][_strict].push(_recipient);
            } else {
                // performing update allocation

                individualAmount = oldIndividualAllocationMaticAmount + _amount;

                individualPriceNum = oldIndividualAllocationMaticAmount * 1e22 + _amount * 1e22;

                individualPriceDenom =
                    MathUpgradeable.mulDiv(
                        oldIndividualAllocationMaticAmount * 1e22,
                        oldIndividualAllocation.sharePriceDenom,
                        oldIndividualAllocation.sharePriceNum,
                        MathUpgradeable.Rounding.Down
                    ) +
                    MathUpgradeable.mulDiv(
                        _amount * 1e22,
                        globalPriceDenom,
                        globalPriceNum,
                        MathUpgradeable.Rounding.Down
                    );

                // rounding individual allocation share price denominator DOWN, in order to maximise the individual allocation share price
                // which minimises the amount that is distributed in `distributeRewards()`
            }

            allocations[msg.sender][_recipient][_strict] = Allocation(
                individualAmount,
                individualPriceNum,
                individualPriceDenom
            );

            // set or update total allocation value for user

            Allocation storage totalAllocation = totalAllocated[msg.sender][_strict];

            if (totalAllocation.maticAmount == 0) {
                // set total allocated amount + share price

                totalAmount = _amount;
                totalNum = globalPriceNum;
                totalDenom = globalPriceDenom;
            } else {
                // update total allocated amount + share price

                totalAmount = totalAllocation.maticAmount + _amount;

                totalNum = totalAllocation.maticAmount * 1e22 + _amount * 1e22;

                totalDenom =
                    MathUpgradeable.mulDiv(
                        totalAllocation.maticAmount * 1e22,
                        totalAllocation.sharePriceDenom,
                        totalAllocation.sharePriceNum,
                        MathUpgradeable.Rounding.Up
                    ) +
                    MathUpgradeable.mulDiv(
                        _amount * 1e22,
                        globalPriceDenom,
                        globalPriceNum,
                        MathUpgradeable.Rounding.Up
                    );

                // rounding total allocated share price denominator UP, in order to minimise the total allocation share price
                // which maximises the amount owed by the distributor, which they cannot withdraw/transfer (strict allocations)
            }

            totalAllocated[msg.sender][_strict] = Allocation(totalAmount, totalNum, totalDenom);
        }

        emit Allocated(
            msg.sender,
            _recipient,
            individualAmount,
            individualPriceNum,
            individualPriceDenom,
            totalAmount,
            totalNum,
            totalDenom,
            _strict
        );
    }

    /// @notice Deallocates an amount of MATIC previously allocated to a user.
    /// @dev Distributes any outstanding rewards to the recipient before deallocating (strict allocations only).
    /// @param _amount The amount the caller wishes to reduce the target's allocation by.
    /// @param _recipient The address of the user whose allocation is being reduced.
    /// @param _strict A value indicating whether the type of the allocation is strict(true) or loose(false).
    function deallocate(uint256 _amount, address _recipient, bool _strict) external onlyWhitelist nonReentrant {
        Allocation storage individualAllocation = allocations[msg.sender][_recipient][_strict];

        uint256 individualSharePriceNum = individualAllocation.sharePriceNum;
        uint256 individualSharePriceDenom = individualAllocation.sharePriceDenom;
        uint256 individualMaticAmount = individualAllocation.maticAmount;

        if (individualMaticAmount == 0) {
            revert AllocationNonExistent();
        }

         if (individualMaticAmount < _amount) {
            revert ExcessDeallocation();
        }

        unchecked {
           individualMaticAmount -= _amount;
        }

         if (individualMaticAmount < 1e18 && individualMaticAmount !=0 ) {
            revert AllocationUnderOneMATIC();
        }

        (uint256 globalPriceNum, uint256 globalPriceDenom) = sharePrice();

        // check if the share price has moved - if yes, distribute first
        if (
            _strict &&
            individualSharePriceNum / individualSharePriceDenom <
            globalPriceNum / globalPriceDenom
        ) {
            _distributeRewardsUpdateTotal(_recipient, msg.sender, _strict, false);
        }

        // check if this is a complete deallocation
        if (individualMaticAmount == 0) {
            // remove recipient from distributor's recipient array
            delete allocations[msg.sender][_recipient][_strict];

            address[] storage rec = recipients[msg.sender][_strict];
            removeAddress(rec, _recipient);

            // remove distributor from recipient's distributor array
            address[] storage dist = distributors[_recipient][_strict];
            removeAddress(dist, msg.sender);
        } else {
            individualAllocation.maticAmount = individualMaticAmount;
        }

        // update total allocation values - rebalance

        uint256 totalAmount;
        uint256 totalPriceNum;
        uint256 totalPriceDenom;

        Allocation storage totalAllocation = totalAllocated[msg.sender][_strict];

        uint256 totalAllocationMaticAmount = totalAllocation.maticAmount;
        totalAmount = totalAllocationMaticAmount - _amount;

        if (totalAmount == 0) {
            delete totalAllocated[msg.sender][_strict];
        } else {
            if(_strict){
                individualSharePriceNum = globalPriceNum;
                individualSharePriceDenom = globalPriceDenom;
            }

            // in the case of deallocating a strict allocation, rewards will have been distributed
            // at the start of the deallocate function, therefore we must use the old share price
            // in the weighted sum below to update the total allocation share price. This is because
            // the individual share price has already been updated to the global share price.

            totalPriceNum = totalAllocationMaticAmount * 1e22 - _amount * 1e22;

            totalPriceDenom =
                MathUpgradeable.mulDiv(
                    totalAllocationMaticAmount * 1e22,
                    totalAllocation.sharePriceDenom,
                    totalAllocation.sharePriceNum,
                    MathUpgradeable.Rounding.Up
                ) -
                MathUpgradeable.mulDiv(
                    _amount * 1e22,
                    individualSharePriceDenom,
                    individualSharePriceNum,
                    MathUpgradeable.Rounding.Down
                );

            // rounding total allocated share price denominator UP, in order to minimise the total allocation share price
            // which maximises the amount owed by the distributor, which they cannot withdraw/transfer (strict allocations)

            totalAllocated[msg.sender][_strict] = Allocation(totalAmount, totalPriceNum, totalPriceDenom);
        }


        emit Deallocated(
            msg.sender,
            _recipient,
            individualMaticAmount,
            totalAmount,
            totalPriceNum,
            totalPriceDenom,
            _strict
        );
    }

    /// @notice Reallocates an amount of the caller's loosely allocated MATIC from one recipient to another.
    /// @param _oldRecipient The previous recipient of the allocation.
    /// @param _newRecipient The new recipient of the allocation.
    function reallocate(address _oldRecipient, address _newRecipient) external onlyWhitelist nonReentrant {
        _checkNotZeroAddress(_newRecipient);

        // cannot reallocate to the original recipient
        if (_oldRecipient == _newRecipient) {
            revert AllocationToInitialRecipient();
        }

        // Loose allocations only => strictness = false
        Allocation memory oldIndividualAllocation = allocations[msg.sender][_oldRecipient][false];

        // assert that there is an old allocation
        if (oldIndividualAllocation.maticAmount == 0) {
            revert AllocationNonExistent();
        }

        Allocation storage newAllocation = allocations[msg.sender][_newRecipient][false];

        uint256 individualAmount;
        uint256 individualPriceNum;
        uint256 individualPriceDenom;

        // check if new recipient has already been allocated to
        if (newAllocation.maticAmount == 0) {
            // set new one
            individualAmount = oldIndividualAllocation.maticAmount;
            individualPriceNum = oldIndividualAllocation.sharePriceNum;
            individualPriceDenom = oldIndividualAllocation.sharePriceDenom;

            // replace the old recipient address with the new one
            address[] storage rec = recipients[msg.sender][false];
            uint256 rlen = rec.length;

            for (uint256 i; i < rlen; ) {
                if (rec[i] == _oldRecipient) {
                    rec[i] = _newRecipient;
                    break;
                }

                unchecked {
                    ++i;
                }
            }

            // to newRecipient's distributors array: add distributor
            distributors[_newRecipient][false].push(msg.sender);
        } else {
            // update existing recipient allocation with weighted sum
            individualAmount = oldIndividualAllocation.maticAmount + newAllocation.maticAmount;
            individualPriceNum = oldIndividualAllocation.maticAmount * 1e22 + newAllocation.maticAmount * 1e22;

            individualPriceDenom =
                MathUpgradeable.mulDiv(
                    oldIndividualAllocation.maticAmount * 1e22,
                    oldIndividualAllocation.sharePriceDenom,
                    oldIndividualAllocation.sharePriceNum,
                    MathUpgradeable.Rounding.Down
                ) +
                MathUpgradeable.mulDiv(
                    newAllocation.maticAmount * 1e22,
                    newAllocation.sharePriceDenom,
                    newAllocation.sharePriceNum,
                    MathUpgradeable.Rounding.Down
                );

            // rounding individual allocation share price denominator DOWN, in order to maximise the individual allocation share price
            // which minimises the amount that is distributed in `distributeRewards()`

            // pop old one from recipients array
            address[] storage rec = recipients[msg.sender][false];
            removeAddress(rec, _oldRecipient);
        }
        // delete old one
        delete allocations[msg.sender][_oldRecipient][false];
        // set the new allocation amount
        allocations[msg.sender][_newRecipient][false] = Allocation(
            individualAmount,
            individualPriceNum,
            individualPriceDenom
        );

        // from oldRecipient's distributors array: pop distributor
        address[] storage dist = distributors[_oldRecipient][false];
        removeAddress(dist, msg.sender);

        emit Reallocated(
            msg.sender,
            _oldRecipient,
            _newRecipient,
            individualAmount,
            individualPriceNum,
            individualPriceDenom
        );
    }

    /// @notice Distributes allocation rewards from a distributor to a recipient.
    /// @dev Caller must be a distributor of the recipient in the case of loose allocations or MATIC distributions.
    /// @param _recipient Address of allocation's recipient.
    /// @param _distributor Address of allocation's distributor.
    /// @param _strict A value indicating whether the type of the allocation is strict(true) or loose(false).
    /// @param _inMatic A value indicating whether the reward is in MATIC or not.
    function distributeRewards(address _recipient, address _distributor, bool _strict, bool _inMatic) public nonReentrant {
        if ((!_strict || _inMatic) && msg.sender != _distributor) {
            revert OnlyDistributorCanDistributeRewards();
        }

        _distributeRewardsUpdateTotal(_recipient, _distributor, _strict, _inMatic);
    }

    /// @notice Distributes the rewards from a specific allocator's allocations to all their recipients.
    /// @dev Caller must be a distributor of the recipient in the case of loose allocations or MATIC distributions.
    /// @param _distributor Address of distributor whose allocations are to have their rewards distributed.
    /// @param _strict A value indicating whether the type of the allocation is strict(true) or loose(false).
    /// @param _inMatic A value indicating whether the reward is in MATIC or not.
    function distributeAll(address _distributor, bool _strict, bool _inMatic) external nonReentrant {
        if ((!_strict || _inMatic) && msg.sender != _distributor) {
            revert OnlyDistributorCanDistributeRewards();
        }

        address[] storage rec = recipients[_distributor][_strict];
        uint256 len = rec.length;

        (uint256 globalPriceNum, uint256 globalPriceDenom) = sharePrice();

        for (uint256 i; i < len; ) {
            Allocation storage individualAllocation = allocations[_distributor][rec[i]][_strict];

            if (
                individualAllocation.sharePriceNum / individualAllocation.sharePriceDenom <
                globalPriceNum / globalPriceDenom
            ) {
                _distributeRewards(rec[i], _distributor, _strict, false, _inMatic);
            }
            unchecked {
                ++i;
            }
        }

        // reset total allocation

        Allocation storage totalAllocation = totalAllocated[msg.sender][_strict];
        totalAllocation.sharePriceNum = globalPriceNum;
        totalAllocation.sharePriceDenom = globalPriceDenom;

        emit DistributedAll(_distributor, globalPriceNum, globalPriceDenom, _strict);
    }

    // *** VAULT OWNER ADMIN SETTERS ***

    /// @notice Sets the whitelist used to check user status.
    /// @param _whitelistAddress to point to.
    function setWhitelist(address _whitelistAddress) external onlyOwner {
        _checkNotZeroAddress(_whitelistAddress);
        emit SetWhitelist(whitelistAddress, _whitelistAddress);
        whitelistAddress = _whitelistAddress;
    }

    /// @notice Sets the treasury used to accumulate rewards.
    /// @param _treasuryAddress to receive rewards and fees.
    function setTreasury(address _treasuryAddress) external onlyOwner {
        _checkNotZeroAddress(_treasuryAddress);
        emit SetTreasury(treasuryAddress, _treasuryAddress);
        treasuryAddress = _treasuryAddress;
    }

    /// @notice Sets the default validator used for staking.
    /// @param _validator New default validator to stake to and withdraw from.
    function setDefaultValidator(address _validator) external onlyOwner {
        _checkNotZeroAddress(_validator);
        if (validators[_validator].state != ValidatorState.ENABLED) {
            revert ValidatorNotEnabled();
        }
        emit SetDefaultValidator(defaultValidatorAddress, _validator);
        defaultValidatorAddress = _validator;
    }

    /// @notice Sets the maximum amount of staked MATIC above which users cannot call deposit.
    /// @param _cap Must be larger than the total staked of the pool.
    function setCap(uint256 _cap) external onlyOwner {
        if (_cap < totalStaked()) {
            revert CapTooLow();
        }
        //check for cap too high as well/instead?
        emit SetCap(cap, _cap);
        cap = _cap;
    }

    /// @notice Sets the fee on certain actions within the protocol.
    /// @param _phi New fee cannot be larger than phi precision.
    function setPhi(uint256 _phi) external onlyOwner {
        if (_phi > PHI_PRECISION) {
            revert PhiTooLarge();
        }
        emit SetPhi(phi, _phi);
        phi = _phi;
    }

    /// @notice Sets the distribution fee for loose distributions.
    /// @param _distPhi New distribution fee.
    function setDistPhi(uint256 _distPhi) external onlyOwner {
        if (_distPhi > PHI_PRECISION) {
            revert DistPhiTooLarge();
        }
        emit SetDistPhi(distPhi, _distPhi);
        distPhi = _distPhi;
    }

    /// @notice Sets the epsilon for rounding.
    /// @param _epsilon Buffer amount for rounding.
    function setEpsilon(uint256 _epsilon) external onlyOwner {
        if (_epsilon > MAX_EPSILON) {
            revert EpsilonTooLarge();
        }
        emit SetEpsilon(epsilon, _epsilon);
        epsilon = _epsilon;
    }

    /// @notice Determines whether strict allocations are allowed.
    /// @param _allowStrict A value indicating whether the protocol allows strict allocations.
    function setAllowStrict(bool _allowStrict) external onlyOwner {
        emit SetAllowStrict(allowStrict, _allowStrict);
        allowStrict = _allowStrict;
    }

    /// @notice Sets the lower deposit limit.
    /// @param _newMinDeposit New minimum amount of MATIC one has to deposit (default 1e18 = 1 MATIC).
    function setMinDeposit(uint256 _newMinDeposit) external onlyOwner {
        if (_newMinDeposit < 1e18) {
            revert MinDepositTooSmall();
        }
        emit SetMinDeposit(minDeposit, _newMinDeposit);
        minDeposit = _newMinDeposit;
    }

    /// @notice Adds a new validator to the list of validators supported by the Staker.
    /// @param _validator The share contract address of the validator to add.
    /// @dev Newly added validators are considered enabled by defaut.
    /// This function reverts when a validator with the same share contract address already exists.
    function addValidator(address _validator) external onlyOwner {
        _checkNotZeroAddress(_validator);

        if (validators[_validator].state != ValidatorState.NONE){
            revert ValidatorAlreadyExists();
        }

        validatorAddresses.push(_validator);
        validators[_validator].state = ValidatorState.ENABLED;

         emit ValidatorAdded(_validator);
    }

    /// @notice Disable an enabled validator to prevent depositing and staking to it.
    /// @param _validator The share contract address of the validator to disable.
    function disableValidator(address _validator) external onlyOwner {
        _checkNotZeroAddress(_validator);

        if (validators[_validator].state != ValidatorState.ENABLED){
            revert ValidatorNotEnabled();
        }

        validators[_validator].state = ValidatorState.DISABLED;

        emit ValidatorStateChanged(_validator, ValidatorState.ENABLED, ValidatorState.DISABLED);
    }

    /// @notice Enable a disabled validator to allow depositing and staking to it.
    /// @param _validator The share contract address of the validator to enable.
    function enableValidator(address _validator) external onlyOwner {
        _checkNotZeroAddress(_validator);

        if (validators[_validator].state != ValidatorState.DISABLED){
            revert ValidatorNotDisabled();
        }

        validators[_validator].state = ValidatorState.ENABLED;

        emit ValidatorStateChanged(_validator, ValidatorState.DISABLED, ValidatorState.ENABLED);
    }


    /// *** INTERNAL METHODS ***
    /// @notice Internal deposit function which stakes and mints shares for the user + treasury.
    /// @param _user User depositing the amount.
    /// @param _amount Amount to be deposited.
    /// @param _validator Address of the validator to stake to.
    function _deposit(address _user, uint256 _amount, address _validator) private {
        if (_amount < minDeposit && _amount > 0) {
            revert DepositBelowMinDeposit();
        }

        if (_amount > maxDeposit(_user)) {
            revert DepositSurpassesVaultCap();
        }

        if (validators[_validator].state != ValidatorState.ENABLED) {
            revert ValidatorNotEnabled();
        }

        (uint256 globalPriceNum, uint256 globalPriceDenom) = sharePrice();

        // calculate share increase
        uint256 shareIncreaseUser = convertToShares(_amount);
        uint256 shareIncreaseTsy = (totalRewards() * phi * 1e18 * globalPriceDenom) / (globalPriceNum * PHI_PRECISION);

        // piggyback previous withdrawn rewards in this staking call
        uint256 stakeAmount = _amount + totalAssets();
        // adjust share balances
        if (_user != address(0)) {
            _mint(_user, shareIncreaseUser);
            emit Deposit(_user, _user, _amount, shareIncreaseUser);
            // erc-4626 event needed for integration
        }

        _mint(treasuryAddress, shareIncreaseTsy);
        emit Deposit(_user, treasuryAddress, 0, shareIncreaseTsy);
        // erc-4626 event needed for integration

        // transfer staking token from user to Staker
        IERC20Upgradeable(stakingTokenAddress).safeTransferFrom(_user, address(this), _amount);

        // approve funds to Stake Manager
        IERC20Upgradeable(stakingTokenAddress).safeIncreaseAllowance(stakeManagerContractAddress, stakeAmount);

        // interact with Validator Share contract to stake
        _stake(stakeAmount, _validator);
        // claimed rewards increase here as liquid rewards on validator share contract
        // are set to zero rewards and transferred to this vault

        emit Deposited(_user, shareIncreaseTsy, shareIncreaseUser, _amount, stakeAmount, totalAssets(), _validator);
    }

    /// @notice Internal function to handle withdrawals and burning shares.
    /// @param _user The user that is making the request.
    /// @param _amount The amount to be withdrawn.
    /// @param _validator Address of the validator to withdraw from.
    function _withdrawRequest(address _user, uint256 _amount, address _validator) private {
        if (_amount == 0) {
            revert WithdrawalRequestAmountCannotEqualZero();
        }

        uint256 maxWithdrawal = maxWithdraw(_user);
        if (_amount > maxWithdrawal) {
            revert WithdrawalAmountTooLarge();
        }

        (uint256 globalPriceNum, uint256 globalPriceDenom) = sharePrice();

        // calculate share decrease

        uint256 shareDecreaseUser = (_amount * globalPriceDenom * 1e18) / globalPriceNum;

        uint256 shareIncreaseTsy = (totalRewards() * phi * globalPriceDenom * 1e18) / (globalPriceNum * PHI_PRECISION);

        // If remaining user balance is below 1 MATIC, entire balance is withdrawn and all shares
        // are burnt. We allow the user to withdraw their deposited amount + epsilon
        uint256 remainingBalance = maxWithdrawal - _amount;
        if (remainingBalance < 1e18){
            _amount = maxWithdrawal;
            shareDecreaseUser = balanceOf(_user);
        }

        _burn(_user, shareDecreaseUser);
        emit Withdraw(_user, _user, _user, _amount, shareDecreaseUser); // erc-4626 event needed for integration

        _mint(treasuryAddress, shareIncreaseTsy);
        emit Deposit(_user, treasuryAddress, 0, shareIncreaseTsy); // erc-4626 event needed for integration

        // interact with staking contract to initiate unbonding
        uint256 unbondNonce = _unbond(_amount, _validator);

        // store user under unbond nonce, used for fair claiming
        withdrawals[_validator][unbondNonce] = Withdrawal(_user, _amount);

        // only once 80 epochs have passed can this be claimed
        uint256 epoch = getCurrentEpoch();

        emit WithdrawalRequested(
            _user,
            shareIncreaseTsy,
            shareDecreaseUser,
            _amount,
            totalAssets(),
            _validator,
            unbondNonce,
            epoch
        );
    }

    /// @notice Handles withdraw claims internally according to unbond nonces (once unbonding period has passed).
    /// @param _unbondNonce The claim number the user got when initiating the withdrawal.
    /// @param _validator Address of the validator to claim from.
    function _withdrawClaim(uint256 _unbondNonce, address _validator) private {
        Withdrawal memory withdrawal = withdrawals[_validator][_unbondNonce];

        // if the nonce is linked to a withdrawal in the current mapping, use that
        if(withdrawal.user != address(0)){
            delete withdrawals[_validator][_unbondNonce];
        }

        // else if the claim is for the twinstake staker, check the legacy mapping for the withdrawal
        else if(_validator == 0xeA077b10A0eD33e4F68Edb2655C18FDA38F84712 && unbondingWithdrawals[_unbondNonce].user != address(0) ){
            withdrawal = unbondingWithdrawals[_unbondNonce];
            delete unbondingWithdrawals[_unbondNonce];
        }

        // else withdraw claim does not exist
        else{
            revert WithdrawClaimNonExistent();
        }

        if (withdrawal.user != msg.sender) {
            revert SenderMustHaveInitiatedWithdrawalRequest();
        }

        // claim will revert if unbonding not finished for this unbond nonce
        _claimStake(_unbondNonce, _validator);

        // transfer claimed MATIC to claimer
        IERC20Upgradeable(stakingTokenAddress).safeTransfer(msg.sender, withdrawal.amount);

        emit WithdrawalClaimed(msg.sender, _validator, _unbondNonce, withdrawal.amount);

    }

    /// @notice Validator function that transfers the _amount to the stake manager and stakes the assets onto the validator.
    /// @param _amount Amount of MATIC to stake.
    /// @param _validator Address of the validator to stake with.
    function _stake(uint256 _amount, address _validator) private {
        IValidatorShare(_validator).buyVoucher(_amount, _amount);
        validators[_validator].stakedAmount += _amount;
    }

    /// @notice Requests to unstake a certain amount of MATIC from the default validator.
    /// @param _amount Amount of MATIC to initiate the unstaking of.
    /// @param _validator Address of the validator to unstake from.
    function _unbond(uint256 _amount, address _validator) private returns (uint256 unbondNonce) {
        IValidatorShare(_validator).sellVoucher_new(_amount, _amount);

        unbondNonce = IValidatorShare(_validator).unbondNonces(address(this));
        validators[_validator].stakedAmount -= _amount;
    }

    /// @notice Internal function for claiming the MATIC from a withdrawal request made previously.
    /// @param _unbondNonce Unbond nonce of the withdrawal request being claimed.
    /// @param _validator Address of the validator to claim from.
    function _claimStake(uint256 _unbondNonce, address _validator) private {
        IValidatorShare(_validator).unstakeClaimTokens_new(_unbondNonce);
    }

    /// @notice Calls the validator share contract's restake functionality to turn earned rewards into staked MATIC.
    /// @param _validator Address of the validator to restake.
    function _restake(address _validator) private {
        IValidatorShare(_validator).restake();
        //TODO: update validator mapping
    }

    /// @notice Private function called upon distribute rewards calls.
    /// @dev Also updates share price accordingly.
    /// @param _recipient The receiver of the distributed rewards.
    /// @param _distributor The person sending the rewards.
    /// @param _strict A value indicating whether the type of the allocation is strict(true) or loose(false).
    /// @param _inMatic A value indicating whether the rewards are in MATIC.
    function _distributeRewardsUpdateTotal(address _recipient, address _distributor, bool _strict, bool _inMatic) private {
        Allocation storage individualAllocation = allocations[_distributor][_recipient][_strict];

        if (individualAllocation.maticAmount == 0) {
            revert NothingToDistribute();
        }
        Allocation storage totalAllocation = totalAllocated[_distributor][_strict];
        // moved up for stack too deep issues
        (uint256 globalPriceNum, uint256 globalPriceDenom) = sharePrice();

        uint256 amountDistributed;
        uint256 sharesDistributed;

        // check necessary to avoid div by zero error
        if (
            individualAllocation.sharePriceNum / individualAllocation.sharePriceDenom ==
            globalPriceNum / globalPriceDenom
        ) {
            return;
        }

        uint256 oldIndividualSharePriceNum;
        uint256 oldIndividualSharePriceDenom;

        // dist rewards private fn, which does not update total allocated
        (oldIndividualSharePriceNum, oldIndividualSharePriceDenom, sharesDistributed) = _distributeRewards(
            _recipient,
            _distributor,
            _strict,
            true,
            _inMatic
        );

        amountDistributed = convertToAssets(sharesDistributed);

        // note: this amount was rounded, but it's only being used as a parameter in the emitted event,
        // should be cautious when using rounded values in calculations

        uint256 individualAllocationMaticAmount = individualAllocation.maticAmount;
        uint256 totalAllocationSharePriceNum = totalAllocation.sharePriceNum;

        // update total allocated

        uint256 newTotalAllocationSharePriceDenom =
            totalAllocation.sharePriceDenom +
            MathUpgradeable.mulDiv(
                individualAllocationMaticAmount * 1e22,
                globalPriceDenom * totalAllocationSharePriceNum,
                totalAllocation.maticAmount * globalPriceNum,
                MathUpgradeable.Rounding.Up
            ) /
            1e22 -
            MathUpgradeable.mulDiv(
                individualAllocationMaticAmount * 1e22,
                oldIndividualSharePriceDenom * totalAllocationSharePriceNum,
                totalAllocation.maticAmount * oldIndividualSharePriceNum,
                MathUpgradeable.Rounding.Down
            ) /
            1e22;

        // totalAllocation.sharePriceNum unchanged
        totalAllocation.sharePriceDenom = newTotalAllocationSharePriceDenom;

        // rounding total allocated share price denominator UP, in order to minimise the total allocation share price
        // which maximises the amount owed by the distributor, which they cannot withdraw/transfer (strict allocations)

        emit DistributedRewards(
            _distributor,
            _recipient,
            amountDistributed,
            sharesDistributed,
            globalPriceNum,
            globalPriceDenom,
            totalAllocationSharePriceNum,
            newTotalAllocationSharePriceDenom,
            _strict
        );
    }

    /// @notice Distributes the rewards related to the allocation made to that receiver.
    /// @param _recipient Receives the rewards.
    /// @param _distributor Distributes their rewards.
    /// @param _strict A value indicating whether the type of the allocation is strict(true) or loose(false).
    /// @param _individual A value indicating whether this function is called within distributeRewards(true) or distributeAll(false).
    /// @param _inMatic A value indicating whether rewards are in MATIC.
    function _distributeRewards(
        address _recipient,
        address _distributor,
        bool _strict,
        bool _individual,
        bool _inMatic
    ) private returns (uint256, uint256, uint256) {
        Allocation storage individualAllocation = allocations[_distributor][_recipient][_strict];
        uint256 amt = individualAllocation.maticAmount;

        (uint256 globalPriceNum, uint256 globalPriceDenom) = sharePrice();

        // calculate amount of TruMatic to move from distributor to recipient

        uint256 sharesToMove;

        {
            uint256 totalShares = MathUpgradeable.mulDiv(amt, individualAllocation.sharePriceDenom * 1e18, individualAllocation.sharePriceNum, MathUpgradeable.Rounding.Down) -
                MathUpgradeable.mulDiv(amt, globalPriceDenom * 1e18, globalPriceNum, MathUpgradeable.Rounding.Up);

            if (!_strict) {
                // calc fees and transfer

                uint256 fee = (totalShares * distPhi) / PHI_PRECISION;

                sharesToMove = totalShares - fee;

                // Use parent _transfer function to bypass strict allocation share lock
                super._transfer(_distributor, treasuryAddress, fee);
            } else {
                sharesToMove = totalShares;
            }
        }

        if (_inMatic) {
            uint256 maticAmount = previewRedeem(sharesToMove);
            // transfer staking token from distributor to recipient
            IERC20Upgradeable(stakingTokenAddress).safeTransferFrom(_distributor, _recipient, maticAmount);
        } else {
            // Use parent _transfer function to bypass strict allocation share lock
            super._transfer(_distributor, _recipient, sharesToMove);
        }

        (uint256 oldNum, uint256 oldDenom) = (individualAllocation.sharePriceNum, individualAllocation.sharePriceDenom);
        individualAllocation.sharePriceNum = globalPriceNum;
        individualAllocation.sharePriceDenom = globalPriceDenom;

        if (!_individual) {
            emit DistributedRewards(
                _distributor,
                _recipient,
                convertToAssets(sharesToMove),
                sharesToMove,
                globalPriceNum,
                globalPriceDenom,
                0,
                0,
                _strict
            );
        }

        return (oldNum, oldDenom, sharesToMove);
    }

    /// @notice Removes an address from an array of addresses.
    /// @param addresses A storage array of addresses.
    /// @param item The address to be removed.
    function removeAddress(address[] storage addresses, address item) private {
        uint256 addressCount = addresses.length;

        for (uint256 i; i < addressCount; ) {
            if (addresses[i] == item) {
                addresses[i] = addresses[addressCount - 1];
                addresses.pop();
                break;
            }

            unchecked {
                ++i;
            }
        }
    }

    /// @notice Checks whether an address is the zero address.
    /// @dev Gas-efficient way to check using assembly.
    /// @param toCheck Address to be checked.
    function _checkNotZeroAddress(address toCheck) private pure {
        assembly {
            //more gas efficient to use assembly for zero address check
            if iszero(toCheck) {
                let ptr := mload(0x40)
                mstore(ptr, 0x1cb411bc00000000000000000000000000000000000000000000000000000000) // selector for `ZeroAddressNotSupported()`
                revert(ptr, 0x4)
            }
        }
    }

    /// @notice Internal function to convert MATIC to TruMATIC.
    /// @dev Method overrides an ERC-4626 method and is used in ERC-4626 functions like the public convertToShares.
    /// @param assets Assets in MATIC to be converted into TruMATIC.
    function _convertToShares(
        uint256 assets,
        MathUpgradeable.Rounding rounding
    ) internal view override returns (uint256 shares) {
        (uint256 globalPriceNum, uint256 globalPriceDenom) = sharePrice();
        shares =  MathUpgradeable.mulDiv(assets * 1e18, globalPriceDenom, globalPriceNum, rounding);
    }

    /// @notice internal function to convert TruMATIC to MATIC.
    /// @dev Method overrides an ERC-4626 method and is used in ERC-4626 functions like the public convertToAssets.
    /// @param shares TruMATIC shares to be converted into MATIC.
    function _convertToAssets(
        uint256 shares,
        MathUpgradeable.Rounding rounding
    ) internal view override returns (uint256 assets) {
        (uint256 globalPriceNum, uint256 globalPriceDenom) = sharePrice();
        assets = MathUpgradeable.mulDiv(shares, globalPriceNum, globalPriceDenom * 1e18, rounding);
    }

    // We override this function as we want to block users from transferring strict allocations and associated rewards.
    // We avoid using the _beforeTokenTransfer hook as we wish to utilise unblocked super._transfer functionality in reward distribution.
    function _transfer(address from, address to, uint256 amount) internal override {
        if (from != address(0) && amount > maxRedeem(from)) {
            revert ExceedsUnallocatedBalance();
        }

        super._transfer(from, to, amount);
    }

}
