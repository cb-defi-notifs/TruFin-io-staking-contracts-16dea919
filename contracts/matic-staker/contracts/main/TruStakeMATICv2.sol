// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.8.19;

// OpenZeppelin
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {MathUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

// Polygon
import {IValidatorShare} from "../interfaces/IValidatorShare.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";

// TruFin
import {ERC4626Storage} from "./ERC4626Storage.sol";
import {ITruStakeMATICv2} from "../interfaces/ITruStakeMATICv2.sol";
import {TruStakeMATICv2Storage} from "./TruStakeMATICv2Storage.sol";
import {Withdrawal, Allocation, ValidatorState, Validator} from "./Types.sol";
import {IMasterWhitelist} from "../interfaces/IMasterWhitelist.sol";

uint256 constant PHI_PRECISION = 1e4;
uint256 constant MAX_EPSILON = 1e12;
uint256 constant ONE_MATIC = 1e18;
uint256 constant SHARE_PRICE_PRECISION = 1e22;

/// @title TruStakeMATICv2
/// @notice An auto-compounding liquid staking MATIC vault with reward-allocating functionality.
contract TruStakeMATICv2 is
    TruStakeMATICv2Storage,
    ITruStakeMATICv2,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    ERC4626Storage
{
    // *** LIBRARIES ***

    using SafeERC20Upgradeable for IERC20Upgradeable;

    // *** MODIFIERS ***
    // Reverts call if caller is not whitelisted
    modifier onlyWhitelist() {
        if (!IMasterWhitelist(whitelistAddress).isUserWhitelisted(msg.sender)) {
            revert UserNotWhitelisted();
        }
        _;
    }

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
    /// @param _distPhi Fee taken during the distribution of rewards earned from allocations.
    function initialize(
        address _stakingTokenAddress,
        address _stakeManagerContractAddress,
        address _validator,
        address _whitelistAddress,
        address _treasuryAddress,
        uint256 _phi,
        uint256 _distPhi
    ) external initializer {
        // Initialize derived state
        __ReentrancyGuard_init();
        __Ownable_init();
        __ERC20_init("TruStake MATIC Vault Shares", "TruMATIC");

        // Ensure addresses are non-zero
        _checkNotZeroAddress(_stakingTokenAddress);
        _checkNotZeroAddress(_stakeManagerContractAddress);
        _checkNotZeroAddress(_validator);
        _checkNotZeroAddress(_whitelistAddress);
        _checkNotZeroAddress(_treasuryAddress);

        if (_phi > PHI_PRECISION) revert PhiTooLarge();

        if (_distPhi > PHI_PRECISION) revert DistPhiTooLarge();

        // Initialize contract state
        stakingTokenAddress = _stakingTokenAddress;
        stakeManagerContractAddress = _stakeManagerContractAddress;
        defaultValidatorAddress = _validator;
        validatorAddresses.push(_validator);
        validators[_validator].state = ValidatorState.ENABLED;
        whitelistAddress = _whitelistAddress;
        treasuryAddress = _treasuryAddress;
        phi = _phi;
        distPhi = _distPhi;
        epsilon = 1e4;
        minDeposit = ONE_MATIC; // default minimum is 1 MATIC

        emit StakerInitialized(
            _stakingTokenAddress,
            _stakeManagerContractAddress,
            _validator,
            _whitelistAddress,
            _treasuryAddress,
            _phi,
            _distPhi
        );
    }

    /// *** EXTERNAL METHODS ***
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
        if (validators[_validator].state != ValidatorState.ENABLED) revert ValidatorNotEnabled();

        emit SetDefaultValidator(defaultValidatorAddress, _validator);
        defaultValidatorAddress = _validator;
    }

    /// @notice Sets the fee on certain actions within the protocol.
    /// @param _phi New fee cannot be larger than phi precision.
    function setPhi(uint256 _phi) external onlyOwner {
        if (_phi > PHI_PRECISION) revert PhiTooLarge();

        emit SetPhi(phi, _phi);
        phi = _phi;
    }

    /// @notice Sets the distribution fee.
    /// @param _distPhi New distribution fee.
    function setDistPhi(uint256 _distPhi) external onlyOwner {
        if (_distPhi > PHI_PRECISION) revert DistPhiTooLarge();

        emit SetDistPhi(distPhi, _distPhi);
        distPhi = _distPhi;
    }

    /// @notice Sets the epsilon for rounding.
    /// @param _epsilon Buffer amount for rounding.
    function setEpsilon(uint256 _epsilon) external onlyOwner {
        if (_epsilon > MAX_EPSILON) revert EpsilonTooLarge();

        emit SetEpsilon(epsilon, _epsilon);
        epsilon = _epsilon;
    }

    /// @notice Sets the lower deposit limit.
    /// @param _newMinDeposit New minimum amount of MATIC one has to deposit (default 1e18 = 1 MATIC).
    function setMinDeposit(uint256 _newMinDeposit) external onlyOwner {
        if (_newMinDeposit < ONE_MATIC) revert MinDepositTooSmall();

        emit SetMinDeposit(minDeposit, _newMinDeposit);
        minDeposit = _newMinDeposit;
    }

    /// @notice Adds a new validator to the list of validators supported by the Staker.
    /// @param _validator The share contract address of the validator to add.
    /// @dev Newly added validators are considered enabled by default.
    /// @dev This function reverts when a validator with the same share contract address already exists.
    function addValidator(address _validator) external onlyOwner {
        _checkNotZeroAddress(_validator);

        if (validators[_validator].state != ValidatorState.NONE) revert ValidatorAlreadyExists();

        validatorAddresses.push(_validator);

        (uint256 stakedAmount, ) = IValidatorShare(_validator).getTotalStake(address(this));
        validators[_validator].state = ValidatorState.ENABLED;
        validators[_validator].stakedAmount = stakedAmount;

        emit ValidatorAdded(_validator, stakedAmount);
    }

    /// @notice Disable an enabled validator to prevent depositing and staking to it.
    /// @param _validator The share contract address of the validator to disable.
    function disableValidator(address _validator) external onlyOwner {
        _checkNotZeroAddress(_validator);

        if (validators[_validator].state != ValidatorState.ENABLED) revert ValidatorNotEnabled();

        validators[_validator].state = ValidatorState.DISABLED;

        emit ValidatorStateChanged(_validator, ValidatorState.ENABLED, ValidatorState.DISABLED);
    }

    /// @notice Enable a disabled validator to allow depositing and staking to it.
    /// @param _validator The share contract address of the validator to enable.
    function enableValidator(address _validator) external onlyOwner {
        _checkNotZeroAddress(_validator);

        if (validators[_validator].state != ValidatorState.DISABLED) revert ValidatorNotDisabled();

        validators[_validator].state = ValidatorState.ENABLED;

        emit ValidatorStateChanged(_validator, ValidatorState.DISABLED, ValidatorState.ENABLED);
    }

    /// @notice Claims a previously requested and now unbonded withdrawal.
    /// @param _unbondNonce Nonce of the corresponding delegator unbond.
    /// @param _validator Address of the validator to claim the withdrawal from.
    function withdrawClaim(uint256 _unbondNonce, address _validator) external onlyWhitelist nonReentrant {
        _withdrawClaim(_unbondNonce, _validator);
    }

    /// @notice Claims multiple previously requested and now unbonded withdrawals from a specified validator.
    /// @param _unbondNonces List of delegator unbond nonces corresponding to said withdrawals.
    /// @param _validator Address of the validator to claim the withdrawals from.
    function claimList(uint256[] calldata _unbondNonces, address _validator) external onlyWhitelist nonReentrant {
        uint256 len = _unbondNonces.length;

        for (uint256 i; i < len; ) {
            _withdrawClaim(_unbondNonces[i], _validator);

            unchecked {
                ++i;
            }
        }
    }

    /// @notice Restakes the vault's current unclaimed delegation-earned rewards on the respective validators and
    /// stakes MATIC lingering in the vault to the validator provided.
    /// @dev Can be called manually to prevent the rewards surpassing reserves. This could lead to insufficient funds for
    /// withdrawals, as they are taken from delegated MATIC and not its rewards.
    /// @param _validator Address of the validator where MATIC in the vault should be staked to.
    function compoundRewards(address _validator) external nonReentrant {
        uint256 amountRestaked = totalRewards();
        uint256 totalAssetBalance = totalAssets();
        // To keep share price constant when rewards are staked, new shares need to be minted
        uint256 shareIncrease = convertToShares(totalStaked() + totalAssetBalance + amountRestaked) - totalSupply();

        _restake();

         // Minted shares are given to the treasury to effectively take a fee
        _mint(treasuryAddress, shareIncrease);

        // if there is MATIC in the vault, stake it with the provided validator
        if (totalAssetBalance > 0) {
            _deposit(address(0), 0, _validator);
        }

        emit RewardsCompounded(amountRestaked, shareIncrease);
    }

    // *** ALLOCATIONS ***

    /// @notice Allocates the validation rewards earned by an amount of the caller's staked MATIC to a user.
    /// @param _amount The amount of staked MATIC to allocate.
    /// @param _recipient The address of the target recipient.
    function allocate(uint256 _amount, address _recipient) external onlyWhitelist nonReentrant {
        _checkNotZeroAddress(_recipient);

        // can only allocate up to allocator's balance
        if (_amount > maxWithdraw(msg.sender)) revert InsufficientDistributorBalance();

        if (_amount < ONE_MATIC) revert AllocationUnderOneMATIC();

        // variables up here for stack too deep issues
        uint256 individualAmount;
        uint256 individualPriceNum;
        uint256 individualPriceDenom;

        (uint256 globalPriceNum, uint256 globalPriceDenom) = sharePrice();
        {
            Allocation storage oldIndividualAllocation = allocations[msg.sender][_recipient][false];
            uint256 oldIndividualAllocationMaticAmount = oldIndividualAllocation.maticAmount;

            if (oldIndividualAllocationMaticAmount == 0) {
                // if this is a new allocation
                individualAmount = _amount;
                individualPriceNum = globalPriceNum;
                individualPriceDenom = globalPriceDenom;

                // update mappings to keep track of recipients for each dist and vice versa
                distributors[_recipient][false].push(msg.sender);
                recipients[msg.sender][false].push(_recipient);
            } else {
                // if this adds to an existing allocation, update the individual allocation

                individualAmount = oldIndividualAllocationMaticAmount + _amount;
                individualPriceNum = oldIndividualAllocationMaticAmount * SHARE_PRICE_PRECISION + _amount * SHARE_PRICE_PRECISION;

                individualPriceDenom =
                    MathUpgradeable.mulDiv(
                        oldIndividualAllocationMaticAmount * SHARE_PRICE_PRECISION,
                        oldIndividualAllocation.sharePriceDenom,
                        oldIndividualAllocation.sharePriceNum,
                        MathUpgradeable.Rounding.Down
                    ) +
                    MathUpgradeable.mulDiv(
                        _amount * SHARE_PRICE_PRECISION,
                        globalPriceDenom,
                        globalPriceNum,
                        MathUpgradeable.Rounding.Down
                    );
                // rounding individual allocation share price denominator DOWN, in order to maximise the individual allocation share price
                // which minimises the amount that is distributed in `distributeRewards()`
            }

            allocations[msg.sender][_recipient][false] = Allocation(
                individualAmount,
                individualPriceNum,
                individualPriceDenom
            );
        }

        emit Allocated(msg.sender, _recipient, individualAmount, individualPriceNum, individualPriceDenom);
    }

    /// @notice Deallocates an amount of MATIC previously allocated to a user.
    /// @param _amount The amount the caller wishes to reduce the target's allocation by.
    /// @param _recipient The address of the user whose allocation is being reduced.
    function deallocate(uint256 _amount, address _recipient) external onlyWhitelist nonReentrant {
        Allocation storage individualAllocation = allocations[msg.sender][_recipient][false];

        uint256 individualMaticAmount = individualAllocation.maticAmount;

        if (individualMaticAmount == 0) revert AllocationNonExistent();

        if (individualMaticAmount < _amount) revert ExcessDeallocation();

        unchecked {
            individualMaticAmount -= _amount;
        }

        if (individualMaticAmount < ONE_MATIC && individualMaticAmount != 0) revert AllocationUnderOneMATIC();

        // check if this is a complete deallocation
        if (individualMaticAmount == 0) {
            // remove recipient from distributor's recipient array
            delete allocations[msg.sender][_recipient][false];

            address[] storage rec = recipients[msg.sender][false];
            removeAddress(rec, _recipient);

            // remove distributor from recipient's distributor array
            address[] storage dist = distributors[_recipient][false];
            removeAddress(dist, msg.sender);
        } else {
            individualAllocation.maticAmount = individualMaticAmount;
        }

        emit Deallocated(msg.sender, _recipient, individualMaticAmount);
    }

    /// @notice Distributes the rewards from the caller's allocations to all their recipients.
    /// @param _inMatic A value indicating whether the reward is in MATIC or not.
    /// @dev If _inMatic is set to true, the MATIC will be transferred straight from the distributor's wallet.
    /// Their TruMATIC balance will not be altered.
    function distributeAll(bool _inMatic) external onlyWhitelist nonReentrant {
        address[] storage rec = recipients[msg.sender][false];
        uint256 recipientsCount = rec.length;

        if (recipientsCount == 0) revert NoRecipientsFound();

        (uint256 globalPriceNum, uint256 globalPriceDenom) = sharePrice();

        for (uint256 i; i < recipientsCount; ) {
            _distributeRewards(rec[i], msg.sender, _inMatic, globalPriceNum, globalPriceDenom);
            unchecked {
                ++i;
            }
        }

        emit DistributedAll(msg.sender);
    }

    /// *** EXTERNAL VIEW METHODS ***
    // *** VAULT INFO ***
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

    /// @notice Returns the addresses of the validators that are supported by the contract.
    function getValidators() external view returns (address[] memory) {
        return validatorAddresses;
    }

    /// @notice Checks if the unbond specified via the _unbondNonce can be claimed from the validator.
    /// @dev Cannot check the claimability of pre-upgrade unbonds.
    /// @param _unbondNonce Nonce of the unbond under consideration.
    /// @param _validator The address of the validator.
    /// @return  A value indicating whether the unbond can be claimed.
    function isClaimable(uint256 _unbondNonce, address _validator) external view returns (bool) {
        // Get epoch at which unbonding of delegated MATIC was initiated
        (, uint256 withdrawEpoch) = IValidatorShare(_validator).unbonds_new(address(this), _unbondNonce);

        // Check required epochs have passed
        bool epochsPassed = getCurrentEpoch() >=
            withdrawEpoch + IStakeManager(stakeManagerContractAddress).withdrawalDelay();

        bool withdrawalPresent = withdrawals[_validator][_unbondNonce].user != address(0);

        return withdrawalPresent && epochsPassed;
    }

    // *** PUBLIC METHODS ***
    /// @notice Deposits an amount of caller->-vault approved MATIC into the vault.
    /// @param _assets The amount of MATIC to deposit.
    /// @dev The MATIC is staked with the default validator.
    /// @return The resulting amount of TruMATIC shares minted to the caller.
    function deposit(uint256 _assets) public onlyWhitelist nonReentrant returns (uint256) {
        return _deposit(msg.sender, _assets, defaultValidatorAddress);
    }

    /// @notice Deposits an amount of caller->-vault approved MATIC into the vault.
    /// @param _assets The amount of MATIC to deposit.
    /// @param _validator Address of the validator you want to stake with.
    /// @return The resulting amount of TruMATIC shares minted to the caller.
    function depositToSpecificValidator(
        uint256 _assets,
        address _validator
    ) public onlyWhitelist nonReentrant returns (uint256) {
        return _deposit(msg.sender, _assets, _validator);
    }

    /// @notice Initiates a withdrawal request for an amount of MATIC from the vault and burns corresponding TruMATIC shares.
    /// @param _assets The amount of MATIC to withdraw.
    /// @dev The MATIC is unstaked from the default validator.
    /// @return The resulting amount of TruMATIC shares burned from the caller and the unbond nonce.
    function withdraw(uint256 _assets) public onlyWhitelist nonReentrant returns (uint256, uint256) {
        return _withdrawRequest(msg.sender, _assets, defaultValidatorAddress);
    }

    /// @notice Initiates a withdrawal request for an amount of MATIC from the vault
    /// and burns corresponding TruMATIC shares.
    /// @param _assets The amount of MATIC to withdraw.
    /// @param _validator The address of the validator from which to unstake.
    /// @return The resulting amount of TruMATIC shares burned from the caller and the unbond nonce.
    function withdrawFromSpecificValidator(
        uint256 _assets,
        address _validator
    ) public onlyWhitelist nonReentrant returns (uint256, uint256) {
        if (validators[_validator].state == ValidatorState.NONE) revert ValidatorDoesNotExist();

        return _withdrawRequest(msg.sender, _assets, _validator);
    }

    /// @notice Distributes allocation rewards from the caller to a recipient.
    /// @param _recipient Address of allocation's recipient.
    /// @param _inMatic A value indicating whether the reward is in MATIC or not.
    /// @dev If _inMatic is set to true, the MATIC will be transferred straight from the distributor's wallet.
    /// Their TruMATIC balance will not be altered.
    function distributeRewards(address _recipient, bool _inMatic) public onlyWhitelist nonReentrant {
        (uint256 globalPriceNum, uint256 globalPriceDenom) = sharePrice();
        _distributeRewards(_recipient, msg.sender, _inMatic, globalPriceNum, globalPriceDenom);
    }

    /// *** PUBLIC VIEW METHODS ***
    /// @notice Gets the total amount of MATIC currently held by the vault.
    /// @return Total amount of MATIC held by the vault.
    function totalAssets() public view returns (uint256) {
        return IERC20Upgradeable(stakingTokenAddress).balanceOf(address(this));
    }

    /// @notice Gets the total amount of MATIC currently staked by the vault.
    /// @return Total amount of MATIC staked by the vault across all validator delegations.
    function totalStaked() public view returns (uint256) {
        uint256 validatorCount = validatorAddresses.length;
        uint256 stake;
        for (uint256 i; i < validatorCount; ) {
            stake += validators[validatorAddresses[i]].stakedAmount;
            unchecked {
                ++i;
            }
        }
        return stake;
    }

    /// @notice Gets the total unclaimed MATIC rewards on all validators.
    /// @return Total amount of MATIC rewards earned through all validators.
    function totalRewards() public view returns (uint256) {
        uint256 validatorCount = validatorAddresses.length;
        uint256 validatorRewards;
        for (uint256 i; i < validatorCount; ) {
            validatorRewards += IValidatorShare(validatorAddresses[i]).getLiquidRewards(address(this));
            unchecked {
                ++i;
            }
        }
        return validatorRewards;
    }

    /// @notice Gets the price of one TruMATIC share in MATIC.
    /// @dev Represented via a fraction. Factor of 1e18 included in numerator to avoid rounding errors (currently redundant).
    /// @return Numerator of the vault's share price fraction.
    /// @return Denominator of the vault's share price fraction.
    function sharePrice() public view returns (uint256, uint256) {
        if (totalSupply() == 0) return (1e18, 1);

        uint256 totalCapitalTimesPhiPrecision = (totalStaked() + totalAssets()) *
            PHI_PRECISION +
            (PHI_PRECISION - phi) *
            totalRewards();

        return (totalCapitalTimesPhiPrecision * 1e18, totalSupply() * PHI_PRECISION);
    }

    /// @notice Convenience getter for retrieving user-relevant info.
    /// @param _user Address of the user.
    /// @return Maximum TruMATIC that can be redeemed by the user.
    /// @return Maximum MATIC that can be withdrawn by the user.
    /// @return Numerator of the vault's share price fraction.
    /// @return Denominator of the vault's share price fraction.
    /// @return Current Polygon epoch.
    function getUserInfo(address _user) public view returns (uint256, uint256, uint256, uint256, uint256) {
        (uint256 globalPriceNum, uint256 globalPriceDenom) = sharePrice();
        uint256 maxRedeemable = balanceOf(_user);
        uint256 maxWithdrawAmount = maxWithdraw(_user);
        uint256 epoch = getCurrentEpoch();

        return (maxRedeemable, maxWithdrawAmount, globalPriceNum, globalPriceDenom, epoch);
    }

    /// @notice Retrieves information for all supported validators.
    /// @return An array of structs containing details for each validator.
    function getAllValidators() public view returns (Validator[] memory) {
        uint256 validatorCount = validatorAddresses.length;
        Validator[] memory validatorArray = new Validator[](validatorCount);
        for (uint256 i; i < validatorCount; ) {
            address validatorAddress = validatorAddresses[i];
            Validator memory validator = validators[validatorAddress];
            validator.validatorAddress = validatorAddress;
            validatorArray[i] = validator;
            unchecked {
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

    /// @notice Gets a recipient's distributors.
    /// @param _user The recipient.
    /// @return The recipient's distributors.
    function getDistributors(address _user) public view returns (address[] memory) {
        return distributors[_user][false];
    }

    /// @notice Gets a distributor's recipients.
    /// @param _user The distributor.
    /// @return The distributor's recipients.
    function getRecipients(address _user) public view returns (address[] memory) {
        return recipients[_user][false];
    }

    /// @notice Gets the current epoch from Polygons's StakeManager contract.
    /// @return Current Polygon epoch.
    function getCurrentEpoch() public view returns (uint256) {
        return IStakeManager(stakeManagerContractAddress).epoch();
    }

    /// @notice Calculates the total amount of MATIC allocated by a distributor and the
    /// average share price fraction at which it was allocated.
    /// @param distributor The distributor.
    /// @return An allocation struct representing the distributor's total allocations.
    function getTotalAllocated(address distributor) public view returns (Allocation memory) {
        uint256 recipientsCount = recipients[distributor][false].length; // fetch all recipients
        uint256 totalAllocatedAmount;
        uint256 sharePriceNum;
        uint256 sharePriceDenom;

        for (uint256 i; i < recipientsCount; i++) {
            // loop through all recipient allocations
            address recipient = recipients[distributor][false][i];
            Allocation memory allocation = allocations[distributor][recipient][false];

            // if this is the first iteration of the for loop
            if (totalAllocatedAmount == 0) {
                totalAllocatedAmount = allocation.maticAmount;
                sharePriceNum = allocation.sharePriceNum;
                sharePriceDenom = allocation.sharePriceDenom;
                continue;
            }

            sharePriceDenom =
                MathUpgradeable.mulDiv(
                    totalAllocatedAmount * SHARE_PRICE_PRECISION,
                    sharePriceDenom,
                    sharePriceNum,
                    MathUpgradeable.Rounding.Up
                ) +
                MathUpgradeable.mulDiv(
                    allocation.maticAmount * SHARE_PRICE_PRECISION,
                    allocation.sharePriceDenom,
                    allocation.sharePriceNum,
                    MathUpgradeable.Rounding.Up
                );

            sharePriceNum = totalAllocatedAmount * SHARE_PRICE_PRECISION + allocation.maticAmount * SHARE_PRICE_PRECISION;
            totalAllocatedAmount += allocation.maticAmount;
        }
        return Allocation(totalAllocatedAmount, sharePriceNum, sharePriceDenom);
    }

    /// @notice Gets the maximum amount of MATIC a user can withdraw from the vault.
    /// @param _user The user under consideration.
    /// @return The amount of MATIC.
    function maxWithdraw(address _user) public view returns (uint256) {
        uint256 preview = previewRedeem(balanceOf(_user));

        if (preview == 0) return 0;

        return preview + epsilon;
    }

    /// @notice Returns the amount of TruMATIC needed to withdraw an amount of MATIC.
    /// @dev Returns no fewer than the exact amount of TruMATIC that would be burned
    /// in a withdraw request for the exact amount of MATIC.
    /// @param _assets The exact amount of MATIC to withdraw.
    /// @return The amount of TruMATIC burned.
    function previewWithdraw(uint256 _assets) public view returns (uint256) {
        return _convertToShares(_assets, MathUpgradeable.Rounding.Up);
    }

    /// @notice Returns the amount of MATIC that can be withdrawn for an amount of TruMATIC.
    /// @dev Returns no fewer than the exact amount of MATIC that would be withdrawn
    /// in a withdraw request that burns the exact amount of TruMATIC.
    /// @param _shares The exact amount of TruMATIC to redeem.
    /// @return The amount of MATIC withdrawn.
    function previewRedeem(uint256 _shares) public view returns (uint256) {
        return _convertToAssets(_shares, MathUpgradeable.Rounding.Up);
    }

    /// @notice Returns the amount of TruMATIC equivalent to an amount of MATIC.
    /// @param _assets The amount of MATIC to convert.
    /// @return The amount of TruMATIC that the Vault would exchange for the MATIC of assets provided.
    function convertToShares(uint256 _assets) public view returns (uint256) {
        return _convertToShares(_assets, MathUpgradeable.Rounding.Down);
    }

    /// @notice Returns the amount of MATIC equivalent to an amount of TruMATIC.
    /// @param _shares The amount of TruMATIC to convert.
    /// @return The amount of MATIC that the Vault would exchange for the amount of TruMATIC provided.
    function convertToAssets(uint256 _shares) public view returns (uint256) {
        return _convertToAssets(_shares, MathUpgradeable.Rounding.Down);
    }

    /// ***** PRIVATE METHODS *****
    /// @notice Private deposit function which stakes and mints shares for the user + treasury.
    /// @param _user User depositing the amount.
    /// @param _amount Amount to be deposited.
    /// @param _validator Address of the validator to stake to.
    function _deposit(address _user, uint256 _amount, address _validator) private returns (uint256) {
        if (_amount < minDeposit && _amount > 0) revert DepositBelowMinDeposit();

        if (validators[_validator].state != ValidatorState.ENABLED) revert ValidatorNotEnabled();

        (uint256 globalPriceNum, uint256 globalPriceDenom) = sharePrice();

        // calculate share increase
        uint256 shareIncreaseUser = convertToShares(_amount);
        uint256 shareIncreaseTsy = (getRewardsFromValidator(_validator) * phi * 1e18 * globalPriceDenom) / (globalPriceNum * PHI_PRECISION);

        // piggyback previous withdrawn rewards in this staking call
        uint256 totalAssetBalance = totalAssets();
        uint256 stakeAmount = _amount + totalAssetBalance;
        // adjust share balances
        if (_user != address(0)) _mint(_user, shareIncreaseUser);

        _mint(treasuryAddress, shareIncreaseTsy);

        // transfer staking token from user to Staker
        IERC20Upgradeable(stakingTokenAddress).safeTransferFrom(_user, address(this), _amount);

        // approve funds to Stake Manager
        IERC20Upgradeable(stakingTokenAddress).safeIncreaseAllowance(stakeManagerContractAddress, stakeAmount);

        // interact with Validator Share contract to stake
        _stake(stakeAmount, _validator);
        // claimed rewards increase here as liquid rewards on validator share contract
        // are set to zero rewards and transferred to this vault

        emit Deposited(_user, shareIncreaseTsy, shareIncreaseUser, _amount, stakeAmount, totalAssetBalance, _validator);

        return shareIncreaseUser;
    }

    /// @notice Private function to handle withdrawals and burning shares.
    /// @param _user The user that is making the request.
    /// @param _amount The amount to be withdrawn.
    /// @param _validator Address of the validator to withdraw from.
    function _withdrawRequest(address _user, uint256 _amount, address _validator) private returns (uint256, uint256) {
        if (_amount == 0) revert WithdrawalRequestAmountCannotEqualZero();

        uint256 maxWithdrawal = maxWithdraw(_user);
        if (_amount > maxWithdrawal) revert WithdrawalAmountTooLarge();

        (uint256 globalPriceNum, uint256 globalPriceDenom) = sharePrice();

        // calculate share decrease
        uint256 shareDecreaseUser = (_amount * globalPriceDenom * 1e18) / globalPriceNum;

        uint256 shareIncreaseTsy = (getRewardsFromValidator(_validator) * phi * globalPriceDenom * 1e18) / (globalPriceNum * PHI_PRECISION);

        // If remaining user balance is below 1 MATIC, entire balance is withdrawn and all shares
        // are burnt. We allow the user to withdraw their deposited amount + epsilon
        if (maxWithdrawal - _amount < ONE_MATIC) {
            _amount = maxWithdrawal;
            shareDecreaseUser = balanceOf(_user);
        }

        _burn(_user, shareDecreaseUser);

        _mint(treasuryAddress, shareIncreaseTsy);

        // interact with staking contract to initiate unbonding
        uint256 unbondNonce = _unbond(_amount, _validator);

        // store user under unbond nonce, used for fair claiming
        withdrawals[_validator][unbondNonce] = Withdrawal(_user, _amount);

        emit WithdrawalRequested(
            _user,
            shareIncreaseTsy,
            shareDecreaseUser,
            _amount,
            totalAssets(),
            _validator,
            unbondNonce,
            getCurrentEpoch() // only once 80 epochs have passed can this be claimed
        );

        return (shareDecreaseUser, unbondNonce);
    }

    /// @notice Handles withdraw claims internally according to unbond nonces (once unbonding period has passed).
    /// @param _unbondNonce The claim number the user got when initiating the withdrawal.
    /// @param _validator Address of the validator to claim from.
    function _withdrawClaim(uint256 _unbondNonce, address _validator) private {
        Withdrawal memory withdrawal = withdrawals[_validator][_unbondNonce];

        // if the nonce is linked to a withdrawal in the current mapping, use that
        if (withdrawal.user != address(0)) {
            delete withdrawals[_validator][_unbondNonce];
        } else if (
            _validator == 0xeA077b10A0eD33e4F68Edb2655C18FDA38F84712 &&
            unbondingWithdrawals[_unbondNonce].user != address(0)
        ) {
            // else if the claim is for the twinstake staker, check the legacy mapping for the withdrawal
            withdrawal = unbondingWithdrawals[_unbondNonce];
            delete unbondingWithdrawals[_unbondNonce];
        } else {
            // else withdraw claim does not exist
            revert WithdrawClaimNonExistent();
        }

        if (withdrawal.user != msg.sender) revert SenderMustHaveInitiatedWithdrawalRequest();

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
        uint256 amountToDeposit = IValidatorShare(_validator).buyVoucher(_amount, _amount);
        validators[_validator].stakedAmount += amountToDeposit;
    }

    /// @notice Requests to unstake a certain amount of MATIC from the specified validator.
    /// @param _amount Amount of MATIC to initiate the unstaking of.
    /// @param _validator Address of the validator to unstake from.
    function _unbond(uint256 _amount, address _validator) private returns (uint256) {
        validators[_validator].stakedAmount -= _amount;
        IValidatorShare(_validator).sellVoucher_new(_amount, _amount);
        return IValidatorShare(_validator).unbondNonces(address(this));
    }

    /// @notice Internal function for claiming the MATIC from a withdrawal request made previously.
    /// @param _unbondNonce Unbond nonce of the withdrawal request being claimed.
    /// @param _validator Address of the validator to claim from.
    function _claimStake(uint256 _unbondNonce, address _validator) private {
        IValidatorShare(_validator).unstakeClaimTokens_new(_unbondNonce);
    }

    /// @notice Calls the validator share contract's restake functionality on all enabled validators
    /// to turn earned rewards into staked MATIC.
    /// @dev Logs a RestakeError event when an exception occurs while calling restake on a validator.
    function _restake() private {
        uint256 validatorCount = validatorAddresses.length;
        for (uint256 i; i < validatorCount; ) {
            address validator = validatorAddresses[i];
            if (validators[validator].state == ValidatorState.ENABLED) {
                // log an event on "Too small rewards to restake" and other exceptions
                try IValidatorShare(validator).restake() returns (uint256 amountRestaked, uint256) {
                    validators[validator].stakedAmount += amountRestaked;
                } catch Error(string memory reason) {
                    emit RestakeError(validator, reason);
                }
            }

            unchecked {
                ++i;
            }
        }
    }

    /// @notice Distributes the rewards related to the allocation made to that receiver.
    /// @param _recipient Receives the rewards.
    /// @param _distributor Distributes their rewards.
    /// @param _inMatic A value indicating whether rewards are in MATIC.
    function _distributeRewards(address _recipient, address _distributor, bool _inMatic, uint256 globalPriceNum, uint256 globalPriceDenom) private {
        Allocation storage individualAllocation = allocations[_distributor][_recipient][false];
        uint256 amt = individualAllocation.maticAmount;

        // if there is no allocation, revert. This should never happen during a distributeAll call.
        if (amt == 0) revert NothingToDistribute();

        // check if there are any rewards to distribute. If not, return.
        if (
            individualAllocation.sharePriceNum / individualAllocation.sharePriceDenom ==
            globalPriceNum / globalPriceDenom
        ) {
            return;
        }

        // calculate amount of TruMatic to move from distributor to recipient
        uint256 sharesToMove;
        {
            sharesToMove =
                MathUpgradeable.mulDiv(
                    amt,
                    individualAllocation.sharePriceDenom * 1e18,
                    individualAllocation.sharePriceNum,
                    MathUpgradeable.Rounding.Down
                ) -
                MathUpgradeable.mulDiv(amt, globalPriceDenom * 1e18, globalPriceNum, MathUpgradeable.Rounding.Up);

            // calculate fees and transfer
            uint256 fee = (sharesToMove * distPhi) / PHI_PRECISION;

            sharesToMove -= fee;

            _transfer(_distributor, treasuryAddress, fee);
        }

        if (_inMatic) {
            uint256 maticAmount = convertToAssets(sharesToMove);
            // transfer staking token from distributor to recipient
            IERC20Upgradeable(stakingTokenAddress).safeTransferFrom(_distributor, _recipient, maticAmount);
        } else {
            _transfer(_distributor, _recipient, sharesToMove);
        }

        individualAllocation.sharePriceNum = globalPriceNum;
        individualAllocation.sharePriceDenom = globalPriceDenom;

        emit DistributedRewards(
            _distributor,
            _recipient,
            convertToAssets(sharesToMove),
            sharesToMove,
            globalPriceNum,
            globalPriceDenom
        );
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

    /// ***** PRIVATE VIEW METHODS *****
    /// @notice Private function to convert MATIC to TruMATIC.
    /// @param assets Assets in MATIC to be converted into TruMATIC.
    function _convertToShares(uint256 assets, MathUpgradeable.Rounding rounding) private view returns (uint256) {
        (uint256 globalPriceNum, uint256 globalPriceDenom) = sharePrice();
        return MathUpgradeable.mulDiv(assets * 1e18, globalPriceDenom, globalPriceNum, rounding);
    }

    /// @notice Private function to convert TruMATIC to MATIC.
    /// @param shares TruMATIC shares to be converted into MATIC.
    function _convertToAssets(uint256 shares, MathUpgradeable.Rounding rounding) private view returns (uint256) {
        (uint256 globalPriceNum, uint256 globalPriceDenom) = sharePrice();
        return MathUpgradeable.mulDiv(shares, globalPriceNum, globalPriceDenom * 1e18, rounding);
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
}
